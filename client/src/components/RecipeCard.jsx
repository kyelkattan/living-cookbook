export default function RecipeCard({ recipe, onSelect }) {
  const date = new Date(recipe.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="recipe-card" onClick={() => onSelect(recipe.id)} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect(recipe.id)}>
      <h3>{recipe.name}</h3>
      {recipe.description && <p className="meta" style={{ marginBottom: '0.5rem' }}>{recipe.description}</p>}
      <p className="meta">Added {date}</p>
    </div>
  );
}
