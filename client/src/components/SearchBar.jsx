export default function SearchBar({ value, onChange }) {
  return (
    <div className="search-wrap">
      <input
        className="search-input"
        type="search"
        placeholder="Search by name, ingredient, tag, tool, or user..."
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
