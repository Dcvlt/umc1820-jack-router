// services/connectionService.js
const jackService = require('./jackService');
const config = require('../config');

class ConnectionService {
  constructor() {
    this.connectionTracker = new Map();
  }

  /**
   * Connect two JACK ports
   */
  async connectPorts(fromPort, toPort) {
    const command = `${config.jack.commands.connect} "${fromPort}" "${toPort}"`;
    
    try {
      const result = await jackService.executeCommand(command);
      console.log(`✅ Connected: ${fromPort} -> ${toPort}`);

      // Track the connection
      const connectionKey = `${fromPort}=>${toPort}`;
      this.connectionTracker.set(connectionKey, {
        from: fromPort,
        to: toPort,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      if (
        error.message.includes('already connected') ||
        error.message.includes('Connection already exists')
      ) {
        console.log(`ℹ️ Already connected: ${fromPort} -> ${toPort}`);

        // Track the existing connection
        const connectionKey = `${fromPort}=>${toPort}`;
        this.connectionTracker.set(connectionKey, {
          from: fromPort,
          to: toPort,
          timestamp: Date.now(),
        });

        return 'already connected';
      }
      throw error;
    }
  }

  /**
   * Disconnect two JACK ports (with fallback methods)
   */
  async disconnectPorts(fromPort, toPort) {
    console.log(`🔌 Attempting to disconnect: ${fromPort} -> ${toPort}`);

    try {
      await this._disconnectViaQjackCtl(fromPort, toPort);
      return 'disconnected via QjackCtl';
    } catch (error) {
      console.log(`❌ QjackCtl disconnect failed: ${error.message}`);
    }

    try {
      await this._disconnectViaClearAndRebuild(fromPort, toPort);
      return 'disconnected via clear/rebuild';
    } catch (error) {
      console.log(`❌ Clear/rebuild disconnect failed: ${error.message}`);
    }

    // Fallback: just mark as disconnected
    const connectionKey = `${fromPort}=>${toPort}`;
    this.connectionTracker.delete(connectionKey);
    console.log(`ℹ️ Marked as disconnected: ${fromPort} -> ${toPort}`);

    return 'marked as disconnected';
  }

  /**
   * Disconnect via QjackCtl
   */
  async _disconnectViaQjackCtl(fromPort, toPort) {
    const command = `${config.jack.commands.qjackctl} --disconnect "${fromPort}" "${toPort}"`;
    
    try {
      await jackService.executeCommand(command, config.jack.timeouts.disconnect);
      console.log(`✅ Disconnected via QjackCtl: ${fromPort} -> ${toPort}`);
      return true;
    } catch (error) {
      throw new Error(`QjackCtl disconnect not available: ${error.message}`);
    }
  }

  /**
   * Disconnect via clear and rebuild method
   */
  async _disconnectViaClearAndRebuild(fromPort, toPort) {
    console.log(`🔄 Using clear/rebuild method for: ${fromPort} -> ${toPort}`);

    const currentConnections = await this.getCurrentConnections();
    const targetConnection = currentConnections.find(
      (conn) => conn.from === fromPort && conn.to === toPort
    );

    if (!targetConnection) {
      console.log(`ℹ️ Connection not found: ${fromPort} -> ${toPort}`);
      return false;
    }

    await this.clearAllConnections();
    await new Promise((resolve) => setTimeout(resolve, config.app.connectionRebuildDelay));

    // Rebuild all connections except the target one
    const connectionsToRebuild = currentConnections.filter(
      (conn) => !(conn.from === fromPort && conn.to === toPort)
    );

    console.log(`🔄 Rebuilding ${connectionsToRebuild.length} connections`);

    for (const conn of connectionsToRebuild) {
      try {
        await this.connectPorts(conn.from, conn.to);
      } catch (error) {
        console.warn(`⚠️ Failed to rebuild connection: ${conn.from} -> ${conn.to}`);
      }
    }

    console.log(`✅ Disconnected via clear/rebuild: ${fromPort} -> ${toPort}`);
    return true;
  }

  /**
   * Clear all connections
   */
  async clearAllConnections() {
    try {
      console.log('🧹 Clearing all connections...');

      const connectionOutput = await jackService.listConnections();
      const connections = jackService.parseConnections(connectionOutput);

      console.log(`Found ${connections.length} connections to clear`);

      try {
        await jackService.clearConnectionsViaQjackCtl();
        console.log('✅ Cleared connections via QjackCtl automation');
      } catch (error) {
        console.log('⚠️ QjackCtl automation not available, using connection tracking');
        this.connectionTracker.clear();
      }

      return connections.length;
    } catch (error) {
      console.error('❌ Error clearing connections:', error.message);
      return 0;
    }
  }

  /**
   * Get current connections (fallback to tracker if JACK fails)
   */
  async getCurrentConnections() {
    try {
      return await jackService.getCurrentConnections();
    } catch (error) {
      console.warn('⚠️ Failed to get current connections from JACK, using tracker');
      return Array.from(this.connectionTracker.values());
    }
  }

  /**
   * Get tracked connections
   */
  getTrackedConnections() {
    return Array.from(this.connectionTracker.values());
  }

  /**
   * Get connection tracker size
   */
  getTrackedConnectionsCount() {
    return this.connectionTracker.size;
  }

  /**
   * Clear connection tracker
   */
  clearTracker() {
    this.connectionTracker.clear();
  }
}

module.exports = new ConnectionService();