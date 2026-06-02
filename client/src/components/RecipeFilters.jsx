import { useState, useRef } from 'react';

export default function RecipeFilters({
  search, onSearchChange,
  selectedTags, onTagsChange,
  selectedUser, onUserChange,
  availableTags, availableUsers,
}) {
  const [userInput, setUserInput] = useState(selectedUser);
  const [showDropdown, setShowDropdown] = useState(false);
  const userRef = useRef(null);

  const toggleTag = (tag) =>
    onTagsChange(
      selectedTags.includes(tag)
        ? selectedTags.filter(t => t !== tag)
        : [...selectedTags, tag]
    );

  const handleUserInput = (e) => {
    setUserInput(e.target.value);
    onUserChange(e.target.value);
    setShowDropdown(true);
  };

  const selectUser = (u) => {
    setUserInput(u);
    onUserChange(u);
    setShowDropdown(false);
  };

  const clearUser = () => { setUserInput(''); onUserChange(''); };

  const clearAll = () => {
    onSearchChange('');
    onTagsChange([]);
    onUserChange('');
    setUserInput('');
  };

  const hasFilters = search || selectedTags.length > 0 || selectedUser;

  const dropdownUsers = availableUsers.filter(u =>
    !userInput || u.toLowerCase().includes(userInput.toLowerCase())
  );

  return (
    <div className="recipe-filters">
      <div className="filter-row">
        <div className="filter-search">
          <input
            className="search-input"
            type="search"
            placeholder="Search by name, description, ingredient, tag, or user..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>
        <div className="filter-user-wrap combobox" ref={userRef}>
          <input
            className="form-input filter-user-input"
            type="text"
            placeholder="Filter by user..."
            value={userInput}
            onChange={handleUserInput}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            autoComplete="off"
          />
          {userInput && (
            <button type="button" className="filter-user-clear" onClick={clearUser} aria-label="Clear user">
              ×
            </button>
          )}
          {showDropdown && dropdownUsers.length > 0 && (
            <ul className="combobox-dropdown">
              {dropdownUsers.map(u => (
                <li key={u} onMouseDown={() => selectUser(u)}>{u}</li>
              ))}
            </ul>
          )}
        </div>
        {hasFilters && (
          <button className="btn btn-ghost" onClick={clearAll}>Clear All</button>
        )}
      </div>

      {availableTags.length > 0 && (
        <div className="filter-tags-row">
          <span className="filter-label">Tags:</span>
          <div className="chips">
            {availableTags.map(tag => (
              <button
                key={tag}
                type="button"
                className={`chip${selectedTags.includes(tag) ? ' chip-active' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
