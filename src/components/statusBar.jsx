import React from 'react';
export const StatusBar = ({
  serverStatus,
  jackStatus,
  connectionCount,
  theme,
}) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 20px',
      backgroundColor: theme.cardBg,
      borderRadius: '8px',
      marginBottom: '20px',
      border: `1px solid ${theme.border}`,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: serverStatus ? '#4CAF50' : '#f44336',
          }}
        />
        <span style={{ color: theme.text, fontSize: '14px' }}>
          Server: {serverStatus ? 'Online' : 'Offline'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: jackStatus ? '#4CAF50' : '#f44336',
          }}
        />
        <span style={{ color: theme.text, fontSize: '14px' }}>
          JACK: {jackStatus ? 'Running' : 'Stopped'}
        </span>
      </div>
    </div>
    <div style={{ color: theme.text, fontSize: '12px' }}>
      {connectionCount} active connections
    </div>
  </div>
);
