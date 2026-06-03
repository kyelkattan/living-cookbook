-- Apply this in the Supabase Dashboard → SQL Editor to create the friends
-- backend (friendships table, RLS, and RPC functions). Idempotent: safe to
-- re-run. Extracted from schema.sql lines 96-343.

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

