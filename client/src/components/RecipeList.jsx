import RecipeCard from './RecipeCard';

export default function RecipeList({ recipes, loading, onSelect, hasFilters }) {
  if (loading) return <p className="loading">Loading recipes...</p>;

  if (!recipes.length) {
    return (
      <div className="empty-state">
        <strong>{hasFilters ? 'No recipes match your filters.' : 'No recipes yet.'}</strong>
        <p>{hasFilters ? 'Try adjusting or clearing your filters.' : 'Add your first recipe to get started!'}</p>
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
