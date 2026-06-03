-- Apply this in the Supabase Dashboard → SQL Editor to add the per-user shopping
-- list. Idempotent: safe to re-run. Extracted from schema.sql.

-- ── Shopping list ───────────────────────────────────────────────────────────
-- One row per ingredient contribution: the ingredient as it appeared on a single
-- recipe (recipe_id), with the recipe name denormalized so the list still reads
-- correctly after the recipe is edited or deleted. Consolidating duplicates
-- (e.g. "1 cup flour" + "2 cups flour" → "3 cups flour") and converting between
-- compatible units happens at read time on the client — the database just stores
-- the raw contributions. This keeps per-recipe removal trivial (delete that
-- recipe's rows and the consolidated totals re-sum to less) and the checked state
-- unambiguous (it lives on the contribution rows, and the client toggles every
-- row behind a consolidated line together).
--
-- recipe_id is ON DELETE SET NULL (not CASCADE) so deleting a recipe doesn't
-- silently wipe items the user already added to their list; the denormalized
-- recipe_name keeps them grouped/labelled.

CREATE TABLE IF NOT EXISTS public.shopping_list (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID   REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  recipe_id   BIGINT REFERENCES public.recipes(id)  ON DELETE SET NULL,
  recipe_name TEXT    NOT NULL DEFAULT '',
  item        TEXT    NOT NULL,
  amount      TEXT,                       -- raw amount as entered (e.g. "1", "1/2", "2.5"); NULL when none
  unit        TEXT    NOT NULL DEFAULT '',
  checked     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- The list view always loads a single user's rows.
CREATE INDEX IF NOT EXISTS shopping_list_user_idx   ON public.shopping_list (user_id, created_at);
-- "Is this recipe already in my list?" and per-recipe removal.
CREATE INDEX IF NOT EXISTS shopping_list_recipe_idx ON public.shopping_list (recipe_id);

ALTER TABLE public.shopping_list ENABLE ROW LEVEL SECURITY;

-- A user can only ever see or touch their own list. Every policy pins the row to
-- auth.uid(), so the client's delete-by-recipe and clear-all calls can't reach
-- another user's rows even without an explicit user_id filter.
DROP POLICY IF EXISTS "shopping_list_select_own" ON public.shopping_list;
CREATE POLICY "shopping_list_select_own" ON public.shopping_list FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "shopping_list_insert_own" ON public.shopping_list;
CREATE POLICY "shopping_list_insert_own" ON public.shopping_list FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "shopping_list_update_own" ON public.shopping_list;
CREATE POLICY "shopping_list_update_own" ON public.shopping_list FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "shopping_list_delete_own" ON public.shopping_list;
CREATE POLICY "shopping_list_delete_own" ON public.shopping_list FOR DELETE
  USING (auth.uid() = user_id);

-- Cross-device sync: stream row changes to the client over Realtime. Guarded so
-- re-running this file doesn't error if the table is already in the publication.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_list;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;  -- publication missing on a non-Supabase Postgres
END $$;
