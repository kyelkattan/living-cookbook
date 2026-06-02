import { useState, useEffect, useCallback } from 'react';
import SearchBar from './components/SearchBar';
import RecipeList from './components/RecipeList';
import RecipeDetail from './components/RecipeDetail';
import RecipeForm from './components/RecipeForm';
import AuthModal from './components/AuthModal';
import ResetPasswordModal from './components/ResetPasswordModal';
import HomePage from './components/HomePage';

async function safeError(res, fallback) {
  try { const b = await res.json(); return b.error || fallback; }
  catch { return fallback; }
}

export default function App() {
  const [view, setView] = useState('home');
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [resetToken, setResetToken] = useState(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(u => setUser(u)).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset');
    if (token) { setResetToken(token); window.history.replaceState({}, '', window.location.pathname); }
  }, []);

  const fetchRecipes = useCallback(async (query = '') => {
    setLoading(true); setError(null);
    try {
      const url = query ? `/api/recipes?search=${encodeURIComponent(query)}` : '/api/recipes';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load recipes');
      setRecipes(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (view === 'list') fetchRecipes(search);
  }, [search, view, fetchRecipes]);

  const handleSelectRecipe = async (id) => {
    try {
      const res = await fetch(`/api/recipes/${id}`);
      if (!res.ok) throw new Error('Failed to load recipe');
      setSelectedRecipe(await res.json());
      setView('detail');
    } catch (e) { setError(e.message); }
  };

  const handleAuth = (u) => { setUser(u); setShowAuth(false); };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null); setView('home');
  };

  const handleSaveRecipe = async (data) => {
    const res = await fetch('/api/recipes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (res.status === 401) { setUser(null); setShowAuth(true); throw new Error('Please sign in to save recipes'); }
    if (!res.ok) throw new Error(await safeError(res, 'Failed to save recipe'));
    fetchRecipes(search);
    setView('home');
  };

  const handleUpdateRecipe = async (data) => {
    const res = await fetch(`/api/recipes/${selectedRecipe.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (res.status === 401) { setUser(null); setShowAuth(true); throw new Error('Please sign in to edit recipes'); }
    if (!res.ok) throw new Error(await safeError(res, 'Failed to update recipe'));
    const updated = await res.json();
    setSelectedRecipe(updated);
    fetchRecipes(search);
    setView('detail');
  };

  const handleDeleteRecipe = async (id) => {
    const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
    if (res.status === 401) { setUser(null); setShowAuth(true); return; }
    fetchRecipes(search);
    setView('list');
    setSelectedRecipe(null);
  };

  const handleSearchFromHome = (query) => {
    setSearch(query);
    setView('list');
  };

  const handleBack = () => {
    if (view === 'list') setView('home');
    else if (view === 'detail') setView('list');
    else if (view === 'form') setView('home');
    else if (view === 'edit') setView('detail');
    else setView('home');
  };

  const year = new Date().getFullYear();

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-marquee">
          ✦ THE LIVING COOKBOOK ✦ CLASSIC RECIPES FROM THE HEART ✦ EST. 1999 ✦ WELCOME, {user ? user.email.toUpperCase() : 'GUEST'} ✦
        </div>
        <div className="header-nav">
          <div className="header-left">
            <button className="logo-btn" onClick={() => setView('home')}>
              LIVING COOKBOOK
            </button>
            <button className="btn btn-ghost" onClick={() => handleSearchFromHome('')}>
              BROWSE
            </button>
            {view !== 'home' && (
              <button className="btn btn-ghost" onClick={handleBack}>
                ← BACK
              </button>
            )}
          </div>

          <div className="header-right">
            {user && view === 'home' && (
              <button className="btn btn-primary" onClick={() => setView('form')}>
                + ADD RECIPE
              </button>
            )}
            {user ? (
              <>
                <span className="header-user-email">[{user.email}]</span>
                <button className="btn btn-ghost" onClick={handleLogout}>LOGOUT</button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={() => setShowAuth(true)}>LOGIN</button>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        {view === 'home' && (
          <HomePage
            user={user}
            onSearch={handleSearchFromHome}
            onViewRecipe={handleSelectRecipe}
            onAddRecipe={() => setView('form')}
          />
        )}

        {view === 'list' && (
          <>
            <div className="page-section-title">// RECIPE ARCHIVE //</div>
            <SearchBar value={search} onChange={setSearch} />
            {error && <p className="error">{error}</p>}
            {!user && (
              <p className="guest-notice">
                <button className="link-btn" onClick={() => setShowAuth(true)}>Sign in</button>
                {' '}to add, edit, or delete recipes.
              </p>
            )}
            <RecipeList recipes={recipes} loading={loading} onSelect={handleSelectRecipe} search={search} />
          </>
        )}

        {view === 'detail' && selectedRecipe && (
          <RecipeDetail
            recipe={selectedRecipe}
            user={user}
            onDelete={handleDeleteRecipe}
            onEdit={() => setView('edit')}
          />
        )}

        {view === 'form' && (
          <RecipeForm onSave={handleSaveRecipe} onCancel={() => setView('home')} />
        )}

        {view === 'edit' && selectedRecipe && (
          <RecipeForm
            initialRecipe={selectedRecipe}
            onSave={handleUpdateRecipe}
            onCancel={() => setView('detail')}
          />
        )}
      </main>

      <footer className="app-footer">
        <div>© 1999–{year} THE LIVING COOKBOOK — ALL RIGHTS RESERVED</div>
        <div>ALL RECIPES ARE PROPERTY OF THEIR RESPECTIVE AUTHORS</div>
        <div>BEST VIEWED IN 800×600 — NETSCAPE NAVIGATOR 4.0+</div>
      </footer>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuth={handleAuth} />}
      {resetToken && (
        <ResetPasswordModal
          token={resetToken}
          onClose={() => setResetToken(null)}
          onDone={() => { setResetToken(null); setShowAuth(true); }}
        />
      )}
    </div>
  );
}
