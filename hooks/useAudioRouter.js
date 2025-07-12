import { useState, useEffect, useCallback } from 'react';

export const useAudioRouter = (initialData) => {
  const [deviceConfig, setDeviceConfig] = useState(
    initialData?.device_config || null
  );
  const [currentConnections, setCurrentConnections] = useState(
    initialData?.parsed_connections || []
  );
  const [availablePresets, setAvailablePresets] = useState(
    initialData?.presets || {}
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [jackStatus, setJackStatus] = useState(
    initialData?.jack_running || false
  );
  const [serverStatus, setServerStatus] = useState(
    initialData?.status === 'ok'
  );
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [toast, setToast] = useState({
    show: false,
    message: '',
    type: 'success',
  });
  const [theme, setTheme] = useState('dark');
  const [showIndividualChannels, setShowIndividualChannels] = useState(false);
  const [stereoGroups, setStereoGroups] = useState({});

  const API_BASE = '/api';

  const showToast = useCallback((message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 3000);
  }, []);

  const showError = useCallback((message) => {
    setError(message);
    setSuccess(null);
    setTimeout(() => setError(null), 5000);
  }, []);

  const showSuccess = useCallback((message) => {
    setSuccess(message);
    setError(null);
    setTimeout(() => setSuccess(null), 3000);
  }, []);

  const detectStereoGroups = useCallback(() => {
    if (!deviceConfig) return {};

    const groups = {};

    // Group inputs by their 'group' key
    Object.entries(deviceConfig.inputs).forEach(([key, input]) => {
      if (!input.group) return;
      if (!groups[input.group]) {
        groups[input.group] = {
          type: 'input',
          name: input.group,
          channels: [],
        };
      }
      groups[input.group].channels.push({ key, ...input });
    });

    // Group outputs by their 'group' key
    Object.entries(deviceConfig.outputs).forEach(([key, output]) => {
      if (!output.group) return;
      if (!groups[output.group]) {
        groups[output.group] = {
          type: 'output',
          name: output.group,
          channels: [],
        };
      }
      groups[output.group].channels.push({ key, ...output });
    });

    return groups;
  }, [deviceConfig]);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (data.status === 'ok') {
        setServerStatus(true);
        setJackStatus(data.jack_running);
        setDeviceConfig(data.device_config);
        setCurrentConnections(data.parsed_connections || []);
        return data;
      } else {
        throw new Error(data.message || 'Server error');
      }
    } catch (error) {
      console.error('Fetch status error:', error);
      setServerStatus(false);
      setJackStatus(false);
      throw error;
    }
  }, []);

  const fetchPresets = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/presets`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const presets = await response.json();
      setAvailablePresets(presets);
    } catch (error) {
      console.error('Failed to fetch presets:', error);
      showError('Failed to load presets');
    }
  }, [showError]);

  const applyPreset = useCallback(
    async (presetName) => {
      if (isUpdating) return;
      setIsUpdating(true);

      try {
        const response = await fetch(`${API_BASE}/preset/${presetName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.status === 'success') {
          showSuccess(
            `Applied preset: ${availablePresets[presetName]?.name || presetName}`
          );
          await fetchStatus();
        } else {
          throw new Error(data.message || 'Failed to apply preset');
        }
      } catch (error) {
        console.error('Failed to apply preset:', error);
        showError(`Failed to apply preset: ${error.message}`);
      } finally {
        setIsUpdating(false);
      }
    },
    [isUpdating, availablePresets, showSuccess, showError, fetchStatus]
  );

  const toggleConnection = useCallback(
    async (fromKey, toKey) => {
      if (isUpdating) return;
      setIsUpdating(true);

      try {
        const isConnected = isConnectionActive(fromKey, toKey);
        const endpoint = isConnected ? 'disconnect' : 'connect';

        const response = await fetch(`${API_BASE}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: fromKey, to: toKey }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.status === 'connected' || data.status === 'disconnected') {
          showToast(
            `${isConnected ? 'Disconnected' : 'Connected'}: ${data.from_label} → ${data.to_label}`
          );
          await fetchStatus();
        } else {
          throw new Error(data.error || 'Connection failed');
        }
      } catch (error) {
        console.error('Failed to toggle connection:', error);
        showError(`Connection failed: ${error.message}`);
      } finally {
        setIsUpdating(false);
      }
    },
    [isUpdating, showToast, showError, fetchStatus]
  );

  const clearAllConnections = useCallback(async () => {
    if (isUpdating) return;
    if (!window.confirm('Are you sure you want to clear all connections?'))
      return;

    setIsUpdating(true);

    try {
      const response = await fetch(`${API_BASE}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (data.status === 'cleared') {
        showSuccess('All connections cleared');
        await fetchStatus();
      } else {
        throw new Error('Failed to clear connections');
      }
    } catch (error) {
      console.error('Failed to clear connections:', error);
      showError(`Failed to clear connections: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  }, [isUpdating, showSuccess, showError, fetchStatus]);

  const isConnectionActive = useCallback(
    (inputKey, outputKey) => {
      if (!deviceConfig) return false;

      const inputConfig = deviceConfig.inputs[inputKey];
      const outputConfig = deviceConfig.outputs[outputKey];

      if (!inputConfig || !outputConfig) return false;

      return currentConnections.some(
        (conn) =>
          conn.from === inputConfig.value && conn.to === outputConfig.value
      );
    },
    [deviceConfig, currentConnections]
  );

  const initialize = useCallback(async () => {
    try {
      setLoading(true);
      if (!initialData) {
        await fetchPresets();
        await fetchStatus();
      }
      setLoading(false);
      showSuccess('Audio router loaded successfully');
    } catch (error) {
      console.error('Initialization failed:', error);
      setLoading(false);
      showError(`Failed to initialize: ${error.message}`);
    }
  }, [initialData, fetchPresets, fetchStatus, showSuccess, showError]);

  useEffect(() => {
    if (!initialData) {
      initialize();
    }
  }, [initialData, initialize]);

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (deviceConfig) {
      setStereoGroups(detectStereoGroups());
    }
  }, [deviceConfig, detectStereoGroups]);

  useEffect(() => {
    const initialize = async () => {
      try {
        await fetchStatus();
        setLoading(false);
      } catch (error) {
        setLoading(false);
        showError('Failed to initialize data');
      }
    };

    initialize();
  }, [fetchStatus, showError]);

  return {
    state: {
      deviceConfig,
      currentConnections,
      availablePresets,
      isUpdating,
      selectedPreset,
      jackStatus,
      serverStatus,
      loading,
      error,
      success,
      toast,
      theme,
      showIndividualChannels,
      stereoGroups,
    },
    actions: {
      setSelectedPreset,
      setTheme,
      setShowIndividualChannels,
      applyPreset,
      toggleConnection,
      clearAllConnections,
      isConnectionActive,
    },
  };
};
