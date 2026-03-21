import React from 'react';

const FILTER_FIELDS = [
  { key: 'country', label: 'Country', optionsKey: 'countries' },
  { key: 'operator', label: 'Operator', optionsKey: 'operators' },
  { key: 'orbit_type', label: 'Orbit type', optionsKey: 'orbit_types' },
  { key: 'purpose', label: 'Purpose', optionsKey: 'purposes' },
];

export default function FiltersPanel({ filters, onFiltersChange, filterOptions, positionsCount }) {
  const updateFilter = (key, value) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <section className="panel-section">
      <div className="section-header">
        <h3>Filters</h3>
        <span className="status-pill">{positionsCount} visible</span>
      </div>

      <label className="field-label" htmlFor="search-filter">Search</label>
      <input
        id="search-filter"
        type="text"
        value={filters.search}
        placeholder="Satellite name or operator"
        onChange={(event) => updateFilter('search', event.target.value)}
      />

      {FILTER_FIELDS.map((field) => (
        <div key={field.key} className="field-group">
          <label className="field-label" htmlFor={`filter-${field.key}`}>{field.label}</label>
          <select
            id={`filter-${field.key}`}
            value={filters[field.key]}
            onChange={(event) => updateFilter(field.key, event.target.value)}
          >
            <option value="">All</option>
            {(filterOptions[field.optionsKey] || []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      ))}

      <button
        type="button"
        className="secondary-button full-width"
        onClick={() => onFiltersChange({ country: '', operator: '', orbit_type: '', purpose: '', search: '' })}
      >
        Reset filters
      </button>
    </section>
  );
}
