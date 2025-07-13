// services/connectionService.js - Cleaned up with working programmatic disconnect
const jackService = require('./jackService');
const logger = require('../utils/logger');
const mqttService = require('../services/mqttService');

class ConnectionService {
  constructor() {
    this.connectionTracker = new Map();
  }

  /**
   * Connect two JACK ports with state tracking
   */
  async connectPorts(fromPort, toPort) {
    try {
      logger.info(`🔗 Connecting: ${fromPort} -> ${toPort}`);

      // Use the low-level JACK service
      const result = await jackService.connectPorts(fromPort, toPort);

      // Track the connection
      const connectionKey = `${fromPort}=>${toPort}`;
      this.connectionTracker.set(connectionKey, {
        from: fromPort,
        to: toPort,
        timestamp: Date.now(),
        status: result === 'already connected' ? 'existing' : 'new',
      });

      mqttService.publishConnectionChange('connected', {
        from_port: fromPort,
        to_port: toPort,
      });

      logger.info(`✅ Connection tracked: ${fromPort} -> ${toPort}`);
      return result;
    } catch (error) {
      logger.error(
        `❌ Connection failed: ${fromPort} -> ${toPort} - ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Disconnect ports - WORKING PROGRAMMATIC VERSION
   */
  async disconnectPorts(fromPort, toPort) {
    logger.info(`🔌 Disconnecting: ${fromPort} -> ${toPort}`);

    try {
      // Use the new programmatic disconnect method
      const result = await jackService.disconnectPorts(fromPort, toPort);

      if (result.success) {
        // Remove from tracker
        const connectionKey = `${fromPort}=>${toPort}`;
        this.connectionTracker.delete(connectionKey);

        mqttService.publishConnectionChange('disconnected', {
          from_port: fromPort,
          to_port: toPort,
        });

        logger.info(
          `✅ Disconnect successful via ${result.method}: ${fromPort} -> ${toPort}`
        );

        if (result.rebuiltConnections !== undefined) {
          logger.info(
            `🔄 Rebuilt ${result.rebuiltConnections} other connections`
          );
        }

        return {
          success: true,
          method: result.method,
          rebuiltConnections: result.rebuiltConnections || 0,
          clearMethod: result.clearMethod,
        };
      } else {
        throw new Error(
          `Disconnect failed: ${result.message || 'Unknown error'}`
        );
      }
    } catch (error) {
      logger.error(
        `❌ Disconnect failed: ${fromPort} -> ${toPort} - ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Clear all connections - WORKING PROGRAMMATIC VERSION
   */
  async clearAllConnections() {
    try {
      logger.info('🧹 Clearing all connections programmatically...');

      // Get current connections for count
      const connections = await this.getCurrentConnections();
      logger.info(`Found ${connections.length} connections to clear`);

      if (connections.length === 0) {
        logger.info('ℹ️ No connections to clear');
        return { cleared: 0, method: 'none_needed' };
      }

      // Use the programmatic clear method
      const result = await jackService.clearAllConnections();

      if (result.success) {
        // Clear our tracker
        this.connectionTracker.clear();

        mqttService.publishConnectionChange('cleared_all', {
          count: connections.length,
          method: result.method,
        });

        logger.info(
          `✅ Cleared ${connections.length} connections via ${result.method}`
        );

        return {
          cleared: connections.length,
          method: result.method,
          success: true,
        };
      } else {
        throw new Error(
          `Clear all failed: ${result.message || 'Unknown error'}`
        );
      }
    } catch (error) {
      logger.error('❌ Error clearing connections:', error.message);
      throw error;
    }
  }

  /**
   * Get current connections using jack_lsp -c
   */
  async getCurrentConnections() {
    try {
      // Use jackService to get connections
      const connections = await jackService.getCurrentConnections();

      // Sync our tracker with reality
      this.syncTrackerWithJack(connections);

      return connections;
    } catch (error) {
      logger.warn(
        '⚠️ Failed to get JACK connections via jack_lsp, using tracker data'
      );
      return this.getTrackedConnections();
    }
  }

  /**
   * List all available ports using jack_lsp
   */
  async listAllPorts() {
    try {
      const output = await jackService.listPorts();
      return output
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => line.trim());
    } catch (error) {
      logger.error('❌ Failed to list ports:', error.message);
      return [];
    }
  }

  /**
   * Sync our tracker with actual JACK state
   */
  syncTrackerWithJack(jackConnections) {
    // Clear tracker
    this.connectionTracker.clear();

    // Rebuild from actual JACK state
    jackConnections.forEach((conn) => {
      const connectionKey = `${conn.from}=>${conn.to}`;
      this.connectionTracker.set(connectionKey, {
        from: conn.from,
        to: conn.to,
        timestamp: Date.now(),
        status: 'synced',
      });
    });

    logger.debug(
      `🔄 Synced tracker with ${jackConnections.length} JACK connections`
    );
  }

  /**
   * Get tracked connections
   */
  getTrackedConnections() {
    return Array.from(this.connectionTracker.values());
  }

  /**
   * Check if JACK server is running
   */
  async isJackRunning() {
    try {
      return await jackService.checkStatus();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get service status
   */
  async getStatus() {
    const isRunning = await this.isJackRunning();
    const jackStatus = jackService.getStatus();

    return {
      jackRunning: isRunning,
      trackedConnections: this.connectionTracker.size,
      hasConnections: this.connectionTracker.size > 0,
      disconnectMethod: 'programmatic',
      features: {
        connect: true,
        disconnect: true,
        clearAll: true,
        listPorts: true,
        listConnections: true,
      },
      availableMethods: jackStatus.availableMethods,
      lastStatusCheck: jackStatus.lastCheck,
    };
  }

  /**
   * Validate connection before attempting
   */
  async validateConnection(fromPort, toPort) {
    try {
      const allPorts = await this.listAllPorts();
      const fromExists = allPorts.includes(fromPort);
      const toExists = allPorts.includes(toPort);

      if (!fromExists) {
        throw new Error(`Source port not found: ${fromPort}`);
      }
      if (!toExists) {
        throw new Error(`Destination port not found: ${toPort}`);
      }

      return true;
    } catch (error) {
      logger.warn(`⚠️ Port validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if two ports are connected
   */
  async arePortsConnected(fromPort, toPort) {
    try {
      return await jackService.arePortsConnected(fromPort, toPort);
    } catch (error) {
      logger.error(`❌ Error checking connection: ${error.message}`);
      return false;
    }
  }

  /**
   * Get all connections for a specific port
   */
  async getPortConnections(portName) {
    try {
      return await jackService.getPortConnections(portName);
    } catch (error) {
      logger.error(`❌ Error getting port connections: ${error.message}`);
      return { outgoing: [], incoming: [] };
    }
  }

  /**
   * Disconnect all connections for a specific port - WORKING PROGRAMMATIC VERSION
   */
  async disconnectAllFromPort(portName) {
    logger.info(`🔌 Disconnecting all connections for port: ${portName}`);

    try {
      const result = await jackService.disconnectAllFromPort(portName);

      if (result.disconnected === 0) {
        logger.info(`ℹ️ No connections found for port: ${portName}`);
        return { disconnected: 0, method: result.method };
      }

      // Update tracker - remove all connections involving this port
      const connectionsToRemove = [];
      for (const [key, conn] of this.connectionTracker.entries()) {
        if (conn.from === portName || conn.to === portName) {
          connectionsToRemove.push(key);
        }
      }

      connectionsToRemove.forEach((key) => this.connectionTracker.delete(key));

      mqttService.publishConnectionChange('disconnected_all_from_port', {
        port: portName,
        count: result.disconnected,
        method: result.method,
      });

      logger.info(
        `✅ Disconnected ${result.disconnected} connections from ${portName} via ${result.method}`
      );

      return {
        disconnected: result.disconnected,
        method: result.method,
        rebuiltConnections: result.rebuiltConnections || 0,
      };
    } catch (error) {
      logger.error(`❌ Error disconnecting all from port: ${error.message}`);
      throw error;
    }
  }

  /**
   * Bulk connect multiple ports
   */
  async bulkConnect(connections) {
    logger.info(`🔗 Bulk connecting ${connections.length} connections`);

    const results = [];
    let successCount = 0;

    for (const conn of connections) {
      try {
        const result = await this.connectPorts(conn.from, conn.to);
        results.push({ connection: conn, success: true, result });
        successCount++;
      } catch (error) {
        results.push({
          connection: conn,
          success: false,
          error: error.message,
        });
        logger.warn(`⚠️ Bulk connect failed: ${conn.from} -> ${conn.to}`);
      }
    }

    logger.info(
      `✅ Bulk connect completed: ${successCount}/${connections.length} successful`
    );

    return {
      total: connections.length,
      successful: successCount,
      failed: connections.length - successCount,
      results,
    };
  }

  /**
   * Bulk disconnect multiple connections
   */
  async bulkDisconnect(connections) {
    logger.info(`🔌 Bulk disconnecting ${connections.length} connections`);

    const results = [];
    let successCount = 0;

    for (const conn of connections) {
      try {
        const result = await this.disconnectPorts(conn.from, conn.to);
        results.push({ connection: conn, success: true, result });
        successCount++;
      } catch (error) {
        results.push({
          connection: conn,
          success: false,
          error: error.message,
        });
        logger.warn(`⚠️ Bulk disconnect failed: ${conn.from} -> ${conn.to}`);
      }
    }

    logger.info(
      `✅ Bulk disconnect completed: ${successCount}/${connections.length} successful`
    );

    return {
      total: connections.length,
      successful: successCount,
      failed: connections.length - successCount,
      results,
    };
  }

  /**
   * Save current connection state to file
   */
  async saveConnectionState(filename) {
    try {
      const connections = await this.getCurrentConnections();
      const state = {
        timestamp: new Date().toISOString(),
        connections: connections,
        metadata: {
          totalConnections: connections.length,
          jackRunning: await this.isJackRunning(),
          trackedConnections: this.connectionTracker.size,
        },
      };

      const fs = require('fs');
      fs.writeFileSync(filename, JSON.stringify(state, null, 2));

      logger.info(`💾 Saved ${connections.length} connections to ${filename}`);
      return { saved: connections.length, filename };
    } catch (error) {
      logger.error(`❌ Failed to save connection state: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load and restore connection state from file
   */
  async loadConnectionState(filename) {
    try {
      const fs = require('fs');
      const data = fs.readFileSync(filename, 'utf8');
      const state = JSON.parse(data);

      logger.info(
        `📁 Loading ${state.connections.length} connections from ${filename}`
      );

      // Clear current connections first
      await this.clearAllConnections();

      // Wait for JACK to stabilize
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Restore connections
      const result = await this.bulkConnect(state.connections);

      logger.info(
        `✅ Restored ${result.successful}/${result.total} connections from ${filename}`
      );

      return result;
    } catch (error) {
      logger.error(`❌ Failed to load connection state: ${error.message}`);
      throw error;
    }
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
    logger.info('🧹 Connection tracker cleared');
  }

  /**
   * Get detailed connection statistics
   */
  async getConnectionStats() {
    try {
      const connections = await this.getCurrentConnections();
      const ports = await this.listAllPorts();

      // Analyze connection patterns
      const sourceStats = {};
      const destStats = {};

      connections.forEach((conn) => {
        sourceStats[conn.from] = (sourceStats[conn.from] || 0) + 1;
        destStats[conn.to] = (destStats[conn.to] || 0) + 1;
      });

      return {
        totalConnections: connections.length,
        totalPorts: ports.length,
        averageConnectionsPerPort: connections.length / ports.length,
        mostConnectedSource: Object.keys(sourceStats).reduce(
          (a, b) => (sourceStats[a] > sourceStats[b] ? a : b),
          ''
        ),
        mostConnectedDestination: Object.keys(destStats).reduce(
          (a, b) => (destStats[a] > destStats[b] ? a : b),
          ''
        ),
        sourceStats,
        destStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`❌ Failed to get connection stats: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new ConnectionService();
