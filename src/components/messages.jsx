import React from 'react';
export const Messages = ({ error, success }) => {
  if (!error && !success) return null;

  return (
    <div style={{ marginBottom: '20px' }}>
      {error && (
        <div
          style={{
            padding: '12px',
            backgroundColor: 'rgba(244, 67, 54, 0.1)',
            border: '1px solid rgba(244, 67, 54, 0.3)',
            borderRadius: '4px',
            color: '#f44336',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            padding: '12px',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            border: '1px solid rgba(76, 175, 80, 0.3)',
            borderRadius: '4px',
            color: '#4CAF50',
            fontSize: '14px',
          }}
        >
          {success}
        </div>
      )}
    </div>
  );
};
