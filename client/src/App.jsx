import { useState, useEffect, useCallback } from 'react';
import SearchBar from './components/SearchBar';
import RecipeList from './components/RecipeList';
import RecipeDetail from './components/RecipeDetail';
import RecipeForm from './components/RecipeForm';
import AuthModal from './components/AuthModal';
import ResetPasswordModal from './components/ResetPasswordModal';

async function safeError(res, fallback) {
  try {
    const body = await res.json();
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [view, setView] = useState('list');
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [resetToken, setResetToken] = useState(null);

  // Restore session and detect reset-password links on page load
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(u => setUser(u))
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset');
    if (token) {
      setResetToken(token);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const fetchRecipes = useCallback(async (query = '') => {
    setLoading(true);
    setError(null);
    try {
      const url = query ? `/api/recipes?search=${encodeURIComponent(query)}` : '/api/recipes';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load recipes');
      setRecipes(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecipes(search);
  }, [search, fetchRecipes]);

  const handleSelectRecipe = async (id) => {
    try {
      const res = await fetch(`/api/recipes/${id}`);
      if (!res.ok) throw new Error('Failed to load recipe');
      setSelectedRecipe(await res.json());
      setView('detail');
    } catch (e) {
      setError(e.message);
    }
  };

  const handleAuth = (authedUser) => {
    setUser(authedUser);
    setShowAuth(false);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setView('list');
  };

  const handleSaveRecipe = async (data) => {
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.status === 401) { setUser(null); setShowAuth(true); throw new Error('Please sign in to save recipes'); }
    if (!res.ok) throw new Error(await safeError(res, 'Failed to save recipe'));
    fetchRecipes(search);
    setView('list');
  };

  const handleUpdateRecipe = async (data) => {
    const res = await fetch(`/api/recipes/${selectedRecipe.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
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

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <button className="logo-btn" onClick={() => setView('list')}>Living Cookbook</button>
          {view !== 'list' && (
            <button className="btn btn-ghost" onClick={() => setView('list')}>&larr; Back</button>
          )}
        </div>

        <div className="header-right">
          {view === 'list' && user && (
            <button className="btn btn-primary" onClick={() => setView('form')}>+ Add Recipe</button>
          )}
          {user ? (
            <>
              <span className="header-user-email" title={user.email}>{user.email}</span>
              <button className="btn btn-ghost" onClick={handleLogout}>Sign Out</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setShowAuth(true)}>Sign In</button>
          )}
        </div>
      </header>

      <main className="app-main">
        {view === 'list' && (
          <>
            <SearchBar value={search} onChange={setSearch} />
            {error && <p className="error">{error}</p>}
            {!user && (
              <p className="guest-notice">
                <button className="link-btn" onClick={() => setShowAuth(true)}>Sign in</button> or{' '}
                <button className="link-btn" onClick={() => setShowAuth(true)}>create an account</button> to add, edit, or delete recipes.
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
          <RecipeForm onSave={handleSaveRecipe} onCancel={() => setView('list')} />
        )}

        {view === 'edit' && selectedRecipe && (
          <RecipeForm
            initialRecipe={selectedRecipe}
            onSave={handleUpdateRecipe}
            onCancel={() => setView('detail')}
          />
        )}
      </main>

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
