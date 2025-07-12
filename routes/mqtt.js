// routes/mqtt.js - MQTT management routes
const express = require('express');
const mqttService = require('../services/mqttService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Get MQTT service status
 */
router.get('/status', (req, res) => {
  try {
    const status = mqttService.getStatus();
    
    res.json({
      ...status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting MQTT status:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Manually trigger MQTT status publication
 */
router.post('/publish/status', async (req, res) => {
  try {
    if (!mqttService.isEnabled()) {
      return res.status(400).json({
        error: 'MQTT service is not enabled',
        timestamp: new Date().toISOString()
      });
    }

    const status = mqttService.getStatus();
    if (!status.connected) {
      return res.status(503).json({
        error: 'MQTT service is not connected',
        status: status,
        timestamp: new Date().toISOString()
      });
    }

    await mqttService.publishStatus();
    
    res.json({
      status: 'success',
      message: 'Status published to MQTT',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error publishing MQTT status:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Manually trigger connection change publication
 */
router.post('/publish/connection', async (req, res) => {
  try {
    const { action, from, to, from_label, to_label } = req.body;

    if (!mqttService.isEnabled()) {
      return res.status(400).json({
        error: 'MQTT service is not enabled',
        timestamp: new Date().toISOString()
      });
    }

    if (!action) {
      return res.status(400).json({
        error: 'Missing required parameter: action',
        required: ['action'],
        optional: ['from', 'to', 'from_label', 'to_label'],
        timestamp: new Date().toISOString()
      });
    }

    const status = mqttService.getStatus();
    if (!status.connected) {
      return res.status(503).json({
        error: 'MQTT service is not connected',
        status: status,
        timestamp: new Date().toISOString()
      });
    }

    mqttService.publishConnectionChange(action, {
      from,
      to,
      from_label,
      to_label
    });
    
    res.json({
      status: 'success',
      message: 'Connection change published to MQTT',
      published: { action, from, to, from_label, to_label },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error publishing MQTT connection change:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get MQTT topics information
 */
router.get('/topics', (req, res) => {
  try {
    res.json({
      topics: mqttService.MQTT_TOPICS,
      description: {
        device: 'Main device topics for status and commands',
        discovery: 'Home Assistant discovery topics',
        legacy: 'Backward compatibility topics'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting MQTT topics:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Test MQTT connection
 */
router.post('/test', async (req, res) => {
  try {
    if (!mqttService.isEnabled()) {
      return res.status(400).json({
        error: 'MQTT service is not enabled',
        help: 'Set MQTT_ENABLED=true in your environment variables',
        timestamp: new Date().toISOString()
      });
    }

    const status = mqttService.getStatus();
    
    if (!status.connected) {
      return res.status(503).json({
        error: 'MQTT service is not connected to broker',
        status: status,
        help: 'Check MQTT_HOST and broker availability',
        timestamp: new Date().toISOString()
      });
    }

    // Send a test message
    const testMessage = {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'MQTT test message from JACK Audio Router'
    };

    mqttService.publishError('Test message - this is not a real error');
    
    res.json({
      status: 'success',
      message: 'MQTT test message sent',
      mqtt_status: status,
      test_message: testMessage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error testing MQTT:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Update device configuration for MQTT
 */
router.post('/config/device', (req, res) => {
  try {
    const { deviceConfig } = req.body;

    if (!deviceConfig) {
      return res.status(400).json({
        error: 'Missing required parameter: deviceConfig',
        timestamp: new Date().toISOString()
      });
    }

    if (!mqttService.isEnabled()) {
      return res.status(400).json({
        error: 'MQTT service is not enabled',
        timestamp: new Date().toISOString()
      });
    }

    mqttService.updateDeviceConfig(deviceConfig);
    
    res.json({
      status: 'success',
      message: 'Device configuration updated for MQTT',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating MQTT device config:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Update routing presets for MQTT
 */
router.post('/config/presets', (req, res) => {
  try {
    const { routingPresets } = req.body;

    if (!routingPresets) {
      return res.status(400).json({
        error: 'Missing required parameter: routingPresets',
        timestamp: new Date().toISOString()
      });
    }

    if (!mqttService.isEnabled()) {
      return res.status(400).json({
        error: 'MQTT service is not enabled',
        timestamp: new Date().toISOString()
      });
    }

    mqttService.updateRoutingPresets(routingPresets);
    
    res.json({
      status: 'success',
      message: 'Routing presets updated for MQTT',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating MQTT routing presets:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;