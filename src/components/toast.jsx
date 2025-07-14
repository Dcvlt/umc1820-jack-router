import React from 'react';
export const Toast = ({ toast }) => {
  if (!toast.show) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 16px',
        backgroundColor: toast.type === 'success' ? '#4CAF50' : '#f44336',
        color: 'white',
        borderRadius: '4px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        zIndex: 1000,
        fontSize: '14px',
        maxWidth: '300px',
      }}
    >
      {toast.message}
    </div>
  );
};
