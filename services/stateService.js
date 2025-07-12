// services/stateService.js
const fs = require('fs').promises;
const config = require('../config');
const jackService = require('./jackService');
const connectionService = require('./connectionService');
const { DEVICE_CONFIG, ROUTING_PRESETS } = require('../constants/constants.cjs');

class StateService {
  constructor() {
    this.stateFile = config.paths.state.main;
    this.backupFile = config.paths.state.backup;
    this.isStartingUp = true;
    this.autoSaveInterval = null;
  }

  /**
   * Save current state to file
   */
  async saveState() {
    try {
      if (!(await jackService.checkStatus())) {
        console.log('⚠️ JACK not running, skipping state save');
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
      try {
        await fs.copyFile(this.stateFile, this.backupFile);
      } catch (error) {
        // Backup file might not exist yet
      }

      await fs.writeFile(this.stateFile, JSON.stringify(currentState, null, 2));
      console.log('💾 Audio router state saved');
      return true;
    } catch (error) {
      console.error('❌ Failed to save state:', error.message);
      return false;
    }
  }

  /**
   * Load state from file and restore connections
   */
  async loadState() {
    try {
      console.log('🔄 Loading previous state...');

      if (!(await jackService.checkStatus())) {
        console.log('⚠️ JACK not running, cannot restore state');
        return false;
      }

      const stateData = await fs.readFile(this.stateFile, 'utf8');
      const savedState = JSON.parse(stateData);

      console.log(`📅 Found state from ${savedState.timestamp}`);
      console.log(`📊 State contains ${savedState.connections.length} connections`);

      // Clear existing connections
      await connectionService.clearAllConnections();
      await new Promise((resolve) => setTimeout(resolve, config.app.connectionRebuildDelay));

      let restored = 0;
      let failed = 0;

      // Restore connections
      for (const connection of savedState.connections) {
        try {
          await connectionService.connectPorts(connection.from, connection.to);
          restored++;
        } catch (error) {
          console.error(
            `❌ Failed to restore connection ${connection.from} -> ${connection.to}: ${error.message}`
          );
          failed++;
        }
      }

      console.log(`✅ Restored ${restored} connections, ${failed} failed`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('ℹ️ No previous state file found');
      } else {
        console.error('❌ Failed to load state:', error.message);
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
    
    this.autoSaveInterval = setInterval(async () => {
      if (!this.isStartingUp) {
        await this.saveState();
      }
    }, config.app.autoSaveInterval);

    console.log(`🔄 Auto-save started (every ${config.app.autoSaveInterval / 1000}s)`);
  }

  /**
   * Stop auto-save functionality
   */
  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
      console.log('🔄 Auto-save stopped');
    }
  }

  /**
   * Set startup flag
   */
  setStartingUp(isStartingUp) {
    this.isStartingUp = isStartingUp;
  }

  /**
   * Get startup status
   */
  getStartingUp() {
    return this.isStartingUp;
  }
}

module.exports = new StateService();