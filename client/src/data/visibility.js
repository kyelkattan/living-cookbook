// Recipe visibility levels. Mirrors the `visibility` column + RLS policy in
// supabase/schema.sql. `icon` is a plain glyph so it renders in the retro
// monospace UI without pulling in an icon set.
export const VISIBILITY_OPTIONS = [
  {
    value: 'public',
    label: 'Public',
    icon: '⊕', // ⊕
    description: 'Anyone can see this recipe, including visitors who are not logged in.',
  },
  {
    value: 'friends',
    label: 'Friends',
    icon: '✦', // ✦
    description: 'Only people you have accepted as friends can see this recipe.',
  },
  {
    value: 'specific_friends',
    label: 'Specific Friends',
    icon: '★', // ★
    description: 'Only the friends you pick below can see this recipe.',
  },
  {
    value: 'private',
    label: 'Private',
    icon: '⊘', // ⊘
    description: 'Only you can see this recipe. Nobody else can find or open it.',
  },
];

export const VISIBILITY_MAP = Object.fromEntries(
  VISIBILITY_OPTIONS.map(o => [o.value, o])
);

export const DEFAULT_VISIBILITY = 'public';

// Safe lookup that falls back to the default level for unknown/missing values.
export function getVisibility(value) {
  return VISIBILITY_MAP[value] || VISIBILITY_MAP[DEFAULT_VISIBILITY];
}
