const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { read, write } = require('./db');

const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'living-cookbook-dev-secret-change-in-production';

if (!process.env.JWT_SECRET) {
  console.warn('Warning: JWT_SECRET env var not set — using insecure default. Set it before deploying.');
}

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// ── Helpers ───────────────────────────────────────────────────────────────────

function ingredientText(ing) {
  if (typeof ing === 'string') return ing;
  return [ing.amount, ing.unit, ing.item].filter(Boolean).join(' ');
}

function cleanIngredients(raw) {
  return (raw || [])
    .map(ing => ({
      amount: (ing.amount || '').trim(),
      unit: (ing.unit || '').trim(),
      item: (ing.item || '').trim(),
    }))
    .filter(ing => ing.item);
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Sign in to continue' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired — please sign in again' });
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.json(null);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ id: payload.userId, email: payload.email });
  } catch {
    res.json(null);
  }
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const db = read();
    const normalizedEmail = email.toLowerCase().trim();

    if (db.users.find(u => u.email === normalizedEmail)) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = { id: db.nextUserId++, email: normalizedEmail, passwordHash, created_at: new Date().toISOString() };
    db.users.push(user);
    write(db);

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(201).json({ id: user.id, email: user.email });
  } catch (err) { next(err); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = read();
    const user = db.users.find(u => u.email === email.toLowerCase().trim());

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ id: user.id, email: user.email });
  } catch (err) { next(err); }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

// ── Recipes ───────────────────────────────────────────────────────────────────

app.get('/api/recipes', (req, res) => {
  const { search } = req.query;
  let { recipes } = read();

  if (search) {
    const term = search.toLowerCase();
    recipes = recipes.filter(r =>
      r.name.toLowerCase().includes(term) ||
      r.description.toLowerCase().includes(term) ||
      (r.ingredients || []).some(i => ingredientText(i).toLowerCase().includes(term))
    );
  }

  res.json(recipes.map(({ id, name, description, created_at, user_email }) =>
    ({ id, name, description, created_at, user_email })
  ));
});

app.get('/api/recipes/:id', (req, res) => {
  const { recipes } = read();
  const recipe = recipes.find(r => r.id === Number(req.params.id));
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  res.json(recipe);
});

app.get('/api/ingredient-items', (req, res) => {
  const { recipes } = read();
  const items = new Set();
  recipes.forEach(r => {
    (r.ingredients || []).forEach(ing => {
      const item = typeof ing === 'string' ? ing.trim() : ing.item?.trim();
      if (item) items.add(item);
    });
  });
  res.json([...items].sort((a, b) => a.localeCompare(b)));
});

app.post('/api/recipes', requireAuth, (req, res) => {
  const { name, description, ingredients, steps } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'Recipe name is required' });

  const validIngredients = cleanIngredients(ingredients);
  const validSteps = (steps || []).map(s => s?.trim()).filter(Boolean);

  if (!validIngredients.length) return res.status(400).json({ error: 'At least one ingredient is required' });
  if (!validSteps.length) return res.status(400).json({ error: 'At least one step is required' });

  const db = read();
  const recipe = {
    id: db.nextId++,
    user_id: req.user.userId,
    user_email: req.user.email,
    name: name.trim(),
    description: description?.trim() || '',
    ingredients: validIngredients,
    steps: validSteps,
    created_at: new Date().toISOString(),
  };
  db.recipes.unshift(recipe);
  write(db);
  res.status(201).json(recipe);
});

app.put('/api/recipes/:id', requireAuth, (req, res) => {
  const { name, description, ingredients, steps } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'Recipe name is required' });

  const validIngredients = cleanIngredients(ingredients);
  const validSteps = (steps || []).map(s => s?.trim()).filter(Boolean);

  if (!validIngredients.length) return res.status(400).json({ error: 'At least one ingredient is required' });
  if (!validSteps.length) return res.status(400).json({ error: 'At least one step is required' });

  const db = read();
  const idx = db.recipes.findIndex(r => r.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Recipe not found' });

  if (db.recipes[idx].user_id !== req.user.userId) {
    return res.status(403).json({ error: 'You can only edit your own recipes' });
  }

  db.recipes[idx] = { ...db.recipes[idx], name: name.trim(), description: description?.trim() || '', ingredients: validIngredients, steps: validSteps };
  write(db);
  res.json(db.recipes[idx]);
});

app.delete('/api/recipes/:id', requireAuth, (req, res) => {
  const db = read();
  const idx = db.recipes.findIndex(r => r.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Recipe not found' });

  if (db.recipes[idx].user_id !== req.user.userId) {
    return res.status(403).json({ error: 'You can only delete your own recipes' });
  }

  db.recipes.splice(idx, 1);
  write(db);
  res.status(204).send();
});

// ── Error handler ─────────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
