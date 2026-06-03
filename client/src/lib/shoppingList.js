// Shopping-list consolidation logic.
//
// The database stores one row per ingredient *contribution* (the ingredient as it
// appeared on a single recipe). This module turns those raw rows into the
// consolidated checklist the UI shows: duplicate ingredients are summed, and
// where their units differ but are compatible (e.g. cups + tablespoons) they're
// converted to a common unit first. Everything here is pure so it's easy to test
// and reason about.

// ── Unit conversions ─────────────────────────────────────────────────────────
// Two dimensions the app can reason about: volume (base = millilitre) and weight
// (base = gram). Each entry maps a canonical unit to its size in the base unit.
// Standard culinary conversions: 1 tbsp = 3 tsp, 1 cup = 16 tbsp; 1 lb = 16 oz,
// 1 oz ≈ 28.35 g. Anything not in these tables (a clove, a knob, a pinch) has no
// dimension and only ever combines with an identical unit, never converts.
const VOLUME = {
  teaspoon:    4.92892,
  tablespoon:  14.7868,
  'fluid ounce': 29.5735,
  cup:         236.588,
  pint:        473.176,
  quart:       946.353,
  gallon:      3785.41,
  milliliter:  1,
  liter:       1000,
};
const WEIGHT = {
  gram:     1,
  kilogram: 1000,
  ounce:    28.3495,
  pound:    453.592,
};

// Maps the many ways a unit can be written (including the app's own dropdown
// labels like "Tablespoon (tbsp)") to a canonical key in the tables above.
const UNIT_ALIASES = {
  // volume
  tsp: 'teaspoon', tsps: 'teaspoon', teaspoon: 'teaspoon', teaspoons: 'teaspoon',
  tbsp: 'tablespoon', tbsps: 'tablespoon', tbs: 'tablespoon', tbl: 'tablespoon',
  tablespoon: 'tablespoon', tablespoons: 'tablespoon',
  'fl oz': 'fluid ounce', 'fluid ounce': 'fluid ounce', 'fluid ounces': 'fluid ounce',
  c: 'cup', cup: 'cup', cups: 'cup',
  pt: 'pint', pint: 'pint', pints: 'pint',
  qt: 'quart', quart: 'quart', quarts: 'quart',
  gal: 'gallon', gallon: 'gallon', gallons: 'gallon',
  ml: 'milliliter', milliliter: 'milliliter', milliliters: 'milliliter',
  millilitre: 'milliliter', millilitres: 'milliliter',
  l: 'liter', liter: 'liter', liters: 'liter', litre: 'liter', litres: 'liter',
  // weight
  g: 'gram', gr: 'gram', gram: 'gram', grams: 'gram', gramme: 'gram', grammes: 'gram',
  kg: 'kilogram', kilo: 'kilogram', kilos: 'kilogram',
  kilogram: 'kilogram', kilograms: 'kilogram', kilogramme: 'kilogram', kilogrammes: 'kilogram',
  oz: 'ounce', ounce: 'ounce', ounces: 'ounce',
  lb: 'pound', lbs: 'pound', pound: 'pound', pounds: 'pound',
};

// Pretty labels for a canonical unit, used when rendering a consolidated total.
// Abbreviations (tsp, lb, g…) read fine at any quantity; only the spelled-out
// "cup" needs to agree in number, so it carries a [singular, plural] pair.
const CANONICAL_LABEL = {
  teaspoon: 'tsp', tablespoon: 'tbsp', 'fluid ounce': 'fl oz', cup: ['cup', 'cups'],
  pint: 'pt', quart: 'qt', gallon: 'gal', milliliter: 'mL', liter: 'L',
  gram: 'g', kilogram: 'kg', ounce: 'oz', pound: 'lb',
};

function canonicalLabel(canonical, value) {
  const label = CANONICAL_LABEL[canonical];
  if (Array.isArray(label)) return value > 1 ? label[1] : label[0];
  return label;
}

// Case-insensitive, whitespace-trimmed key for matching items/units.
export function normalizeKey(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Resolve a free-text unit to { dim, canonical, perBase }, or null if we don't
// recognise it. Strips a trailing parenthetical so "Tablespoon (tbsp)" works.
export function normalizeUnit(raw) {
  let key = normalizeKey(raw).replace(/\s*\(.*\)\s*$/, '');
  if (!key) return null;
  const canonical = UNIT_ALIASES[key];
  if (!canonical) return null;
  if (canonical in VOLUME) return { dim: 'volume', canonical, perBase: VOLUME[canonical] };
  if (canonical in WEIGHT) return { dim: 'weight', canonical, perBase: WEIGHT[canonical] };
  return null;
}

const UNICODE_FRACTIONS = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

// Parse an amount string into a number, or null when it isn't numeric (e.g. "a
// knob", "to taste", ""). Handles integers, decimals, simple and mixed
// fractions, and unicode fraction glyphs ("1½", "1 1/2", "0.5", "3/4").
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;

  // Expand unicode fractions: "1½" → "1 0.5", "½" → " 0.5".
  s = s.replace(/([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (ch) => ` ${UNICODE_FRACTIONS[ch]} `);
  s = s.trim().replace(/\s+/g, ' ');

  let m;
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return Number(m[1]) / Number(m[2]);

  // One or more space-separated plain numbers (covers an expanded unicode
  // fraction like "1 0.5"); sum them.
  const parts = s.split(' ');
  if (parts.length > 1 && parts.every((p) => /^\d*\.?\d+$/.test(p))) {
    return parts.reduce((sum, p) => sum + parseFloat(p), 0);
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const NICE_FRACTIONS = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'],
];

// Render a number back to a friendly cookbook amount: whole numbers stay whole,
// common fractions become glyphs ("1.5" → "1 ½"), everything else rounds to two
// decimals with trailing zeros stripped.
export function formatAmount(n) {
  if (n == null || !Number.isFinite(n)) return '';
  if (n === 0) return '0';
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  for (const [value, glyph] of NICE_FRACTIONS) {
    if (Math.abs(frac - value) < 0.02) {
      return whole > 0 ? `${whole} ${glyph}` : glyph;
    }
  }
  if (frac < 0.02) return String(whole);
  return String(Math.round(n * 100) / 100);
}

// Clean a raw unit for display: drop a trailing parenthetical ("Cup" stays,
// "Tablespoon (tbsp)" → "Tablespoon").
function displayUnit(raw) {
  return String(raw ?? '').trim().replace(/\s*\(.*\)\s*$/, '');
}

// Distinct contributing recipes for a group, in first-seen order. Identity is the
// recipe_id when present, otherwise the (denormalized) recipe name — so rows left
// orphaned by a deleted recipe still group sensibly by name.
function distinctRecipes(members) {
  const seen = new Map();
  for (const { row } of members) {
    const id = row.recipe_id ?? null;
    const key = id != null ? `id:${id}` : `name:${normalizeKey(row.recipe_name)}`;
    if (!seen.has(key)) seen.set(key, { id, name: row.recipe_name || 'Untitled recipe' });
  }
  return [...seen.values()];
}

// Turn one group of contribution rows into a single consolidated line.
function buildLine(key, members) {
  const recipes = distinctRecipes(members);
  const rowIds = members.map((m) => m.row.id);
  const checkedCount = members.filter((m) => m.row.checked).length;
  const checked = checkedCount === members.length;
  const partial = checkedCount > 0 && !checked;
  const item = members[0].row.item.trim();

  let amountText = '';
  let unitText = '';

  const numeric = members.every((m) => m.amt != null);
  const recognised = members.every((m) => m.uInfo);

  if (numeric && recognised && members.length >= 1) {
    // Combine within a dimension, displaying the total in the unit of whichever
    // contribution is largest (so "1 cup + 8 tbsp" reads in cups, not tbsp).
    const totalBase = members.reduce((sum, m) => sum + m.amt * m.uInfo.perBase, 0);
    const dominant = members.reduce((a, b) =>
      b.amt * b.uInfo.perBase > a.amt * a.uInfo.perBase ? b : a
    );
    const total = totalBase / dominant.uInfo.perBase;
    amountText = formatAmount(total);
    unitText = canonicalLabel(dominant.uInfo.canonical, total) || displayUnit(dominant.row.unit);
  } else if (numeric) {
    // Same item + identical (unrecognised) unit: just add the amounts.
    const total = members.reduce((sum, m) => sum + m.amt, 0);
    amountText = formatAmount(total);
    unitText = displayUnit(members[0].row.unit);
  } else {
    // Not numeric — a lone "a knob of butter"-style row. Show it verbatim.
    amountText = String(members[0].row.amount ?? '').trim();
    unitText = displayUnit(members[0].row.unit);
  }

  const label = [amountText, unitText, item].filter(Boolean).join(' ');

  return { key, item, amountText, unitText, label, checked, partial, rowIds, recipes };
}

// Build the consolidated view-model from raw shopping_list rows.
//
// Grouping rules (case-insensitive, whitespace-trimmed throughout):
//   • Same item + recognised units of the same dimension → combine (converting).
//   • Same item + identical unrecognised unit            → combine (summing).
//   • Anything with a non-numeric amount                 → its own line.
//   • Incompatible units (volume vs weight, knob vs grams) stay separate.
//
// Returns lines sorted alphabetically by item. Each line carries the underlying
// rowIds (so the UI can toggle/remove the whole consolidated entry) and the list
// of source recipes.
export function buildShoppingView(rows) {
  const groups = new Map();

  for (const row of rows) {
    const amt = parseAmount(row.amount);
    const uInfo = normalizeUnit(row.unit);
    const itemKey = normalizeKey(row.item);

    let key;
    if (amt == null) {
      key = `solo:${row.id}`;                       // can't sum — keep standalone
    } else if (uInfo) {
      key = `dim:${uInfo.dim}:${itemKey}`;          // convertible within a dimension
    } else {
      key = `unit:${itemKey}:${normalizeKey(row.unit)}`; // identical literal unit only
    }

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ row, amt, uInfo });
  }

  return [...groups.entries()]
    .map(([key, members]) => buildLine(key, members))
    .sort((a, b) => a.item.localeCompare(b.item));
}

// Normalize a recipe ingredient (object or legacy plain string) to { amount,
// unit, item }. Shared with the form's own normalizer shape.
export function normalizeIngredient(ing) {
  if (typeof ing === 'string') return { amount: '', unit: '', item: ing };
  return { amount: ing?.amount ?? '', unit: ing?.unit ?? '', item: ing?.item ?? '' };
}
