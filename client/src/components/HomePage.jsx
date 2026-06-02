import { useState, useEffect, useRef } from 'react';
import PixelChef from './PixelChef';
import { getFoodArt } from '../utils/foodArt';

const RAINBOW = ['#cc2222', '#cc7700', '#c8aa00', '#22aa44', '#2266cc', '#aa22cc', '#cc2288'];

function RainbowText({ text }) {
  let i = 0;
  return (
    <span>
      {text.split('').map((ch, idx) => {
        if (ch === '\n') return <br key={idx} />;
        const color = RAINBOW[i % RAINBOW.length];
        i++;
        return <span key={idx} style={{ color, textShadow: `0 1px 0 rgba(0,0,0,0.2)` }}>{ch}</span>;
      })}
    </span>
  );
}

function highlightMatch(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="suggestion-mark">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function HomePage({ user, onSearch, onViewRecipe, onAddRecipe }) {
  const [query, setQuery] = useState('');
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allRecipes, setAllRecipes] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef(null);

  useEffect(() => {
    fetch('/api/recipes/featured')
      .then(r => r.json())
      .then(data => { setFeatured(data); setLoading(false); })
      .catch(() => setLoading(false));

    fetch('/api/recipes')
      .then(r => r.json())
      .then(data => setAllRecipes(data))
      .catch(() => {});
  }, []);

  const suggestions = query.trim().length > 0
    ? allRecipes
        .filter(r =>
          r.name.toLowerCase().includes(query.toLowerCase()) ||
          (r.categories || []).some(c => c.toLowerCase().includes(query.toLowerCase()))
        )
        .slice(0, 6)
    : [];

  const handleQueryChange = (e) => {
    setQuery(e.target.value);
    setShowSuggestions(true);
    setSelectedIdx(-1);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (selectedIdx >= 0 && suggestions[selectedIdx]) {
      onViewRecipe(suggestions[selectedIdx].id);
    } else {
      onSearch(query);
    }
    setShowSuggestions(false);
    setSelectedIdx(-1);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIdx(-1);
    }
  };

  const handleSuggestionClick = (recipe) => {
    setQuery(recipe.name);
    setShowSuggestions(false);
    setSelectedIdx(-1);
    onViewRecipe(recipe.id);
  };

  return (
    <div className="home-page">
      <div className="book-outer">
        <div className="book-bookmark" />
        <div className="book-grid">

          {/* ── LEFT PAGE ── */}
          <div className="book-page book-left">
            <div>
              <div className="book-title">
                <RainbowText text={'LIVING\nCOOKBOOK'} />
              </div>
              <div className="book-subtitle">✦ EST. 1999 — CLASSIC RECIPES FROM THE HEART ✦</div>
            </div>

            <div className="book-chef-area">
              <PixelChef />
              <span className="book-chef-caption">...COOKING WITH NOSTALGIA...</span>
            </div>

            <div className="book-search-area">
              <span className="book-search-label">⌨ SEARCH RECIPES</span>
              <div className="book-search-wrap">
                <form onSubmit={handleSearch}>
                  <input
                    ref={inputRef}
                    className="book-search-input"
                    type="text"
                    placeholder="type a dish and press enter..."
                    value={query}
                    onChange={handleQueryChange}
                    onFocus={() => query.trim() && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                  />
                </form>

                {showSuggestions && suggestions.length > 0 && (
                  <ul className="book-suggestions">
                    {suggestions.map((recipe, idx) => (
                      <li
                        key={recipe.id}
                        className={`book-suggestion-item${idx === selectedIdx ? ' selected' : ''}`}
                        onMouseDown={() => handleSuggestionClick(recipe)}
                      >
                        <span className="suggestion-name">
                          {highlightMatch(recipe.name, query)}
                        </span>
                        {recipe.categories?.length > 0 && (
                          <span className="suggestion-cats">
                            {recipe.categories.slice(0, 2).join(' · ')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* ── SPINE ── */}
          <div className="book-spine" />

          {/* ── RIGHT PAGE ── */}
          <div className="book-page book-right">
            <div className="book-right-header">
              ★ TODAY'S FEATURED RECIPES! ★
            </div>

            <div className="featured-list">
              {loading && (
                <div className="featured-empty">LOADING...</div>
              )}
              {!loading && featured.length === 0 && (
                <div className="featured-empty">
                  NO RECIPES YET<br />
                  {user ? 'ADD THE FIRST ONE!' : 'LOGIN TO ADD ONE!'}
                </div>
              )}
              {featured.map(recipe => (
                <div key={recipe.id} className="featured-item" onClick={() => onViewRecipe(recipe.id)}>
                  {recipe.image ? (
                    <img
                      className="featured-img"
                      src={`/uploads/${recipe.image}`}
                      alt={recipe.name}
                    />
                  ) : (
                    <div className="featured-no-img">
                      <pre>{getFoodArt(recipe.categories)}</pre>
                    </div>
                  )}
                  <div className="featured-info">
                    <div className="featured-name">{recipe.name}</div>
                    {recipe.categories?.length > 0 && (
                      <div className="featured-cats">
                        {recipe.categories.slice(0, 2).join(' · ')}
                      </div>
                    )}
                    {recipe.user_username && (
                      <div className="featured-by">by {recipe.user_username}</div>
                    )}
                    <div className="featured-view-hint">[ VIEW RECIPE ]</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── BOOK FOOTER BAR ── */}
        <div className="book-footer">
          <span className="book-footer-text">
            LIVING COOKBOOK v1.0 &nbsp;|&nbsp; ALL RECIPES PROPERTY OF THEIR AUTHORS
          </span>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={() => onSearch('')}>BROWSE ALL</button>
            {user && (
              <button className="btn btn-primary" onClick={onAddRecipe}>+ ADD RECIPE</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
