// Supabase Edge Function: import-recipe
//
// Extracts a structured recipe from pasted text or a photo using the Anthropic
// API, and enforces a per-user daily import limit. The Anthropic API key never
// leaves the server — it's read from the ANTHROPIC_API_KEY secret.
//
// Deploy:   supabase functions deploy import-recipe
// Secret:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are injected by the
//  Edge runtime automatically.)
//
// Request body (JSON):
//   { "type": "text",  "text": "<pasted recipe>" }
//   { "type": "image", "image": { "media_type": "image/jpeg", "data": "<base64>" } }
//
// Response (always HTTP 200 for handled outcomes; non-2xx only for auth/server):
//   { ok: true,  recipe: {...}, remaining: number, resetsAt: string|null }
//   { ok: false, code: "limit"|"parse"|"input", error: string, remaining, resetsAt }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const DAILY_LIMIT = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MODEL = 'claude-sonnet-4-6';
const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const EXTRACTION_PROMPT = `You are a recipe extraction assistant for a cookbook app. Extract a SINGLE recipe from the user's input (pasted text or a photo of a printed/handwritten recipe).

Respond with ONLY a JSON object — no markdown, no code fences, no commentary. The object must match exactly this shape:
{
  "name": string,
  "description": string,
  "categories": string[],
  "ingredients": [ { "amount": string, "unit": string, "item": string } ],
  "steps": string[],
  "tools": string[]
}

Rules:
- "categories" may ONLY contain the values "Baking" and/or "Cooking". Use "Baking" for baked goods (breads, cakes, cookies, pastries, anything oven-baked from a batter/dough); otherwise use "Cooking". Include both only when the recipe genuinely involves both. Never leave it empty — pick the best single fit.
- "amount" is the quantity as a string (e.g. "2", "1/2", "1.5"); "unit" is the measurement (e.g. "cup", "tbsp", "g", "clove") or "" when there is none; "item" is the ingredient name.
- "steps" are individual instruction sentences in order, WITHOUT leading numbers.
- "tools" are kitchen tools/equipment mentioned or clearly required (e.g. "Oven", "Whisk", "9-inch pan"); use [] if none are evident.
- "description" is a short one-line summary; use "" if the source gives none.

If the input does NOT contain a recipe, or is too unclear to extract one, respond with ONLY:
{"error":"no_recipe"}`;

function safeJsonParse(text: string): any | null {
  if (!text) return null;
  let t = text.trim();
  // Strip ``` / ```json fences if the model added them despite instructions.
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    // Fall back to the first balanced-looking { ... } slice.
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try { return JSON.parse(t.slice(first, last + 1)); } catch { /* ignore */ }
    }
    return null;
  }
}

// Normalize Claude's output into the exact form the recipe form expects.
function normalizeRecipe(raw: any): any | null {
  if (!raw || typeof raw !== 'object' || raw.error) return null;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;

  const categories = (Array.isArray(raw.categories) ? raw.categories : [])
    .map((c: unknown) => String(c).trim())
    .filter((c: string) => c === 'Baking' || c === 'Cooking');
  // Guarantee at least one valid category so the form passes validation.
  if (categories.length === 0) categories.push('Cooking');

  const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : [])
    .map((ing: any) => ({
      amount: String(ing?.amount ?? '').trim(),
      unit: String(ing?.unit ?? '').trim(),
      item: String(ing?.item ?? '').trim(),
    }))
    .filter((ing: any) => ing.item);

  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((s: unknown) => String(s).trim())
    .filter(Boolean);

  const tools = (Array.isArray(raw.tools) ? raw.tools : [])
    .map((t: unknown) => String(t).trim())
    .filter(Boolean);

  // A recipe with no ingredients AND no steps isn't usable.
  if (ingredients.length === 0 && steps.length === 0) return null;

  return {
    name: raw.name.trim(),
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    categories: [...new Set(categories)],
    ingredients,
    steps,
    tools: [...new Set(tools)],
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

  if (!ANTHROPIC_API_KEY) {
    return json({ ok: false, error: 'Import is not configured. Please contact the site owner.' }, 500);
  }

  // ── Authenticate the Supabase user from the request token ──────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const authed = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await authed.auth.getUser();
  if (userErr || !user) {
    return json({ ok: false, error: 'Please sign in to import recipes.' }, 401);
  }

  // ── Rate limit (service role bypasses RLS for the count + insert) ───────────
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();

  const { data: recent, error: countErr } = await admin
    .from('import_logs')
    .select('created_at')
    .eq('user_id', user.id)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true });

  if (countErr) {
    return json({ ok: false, error: 'Could not check your import limit. Please try again.' }, 500);
  }

  const used = recent?.length ?? 0;
  // With a rolling window, the quota frees up when the oldest import ages out.
  const resetsAt = used > 0 ? new Date(new Date(recent![0].created_at).getTime() + WINDOW_MS).toISOString() : null;

  if (used >= DAILY_LIMIT) {
    return json({
      ok: false,
      code: 'limit',
      error: `You've used all ${DAILY_LIMIT} of your recipe imports for today. Your limit resets at ${formatReset(resetsAt)}.`,
      remaining: 0,
      resetsAt,
    });
  }

  // ── Parse the request ──────────────────────────────────────────────────────
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, code: 'input', error: 'Invalid request.', remaining: DAILY_LIMIT - used, resetsAt });
  }

  let content: any[];
  if (payload?.type === 'text') {
    const text = String(payload.text ?? '').trim();
    if (text.length < 10) {
      return json({ ok: false, code: 'input', error: 'Please paste some recipe text first.', remaining: DAILY_LIMIT - used, resetsAt });
    }
    content = [{ type: 'text', text: `Here is the recipe text to extract:\n\n${text}` }];
  } else if (payload?.type === 'image') {
    const media = String(payload?.image?.media_type ?? '');
    const data = String(payload?.image?.data ?? '');
    if (!ALLOWED_MEDIA.includes(media) || !data) {
      return json({ ok: false, code: 'input', error: 'Please choose a JPG, PNG, or WebP image.', remaining: DAILY_LIMIT - used, resetsAt });
    }
    content = [
      { type: 'image', source: { type: 'base64', media_type: media, data } },
      { type: 'text', text: 'Extract the recipe shown in this image.' },
    ];
  } else {
    return json({ ok: false, code: 'input', error: 'Nothing to import.', remaining: DAILY_LIMIT - used, resetsAt });
  }

  // ── Call Anthropic ─────────────────────────────────────────────────────────
  let anthropicRes: Response;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: EXTRACTION_PROMPT,
        messages: [{ role: 'user', content }],
      }),
    });
  } catch {
    return json({ ok: false, error: 'Could not reach the import service. Please try again.', remaining: DAILY_LIMIT - used, resetsAt }, 502);
  }

  if (!anthropicRes.ok) {
    const detail = await anthropicRes.text();
    console.error('Anthropic error', anthropicRes.status, detail);
    return json({ ok: false, error: 'The import service had a problem. Please try again in a moment.', remaining: DAILY_LIMIT - used, resetsAt }, 502);
  }

  const result = await anthropicRes.json();
  const textOut = (result?.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');

  const recipe = normalizeRecipe(safeJsonParse(textOut));
  if (!recipe) {
    return json({
      ok: false,
      code: 'parse',
      error: "We couldn't find a recipe in that. Try again with clearer text, or a sharper, well-lit photo.",
      remaining: DAILY_LIMIT - used,
      resetsAt,
    });
  }

  // ── Log the successful import (counts against the daily limit) ──────────────
  const { error: logErr } = await admin.from('import_logs').insert({ user_id: user.id });
  if (logErr) console.error('import_logs insert failed', logErr);

  const newUsed = used + 1;
  const newResetsAt = used > 0 ? resetsAt : new Date(Date.now() + WINDOW_MS).toISOString();

  return json({
    ok: true,
    recipe,
    remaining: Math.max(0, DAILY_LIMIT - newUsed),
    resetsAt: newResetsAt,
  });
});

function formatReset(iso: string | null): string {
  if (!iso) return 'soon';
  try {
    return new Date(iso).toLocaleString('en-US', {
      hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric',
    });
  } catch {
    return 'soon';
  }
}
