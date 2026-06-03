-- Apply this in the Supabase Dashboard → SQL Editor to add the recipe-import
-- rate-limit log. Idempotent: safe to re-run. Pairs with the import-recipe Edge
-- Function (supabase/functions/import-recipe). Extracted from schema.sql.

-- ── Recipe imports (AI extraction) ─────────────────────────────────────────────
-- One row per successful "Import Recipe" run, used to enforce a per-user daily
-- limit (10 imports / rolling 24h). Rows are written ONLY by the import-recipe
-- Edge Function using the service-role key (which bypasses RLS); the client just
-- reads its own history to show the remaining quota.

CREATE TABLE IF NOT EXISTS public.import_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS import_logs_user_time_idx ON public.import_logs (user_id, created_at DESC);

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

-- Users may read their own import history. No INSERT/UPDATE/DELETE policies —
-- writes happen only through the Edge Function's service-role client.
DROP POLICY IF EXISTS "import_logs_select_own" ON public.import_logs;
CREATE POLICY "import_logs_select_own" ON public.import_logs FOR SELECT
  USING (auth.uid() = user_id);
