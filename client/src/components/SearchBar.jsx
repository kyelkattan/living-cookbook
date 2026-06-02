export default function SearchBar({ value, onChange }) {
  return (
    <div className="search-wrap">
      <input
        className="search-input"
        type="search"
        placeholder="Search recipes by name or ingredient..."
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
