import React from 'react';
import { useAudioRouter } from '../hooks/useAudioRouter.js';
import { LoadingScreen } from '../components/loadingScreen.jsx';
import { ThemeControls } from '../components/themeControls.jsx';
import { StatusBar } from '../components/statusBar.jsx';
import { Messages } from '../components/messages.jsx';
import { PresetControls } from '../components/presetControls.jsx';
import { ConnectionMatrix } from '../components/connectionMatrix.jsx';
import { Toast } from '../components/toast.jsx';
import { themes } from '../constants/themeConstants.js';

export const JackAudioRouter = ({ initialData }) => {
  const { state, actions } = useAudioRouter(initialData);
  const currentTheme = themes[state.theme];

  console.log('Initial data in JackAudioRouter:', initialData); // Debugging line

  const handleApplyPreset = (e) => {
    e.preventDefault();
    if (state.selectedPreset) {
      actions.applyPreset(state.selectedPreset);
    }
  };

  const handleClearAll = (e) => {
    e.preventDefault();
    actions.clearAllConnections();
  };
  console.log('✅ Initial data in JackAudioRouter:', initialData); // Debugging line
  if (state.isLoading) {
    return <LoadingScreen theme={currentTheme} />;
  }
  console.log('State', state);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: currentTheme.background,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <h1
            style={{
              color: currentTheme.headerText,
              fontSize: '24px',
              fontWeight: '300',
              margin: 0,
            }}
          >
            🎵 JACK Audio Router
          </h1>
          <ThemeControls
            theme={state.theme}
            currentTheme={currentTheme}
            setTheme={actions.setTheme}
          />
        </div>

        <StatusBar
          serverStatus={state.serverStatus}
          jackStatus={state.jackStatus}
          connectionCount={state.currentConnections.length}
          theme={currentTheme}
        />

        <Messages error={state.error} success={state.success} />

        <PresetControls
          selectedPreset={state.selectedPreset}
          availablePresets={state.availablePresets}
          isUpdating={state.isUpdating}
          onPresetChange={(e) => actions.setSelectedPreset(e.target.value)}
          onApplyPreset={handleApplyPreset}
          onClearAll={handleClearAll}
          theme={currentTheme}
        />

        <div
          style={{
            backgroundColor: currentTheme.cardBg,
            borderRadius: '8px',
            padding: '20px',
            border: `1px solid ${currentTheme.border}`,
          }}
        >
          <h2
            style={{
              color: currentTheme.headerText,
              marginBottom: '15px',
              fontSize: '18px',
              fontWeight: '400',
            }}
          >
            Connection Matrix
          </h2>
          <ConnectionMatrix
            deviceConfig={state.deviceConfig}
            showIndividualChannels={state.showIndividualChannels}
            stereoGroups={state.stereoGroups}
            isUpdating={state.isUpdating}
            theme={currentTheme}
            onToggleChannelView={() =>
              actions.setShowIndividualChannels(!state.showIndividualChannels)
            }
            onToggleConnection={actions.toggleConnection}
            isConnectionActive={actions.isConnectionActive}
          />
        </div>
      </div>

      <Toast toast={state.toast} />
    </div>
  );
};
