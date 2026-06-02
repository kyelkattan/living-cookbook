import { useState, useEffect } from 'react';
import ComboBox from './ComboBox';
import CategoryPicker from './CategoryPicker';
import { UNITS } from '../data/units';
import { supabase, getImageUrl } from '../lib/supabase';

const emptyIngredient = () => ({ amount: '', unit: '', item: '' });

function normalizeIngredient(ing) {
  if (typeof ing === 'string') return { amount: '', unit: '', item: ing };
  return ing;
}

export default function RecipeForm({ onSave, onCancel, initialRecipe, user }) {
  const [name, setName] = useState(initialRecipe?.name ?? '');
  const [description, setDescription] = useState(initialRecipe?.description ?? '');
  const [categories, setCategories] = useState(initialRecipe?.categories ?? []);
  const [imageFilename, setImageFilename] = useState(initialRecipe?.image ?? null);
  const [imagePreview, setImagePreview] = useState(initialRecipe?.image ? getImageUrl(initialRecipe.image) : null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [ingredients, setIngredients] = useState(
    initialRecipe?.ingredients?.map(normalizeIngredient) ?? [emptyIngredient(), emptyIngredient(), emptyIngredient()]
  );
  const [steps, setSteps] = useState(initialRecipe?.steps ?? ['', '', '']);
  const [tools, setTools] = useState(initialRecipe?.tools ?? []);
  const [toolInput, setToolInput] = useState('');
  const [pastItems, setPastItems] = useState([]);
  const [pastCategories, setPastCategories] = useState([]);
  const [pastTools, setPastTools] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('recipes').select('ingredients, categories, tools').then(({ data }) => {
      if (!data) return;
      const items = new Set(), cats = new Set(), tools = new Set();
      data.forEach(r => {
        (r.ingredients || []).forEach(ing => {
          const item = typeof ing === 'string' ? ing.trim() : ing.item?.trim();
          if (item) items.add(item);
        });
        (r.categories || []).forEach(c => cats.add(c));
        (r.tools || []).forEach(t => tools.add(t));
      });
      setPastItems([...items].sort((a, b) => a.localeCompare(b)));
      setPastCategories([...cats].sort((a, b) => a.localeCompare(b)));
      setPastTools([...tools].sort((a, b) => a.localeCompare(b)));
    });
  }, []);

  const addTool = () => {
    const val = toolInput.trim();
    if (!val || tools.some(t => t.toLowerCase() === val.toLowerCase())) return;
    setTools(prev => [...prev, val]);
    setToolInput('');
  };

  const removeTool = (idx) => setTools(prev => prev.filter((_, i) => i !== idx));

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setImageError('');
    setImageUploading(true);
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('recipe-images')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (uploadErr) throw uploadErr;
      setImageFilename(path);
    } catch (err) {
      setImageError(err.message);
      setImagePreview(null);
    } finally {
      setImageUploading(false);
    }
  };

  const removeImage = () => { setImagePreview(null); setImageFilename(null); setImageError(''); };

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
    if (!categories.some(c => c === 'Baking' || c === 'Cooking')) return setError('Select Baking, Cooking, or both.');
    if (!cleanIngredients.length) return setError('Add at least one ingredient.');
    if (!cleanSteps.length) return setError('Add at least one step.');

    setSaving(true);
    try {
      await onSave({ name, description, categories, image: imageFilename, ingredients: cleanIngredients, steps: cleanSteps, tools });
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
        <label>Photo</label>
        {imagePreview ? (
          <div className="image-preview">
            <img src={imagePreview} alt="Recipe preview" />
            <button type="button" className="image-preview-remove" onClick={removeImage}>Remove</button>
            {imageUploading && <div className="image-uploading">Uploading…</div>}
          </div>
        ) : (
          <label className="image-upload-zone" htmlFor="image-input">
            <span>Click to add a photo</span>
            <span className="image-upload-hint">JPEG, PNG, WebP or GIF · max 5 MB</span>
          </label>
        )}
        <input id="image-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleImageSelect} style={{ display: 'none' }} />
        {imageError && <p className="form-error" style={{ marginTop: '0.5rem' }}>{imageError}</p>}
      </div>

      <div className="form-group">
        <label>Categories *</label>
        <CategoryPicker value={categories} onChange={setCategories} pastCustom={pastCategories} />
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
        <label>Kitchen Tools <span className="label-optional">(optional)</span></label>
        <div className="tools-input-row">
          <input
            className="form-input"
            type="text"
            list="tools-suggestions"
            placeholder="e.g. Stand mixer, Dutch oven, Wok..."
            value={toolInput}
            onChange={e => setToolInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTool(); } }}
            autoComplete="off"
          />
          <datalist id="tools-suggestions">
            {pastTools
              .filter(t => !tools.some(t2 => t2.toLowerCase() === t.toLowerCase()))
              .map(t => <option key={t} value={t} />)}
          </datalist>
          <button type="button" className="btn btn-ghost tools-add-btn" onClick={addTool}>
            + Add
          </button>
        </div>
        {tools.length > 0 && (
          <div className="tools-list">
            {tools.map((tool, i) => (
              <div key={i} className="tool-tag">
                <span>{tool}</span>
                <button type="button" className="btn-icon" onClick={() => removeTool(i)} aria-label={`Remove ${tool}`}>&times;</button>
              </div>
            ))}
          </div>
        )}
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
