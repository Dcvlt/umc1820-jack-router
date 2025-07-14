import React from 'react';
import { Sun, Moon, Palette } from 'lucide-react';

export const ThemeControls = ({ theme, currentTheme, setTheme }) => (
  <div
    style={{
      display: 'flex',
      gap: '10px',
      alignItems: 'center',
      marginBottom: '20px',
    }}
  >
    <span style={{ color: currentTheme.text, fontSize: '14px' }}>Theme:</span>
    <button
      onClick={() => setTheme('light')}
      style={{
        padding: '6px 12px',
        border: `2px solid ${theme === 'light' ? currentTheme.buttonActive : currentTheme.border}`,
        borderRadius: '4px',
        backgroundColor:
          theme === 'light' ? currentTheme.buttonActive : 'transparent',
        color: theme === 'light' ? 'white' : currentTheme.text,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '12px',
      }}
    >
      <Sun size={14} />
      Light
    </button>
    <button
      onClick={() => setTheme('dark')}
      style={{
        padding: '6px 12px',
        border: `2px solid ${theme === 'dark' ? currentTheme.buttonActive : currentTheme.border}`,
        borderRadius: '4px',
        backgroundColor:
          theme === 'dark' ? currentTheme.buttonActive : 'transparent',
        color: theme === 'dark' ? 'white' : currentTheme.text,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '12px',
      }}
    >
      <Moon size={14} />
      Dark
    </button>
    <button
      onClick={() => setTheme('sports')}
      style={{
        padding: '6px 12px',
        border: `2px solid ${theme === 'sports' ? currentTheme.buttonActive : currentTheme.border}`,
        borderRadius: '4px',
        backgroundColor:
          theme === 'sports' ? currentTheme.buttonActive : 'transparent',
        color: theme === 'sports' ? 'white' : currentTheme.text,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '12px',
      }}
    >
      <Palette size={14} />
      Sports
    </button>
  </div>
);
