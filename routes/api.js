// routes/api.js - Clean API routes using proper service separation
const express = require('express');
const jackService = require('../services/jackService'); // Low-level JACK operations
const connectionService = require('../services/connectionService'); // High-level connection management
const stateService = require('../services/stateService');
const {
  DEVICE_CONFIG,
  ROUTING_PRESETS,
} = require('../constants/constants.cjs');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Get system status and connections
 */
router.get('/status', async (req, res) => {
  try {
    const jackRunning = await jackService.checkStatus();

    if (!jackRunning) {
      return res.json({
        status: 'error',
        message: 'JACK server not running',
        jack_running: false,
        connections: '',
        parsed_connections: [],
        tracked_connections: connectionService.getTrackedConnections(),
        device_config: DEVICE_CONFIG,
        presets: Object.keys(ROUTING_PRESETS),
        timestamp: new Date().toISOString(),
      });
    }

    // Use connectionService for high-level operations
    const connections = await connectionService.getCurrentConnections();
    const connectionOutput = await jackService.listConnections(); // Raw output for debugging

    res.json({
      status: 'ok',
      jack_running: true,
      connections: connectionOutput,
      parsed_connections: connections,
      tracked_connections: connectionService.getTrackedConnections(),
      device_config: DEVICE_CONFIG,
      presets: Object.keys(ROUTING_PRESETS),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error in /api/status:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      jack_running: false,
      connections: '',
      parsed_connections: [],
      tracked_connections: connectionService.getTrackedConnections(),
      device_config: DEVICE_CONFIG,
      presets: Object.keys(ROUTING_PRESETS),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Connect two ports
 */
router.post('/connect', async (req, res) => {
  const { from, to } = req.body;

  logger.info(`🔗 API Connect request: ${from} -> ${to}`);

  if (!from || !to) {
    return res.status(400).json({
      error: 'Missing required parameters: from, to',
      required: ['from', 'to'],
    });
  }

  try {
    // Check JACK status first
    if (!(await jackService.checkStatus())) {
      return res.status(500).json({
        error: 'JACK server not running',
        jack_running: false,
      });
    }

    // Resolve port names through device config
    const fromConfig =
      DEVICE_CONFIG.inputs[from] || DEVICE_CONFIG.outputs[from];
    const toConfig = DEVICE_CONFIG.outputs[to];

    logger.info(`🔍 From config:`, fromConfig);
    logger.info(`🔍 To config:`, toConfig);

    const fromPort = fromConfig?.value;
    const toPort = toConfig?.value;

    if (!fromPort || !toPort) {
      logger.error(`❌ Invalid port names: ${fromPort} -> ${toPort}`);
      return res.status(400).json({
        error: 'Invalid port names',
        available_inputs: Object.keys(DEVICE_CONFIG.inputs),
        available_outputs: Object.keys(DEVICE_CONFIG.outputs),
        provided: { from, to },
        resolved: { fromPort, toPort },
      });
    }

    // Use connectionService for high-level connection with tracking
    const result = await connectionService.connectPorts(fromPort, toPort);

    logger.info(`✅ API Connection successful: ${result}`);

    res.json({
      status: 'connected',
      result: result,
      from,
      to,
      from_port: fromPort,
      to_port: toPort,
      from_label: fromConfig.label,
      to_label: toConfig.label,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('❌ Error in /api/connect:', error);
    res.status(500).json({
      error: error.message,
      type: error.constructor.name,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Disconnect two ports
 */
router.post('/disconnect', async (req, res) => {
  const { from, to } = req.body;

  logger.info(`🔌 API Disconnect request: ${from} -> ${to}`);

  if (!from || !to) {
    return res.status(400).json({
      error: 'Missing required parameters: from, to',
      required: ['from', 'to'],
    });
  }

  try {
    if (!(await jackService.checkStatus())) {
      return res.status(500).json({
        error: 'JACK server not running',
        jack_running: false,
      });
    }

    // Resolve port names
    const fromConfig =
      DEVICE_CONFIG.inputs[from] || DEVICE_CONFIG.outputs[from];
    const toConfig = DEVICE_CONFIG.outputs[to];

    const fromPort = fromConfig?.value;
    const toPort = toConfig?.value;

    if (!fromPort || !toPort) {
      return res.status(400).json({
        error: 'Invalid port names',
        available_inputs: Object.keys(DEVICE_CONFIG.inputs),
        available_outputs: Object.keys(DEVICE_CONFIG.outputs),
        provided: { from, to },
      });
    }

    // Use connectionService for high-level disconnect
    const result = await connectionService.disconnectPorts(fromPort, toPort);

    logger.info(`✅ API Disconnect successful: ${result}`);

    res.json({
      status: 'disconnected',
      method: result,
      from,
      to,
      from_port: fromPort,
      to_port: toPort,
      from_label: fromConfig.label,
      to_label: toConfig.label,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('❌ Error in /api/disconnect:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Clear all connections
 */
router.post('/clear', async (req, res) => {
  try {
    if (!(await jackService.checkStatus())) {
      return res.status(500).json({
        error: 'JACK server not running',
        jack_running: false,
      });
    }

    logger.info('🧹 API Clear all connections');

    // Use connectionService for high-level clear
    const cleared = await connectionService.clearAllConnections();

    logger.info(`✅ API Cleared ${cleared} connections`);

    res.json({
      status: 'cleared',
      count: cleared,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('❌ Error in /api/clear:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get current connections
 */
router.get('/connections', async (req, res) => {
  try {
    if (!(await jackService.checkStatus())) {
      return res.status(500).json({
        error: 'JACK server not running',
        jack_running: false,
      });
    }

    const connections = await connectionService.getCurrentConnections();
    const trackedConnections = connectionService.getTrackedConnections();

    res.json({
      active_connections: connections,
      tracked_connections: trackedConnections,
      count: {
        active: connections.length,
        tracked: trackedConnections.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('❌ Error in /api/connections:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get device configuration
 */
router.get('/device', (req, res) => {
  res.json({
    device_config: DEVICE_CONFIG,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get tracked connections
 */
router.get('/tracked', (req, res) => {
  const trackedConnections = connectionService.getTrackedConnections();

  res.json({
    tracked_connections: trackedConnections,
    count: trackedConnections.length,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get list of available ports
 */
router.get('/ports', async (req, res) => {
  try {
    if (!(await jackService.checkStatus())) {
      return res.status(500).json({
        error: 'JACK server not running',
        jack_running: false,
      });
    }

    const portsOutput = await jackService.listPorts();

    res.json({
      status: 'ok',
      ports: portsOutput.split('\n').filter((line) => line.trim()),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error in /api/ports:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// State management routes
router.get('/state', async (req, res) => {
  try {
    const savedState = await stateService.getState();
    res.json(savedState);
  } catch (error) {
    logger.error('Error in /api/state:', error);
    res.status(404).json({
      error: 'No saved state found',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/state/save', async (req, res) => {
  try {
    const success = await stateService.saveState();

    if (success) {
      res.json({
        status: 'success',
        message: 'State saved successfully',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        error: 'Failed to save state',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Error in /api/state/save:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/state/restore', async (req, res) => {
  try {
    const success = await stateService.loadState();

    if (success) {
      res.json({
        status: 'success',
        message: 'State restored successfully',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        error: 'Failed to restore state',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Error in /api/state/restore:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
