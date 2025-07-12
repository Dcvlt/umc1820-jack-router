import React from 'react';

export const LoadingScreen = ({ theme }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: theme.background,
      color: theme.text,
    }}
  >
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: '18px',
          marginBottom: '10px',
          animation: 'blink 2s infinite',
        }}
      >
        Loading JACK Audio Router...
      </div>
      <div
        style={{
          fontSize: '14px',
          opacity: 0.7,
          animation: 'blink 2s infinite',
        }}
      >
        Initializing audio connections
      </div>
      <div
        style={{
          marginTop: '20px',
          width: '50px',
          height: '50px',
          border: `4px solid ${theme.text}`,
          borderTop: `4px solid transparent`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontSize: '20px',
          marginX: 'auto',
        }}
      >
        🎵
      </div>
    </div>
    <style>
      {`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}
    </style>
  </div>
);
