import React from 'react';
export const PresetControls = ({
  selectedPreset,
  availablePresets,
  isUpdating,
  onPresetChange,
  onApplyPreset,
  onClearAll,
  theme,
}) => (
  <div
    style={{
      display: 'flex',
      gap: '10px',
      alignItems: 'center',
      marginBottom: '20px',
      flexWrap: 'wrap',
    }}
  >
    <select
      value={selectedPreset}
      onChange={onPresetChange}
      disabled={isUpdating}
      style={{
        padding: '8px 12px',
        borderRadius: '4px',
        border: `1px solid ${theme.border}`,
        backgroundColor: theme.controlBg,
        color: '#333',
        fontSize: '14px',
        minWidth: '200px',
      }}
    >
      <option value="">Select a preset...</option>
      {Object.entries(availablePresets).map(([key, preset]) => (
        <option key={key} value={key}>
          {preset.name}
        </option>
      ))}
    </select>
    <button
      onClick={onApplyPreset}
      disabled={isUpdating || !selectedPreset}
      style={{
        padding: '8px 16px',
        borderRadius: '4px',
        border: 'none',
        backgroundColor: '#4CAF50',
        color: 'white',
        fontSize: '14px',
        cursor: isUpdating || !selectedPreset ? 'not-allowed' : 'pointer',
        opacity: isUpdating || !selectedPreset ? 0.6 : 1,
      }}
    >
      {isUpdating ? 'Applying...' : 'Apply Preset'}
    </button>
    <button
      onClick={onClearAll}
      disabled={isUpdating}
      style={{
        padding: '8px 16px',
        borderRadius: '4px',
        border: 'none',
        backgroundColor: '#f44336',
        color: 'white',
        fontSize: '14px',
        cursor: isUpdating ? 'not-allowed' : 'pointer',
        opacity: isUpdating ? 0.6 : 1,
      }}
    >
      Clear All
    </button>
  </div>
);
