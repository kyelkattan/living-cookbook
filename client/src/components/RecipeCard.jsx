import { REQUIRED_CATEGORIES } from '../data/categories';
import { getFoodArt } from '../utils/foodArt';

export default function RecipeCard({ recipe, onSelect }) {
  const date = new Date(recipe.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const cats = recipe.categories || [];

  return (
    <div className="recipe-card" onClick={() => onSelect(recipe.id)} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect(recipe.id)}>
      {recipe.image ? (
        <div className="card-image">
          <img src={`/uploads/${recipe.image}`} alt={recipe.name} />
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
