import { useState, useRef } from 'react';
import { REQUIRED_CATEGORIES, STANDARD_CATEGORIES } from '../data/categories';

const ALL_BUILTIN = new Set([...REQUIRED_CATEGORIES, ...STANDARD_CATEGORIES]);

function CustomCategoryInput({ onAdd, suggestions }) {
  const [val, setVal] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const filtered = suggestions.filter(
    s => !val || s.toLowerCase().includes(val.toLowerCase())
  );

  const commit = (str) => {
    const trimmed = (str || val).trim();
    if (trimmed) { onAdd(trimmed); setVal(''); setOpen(false); }
  };

  return (
    <div className="combobox custom-category-input" ref={ref}>
      <input
        type="text"
        className="form-input"
        placeholder="Add custom category…"
        value={val}
        autoComplete="off"
        onChange={e => { setVal(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={e => { if (!ref.current?.contains(e.relatedTarget)) setOpen(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(filtered[0] || val); }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="combobox-dropdown" role="listbox">
          {filtered.map(o => (
            <li key={o} role="option" tabIndex={-1}
              onMouseDown={e => { e.preventDefault(); commit(o); }}>
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CategoryPicker({ value, onChange, pastCustom = [], promoted = [] }) {
  const ALL_PROMOTED = new Set(promoted);

  const toggle = (cat) =>
    onChange(value.includes(cat) ? value.filter(c => c !== cat) : [...value, cat]);

  const addCustom = (cat) => {
    if (!value.includes(cat)) onChange([...value, cat]);
  };

  // Custom = not builtin AND not promoted
  const selectedCustom = value.filter(c => !ALL_BUILTIN.has(c) && !ALL_PROMOTED.has(c));
  const customSuggestions = pastCustom.filter(
    c => !ALL_BUILTIN.has(c) && !ALL_PROMOTED.has(c) && !value.includes(c)
  );

  return (
    <div className="category-picker">
      <div className="category-group">
        <span className="category-group-label">
          Type <span style={{ color: 'var(--danger)' }}>*</span>
          <span className="category-group-hint"> — pick at least one</span>
        </span>
        <div className="chips">
          {REQUIRED_CATEGORIES.map(cat => (
            <button key={cat} type="button"
              className={`chip chip-required${value.includes(cat) ? ' chip-active' : ''}`}
              onClick={() => toggle(cat)}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="category-group">
        <span className="category-group-label">Tags</span>
        <div className="chips">
          {STANDARD_CATEGORIES.map(cat => (
            <button key={cat} type="button"
              className={`chip${value.includes(cat) ? ' chip-active' : ''}`}
              onClick={() => toggle(cat)}>
              {cat}
            </button>
          ))}
          {promoted.map(cat => (
            <button key={cat} type="button"
              className={`chip${value.includes(cat) ? ' chip-active' : ''}`}
              onClick={() => toggle(cat)}>
              {cat}
            </button>
          ))}
          {selectedCustom.map(cat => (
            <button key={cat} type="button"
              className="chip chip-active chip-custom"
              onClick={() => toggle(cat)}>
              {cat} &times;
            </button>
          ))}
        </div>
        <CustomCategoryInput onAdd={addCustom} suggestions={customSuggestions} />
      </div>
    </div>
  );
}
