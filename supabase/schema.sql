-- ════════════════════════════════════════════════════════════════════════════
-- Living Cookbook — Supabase schema
-- Run this entire file in the Supabase SQL editor (Dashboard → SQL Editor).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Profiles ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_all"  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own"  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own"  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user is created.
-- The username is taken from user_metadata (set during signUp); falls back to
-- the email prefix so the INSERT never fails on a missing username.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
      SPLIT_PART(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Recipes ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.recipes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  categories  TEXT[]  NOT NULL DEFAULT '{}',
  image       TEXT,
  ingredients JSONB   NOT NULL DEFAULT '[]',
  steps       TEXT[]  NOT NULL DEFAULT '{}',
  tools       TEXT[]  NOT NULL DEFAULT '{}',
  origin      TEXT,
  -- Who may see this recipe. See the "Recipe privacy" section below for how each
  -- level is enforced by the SELECT policy.
  visibility  TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'friends', 'specific_friends', 'private')),
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

-- The SELECT policy depends on are_friends() (defined in the Friendships section)
-- and recipe_is_shared_with() (defined in the Recipe privacy section), so it is
-- created further down in "Recipe privacy" rather than here.
CREATE POLICY "recipes_insert_own"  ON public.recipes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "recipes_update_own"  ON public.recipes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "recipes_delete_own"  ON public.recipes FOR DELETE USING (auth.uid() = user_id);

-- ── Storage ───────────────────────────────────────────────────────────────────
-- Images are stored under <user_id>/<filename> so RLS can check ownership via
-- the first folder component.

INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-images', 'recipe-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "images_select_all" ON storage.objects
  FOR SELECT USING (bucket_id = 'recipe-images');

CREATE POLICY "images_insert_auth" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'recipe-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "images_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'recipe-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "images_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'recipe-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Friendships ────────────────────────────────────────────────────────────────
-- One row represents the relationship between two users, regardless of which way
-- the request flowed. `requester_id` is who sent it; `addressee_id` is who
-- received it. A unique index on the *unordered* pair stops both A→B and B→A from
-- existing at once. States:
--   pending  — request sent, awaiting the addressee's response
--   accepted — both users are friends
--   blocked  — requester_id has blocked addressee_id (block/unblock endpoints are
--              not built yet, but the state and structure are in place)
--
-- All writes go through the SECURITY DEFINER functions below, which enforce the
-- state machine and authorization. The table itself only exposes a SELECT policy,
-- so the client can read its own rows directly but cannot forge writes.

DO $$ BEGIN
  CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.friendships (
  id           BIGSERIAL PRIMARY KEY,
  requester_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  addressee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status       public.friendship_status NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT friendships_no_self CHECK (requester_id <> addressee_id)
);

-- At most one relationship per unordered pair of users.
CREATE UNIQUE INDEX IF NOT EXISTS friendships_unique_pair
  ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

-- Speeds up the list endpoints and the are_friends() lookup.
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships (requester_id, status);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships (addressee_id, status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Users can read only the relationships they participate in. No INSERT/UPDATE/
-- DELETE policies exist — every mutation flows through the functions below.
DROP POLICY IF EXISTS "friendships_select_own" ON public.friendships;
CREATE POLICY "friendships_select_own" ON public.friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Keep updated_at fresh on status changes.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER friendships_touch_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Friendship API (call via supabase.rpc('<name>', { ... })) ──────────────────
-- Every function reads the caller from auth.uid(), so the client never passes its
-- own id. SET search_path pins resolution so the SECURITY DEFINER context can't be
-- hijacked. Mutations raise a clear exception (surfaced as error.message) on any
-- invalid transition.

-- Send a friend request by username.
CREATE OR REPLACE FUNCTION public.send_friend_request(p_username TEXT)
RETURNS public.friendships
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_target   UUID;
  v_existing public.friendships;
  v_row      public.friendships;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to send a friend request';
  END IF;

  SELECT id INTO v_target FROM public.profiles
   WHERE lower(username) = lower(trim(p_username));
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'No user found with the username %', p_username;
  END IF;
  IF v_target = v_me THEN
    RAISE EXCEPTION 'You cannot send a friend request to yourself';
  END IF;

  SELECT * INTO v_existing FROM public.friendships
   WHERE LEAST(requester_id, addressee_id) = LEAST(v_me, v_target)
     AND GREATEST(requester_id, addressee_id) = GREATEST(v_me, v_target);

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'accepted' THEN
      RAISE EXCEPTION 'You are already friends with this user';
    ELSIF v_existing.status = 'blocked' THEN
      RAISE EXCEPTION 'Unable to send a friend request to this user';
    ELSIF v_existing.requester_id = v_me THEN
      RAISE EXCEPTION 'You already have a pending request to this user';
    ELSE
      -- The target already sent me a pending request — sending one back means we
      -- both want to be friends, so auto-accept theirs instead of creating a new row.
      UPDATE public.friendships
         SET status = 'accepted'
       WHERE id = v_existing.id
       RETURNING * INTO v_row;
      RETURN v_row;
    END IF;
  END IF;

  INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (v_me, v_target, 'pending')
    RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Accept a pending request addressed to me.
CREATE OR REPLACE FUNCTION public.accept_friend_request(p_friendship_id BIGINT)
RETURNS public.friendships
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.friendships;
BEGIN
  UPDATE public.friendships
     SET status = 'accepted'
   WHERE id = p_friendship_id
     AND addressee_id = auth.uid()
     AND status = 'pending'
   RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No pending request found that you can accept';
  END IF;
  RETURN v_row;
END;
$$;

-- Decline a pending request addressed to me (deletes the row).
CREATE OR REPLACE FUNCTION public.decline_friend_request(p_friendship_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count INT;
BEGIN
  DELETE FROM public.friendships
   WHERE id = p_friendship_id AND addressee_id = auth.uid() AND status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'No pending request found that you can decline';
  END IF;
  RETURN true;
END;
$$;

-- Cancel a pending request I sent (deletes the row).
CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_friendship_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count INT;
BEGIN
  DELETE FROM public.friendships
   WHERE id = p_friendship_id AND requester_id = auth.uid() AND status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'No pending request found that you can cancel';
  END IF;
  RETURN true;
END;
$$;

-- Remove an existing friend (deletes the accepted relationship either way).
CREATE OR REPLACE FUNCTION public.remove_friend(p_friendship_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count INT;
BEGIN
  DELETE FROM public.friendships
   WHERE id = p_friendship_id
     AND status = 'accepted'
     AND (requester_id = auth.uid() OR addressee_id = auth.uid());
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'No friendship found that you can remove';
  END IF;
  RETURN true;
END;
$$;

-- My accepted friends, with each friend's profile.
CREATE OR REPLACE FUNCTION public.friends_list()
RETURNS TABLE (friendship_id BIGINT, user_id UUID, username TEXT, since TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp STABLE AS $$
  SELECT f.id,
         p.id,
         p.username,
         f.updated_at
    FROM public.friendships f
    JOIN public.profiles p
      ON p.id = CASE WHEN f.requester_id = auth.uid()
                     THEN f.addressee_id ELSE f.requester_id END
   WHERE f.status = 'accepted'
     AND (f.requester_id = auth.uid() OR f.addressee_id = auth.uid())
   ORDER BY p.username;
$$;

-- Pending requests other people sent to me.
CREATE OR REPLACE FUNCTION public.friend_requests_incoming()
RETURNS TABLE (friendship_id BIGINT, user_id UUID, username TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp STABLE AS $$
  SELECT f.id, p.id, p.username, f.created_at
    FROM public.friendships f
    JOIN public.profiles p ON p.id = f.requester_id
   WHERE f.addressee_id = auth.uid() AND f.status = 'pending'
   ORDER BY f.created_at DESC;
$$;

-- Pending requests I sent to other people.
CREATE OR REPLACE FUNCTION public.friend_requests_outgoing()
RETURNS TABLE (friendship_id BIGINT, user_id UUID, username TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp STABLE AS $$
  SELECT f.id, p.id, p.username, f.created_at
    FROM public.friendships f
    JOIN public.profiles p ON p.id = f.addressee_id
   WHERE f.requester_id = auth.uid() AND f.status = 'pending'
   ORDER BY f.created_at DESC;
$$;

-- Forward-looking helper for recipe privacy (see the Notes section): true when
-- the two users have an accepted friendship in either direction. Marked STABLE so
-- it can be used inside RLS policies efficiently.
CREATE OR REPLACE FUNCTION public.are_friends(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
     WHERE status = 'accepted'
       AND LEAST(requester_id, addressee_id) = LEAST(p_user_a, p_user_b)
       AND GREATEST(requester_id, addressee_id) = GREATEST(p_user_a, p_user_b)
  );
$$;

GRANT EXECUTE ON FUNCTION public.send_friend_request(TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(BIGINT)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_friend_request(BIGINT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(BIGINT)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(BIGINT)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.friends_list()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.friend_requests_incoming()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.friend_requests_outgoing()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.are_friends(UUID, UUID)         TO authenticated;

-- ── Recipe privacy ─────────────────────────────────────────────────────────────
-- Per-recipe visibility, built on the friendships backend above. The recipes
-- table carries a `visibility` column (added in the Recipes section); this section
-- adds the share list for the 'specific_friends' level, a SECURITY DEFINER helper,
-- and the layered SELECT policy.
--
--   public           — anyone, including logged-out visitors
--   friends          — accepted friends of the author (via are_friends())
--   specific_friends — only the users listed in recipe_shares for that recipe
--   private          — the author only
--
-- The SELECT policy must run AFTER are_friends() and recipe_is_shared_with() exist,
-- which is why it lives here rather than in the Recipes section.

-- Which users a 'specific_friends' recipe is shared with. One row per (recipe,
-- user). Cascades away when either the recipe or the profile is deleted.
CREATE TABLE IF NOT EXISTS public.recipe_shares (
  recipe_id BIGINT REFERENCES public.recipes(id)  ON DELETE CASCADE NOT NULL,
  user_id   UUID   REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (recipe_id, user_id)
);

-- Find every recipe a given user has been granted access to.
CREATE INDEX IF NOT EXISTS recipe_shares_user_idx ON public.recipe_shares (user_id);

-- True when p_user is on the share list for p_recipe_id. SECURITY DEFINER so it
-- can be referenced from the recipes SELECT policy without recursing back into the
-- recipe_shares RLS (mirrors how are_friends() reads friendships).
CREATE OR REPLACE FUNCTION public.recipe_is_shared_with(p_recipe_id BIGINT, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recipe_shares
     WHERE recipe_id = p_recipe_id AND user_id = p_user
  );
$$;

GRANT EXECUTE ON FUNCTION public.recipe_is_shared_with(BIGINT, UUID) TO anon, authenticated;

ALTER TABLE public.recipe_shares ENABLE ROW LEVEL SECURITY;

-- The recipe's owner manages the whole share list; a shared user can see their own
-- row. All writes are restricted to the owner of the referenced recipe.
DROP POLICY IF EXISTS "recipe_shares_select" ON public.recipe_shares;
CREATE POLICY "recipe_shares_select" ON public.recipe_shares FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "recipe_shares_insert" ON public.recipe_shares;
CREATE POLICY "recipe_shares_insert" ON public.recipe_shares FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));

DROP POLICY IF EXISTS "recipe_shares_delete" ON public.recipe_shares;
CREATE POLICY "recipe_shares_delete" ON public.recipe_shares FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid()));

-- Layered visibility. auth.uid() is NULL for logged-out visitors, so only the
-- public branch matches for them. Owners always see their own recipes.
-- The policy references are_friends() for every row it tests, so the anon role
-- (used for logged-out reads) needs EXECUTE on it too — not just authenticated.
GRANT EXECUTE ON FUNCTION public.are_friends(UUID, UUID) TO anon;
DROP POLICY IF EXISTS "recipes_select_all" ON public.recipes;
DROP POLICY IF EXISTS "recipes_select_visible" ON public.recipes;
CREATE POLICY "recipes_select_visible" ON public.recipes FOR SELECT
  USING (
    visibility = 'public'
    OR user_id = auth.uid()
    OR (visibility = 'friends'          AND public.are_friends(auth.uid(), user_id))
    OR (visibility = 'specific_friends' AND public.recipe_is_shared_with(id, auth.uid()))
  );

-- ── Recipe imports (AI extraction) ─────────────────────────────────────────────
-- One row per successful "Import Recipe" run. Used to enforce a per-user daily
-- rate limit (10 imports / rolling 24h). Rows are written ONLY by the
-- import-recipe Edge Function using the service-role key (which bypasses RLS);
-- the client just reads its own history to show the remaining quota.

CREATE TABLE IF NOT EXISTS public.import_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Powers both the rate-limit count and the "X of 10 remaining" lookup.
CREATE INDEX IF NOT EXISTS import_logs_user_time_idx ON public.import_logs (user_id, created_at DESC);

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

-- Users may read their own import history. No INSERT/UPDATE/DELETE policies —
-- writes happen only through the Edge Function's service-role client.
DROP POLICY IF EXISTS "import_logs_select_own" ON public.import_logs;
CREATE POLICY "import_logs_select_own" ON public.import_logs FOR SELECT
  USING (auth.uid() = user_id);

-- ── Migration helpers ────────────────────────────────────────────────────────
-- If the recipes table already exists, run these to add later columns:
-- ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS origin TEXT;
-- ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL
--   DEFAULT 'public' CHECK (visibility IN ('public','friends','specific_friends','private'));
--
-- The Friendships, Recipe privacy, and Recipe imports sections are fully
-- idempotent — re-running this file (or just those sections) against an existing
-- database is safe. Standalone apply files exist for the incremental changes:
-- supabase/recipe_privacy.sql and supabase/import_logs.sql.

-- ── Notes ─────────────────────────────────────────────────────────────────────
-- In Supabase Dashboard → Authentication → Settings:
--   • "Confirm email" can be turned OFF for a no-verification flow (matches the
--     old server behaviour).
--   • Add your production URL to "Redirect URLs" for password-reset emails
--     (e.g. https://your-app.vercel.app/).
