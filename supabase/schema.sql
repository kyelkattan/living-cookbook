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
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes_select_all"  ON public.recipes FOR SELECT USING (true);
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

-- ── Migration helpers ────────────────────────────────────────────────────────
-- If the recipes table already exists, run this to add the origin column:
-- ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS origin TEXT;

-- ── Notes ─────────────────────────────────────────────────────────────────────
-- In Supabase Dashboard → Authentication → Settings:
--   • "Confirm email" can be turned OFF for a no-verification flow (matches the
--     old server behaviour).
--   • Add your production URL to "Redirect URLs" for password-reset emails
--     (e.g. https://your-app.vercel.app/).
