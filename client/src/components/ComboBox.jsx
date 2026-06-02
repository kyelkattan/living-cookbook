import { useState, useRef } from 'react';

export default function ComboBox({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered = options.filter(o =>
    !value || o.toLowerCase().includes(value.toLowerCase())
  );

  const select = (option) => {
    onChange(option);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Enter' && open && filtered.length > 0) {
      e.preventDefault();
      select(filtered[0]);
    }
  };

  return (
    <div className="combobox" ref={wrapRef}>
      <input
        type="text"
        className="form-input"
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={e => { if (!wrapRef.current?.contains(e.relatedTarget)) setOpen(false); }}
        onKeyDown={handleKeyDown}
      />
      {open && filtered.length > 0 && (
        <ul className="combobox-dropdown" role="listbox">
          {filtered.map(o => (
            <li
              key={o}
              role="option"
              tabIndex={-1}
              onMouseDown={e => { e.preventDefault(); select(o); }}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
