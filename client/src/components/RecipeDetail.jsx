import { useState } from 'react';
import { REQUIRED_CATEGORIES } from '../data/categories';
import { getImageUrl } from '../lib/supabase';

function formatIngredient(ing) {
  if (typeof ing === 'string') return ing;
  return [ing.amount, ing.unit, ing.item].filter(Boolean).join(' ');
}

export default function RecipeDetail({ recipe, onDelete, onEdit, user }) {
  const [confirming, setConfirming] = useState(false);
  const isOwner = user && recipe.user_id === user.id;

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
