-- Apply this in the Supabase Dashboard → SQL Editor to add recipe privacy levels
-- on top of the existing recipes + friendships backend. Idempotent: safe to
-- re-run. Requires the Friendships section (are_friends()) to already exist.
-- Extracted from schema.sql.

-- ── Recipe privacy ─────────────────────────────────────────────────────────────
-- Per-recipe visibility built on the friendships backend:
--   public           — anyone, including logged-out visitors
--   friends          — accepted friends of the author (via are_friends())
--   specific_friends — only the users listed in recipe_shares for that recipe
--   private          — the author only

-- 1. Visibility column on recipes (default keeps every existing recipe public).
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL
  DEFAULT 'public' CHECK (visibility IN ('public', 'friends', 'specific_friends', 'private'));

-- 2. Share list for the 'specific_friends' level. One row per (recipe, user).
CREATE TABLE IF NOT EXISTS public.recipe_shares (
  recipe_id  BIGINT REFERENCES public.recipes(id)  ON DELETE CASCADE NOT NULL,
  user_id    UUID   REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (recipe_id, user_id)
);

CREATE INDEX IF NOT EXISTS recipe_shares_user_idx ON public.recipe_shares (user_id);

-- 3. SECURITY DEFINER membership helper so the recipes SELECT policy can check the
--    share list without recursing back into recipe_shares RLS.
CREATE OR REPLACE FUNCTION public.recipe_is_shared_with(p_recipe_id BIGINT, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recipe_shares
     WHERE recipe_id = p_recipe_id AND user_id = p_user
  );
$$;

GRANT EXECUTE ON FUNCTION public.recipe_is_shared_with(BIGINT, UUID) TO anon, authenticated;

-- 4. RLS for recipe_shares. The recipe's owner manages the whole list; a shared
--    user can see their own row. All writes are restricted to the recipe owner.
ALTER TABLE public.recipe_shares ENABLE ROW LEVEL SECURITY;

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

-- 5. Replace the open SELECT policy on recipes with the layered one. The policy
--    references are_friends() for every row it tests, so the anon role (logged-out
--    reads) needs EXECUTE on it too — not just authenticated.
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
