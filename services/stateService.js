// services/stateService.js - Fixed version
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const jackService = require('./jackService');
const connectionService = require('./connectionService');
const {
  DEVICE_CONFIG,
  ROUTING_PRESETS,
} = require('../constants/constants.cjs');
const logger = require('../utils/logger');

class StateService {
  constructor() {
    // Use environment variables with fallbacks
    this.stateFile = path.join(
      process.cwd(),
      'state',
      'audio_router_state.json'
    );
    this.backupFile = path.join(
      process.cwd(),
      'state',
      'audio_router_state.backup.json'
    );
    this.isStartingUp = true;
    this.autoSaveInterval = null;

    // Configuration with fallbacks
    this.config = {
      autoSaveInterval: parseInt(
        process.env.STATE_AUTO_SAVE_INTERVAL || '30000',
        10
      ),
      connectionRebuildDelay: 2000,
      backupEnabled: process.env.STATE_BACKUP_ENABLED !== 'false',
    };
  }

  /**
   * Save current state to file
   */
  async saveState() {
    try {
      if (!(await jackService.checkStatus())) {
        logger.warn('⚠️ JACK not running, skipping state save');
        return false;
      }

      const connectionOutput = await jackService.listConnections();
      const parsedConnections = jackService.parseConnections(connectionOutput);
      const trackedConnections = connectionService.getTrackedConnections();

      const currentState = {
        timestamp: new Date().toISOString(),
        connections: parsedConnections,
        tracked_connections: trackedConnections,
        device_config: DEVICE_CONFIG,
        presets: ROUTING_PRESETS,
      };

      // Create backup of existing state
      if (this.config.backupEnabled) {
        try {
          await fs.copyFile(this.stateFile, this.backupFile);
        } catch (error) {
          // Backup file might not exist yet
        }
      }

      // Ensure state directory exists
      await fs.mkdir(path.dirname(this.stateFile), { recursive: true });

      await fs.writeFile(this.stateFile, JSON.stringify(currentState, null, 2));
      logger.info('💾 Audio router state saved');
      return true;
    } catch (error) {
      logger.error('❌ Failed to save state:', error.message);
      return false;
    }
  }

  /**
   * Load state from file and restore connections
   */
  async loadState() {
    try {
      logger.info('🔄 Loading previous state...');

      if (!(await jackService.checkStatus())) {
        logger.warn('⚠️ JACK not running, cannot restore state');
        return false;
      }

      const stateData = await fs.readFile(this.stateFile, 'utf8');
      const savedState = JSON.parse(stateData);

      logger.info(`📅 Found state from ${savedState.timestamp}`);
      logger.info(
        `📊 State contains ${savedState.connections.length} connections`
      );

      // Clear existing connections
      await connectionService.clearAllConnections();
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.connectionRebuildDelay)
      );

      let restored = 0;
      let failed = 0;

      // Restore connections
      for (const connection of savedState.connections) {
        try {
          await connectionService.connectPorts(connection.from, connection.to);
          restored++;
        } catch (error) {
          logger.error(
            `❌ Failed to restore connection ${connection.from} -> ${connection.to}: ${error.message}`
          );
          failed++;
        }
      }

      logger.info(`✅ Restored ${restored} connections, ${failed} failed`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('ℹ️ No previous state file found');
      } else {
        logger.error('❌ Failed to load state:', error.message);
      }
      return false;
    }
  }

  /**
   * Get saved state without restoring
   */
  async getState() {
    try {
      const stateData = await fs.readFile(this.stateFile, 'utf8');
      return JSON.parse(stateData);
    } catch (error) {
      throw new Error('No saved state found');
    }
  }

  /**
   * Start auto-save functionality
   */
  startAutoSave() {
    this.stopAutoSave(); // Clear any existing interval

    logger.info(
      `🔄 Starting auto-save (every ${this.config.autoSaveInterval / 1000}s)`
    );

    this.autoSaveIntervalId = setInterval(async () => {
      if (!this.isStartingUp) {
        await this.saveState();
      }
    }, this.config.autoSaveInterval);

    logger.info(`✅ Auto-save started`);
  }

  /**
   * Stop auto-save functionality
   */
  stopAutoSave() {
    if (this.autoSaveIntervalId) {
      clearInterval(this.autoSaveIntervalId);
      this.autoSaveIntervalId = null;
      logger.info('🔄 Auto-save stopped');
    }
  }

  /**
   * Set startup flag
   */
  setStartingUp(isStartingUp) {
    this.isStartingUp = isStartingUp;
    logger.info(`🚀 Startup phase: ${isStartingUp ? 'active' : 'complete'}`);
  }

  /**
   * Get startup status
   */
  getStartingUp() {
    return this.isStartingUp;
  }

  /**
   * Check if auto-save is enabled
   */
  isAutoSaveEnabled() {
    return this.autoSaveIntervalId !== null;
  }

  /**
   * Get configuration
   */
  getConfig() {
    return this.config;
  }
}

module.exports = new StateService();
