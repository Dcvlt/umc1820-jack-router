// services/mqttService.js - MQTT Service Integration with Home Assistant Discovery
const mqtt = require('mqtt');
const logger = require('../utils/logger');
const { parseJackConnections } = require('../utils/jackParser');

// Import other services
const jackService = require('./jackService');
const connectionService = require('./connectionService');

let mqttClient = null;
let connectionMatrix = {}; // Track current connections
let deviceConfig = null;
let routingPresets = null;
let isInitialized = false;

// MQTT Configuration
const getMQTTConfig = () => ({
  host: process.env.MQTT_HOST,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clientId: process.env.MQTT_CLIENT_ID || 'jack-audio-router',
  enabled: process.env.MQTT_ENABLED === 'true',
  keepalive: parseInt(process.env.MQTT_KEEPALIVE || '60', 10),
  reconnectPeriod: parseInt(process.env.MQTT_RECONNECT_PERIOD || '1000', 10),
});

// MQTT Topics for Home Assistant Discovery
const MQTT_TOPICS = {
  // Discovery topics
  discovery: {
    base: 'homeassistant',
    switch: 'homeassistant/switch/jack_audio',
    sensor: 'homeassistant/sensor/jack_audio',
    button: 'homeassistant/button/jack_audio',
  },

  // Device topics
  device: {
    base: 'jack_audio',
    connections: 'jack_audio/connections',
    status: 'jack_audio/status',
    availability: 'jack_audio/availability',
    command: 'jack_audio/command',
  },

  // Legacy topics for backward compatibility
  command: 'homeassistant/jack_audio/command',
  preset: 'homeassistant/jack_audio/preset',
  connect: 'homeassistant/jack_audio/connect',
  disconnect: 'homeassistant/jack_audio/disconnect',
  clear: 'homeassistant/jack_audio/clear',
  status: 'homeassistant/jack_audio/status',
  connections: 'homeassistant/jack_audio/connections',
  availability: 'homeassistant/jack_audio/availability',
};

/**
 * Initialize MQTT service
 * @param {Object} config - Configuration object
 */
function initialize(config = {}) {
  const mqttConfig = getMQTTConfig();
  
  if (!mqttConfig.enabled) {
    logger.info('📡 MQTT service disabled');
    return false;
  }

  if (!mqttConfig.host) {
    logger.warn('📡 MQTT_HOST not configured, skipping MQTT initialization');
    return false;
  }

  deviceConfig = config.deviceConfig || {};
  routingPresets = config.routingPresets || {};

  try {
    logger.info(`📡 Connecting to MQTT broker: ${mqttConfig.host}`);
    
    mqttClient = mqtt.connect(mqttConfig.host, {
      username: mqttConfig.username,
      password: mqttConfig.password,
      clientId: mqttConfig.clientId,
      keepalive: mqttConfig.keepalive,
      reconnectPeriod: mqttConfig.reconnectPeriod,
      will: {
        topic: MQTT_TOPICS.device.availability,
        payload: 'offline',
        qos: 1,
        retain: true,
      },
    });

    setupEventHandlers();
    isInitialized = true;
    return true;
  } catch (error) {
    logger.error('📡 Failed to initialize MQTT:', error);
    return false;
  }
}

/**
 * Setup MQTT event handlers
 */
function setupEventHandlers() {
  mqttClient.on('connect', () => {
    logger.info('📡 Connected to MQTT broker');

    // Subscribe to all command topics
    const subscribeTopics = [
      MQTT_TOPICS.device.command,
      MQTT_TOPICS.command,
      MQTT_TOPICS.preset,
      MQTT_TOPICS.connect,
      MQTT_TOPICS.disconnect,
      MQTT_TOPICS.clear,
      `${MQTT_TOPICS.device.base}/+/+/set`, // For matrix switches
      `${MQTT_TOPICS.device.base}/preset/+/set`, // For preset buttons
    ];

    subscribeTopics.forEach((topic) => {
      mqttClient.subscribe(topic, (error) => {
        if (error) {
          logger.error(`📡 Failed to subscribe to ${topic}:`, error);
        } else {
          logger.debug(`📡 Subscribed to: ${topic}`);
        }
      });
    });

    // Publish availability
    publishAvailability('online');

    // Setup Home Assistant Discovery
    setupHomeAssistantDiscovery();

    // Send initial status
    publishStatus();
  });

  mqttClient.on('message', handleMQTTMessage);
  
  mqttClient.on('error', (error) => {
    logger.error('📡 MQTT Error:', error);
  });
  
  mqttClient.on('close', () => {
    logger.warn('📡 MQTT connection closed');
  });

  mqttClient.on('reconnect', () => {
    logger.info('📡 MQTT reconnecting...');
  });

  mqttClient.on('offline', () => {
    logger.warn('📡 MQTT client offline');
  });
}

/**
 * Setup Home Assistant Discovery entities
 */
function setupHomeAssistantDiscovery() {
  if (!deviceConfig.inputs || !deviceConfig.outputs) {
    logger.warn('📡 Device configuration missing, skipping Home Assistant discovery');
    return;
  }

  const deviceInfo = {
    identifiers: ['jack_audio_router'],
    name: 'JACK Audio Router',
    model: process.env.DEVICE_MODEL || 'Behringer UMC1820',
    manufacturer: process.env.DEVICE_MANUFACTURER || 'Custom',
    sw_version: process.env.npm_package_version || '1.0.0',
    configuration_url: `http://${require('../utils/network').getLocalIP()}:${process.env.PORT || 3001}`,
  };

  // Create connection matrix switches (input -> output combinations)
  Object.entries(deviceConfig.inputs).forEach(([inputKey, inputConfig]) => {
    Object.entries(deviceConfig.outputs).forEach(([outputKey, outputConfig]) => {
      const entityId = `${inputKey}_to_${outputKey}`;

      const switchConfig = {
        name: `${inputConfig.label} → ${outputConfig.label}`,
        unique_id: `jack_audio_connection_${entityId}`,
        state_topic: `${MQTT_TOPICS.device.base}/connection/${entityId}/state`,
        command_topic: `${MQTT_TOPICS.device.base}/connection/${entityId}/set`,
        payload_on: 'ON',
        payload_off: 'OFF',
        state_on: 'ON',
        state_off: 'OFF',
        device: deviceInfo,
        icon: 'mdi:cable-data',
        entity_category: 'config',
      };

      const discoveryTopic = `${MQTT_TOPICS.discovery.switch}/${entityId}/config`;
      publishDiscovery(discoveryTopic, switchConfig);
    });
  });

  // Create preset buttons
  Object.entries(routingPresets).forEach(([presetKey, presetConfig]) => {
    const buttonConfig = {
      name: `Apply ${presetConfig.name}`,
      unique_id: `jack_audio_preset_${presetKey}`,
      command_topic: `${MQTT_TOPICS.device.base}/preset/${presetKey}/set`,
      payload_press: 'PRESS',
      device: deviceInfo,
      icon: 'mdi:playlist-music',
      entity_category: 'config',
    };

    const discoveryTopic = `${MQTT_TOPICS.discovery.button}/preset_${presetKey}/config`;
    publishDiscovery(discoveryTopic, buttonConfig);
  });

  // Create clear all button
  const clearButtonConfig = {
    name: 'Clear All Connections',
    unique_id: 'jack_audio_clear_all',
    command_topic: `${MQTT_TOPICS.device.base}/clear/set`,
    payload_press: 'PRESS',
    device: deviceInfo,
    icon: 'mdi:delete-sweep',
    entity_category: 'config',
  };

  const clearDiscoveryTopic = `${MQTT_TOPICS.discovery.button}/clear_all/config`;
  publishDiscovery(clearDiscoveryTopic, clearButtonConfig);

  // Create status sensor
  const statusSensorConfig = {
    name: 'JACK Audio Status',
    unique_id: 'jack_audio_status',
    state_topic: MQTT_TOPICS.device.status,
    value_template: "{{ value_json.jack_running | default('unknown') }}",
    json_attributes_topic: MQTT_TOPICS.device.status,
    device: deviceInfo,
    icon: 'mdi:audio-input-rca',
  };

  const statusDiscoveryTopic = `${MQTT_TOPICS.discovery.sensor}/status/config`;
  publishDiscovery(statusDiscoveryTopic, statusSensorConfig);

  logger.info('🏠 Home Assistant Discovery setup completed');
}

/**
 * Handle incoming MQTT messages
 */
async function handleMQTTMessage(topic, message) {
  try {
    const payload = message.toString();
    logger.debug(`📨 MQTT Message on ${topic}: ${payload}`);

    // Handle connection matrix switches
    if (topic.match(/jack_audio\/connection\/(.+)\/set/)) {
      const match = topic.match(/jack_audio\/connection\/(.+)\/set/);
      const connectionId = match[1];
      await handleConnectionSwitch(connectionId, payload);
      return;
    }

    // Handle preset buttons
    if (topic.match(/jack_audio\/preset\/(.+)\/set/)) {
      const match = topic.match(/jack_audio\/preset\/(.+)\/set/);
      const presetKey = match[1];
      if (payload === 'PRESS') {
        await handlePresetCommand({ preset: presetKey });
      }
      return;
    }

    // Handle clear button
    if (topic === `${MQTT_TOPICS.device.base}/clear/set`) {
      if (payload === 'PRESS') {
        await handleClearCommand();
      }
      return;
    }

    // Handle legacy topics
    let parsedPayload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      parsedPayload = payload;
    }

    switch (topic) {
      case MQTT_TOPICS.preset:
        await handlePresetCommand(parsedPayload);
        break;
      case MQTT_TOPICS.connect:
        await handleConnectCommand(parsedPayload);
        break;
      case MQTT_TOPICS.disconnect:
        await handleDisconnectCommand(parsedPayload);
        break;
      case MQTT_TOPICS.clear:
        await handleClearCommand();
        break;
      case MQTT_TOPICS.command:
        await handleGenericCommand(parsedPayload);
        break;
      default:
        logger.debug(`📡 Unknown MQTT topic: ${topic}`);
    }
  } catch (error) {
    logger.error('📡 Error handling MQTT message:', error);
    publishError(error.message);
  }
}

/**
 * Handle connection matrix switch
 */
async function handleConnectionSwitch(connectionId, payload) {
  const [inputKey, , outputKey] = connectionId.split('_');

  const inputConfig = deviceConfig.inputs[inputKey];
  const outputConfig = deviceConfig.outputs[outputKey];

  if (!inputConfig || !outputConfig) {
    logger.error(`📡 Invalid connection: ${connectionId}`);
    return;
  }

  const fromPort = inputConfig.value;
  const toPort = outputConfig.value;

  try {
    if (payload === 'ON') {
      await connectionService.connectPorts(fromPort, toPort);
      connectionMatrix[connectionId] = true;
      logger.info(`📡 Connected: ${inputConfig.label} → ${outputConfig.label}`);
    } else {
      await connectionService.disconnectPorts(fromPort, toPort);
      connectionMatrix[connectionId] = false;
      logger.info(`📡 Disconnected: ${inputConfig.label} → ${outputConfig.label}`);
    }

    // Publish state back to Home Assistant
    publishConnectionState(connectionId, payload);
    publishStatus();
  } catch (error) {
    logger.error(`📡 Error handling connection switch: ${error.message}`);
    // Publish error state
    publishConnectionState(connectionId, connectionMatrix[connectionId] ? 'ON' : 'OFF');
  }
}

/**
 * Command handlers
 */
async function handlePresetCommand(payload) {
  const { preset } = payload;

  if (!routingPresets[preset]) {
    throw new Error(`Preset not found: ${preset}`);
  }

  logger.info(`📡 Applying preset via MQTT: ${preset}`);

  // Clear existing connections
  await connectionService.clearAllConnections();

  // Apply preset
  const presetConfig = routingPresets[preset];
  const results = [];

  for (const connection of presetConfig.connections) {
    const fromConfig = deviceConfig.inputs[connection.from] || deviceConfig.outputs[connection.from];
    const toConfig = deviceConfig.outputs[connection.to];

    const fromPort = fromConfig?.value;
    const toPort = toConfig?.value;

    if (fromPort && toPort) {
      try {
        await connectionService.connectPorts(fromPort, toPort);
        results.push({
          from: connection.from,
          to: connection.to,
          from_label: fromConfig.label,
          to_label: toConfig.label,
          status: 'connected',
        });
      } catch (error) {
        results.push({
          from: connection.from,
          to: connection.to,
          status: 'error',
          message: error.message,
        });
      }
    }
  }

  publishPresetApplied(preset, results);
  publishStatus();
}

async function handleConnectCommand(payload) {
  const { from, to } = payload;

  const fromConfig = deviceConfig.inputs[from] || deviceConfig.outputs[from];
  const toConfig = deviceConfig.outputs[to];

  const fromPort = fromConfig?.value;
  const toPort = toConfig?.value;

  if (!fromPort || !toPort) {
    throw new Error(`Invalid port names: ${from} -> ${to}`);
  }

  await connectionService.connectPorts(fromPort, toPort);

  publishConnectionChange('connected', {
    from,
    to,
    from_label: fromConfig.label,
    to_label: toConfig.label,
  });

  publishStatus();
}

async function handleDisconnectCommand(payload) {
  const { from, to } = payload;

  const fromConfig = deviceConfig.inputs[from] || deviceConfig.outputs[from];
  const toConfig = deviceConfig.outputs[to];

  const fromPort = fromConfig?.value;
  const toPort = toConfig?.value;

  if (!fromPort || !toPort) {
    throw new Error(`Invalid port names: ${from} -> ${to}`);
  }

  await connectionService.disconnectPorts(fromPort, toPort);

  publishConnectionChange('disconnected', {
    from,
    to,
    from_label: fromConfig.label,
    to_label: toConfig.label,
  });

  publishStatus();
}

async function handleClearCommand() {
  await connectionService.clearAllConnections();
  publishConnectionChange('cleared', {});
  publishStatus();
}

async function handleGenericCommand(payload) {
  const { action, data } = payload;

  switch (action) {
    case 'get_status':
      publishStatus();
      break;
    case 'get_presets':
      publishPresets();
      break;
    case 'get_device_config':
      publishDeviceConfig();
      break;
    default:
      throw new Error(`Unknown command: ${action}`);
  }
}

/**
 * Update connection matrix from current JACK state
 */
function updateConnectionMatrix(connections) {
  // Reset matrix
  connectionMatrix = {};

  // Build matrix from current connections
  Object.entries(deviceConfig.inputs || {}).forEach(([inputKey, inputConfig]) => {
    Object.entries(deviceConfig.outputs || {}).forEach(([outputKey, outputConfig]) => {
      const connectionId = `${inputKey}_to_${outputKey}`;

      // Check if this connection exists
      const isConnected = connections.some(
        (conn) => conn.from === inputConfig.value && conn.to === outputConfig.value
      );

      connectionMatrix[connectionId] = isConnected;
      publishConnectionState(connectionId, isConnected ? 'ON' : 'OFF');
    });
  });
}

/**
 * Publishing functions
 */
function publishDiscovery(topic, config) {
  if (!mqttClient || !mqttClient.connected) return;

  mqttClient.publish(topic, JSON.stringify(config), { retain: true }, (error) => {
    if (error) {
      logger.error(`📡 Failed to publish discovery for ${topic}:`, error);
    } else {
      logger.debug(`📡 Published discovery: ${topic}`);
    }
  });
}

function publishConnectionState(connectionId, state) {
  if (!mqttClient || !mqttClient.connected) return;

  const topic = `${MQTT_TOPICS.device.base}/connection/${connectionId}/state`;
  mqttClient.publish(topic, state, { qos: 1, retain: true });
}

function publishAvailability(status) {
  if (!mqttClient) return;

  mqttClient.publish(MQTT_TOPICS.device.availability, status, {
    qos: 1,
    retain: true,
  });
}

async function publishStatus() {
  if (!mqttClient || !mqttClient.connected) return;

  try {
    const jackRunning = await jackService.checkStatus();
    
    if (jackRunning) {
      const connectionOutput = await jackService.listConnections();
      const parsedConnections = parseJackConnections(connectionOutput);

      // Update connection matrix
      updateConnectionMatrix(parsedConnections);

      const status = {
        timestamp: new Date().toISOString(),
        jack_running: true,
        connections: parsedConnections,
        connection_matrix: connectionMatrix,
        available_presets: Object.keys(routingPresets),
        device_config: deviceConfig,
      };

      mqttClient.publish(MQTT_TOPICS.device.status, JSON.stringify(status), { qos: 1 });
      mqttClient.publish(MQTT_TOPICS.status, JSON.stringify(status), { qos: 1 }); // Legacy
    } else {
      const errorStatus = {
        timestamp: new Date().toISOString(),
        jack_running: false,
        error: 'JACK server not running',
      };

      mqttClient.publish(MQTT_TOPICS.device.status, JSON.stringify(errorStatus), { qos: 1 });
      mqttClient.publish(MQTT_TOPICS.status, JSON.stringify(errorStatus), { qos: 1 }); // Legacy
    }
  } catch (error) {
    logger.error('📡 Error publishing status:', error);
    publishError(error.message);
  }
}

function publishPresetApplied(preset, results) {
  if (!mqttClient || !mqttClient.connected) return;

  const message = {
    timestamp: new Date().toISOString(),
    action: 'preset_applied',
    preset,
    results,
  };

  mqttClient.publish(MQTT_TOPICS.device.connections, JSON.stringify(message), { qos: 1 });
  mqttClient.publish(MQTT_TOPICS.connections, JSON.stringify(message), { qos: 1 }); // Legacy
}

function publishConnectionChange(action, data) {
  if (!mqttClient || !mqttClient.connected) return;

  const message = {
    timestamp: new Date().toISOString(),
    action,
    ...data,
  };

  mqttClient.publish(MQTT_TOPICS.device.connections, JSON.stringify(message), { qos: 1 });
  mqttClient.publish(MQTT_TOPICS.connections, JSON.stringify(message), { qos: 1 }); // Legacy
}

function publishPresets() {
  if (!mqttClient || !mqttClient.connected) return;

  const message = {
    timestamp: new Date().toISOString(),
    presets: routingPresets,
  };

  mqttClient.publish(MQTT_TOPICS.device.status, JSON.stringify(message), { qos: 1 });
}

function publishDeviceConfig() {
  if (!mqttClient || !mqttClient.connected) return;

  const message = {
    timestamp: new Date().toISOString(),
    device_config: deviceConfig,
  };

  mqttClient.publish(MQTT_TOPICS.device.status, JSON.stringify(message), { qos: 1 });
}

function publishError(errorMessage) {
  if (!mqttClient || !mqttClient.connected) return;

  const message = {
    timestamp: new Date().toISOString(),
    error: errorMessage,
  };

  mqttClient.publish(MQTT_TOPICS.device.status, JSON.stringify(message), { qos: 1 });
}

/**
 * Graceful shutdown
 */
function shutdown() {
  if (mqttClient) {
    logger.info('📡 Shutting down MQTT service...');
    publishAvailability('offline');
    mqttClient.end(true);
    mqttClient = null;
    isInitialized = false;
  }
}

/**
 * Get service status
 */
function getStatus() {
  return {
    initialized: isInitialized,
    connected: mqttClient?.connected || false,
    config: getMQTTConfig(),
    topics: MQTT_TOPICS,
  };
}

/**
 * Check if MQTT is enabled and available
 */
function isEnabled() {
  return getMQTTConfig().enabled;
}

/**
 * Update device configuration
 */
function updateDeviceConfig(newDeviceConfig) {
  deviceConfig = newDeviceConfig;
  if (isInitialized && mqttClient?.connected) {
    setupHomeAssistantDiscovery();
  }
}

/**
 * Update routing presets
 */
function updateRoutingPresets(newRoutingPresets) {
  routingPresets = newRoutingPresets;
  if (isInitialized && mqttClient?.connected) {
    setupHomeAssistantDiscovery();
  }
}

// Export functions
module.exports = {
  initialize,
  publishStatus,
  publishConnectionChange,
  publishPresetApplied,
  publishError,
  shutdown,
  getStatus,
  isEnabled,
  updateDeviceConfig,
  updateRoutingPresets,
  MQTT_TOPICS,
};