import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './lib/supabase';
import SearchBar from './components/SearchBar';
import RecipeList from './components/RecipeList';
import RecipeDetail from './components/RecipeDetail';
import RecipeForm from './components/RecipeForm';
import AuthModal from './components/AuthModal';
import ResetPasswordModal from './components/ResetPasswordModal';
import HomePage from './components/HomePage';

function normalizeRecipe(r) {
  return { ...r, user_username: r.profiles?.username || '' };
}

export default function App() {
  const [view, setView] = useState('home');
  const [allRecipes, setAllRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showReset, setShowReset] = useState(false);

  // Auth state — listen for session + handle password recovery links
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email,
          username: session.user.user_metadata?.username || '',
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowReset(true);
        return;
      }
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email,
          username: session.user.user_metadata?.username || '',
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch all recipes once; re-called after any mutation
  const fetchRecipes = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase
        .from('recipes')
        .select('id, name, description, created_at, categories, image, tools, user_id, profiles(username)')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setAllRecipes((data || []).map(normalizeRecipe));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRecipes(); }, [fetchRecipes]);

  // Client-side search filter over the cached list
  const recipes = useMemo(() => {
    if (!search) return allRecipes;
    const term = search.toLowerCase();
    return allRecipes.filter(r =>
      r.name.toLowerCase().includes(term) ||
      (r.description || '').toLowerCase().includes(term) ||
      (r.user_username || '').toLowerCase().includes(term) ||
      (r.categories || []).some(c => c.toLowerCase().includes(term)) ||
      (r.tools || []).some(t => t.toLowerCase().includes(term))
    );
  }, [allRecipes, search]);

  const handleSelectRecipe = async (id) => {
    try {
      const { data, error: err } = await supabase
        .from('recipes')
        .select('*, profiles(username)')
        .eq('id', id)
        .single();
      if (err) throw err;
      setSelectedRecipe(normalizeRecipe(data));
      setView('detail');
    } catch (e) { setError(e.message); }
  };

  const handleAuth = (u) => { setUser(u); setShowAuth(false); };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null); setView('home');
  };

  const handleSaveRecipe = async (data) => {
    if (!user) { setShowAuth(true); throw new Error('Please sign in to save recipes'); }
    const { error: err } = await supabase
      .from('recipes')
      .insert({ ...data, user_id: user.id });
    if (err) throw new Error(err.message);
    await fetchRecipes();
    setView('home');
  };

  const handleUpdateRecipe = async (data) => {
    if (!user) { setShowAuth(true); throw new Error('Please sign in to edit recipes'); }

    // Remove the old image from storage if it was replaced
    const oldImage = selectedRecipe.image;
    if (oldImage && oldImage !== data.image) {
      await supabase.storage.from('recipe-images').remove([oldImage]);
    }

    const { data: updated, error: err } = await supabase
      .from('recipes')
      .update(data)
      .eq('id', selectedRecipe.id)
      .select('*, profiles(username)')
      .single();
    if (err) throw new Error(err.message);
    setSelectedRecipe(normalizeRecipe(updated));
    await fetchRecipes();
    setView('detail');
  };

  const handleDeleteRecipe = async (id) => {
    if (!user) { setShowAuth(true); return; }
    if (selectedRecipe?.image) {
      await supabase.storage.from('recipe-images').remove([selectedRecipe.image]);
    }
    const { error: err } = await supabase.from('recipes').delete().eq('id', id);
    if (!err) {
      await fetchRecipes();
      setView('list');
      setSelectedRecipe(null);
    }
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
          ✦ THE LIVING COOKBOOK ✦ CLASSIC RECIPES FROM THE HEART ✦ EST. 1966 ✦ WELCOME, {user ? user.email.toUpperCase() : 'GUEST'} ✦
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
            <button className="btn btn-primary" onClick={() => user ? setView('form') : setShowAuth(true)}>
              + ADD RECIPE
            </button>
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
            allRecipes={allRecipes}
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
          <RecipeForm onSave={handleSaveRecipe} onCancel={() => setView('home')} user={user} />
        )}

        {view === 'edit' && selectedRecipe && (
          <RecipeForm
            initialRecipe={selectedRecipe}
            onSave={handleUpdateRecipe}
            onCancel={() => setView('detail')}
            user={user}
          />
        )}
      </main>

      <footer className="app-footer">
        <div>© 1966–{year} THE LIVING COOKBOOK — ALL RIGHTS RESERVED</div>
        <div>ALL RECIPES ARE PROPERTY OF THEIR RESPECTIVE AUTHORS</div>

      </footer>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuth={handleAuth} />}
      {showReset && (
        <ResetPasswordModal
          onClose={() => setShowReset(false)}
          onDone={() => setShowReset(false)}
        />
      )}
    </div>
  );
}
