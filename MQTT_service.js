// Enhanced MQTT Integration with Home Assistant Discovery
const mqtt = require('mqtt');
require('dotenv').config();

const MQTT_CONFIG = {
  host: process.env.MQTT_HOST,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clientId: process.env.MQTT_CLIENT_ID || 'jack-audio-router',
};

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

// Initialize MQTT client
let mqttClient = null;
let connectionMatrix = {}; // Track current connections
let deviceConfig = null;
let routingPresets = null;

function initializeMQTT(config = {}) {
  deviceConfig = config.deviceConfig || {};
  routingPresets = config.routingPresets || {};

  try {
    mqttClient = mqtt.connect(MQTT_CONFIG.host, {
      username: MQTT_CONFIG.username,
      password: MQTT_CONFIG.password,
      clientId: MQTT_CONFIG.clientId,
      will: {
        topic: MQTT_TOPICS.device.availability,
        payload: 'offline',
        qos: 1,
        retain: true,
      },
    });

    mqttClient.on('connect', () => {
      console.log('🔗 Connected to MQTT broker');

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
        mqttClient.subscribe(topic);
        console.log(`📡 Subscribed to: ${topic}`);
      });

      // Publish availability
      mqttClient.publish(MQTT_TOPICS.device.availability, 'online', {
        qos: 1,
        retain: true,
      });

      // Setup Home Assistant Discovery
      setupHomeAssistantDiscovery();

      // Send initial status
      publishStatus();
    });

    mqttClient.on('message', handleMQTTMessage);
    mqttClient.on('error', (error) => console.error('MQTT Error:', error));
    mqttClient.on('close', () => console.log('🔌 MQTT connection closed'));
  } catch (error) {
    console.error('Failed to initialize MQTT:', error);
  }
}

// Setup Home Assistant Discovery entities
function setupHomeAssistantDiscovery() {
  if (!deviceConfig.inputs || !deviceConfig.outputs) return;

  const deviceInfo = {
    identifiers: ['jack_audio_router'],
    name: 'JACK Audio Router',
    model: 'Behringer UMC1820',
    manufacturer: 'Custom',
    sw_version: '1.0.0',
  };

  // Create connection matrix switches (input -> output combinations)
  Object.entries(deviceConfig.inputs).forEach(([inputKey, inputConfig]) => {
    Object.entries(deviceConfig.outputs).forEach(
      ([outputKey, outputConfig]) => {
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
        mqttClient.publish(discoveryTopic, JSON.stringify(switchConfig), {
          retain: true,
        });
      }
    );
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
    mqttClient.publish(discoveryTopic, JSON.stringify(buttonConfig), {
      retain: true,
    });
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
  mqttClient.publish(clearDiscoveryTopic, JSON.stringify(clearButtonConfig), {
    retain: true,
  });

  // Create status sensor
  const statusSensorConfig = {
    name: 'JACK Audio Status',
    unique_id: 'jack_audio_status',
    state_topic: `${MQTT_TOPICS.device.status}`,
    value_template: "{{ value_json.jack_running | default('unknown') }}",
    json_attributes_topic: `${MQTT_TOPICS.device.status}`,
    device: deviceInfo,
    icon: 'mdi:audio-input-rca',
  };

  const statusDiscoveryTopic = `${MQTT_TOPICS.discovery.sensor}/status/config`;
  mqttClient.publish(statusDiscoveryTopic, JSON.stringify(statusSensorConfig), {
    retain: true,
  });

  console.log('🏠 Home Assistant Discovery setup completed');
}

// Handle incoming MQTT messages
async function handleMQTTMessage(topic, message) {
  try {
    const payload = message.toString();
    console.log(`📨 MQTT Message on ${topic}: ${payload}`);

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
        console.log(`Unknown topic: ${topic}`);
    }
  } catch (error) {
    console.error('Error handling MQTT message:', error);
    publishError(error.message);
  }
}

// Handle connection matrix switch
async function handleConnectionSwitch(connectionId, payload) {
  const [inputKey, , outputKey] = connectionId.split('_'); // Split "input1_to_output1" -> ["input1", "to", "output1"]

  const inputConfig = deviceConfig.inputs[inputKey];
  const outputConfig = deviceConfig.outputs[outputKey];

  if (!inputConfig || !outputConfig) {
    console.error(`Invalid connection: ${connectionId}`);
    return;
  }

  const fromPort = inputConfig.value;
  const toPort = outputConfig.value;

  try {
    if (payload === 'ON') {
      await connectPorts(fromPort, toPort);
      connectionMatrix[connectionId] = true;
      console.log(`🔗 Connected: ${inputConfig.label} → ${outputConfig.label}`);
    } else {
      await disconnectPorts(fromPort, toPort);
      connectionMatrix[connectionId] = false;
      console.log(
        `🔌 Disconnected: ${inputConfig.label} → ${outputConfig.label}`
      );
    }

    // Publish state back to Home Assistant
    publishConnectionState(connectionId, payload);
    publishStatus();
  } catch (error) {
    console.error(`Error handling connection switch: ${error.message}`);
    // Publish error state
    publishConnectionState(
      connectionId,
      connectionMatrix[connectionId] ? 'ON' : 'OFF'
    );
  }
}

// Update connection matrix from current JACK state
function updateConnectionMatrix(connections) {
  // Reset matrix
  connectionMatrix = {};

  // Build matrix from current connections
  Object.entries(deviceConfig.inputs).forEach(([inputKey, inputConfig]) => {
    Object.entries(deviceConfig.outputs).forEach(
      ([outputKey, outputConfig]) => {
        const connectionId = `${inputKey}_to_${outputKey}`;

        // Check if this connection exists
        const isConnected = connections.some(
          (conn) =>
            conn.from === inputConfig.value && conn.to === outputConfig.value
        );

        connectionMatrix[connectionId] = isConnected;
        publishConnectionState(connectionId, isConnected ? 'ON' : 'OFF');
      }
    );
  });
}

// Command handlers (existing functions with updates)
async function handlePresetCommand(payload) {
  const { preset } = payload;

  if (!routingPresets[preset]) {
    throw new Error(`Preset not found: ${preset}`);
  }

  console.log(`🎵 Applying preset via MQTT: ${preset}`);

  // Clear existing connections
  await clearAllConnections();

  // Apply preset
  const presetConfig = routingPresets[preset];
  const results = [];

  for (const connection of presetConfig.connections) {
    const fromConfig =
      deviceConfig.inputs[connection.from] ||
      deviceConfig.outputs[connection.from];
    const toConfig = deviceConfig.outputs[connection.to];

    const fromPort = fromConfig?.value;
    const toPort = toConfig?.value;

    if (fromPort && toPort) {
      try {
        await connectPorts(fromPort, toPort);
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

  await connectPorts(fromPort, toPort);

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

  await disconnectPorts(fromPort, toPort);

  publishConnectionChange('disconnected', {
    from,
    to,
    from_label: fromConfig.label,
    to_label: toConfig.label,
  });

  publishStatus();
}

async function handleClearCommand() {
  await clearAllConnections();
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

// Publishing functions
function publishConnectionState(connectionId, state) {
  if (!mqttClient) return;

  const topic = `${MQTT_TOPICS.device.base}/connection/${connectionId}/state`;
  mqttClient.publish(topic, state, { qos: 1, retain: true });
}

function publishStatus() {
  if (!mqttClient) return;

  listConnections()
    .then((connectionOutput) => {
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

      mqttClient.publish(MQTT_TOPICS.device.status, JSON.stringify(status), {
        qos: 1,
      });
      mqttClient.publish(MQTT_TOPICS.status, JSON.stringify(status), {
        qos: 1,
      }); // Legacy
    })
    .catch((error) => {
      const errorStatus = {
        timestamp: new Date().toISOString(),
        jack_running: false,
        error: error.message,
      };

      mqttClient.publish(
        MQTT_TOPICS.device.status,
        JSON.stringify(errorStatus),
        { qos: 1 }
      );
      mqttClient.publish(MQTT_TOPICS.status, JSON.stringify(errorStatus), {
        qos: 1,
      }); // Legacy
    });
}

function publishPresetApplied(preset, results) {
  if (!mqttClient) return;

  const message = {
    timestamp: new Date().toISOString(),
    action: 'preset_applied',
    preset,
    results,
  };

  mqttClient.publish(MQTT_TOPICS.device.connections, JSON.stringify(message), {
    qos: 1,
  });
  mqttClient.publish(MQTT_TOPICS.connections, JSON.stringify(message), {
    qos: 1,
  }); // Legacy
}

function publishConnectionChange(action, data) {
  if (!mqttClient) return;

  const message = {
    timestamp: new Date().toISOString(),
    action,
    ...data,
  };

  mqttClient.publish(MQTT_TOPICS.device.connections, JSON.stringify(message), {
    qos: 1,
  });
  mqttClient.publish(MQTT_TOPICS.connections, JSON.stringify(message), {
    qos: 1,
  }); // Legacy
}

function publishPresets() {
  if (!mqttClient) return;

  const message = {
    timestamp: new Date().toISOString(),
    presets: routingPresets,
  };

  mqttClient.publish(MQTT_TOPICS.device.status, JSON.stringify(message), {
    qos: 1,
  });
}

function publishDeviceConfig() {
  if (!mqttClient) return;

  const message = {
    timestamp: new Date().toISOString(),
    device_config: deviceConfig,
  };

  mqttClient.publish(MQTT_TOPICS.device.status, JSON.stringify(message), {
    qos: 1,
  });
}

function publishError(errorMessage) {
  if (!mqttClient) return;

  const message = {
    timestamp: new Date().toISOString(),
    error: errorMessage,
  };

  mqttClient.publish(MQTT_TOPICS.device.status, JSON.stringify(message), {
    qos: 1,
  });
}

// Placeholder functions - these should be implemented in your main server
async function connectPorts(fromPort, toPort) {
  // This should call your existing connectPorts function
  console.log(`Connecting ${fromPort} to ${toPort}`);
}

async function disconnectPorts(fromPort, toPort) {
  // This should call your existing disconnectPorts function
  console.log(`Disconnecting ${fromPort} from ${toPort}`);
}

async function listConnections() {
  // This should call your existing listConnections function
  return '';
}

function parseJackConnections(connectionOutput) {
  // This should call your existing parseJackConnections function
  return [];
}

async function clearAllConnections() {
  // This should call your existing clearAllConnections function
  console.log('Clearing all connections');
}

// Graceful shutdown
function shutdown() {
  if (mqttClient) {
    mqttClient.publish(MQTT_TOPICS.device.availability, 'offline', {
      qos: 1,
      retain: true,
    });
    mqttClient.end();
  }
}

// Export functions
module.exports = {
  initializeMQTT,
  publishStatus,
  publishConnectionChange,
  shutdown,
  MQTT_TOPICS,
};
