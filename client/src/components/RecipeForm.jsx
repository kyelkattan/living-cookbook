import { useState, useEffect } from 'react';
import ComboBox from './ComboBox';
import { UNITS } from '../data/units';

const emptyIngredient = () => ({ amount: '', unit: '', item: '' });

function normalizeIngredient(ing) {
  if (typeof ing === 'string') return { amount: '', unit: '', item: ing };
  return ing;
}

export default function RecipeForm({ onSave, onCancel, initialRecipe }) {
  const [name, setName] = useState(initialRecipe?.name ?? '');
  const [description, setDescription] = useState(initialRecipe?.description ?? '');
  const [ingredients, setIngredients] = useState(
    initialRecipe?.ingredients?.map(normalizeIngredient) ?? [emptyIngredient(), emptyIngredient(), emptyIngredient()]
  );
  const [steps, setSteps] = useState(initialRecipe?.steps ?? ['', '', '']);
  const [pastItems, setPastItems] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/ingredient-items')
      .then(r => r.json())
      .then(setPastItems)
      .catch(() => {});
  }, []);

  const updateIngredient = (index, field, value) =>
    setIngredients(prev => prev.map((ing, i) => i === index ? { ...ing, [field]: value } : ing));

  const removeIngredient = (index) =>
    setIngredients(prev => prev.filter((_, i) => i !== index));

  const updateStep = (index, value) =>
    setSteps(prev => prev.map((s, i) => (i === index ? value : s)));

  const removeStep = (index) =>
    setSteps(prev => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanIngredients = ingredients.filter(ing => ing.item.trim());
    const cleanSteps = steps.filter(s => s.trim());

    if (!name.trim()) return setError('Recipe name is required.');
    if (!cleanIngredients.length) return setError('Add at least one ingredient.');
    if (!cleanSteps.length) return setError('Add at least one step.');

    setSaving(true);
    try {
      await onSave({ name, description, ingredients: cleanIngredients, steps: cleanSteps });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <form className="recipe-form" onSubmit={handleSubmit}>
      <h1>{initialRecipe ? 'Edit Recipe' : 'New Recipe'}</h1>

      {error && <p className="form-error">{error}</p>}

      <div className="form-group">
        <label htmlFor="name">Recipe Name *</label>
        <input
          id="name"
          className="form-input"
          type="text"
          placeholder="e.g. Classic Banana Bread"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="description">Description</label>
        <input
          id="description"
          className="form-input"
          type="text"
          placeholder="Optional short description"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Ingredients *</label>
        <div className="ingredient-col-headers">
          <span>Qty</span>
          <span>Unit</span>
          <span>Ingredient</span>
        </div>
        <div className="dynamic-list">
          {ingredients.map((ing, i) => (
            <div className="ingredient-row" key={i}>
              <input
                type="text"
                className="form-input"
                placeholder="2"
                value={ing.amount}
                onChange={e => updateIngredient(i, 'amount', e.target.value)}
              />
              <ComboBox
                value={ing.unit}
                onChange={val => updateIngredient(i, 'unit', val)}
                options={UNITS}
                placeholder="cup"
              />
              <ComboBox
                value={ing.item}
                onChange={val => updateIngredient(i, 'item', val)}
                options={pastItems}
                placeholder="flour"
              />
              {ingredients.length > 1 && (
                <button type="button" className="btn-icon" onClick={() => removeIngredient(i)} aria-label="Remove">
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="add-row-btn" onClick={() => setIngredients(p => [...p, emptyIngredient()])}>
          + Add ingredient
        </button>
      </div>

      <div className="form-group">
        <label>Steps *</label>
        <div className="dynamic-list">
          {steps.map((step, i) => (
            <div className="dynamic-row" key={i}>
              <span className="row-num">{i + 1}.</span>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder={`Step ${i + 1}`}
                value={step}
                onChange={e => updateStep(i, e.target.value)}
              />
              {steps.length > 1 && (
                <button type="button" className="btn-icon" onClick={() => removeStep(i)} aria-label="Remove">
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="add-row-btn" onClick={() => setSteps(p => [...p, ''])}>
          + Add step
        </button>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : initialRecipe ? 'Save Changes' : 'Save Recipe'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
