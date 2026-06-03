import { REQUIRED_CATEGORIES } from '../data/categories';
import { getVisibility } from '../data/visibility';
import { getFoodArt } from '../utils/foodArt';
import { getImageUrl } from '../lib/supabase';

export default function RecipeCard({ recipe, onSelect }) {
  const date = new Date(recipe.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const cats = recipe.categories || [];
  // Only flag non-public recipes — public is the unremarkable default.
  const vis = recipe.visibility && recipe.visibility !== 'public'
    ? getVisibility(recipe.visibility)
    : null;

  return (
    <div className="recipe-card" onClick={() => onSelect(recipe.id)} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect(recipe.id)}>
      {vis && (
        <span className={`visibility-badge visibility-badge-${recipe.visibility}`} title={vis.description}>
          <span aria-hidden="true">{vis.icon}</span> {vis.label}
        </span>
      )}
      {recipe.image ? (
        <div className="card-image">
          <img src={getImageUrl(recipe.image)} alt={recipe.name} />
        </div>
      ) : (
        <div className="card-ascii">
          <pre>{getFoodArt(cats)}</pre>
        </div>
      )}
      <div className="card-body">
        <h3>{recipe.name}</h3>
        {recipe.description && <p className="meta">{recipe.description}</p>}
        {cats.length > 0 && (
          <div className="chips card-chips">
            {cats.map(cat => (
              <span key={cat} className={`chip chip-sm${REQUIRED_CATEGORIES.includes(cat) ? ' chip-active' : ''}`}>
                {cat}
              </span>
            ))}
          </div>
        )}
        <p className="meta">Added {date}</p>
      </div>
    </div>
  );
}
