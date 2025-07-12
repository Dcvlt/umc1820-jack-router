// routes/presets.js - Preset management routes
const express = require('express');
const jackService = require('../services/jackService');
const connectionService = require('../services/connectionService');
const { DEVICE_CONFIG, ROUTING_PRESETS } = require('../constants/constants.cjs');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Get all available presets
 */
router.get('/', (req, res) => {
  try {
    const presets = {};
    
    // Add metadata to each preset
    for (const [key, preset] of Object.entries(ROUTING_PRESETS)) {
      presets[key] = {
        ...preset,
        connectionCount: preset.connections ? preset.connections.length : 0,
        id: key
      };
    }

    res.json({
      presets: presets,
      count: Object.keys(presets).length,
      available_keys: Object.keys(presets),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error in /api/presets:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get specific preset details
 */
router.get('/:presetName', (req, res) => {
  const { presetName } = req.params;
  const preset = ROUTING_PRESETS[presetName];

  if (!preset) {
    return res.status(404).json({ 
      error: 'Preset not found',
      available_presets: Object.keys(ROUTING_PRESETS),
      requested: presetName,
      timestamp: new Date().toISOString()
    });
  }

  try {
    // Validate preset connections against device config
    const validatedConnections = [];
    const invalidConnections = [];

    if (preset.connections) {
      for (const connection of preset.connections) {
        const fromConfig = DEVICE_CONFIG.inputs[connection.from] || DEVICE_CONFIG.outputs[connection.from];
        const toConfig = DEVICE_CONFIG.outputs[connection.to];

        if (fromConfig && toConfig) {
          validatedConnections.push({
            ...connection,
            from_port: fromConfig.value,
            to_port: toConfig.value,
            from_label: fromConfig.label,
            to_label: toConfig.label,
            valid: true
          });
        } else {
          invalidConnections.push({
            ...connection,
            valid: false,
            error: !fromConfig ? `Source '${connection.from}' not found` : `Destination '${connection.to}' not found`
          });
        }
      }
    }

    res.json({
      preset: {
        ...preset,
        id: presetName,
        connectionCount: validatedConnections.length,
        validConnections: validatedConnections,
        invalidConnections: invalidConnections,
        isValid: invalidConnections.length === 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error getting preset ${presetName}:`, error);
    res.status(500).json({ 
      error: error.message,
      preset: presetName,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Apply a preset
 */
router.post('/:presetName', async (req, res) => {
  const { presetName } = req.params;
  const { clearFirst = true, dryRun = false } = req.body;
  const preset = ROUTING_PRESETS[presetName];

  if (!preset) {
    return res.status(404).json({ 
      error: 'Preset not found',
      available_presets: Object.keys(ROUTING_PRESETS),
      requested: presetName,
      timestamp: new Date().toISOString()
    });
  }

  try {
    if (!(await jackService.checkStatus())) {
      return res.status(500).json({ 
        error: 'JACK server not running',
        jack_running: false,
        timestamp: new Date().toISOString()
      });
    }

    logger.info(`🎯 ${dryRun ? 'Validating' : 'Applying'} preset: ${presetName} (${preset.name})`);

    const results = [];
    let connected = 0;
    let errors = 0;

    // Clear existing connections if requested
    if (clearFirst && !dryRun) {
      try {
        await connectionService.clearAllConnections();
        await new Promise(resolve => setTimeout(resolve, 500));
        logger.info('✅ Cleared existing connections');
      } catch (error) {
        logger.warn('⚠️ Failed to clear connections:', error.message);
      }
    }

    // Process each connection in the preset
    for (const connection of preset.connections || []) {
      const fromConfig = DEVICE_CONFIG.inputs[connection.from] || DEVICE_CONFIG.outputs[connection.from];
      const toConfig = DEVICE_CONFIG.outputs[connection.to];

      const fromPort = fromConfig?.value;
      const toPort = toConfig?.value;

      if (fromPort && toPort) {
        try {
          if (!dryRun) {
            await connectionService.connectPorts(fromPort, toPort);
            connected++;
          }
          
          results.push({
            from: connection.from,
            to: connection.to,
            from_port: fromPort,
            to_port: toPort,
            from_label: fromConfig.label,
            to_label: toConfig.label,
            status: dryRun ? 'validated' : 'connected',
            valid: true
          });
        } catch (error) {
          errors++;
          logger.error(`❌ Failed to ${dryRun ? 'validate' : 'connect'} ${fromPort} -> ${toPort}: ${error.message}`);
          
          results.push({
            from: connection.from,
            to: connection.to,
            from_port: fromPort,
            to_port: toPort,
            from_label: fromConfig?.label,
            to_label: toConfig?.label,
            status: 'error',
            valid: false,
            error: error.message
          });
        }
      } else {
        errors++;
        const error = !fromConfig ? `Source '${connection.from}' not found in device config` : `Destination '${connection.to}' not found in device config`;
        
        results.push({
          from: connection.from,
          to: connection.to,
          from_port: fromPort,
          to_port: toPort,
          from_label: fromConfig?.label,
          to_label: toConfig?.label,
          status: 'error',
          valid: false,
          error: error
        });
      }
    }

    const totalConnections = preset.connections ? preset.connections.length : 0;
    
    if (!dryRun) {
      logger.info(`✅ Applied preset ${presetName}: ${connected}/${totalConnections} connections successful`);
    }

    res.json({
      status: dryRun ? 'validated' : 'success',
      preset: presetName,
      preset_name: preset.name,
      dry_run: dryRun,
      cleared_first: clearFirst && !dryRun,
      connected: dryRun ? 0 : connected,
      errors: errors,
      total: totalConnections,
      success_rate: totalConnections > 0 ? ((totalConnections - errors) / totalConnections * 100).toFixed(1) + '%' : '100%',
      connections: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error applying preset ${presetName}:`, error);
    res.status(500).json({
      status: 'error',
      preset: presetName,
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Validate a preset without applying it
 */
router.post('/:presetName/validate', async (req, res) => {
  const { presetName } = req.params;
  
  // Reuse the apply endpoint with dryRun=true
  req.body.dryRun = true;
  req.body.clearFirst = false;
  
  return router.handle(req, res);
});

/**
 * Get preset statistics
 */
router.get('/:presetName/stats', (req, res) => {
  const { presetName } = req.params;
  const preset = ROUTING_PRESETS[presetName];

  if (!preset) {
    return res.status(404).json({ 
      error: 'Preset not found',
      available_presets: Object.keys(ROUTING_PRESETS),
      requested: presetName,
      timestamp: new Date().toISOString()
    });
  }

  try {
    const stats = {
      name: preset.name,
      description: preset.description || 'No description available',
      totalConnections: preset.connections ? preset.connections.length : 0,
      sourceDevices: new Set(),
      destinationDevices: new Set(),
      connectionTypes: {}
    };

    // Analyze connections
    if (preset.connections) {
      for (const connection of preset.connections) {
        stats.sourceDevices.add(connection.from);
        stats.destinationDevices.add(connection.to);
        
        const connectionType = `${connection.from} -> ${connection.to}`;
        stats.connectionTypes[connectionType] = (stats.connectionTypes[connectionType] || 0) + 1;
      }
    }

    res.json({
      preset: presetName,
      stats: {
        ...stats,
        sourceDevices: Array.from(stats.sourceDevices),
        destinationDevices: Array.from(stats.destinationDevices),
        uniqueSourceDevices: stats.sourceDevices.size,
        uniqueDestinationDevices: stats.destinationDevices.size
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error getting preset stats for ${presetName}:`, error);
    res.status(500).json({ 
      error: error.message,
      preset: presetName,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;