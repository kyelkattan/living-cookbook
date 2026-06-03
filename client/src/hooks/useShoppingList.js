import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { buildShoppingView, normalizeIngredient } from '../lib/shoppingList';

// Owns the signed-in user's shopping list: loads the raw contribution rows, keeps
// them in sync across devices over Supabase Realtime, and exposes the mutations
// the UI needs. The consolidated view-model (deduped/converted lines) is derived
// from the rows so every device renders the same thing from the same data.
export function useShoppingList(user) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!user) { setRows([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('shopping_list')
      .select('id, recipe_id, recipe_name, item, amount, unit, checked, created_at')
      .order('created_at', { ascending: true });
    if (!error) setRows(data || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Realtime: refetch whenever any of this user's rows change. Covers edits made
  // on another device (checking an item on mobile shows up on desktop) as well as
  // our own writes — local mutations also refetch immediately so the UI never
  // waits on the round-trip even if Realtime isn't enabled on the project.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`shopping_list:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list', filter: `user_id=eq.${user.id}` },
        () => { fetchRows(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchRows]);

  const lines = useMemo(() => buildShoppingView(rows), [rows]);
  const remainingCount = useMemo(() => lines.filter((l) => !l.checked).length, [lines]);

  // Distinct recipes currently represented in the list, for the per-recipe
  // removal controls. Keyed by recipe_id (falling back to name when orphaned).
  const recipes = useMemo(() => {
    const seen = new Map();
    for (const r of rows) {
      const key = r.recipe_id != null ? `id:${r.recipe_id}` : `name:${(r.recipe_name || '').toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, { id: r.recipe_id ?? null, name: r.recipe_name || 'Untitled recipe' });
    }
    return [...seen.values()];
  }, [rows]);

  const isRecipeInList = useCallback(
    (recipeId) => rows.some((r) => r.recipe_id === recipeId),
    [rows]
  );

  // Add every ingredient of a recipe as its own contribution row. Consolidation
  // happens at read time, so we never merge here — that keeps removal exact.
  const addRecipe = useCallback(async (recipe) => {
    if (!user) throw new Error('Please sign in to use your shopping list');
    const ingredients = (recipe.ingredients || [])
      .map(normalizeIngredient)
      .filter((i) => i.item && i.item.trim());
    if (!ingredients.length) throw new Error('This recipe has no ingredients to add');

    const payload = ingredients.map((i) => ({
      user_id: user.id,
      recipe_id: recipe.id,
      recipe_name: recipe.name || '',
      item: i.item.trim(),
      amount: String(i.amount ?? '').trim() || null,
      unit: String(i.unit ?? '').trim(),
      checked: false,
    }));

    const { error } = await supabase.from('shopping_list').insert(payload);
    if (error) throw new Error(error.message);
    await fetchRows();
  }, [user?.id, fetchRows]);

  // Remove a recipe's contributions entirely. Consolidated lines that drew on it
  // re-sum from the remaining rows, so a shared item is subtracted down rather
  // than wiped. (RLS scopes the delete to the caller; the user_id filter is
  // belt-and-braces.)
  const removeRecipe = useCallback(async (recipeId) => {
    if (!user) return;
    const query = supabase.from('shopping_list').delete().eq('user_id', user.id);
    const { error } = recipeId == null
      ? await query.is('recipe_id', null)
      : await query.eq('recipe_id', recipeId);
    if (error) throw new Error(error.message);
    await fetchRows();
  }, [user?.id, fetchRows]);

  // Toggle a consolidated line: flip every contribution row behind it together so
  // the checked state stays unambiguous. Optimistic, with a refetch on failure.
  const toggleLine = useCallback(async (line, checked) => {
    setRows((prev) => prev.map((r) => (line.rowIds.includes(r.id) ? { ...r, checked } : r)));
    const { error } = await supabase
      .from('shopping_list')
      .update({ checked })
      .in('id', line.rowIds);
    if (error) { await fetchRows(); throw new Error(error.message); }
  }, [fetchRows]);

  const clear = useCallback(async () => {
    if (!user) return;
    const { error } = await supabase.from('shopping_list').delete().eq('user_id', user.id);
    if (error) throw new Error(error.message);
    await fetchRows();
  }, [user?.id, fetchRows]);

  return {
    rows, lines, recipes, remainingCount, loading,
    isRecipeInList, addRecipe, removeRecipe, toggleLine, clear, refresh: fetchRows,
  };
}
