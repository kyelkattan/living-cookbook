import { useState, useEffect } from 'react';
import { REQUIRED_CATEGORIES } from '../data/categories';
import { getImageUrl, supabase } from '../lib/supabase';

function formatIngredient(ing) {
  if (typeof ing === 'string') return ing;
  return [ing.amount, ing.unit, ing.item].filter(Boolean).join(' ');
}

export default function RecipeDetail({ recipe, onDelete, onEdit, user }) {
  const [confirming, setConfirming] = useState(false);
  const isOwner = user && recipe.user_id === user.id;

  // Friendship status with the recipe's author (only when signed in and not the
  // owner). Uses the are_friends + send_friend_request RPCs from the backend.
  const showFriendStatus = user && !isOwner && recipe.user_id;
  const [areFriends, setAreFriends] = useState(null); // null = loading
  const [requested, setRequested] = useState(false);
  const [friendErr, setFriendErr] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!showFriendStatus) return;
    let active = true;
    setAreFriends(null);
    setRequested(false);
    setFriendErr('');
    supabase
      .rpc('are_friends', { p_user_a: user.id, p_user_b: recipe.user_id })
      .then(({ data, error }) => {
        if (active && !error) setAreFriends(!!data);
      });
    return () => { active = false; };
  }, [showFriendStatus, user?.id, recipe.user_id]);

  const handleAddFriend = async () => {
    setFriendErr('');
    setSending(true);
    try {
      const { data, error } = await supabase.rpc('send_friend_request', { p_username: recipe.user_username });
      if (error) throw error;
      if (data?.status === 'accepted') setAreFriends(true); // auto-accepted an incoming request
      else setRequested(true);
    } catch (err) {
      setFriendErr(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <article className="recipe-detail">
      <h1>{recipe.name}</h1>
      {recipe.description && <p className="description">{recipe.description}</p>}
      {recipe.image && (
        <div className="recipe-image">
          <img src={getImageUrl(recipe.image)} alt={recipe.name} />
        </div>
      )}
      {recipe.categories?.length > 0 && (
        <div className="chips recipe-chips">
          {recipe.categories.map(cat => (
            <span key={cat} className={`chip${REQUIRED_CATEGORIES.includes(cat) ? ' chip-active' : ''}`}>
              {cat}
            </span>
          ))}
        </div>
      )}
      {recipe.user_username && (
        <p className="recipe-attribution">Added by {recipe.user_username}</p>
      )}

      {showFriendStatus && areFriends !== null && (
        <div className="recipe-friend-status">
          {areFriends ? (
            <span className="friend-badge-tag">✓ You are friends with {recipe.user_username}</span>
          ) : requested ? (
            <span className="friend-badge-tag friend-badge-pending">Friend request sent to {recipe.user_username}</span>
          ) : (
            <>
              <span className="friend-badge-tag friend-badge-none">Not friends yet</span>
              <button className="btn btn-primary btn-sm" onClick={handleAddFriend} disabled={sending}>
                {sending ? 'Sending…' : `+ Add ${recipe.user_username}`}
              </button>
            </>
          )}
          {friendErr && <span className="friend-status-err">{friendErr}</span>}
        </div>
      )}

      <section className="recipe-section">
        <h2>Ingredients</h2>
        <ul className="ingredients-list">
          {recipe.ingredients.map((ing, i) => (
            <li key={i}>{formatIngredient(ing)}</li>
          ))}
        </ul>
      </section>

      {recipe.tools?.length > 0 && (
        <section className="recipe-section">
          <h2>Kitchen Tools</h2>
          <div className="chips">
            {recipe.tools.map((tool, i) => (
              <span key={i} className="chip chip-tool">{tool}</span>
            ))}
          </div>
        </section>
      )}

      <section className="recipe-section">
        <h2>Steps</h2>
        <ol className="steps-list">
          {recipe.steps.map((step, i) => (
            <li key={i}>
              <span className="step-num">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {recipe.origin && (
        <section className="recipe-section">
          <h2>Recipe Origin</h2>
          <p className="recipe-origin">
            {recipe.origin.startsWith('http://') || recipe.origin.startsWith('https://') ? (
              <a href={recipe.origin} target="_blank" rel="noopener noreferrer">{recipe.origin}</a>
            ) : (
              recipe.origin
            )}
          </p>
        </section>
      )}

      {isOwner && (
        <div className="recipe-actions">
          {confirming ? (
            <>
              <span style={{ marginRight: '1rem', fontSize: '0.9rem' }}>Delete this recipe?</span>
              <button className="btn btn-danger" onClick={() => onDelete(recipe.id)}>Yes, delete</button>
              <button className="btn btn-ghost" style={{ marginLeft: '0.5rem' }} onClick={() => setConfirming(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={() => onEdit(recipe)} style={{ marginRight: '0.75rem' }}>Edit Recipe</button>
              <button className="btn btn-danger" onClick={() => setConfirming(true)}>Delete Recipe</button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
