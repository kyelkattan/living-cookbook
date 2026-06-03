import { useState } from 'react';
import { normalizeKey } from '../lib/shoppingList';

// True when two recipe refs are the same: by id when both have one, otherwise by
// (normalized) name so rows orphaned by a deleted recipe still match.
function sameRecipe(a, b) {
  if (a.id != null && b.id != null) return a.id === b.id;
  return normalizeKey(a.name) === normalizeKey(b.name);
}

// A single consolidated line with its checkbox. `indeterminate` is set via a ref
// because React has no prop for it (used when a line is only partially checked —
// some of its merged contributions are bought, some aren't).
function ShoppingItem({ line, onToggle }) {
  const sources = line.recipes.map((r) => r.name);
  const showSources = sources.length > 1;
  return (
    <li className={`shopping-item${line.checked ? ' shopping-item-done' : ''}`}>
      <label>
        <input
          type="checkbox"
          checked={line.checked}
          ref={(el) => { if (el) el.indeterminate = line.partial; }}
          onChange={(e) => onToggle(line, e.target.checked)}
        />
        <span className="shopping-item-text">
          {line.label}
          {showSources && (
            <span className="shopping-item-sources"> — from {sources.join(', ')}</span>
          )}
        </span>
      </label>
    </li>
  );
}

export default function ShoppingListBar({ lines, recipes, remainingCount, onToggle, onRemoveRecipe, onClear }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!lines.length) return null;

  const combined = lines.filter((l) => l.recipes.length > 1);
  const singles = lines.filter((l) => l.recipes.length === 1);
  const total = lines.length;

  const handleClear = () => { onClear(); setConfirmClear(false); setExpanded(false); };

  return (
    <div className="shopping-bar">
      <button
        className="shopping-bar-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="shopping-bar-title">
          <span className="shopping-bar-cart" aria-hidden="true">🛒</span>
          SHOPPING LIST
        </span>
        <span className="shopping-bar-count">
          {remainingCount > 0
            ? `${remainingCount} ingredient${remainingCount === 1 ? '' : 's'} remaining`
            : `all ${total} ingredient${total === 1 ? '' : 's'} checked off`}
        </span>
        <span className="shopping-bar-chevron" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="shopping-bar-body">
          {combined.length > 0 && (
            <section className="shopping-group">
              <h3 className="shopping-group-head">✦ Combined across recipes</h3>
              <ul className="shopping-list-items">
                {combined.map((line) => (
                  <ShoppingItem key={line.key} line={line} onToggle={onToggle} />
                ))}
              </ul>
            </section>
          )}

          {recipes.map((recipe) => {
            const items = singles.filter((l) => sameRecipe(l.recipes[0], recipe));
            const onlyCombined = items.length === 0;
            return (
              <section className="shopping-group" key={recipe.id != null ? `id:${recipe.id}` : `name:${recipe.name}`}>
                <div className="shopping-group-head shopping-group-head-recipe">
                  <h3>{recipe.name}</h3>
                  <button
                    className="shopping-remove-btn"
                    onClick={() => onRemoveRecipe(recipe.id)}
                    title={`Remove ${recipe.name}'s ingredients from your list`}
                  >
                    Remove
                  </button>
                </div>
                {onlyCombined ? (
                  <p className="shopping-group-note">All of this recipe's ingredients are merged above.</p>
                ) : (
                  <ul className="shopping-list-items">
                    {items.map((line) => (
                      <ShoppingItem key={line.key} line={line} onToggle={onToggle} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          <div className="shopping-bar-actions">
            {confirmClear ? (
              <>
                <span className="shopping-clear-confirm">Clear the whole list?</span>
                <button className="btn btn-danger btn-sm" onClick={handleClear}>Yes, clear</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(false)}>Cancel</button>
              </>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(true)}>
                Clear entire list
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
