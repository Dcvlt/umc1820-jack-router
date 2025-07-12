// routes/api.js - API routes
const express = require('express');
const jackService = require('../services/jackService');
const connectionService = require('../services/connectionService');
const stateService = require('../services/stateService');
const { parseJackConnections } = require('../utils/jackParser');
const { DEVICE_CONFIG, ROUTING_PRESETS } = require('../constants/constants.cjs');
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
        timestamp: new Date().toISOString()
      });
    }

    const connectionOutput = await jackService.listConnections();
    const parsedConnections = parseJackConnections(connectionOutput);

    res.json({
      status: 'ok',
      jack_running: true,
      connections: connectionOutput,
      parsed_connections: parsedConnections,
      tracked_connections: connectionService.getTrackedConnections(),
      device_config: DEVICE_CONFIG,
      presets: Object.keys(ROUTING_PRESETS),
      timestamp: new Date().toISOString()
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
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Connect two ports
 */
router.post('/connect', async (req, res) => {
  const { from, to } = req.body;

  if (!from || !to) {
    return res.status(400).json({
      error: 'Missing required parameters: from, to',
      required: ['from', 'to']
    });
  }

  try {
    if (!(await jackService.checkStatus())) {
      return res.status(500).json({ 
        error: 'JACK server not running',
        jack_running: false 
      });
    }

    const fromConfig = DEVICE_CONFIG.inputs[from] || DEVICE_CONFIG.outputs[from];
    const toConfig = DEVICE_CONFIG.outputs[to];

    const fromPort = fromConfig?.value;
    const toPort = toConfig?.value;

    if (!fromPort || !toPort) {
      return res.status(400).json({
        error: 'Invalid port names',
        available_inputs: Object.keys(DEVICE_CONFIG.inputs),
        available_outputs: Object.keys(DEVICE_CONFIG.outputs),
        provided: { from, to }
      });
    }

    const result = await connectionService.connectPorts(fromPort, toPort);

    res.json({
      status: 'connected',
      result: result,
      from,
      to,
      from_port: fromPort,
      to_port: toPort,
      from_label: fromConfig.label,
      to_label: toConfig.label,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error in /api/connect:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Disconnect two ports
 */
router.post('/disconnect', async (req, res) => {
  const { from, to } = req.body;

  if (!from || !to) {
    return res.status(400).json({
      error: 'Missing required parameters: from, to',
      required: ['from', 'to']
    });
  }

  try {
    if (!(await jackService.checkStatus())) {
      return res.status(500).json({ 
        error: 'JACK server not running',
        jack_running: false 
      });
    }

    const fromConfig = DEVICE_CONFIG.inputs[from] || DEVICE_CONFIG.outputs[from];
    const toConfig = DEVICE_CONFIG.outputs[to];

    const fromPort = fromConfig?.value;
    const toPort = toConfig?.value;

    if (!fromPort || !toPort) {
      return res.status(400).json({
        error: 'Invalid port names',
        available_inputs: Object.keys(DEVICE_CONFIG.inputs),
        available_outputs: Object.keys(DEVICE_CONFIG.outputs),
        provided: { from, to }
      });
    }

    const result = await connectionService.disconnectPorts(fromPort, toPort);

    res.json({
      status: 'disconnected',
      method: result,
      from,
      to,
      from_port: fromPort,
      to_port: toPort,
      from_label: fromConfig.label,
      to_label: toConfig.label,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error in /api/disconnect:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
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
        jack_running: false 
      });
    }

    const cleared = await connectionService.clearAllConnections();
    
    res.json({ 
      status: 'cleared', 
      count: cleared,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error in /api/clear:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get device configuration
 */
router.get('/device', (req, res) => {
  res.json({
    device_config: DEVICE_CONFIG,
    timestamp: new Date().toISOString()
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
    timestamp: new Date().toISOString()
  });
});

/**
 * Get saved state
 */
router.get('/state', async (req, res) => {
  try {
    const savedState = await stateService.getState();
    res.json(savedState);
  } catch (error) {
    logger.error('Error in /api/state:', error);
    res.status(404).json({ 
      error: 'No saved state found',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Save current state
 */
router.post('/state/save', async (req, res) => {
  try {
    const success = await stateService.saveState();
    
    if (success) {
      res.json({ 
        status: 'success', 
        message: 'State saved successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to save state',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Error in /api/state/save:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Restore saved state
 */
router.post('/state/restore', async (req, res) => {
  try {
    const success = await stateService.loadState();
    
    if (success) {
      res.json({ 
        status: 'success', 
        message: 'State restored successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to restore state',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Error in /api/state/restore:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get list of available ports
 */
router.get('/ports', async (req, res) => {
  try {
    if (!(await jackService.checkStatus())) {
      return res.status(500).json({ 
        error: 'JACK server not running',
        jack_running: false 
      });
    }

    const portsOutput = await jackService.listPorts();
    
    res.json({
      status: 'ok',
      ports: portsOutput.split('\n').filter(line => line.trim()),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error in /api/ports:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;