import RecipeCard from './RecipeCard';

export default function RecipeList({ recipes, loading, onSelect, search }) {
  if (loading) return <p className="loading">Loading recipes...</p>;

  if (!recipes.length) {
    return (
      <div className="empty-state">
        <strong>{search ? 'No recipes match your search.' : 'No recipes yet.'}</strong>
        <p>{search ? 'Try a different ingredient or name.' : 'Add your first recipe to get started!'}</p>
      </div>
    );
  }

  return (
    <div className="recipe-grid">
      {recipes.map(r => (
        <RecipeCard key={r.id} recipe={r} onSelect={onSelect} />
      ))}
    </div>
  );
}
