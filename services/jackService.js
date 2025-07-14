// services/jackService.js - Fixed version with Clear All fallback
const axios = require('axios');
const config = require('../config/environment');
const logger = require('../utils/logger');

class JackService {
  constructor() {
    this.bridgeHost = process.env.JACK_BRIDGE_HOST || 'host.docker.internal';
    this.bridgePort = process.env.JACK_BRIDGE_PORT || 6666;
    this.bridgeBaseUrl = `http://${this.bridgeHost}:${this.bridgePort}`;

    this.statusCache = { running: false, lastCheck: 0 };
    this.initializationComplete = false;

    this.config = {
      timeouts: {
        default: config.JACK_TIMEOUT || 8000, // Reduced timeout
        status: 3000, // Faster status checks
        clear: 15000, // Longer timeout for clear operations
      },
      statusCacheMs: config.JACK_STATUS_CACHE_TTL || 5000,
    };

    // Configure axios client for bridge communication
    this.httpClient = axios.create({
      baseURL: this.bridgeBaseUrl,
      timeout: this.config.timeouts.default,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Setup axios interceptors for error handling
    this.setupHttpInterceptors();
  }

  setupHttpInterceptors() {
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.code === 'ECONNREFUSED') {
          logger.warn('🔌 JACK Bridge service not available');
        } else if (error.code === 'ETIMEDOUT') {
          logger.warn('⏱️ JACK Bridge request timeout');
        } else {
          logger.error('❌ JACK Bridge communication error:', error.message);
        }
        throw error;
      }
    );
  }

  async initialize() {
    logger.info('🎛️ Initializing JACK service with HTTP Bridge...');
    logger.info(`   Bridge URL: ${this.bridgeBaseUrl}`);

    // Wait for bridge service to be available
    await this.waitForBridgeService();

    // Initial status check
    try {
      const status = await this.checkStatus();
      if (status) {
        logger.info('✅ JACK Bridge service connected and JACK is running');
      } else {
        logger.warn(
          '⚠️ JACK Bridge service connected but JACK server is not running'
        );
      }
    } catch (error) {
      logger.error('❌ Failed to check initial JACK status:', error.message);
    }
  }

  async waitForBridgeService(maxAttempts = 10, interval = 2000) {
    logger.info('⏳ Waiting for JACK Bridge service to be available...');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.httpClient.get('/health');
        if (response.status === 200) {
          logger.info(`✅ JACK Bridge service available (attempt ${attempt})`);
          return true;
        }
      } catch (error) {
        if (attempt === maxAttempts) {
          logger.error(
            `❌ JACK Bridge service not available after ${maxAttempts} attempts`
          );
          logger.error('   Make sure the C++ bridge is running on the host');
          return false;
        }

        if (attempt % 3 === 0) {
          logger.info(
            `⏳ Still waiting for JACK Bridge service... (attempt ${attempt}/${maxAttempts})`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    return false;
  }

  setInitializationComplete() {
    this.initializationComplete = true;
  }

  async checkStatus() {
    const now = Date.now();
    if (now - this.statusCache.lastCheck < this.config.statusCacheMs) {
      return this.statusCache.running;
    }

    try {
      const response = await this.httpClient.get('/status', {
        timeout: this.config.timeouts.status,
      });
      const data = response.data;

      this.statusCache = {
        running: data.jack_running || false,
        lastCheck: now,
      };

      return this.statusCache.running;
    } catch (error) {
      logger.debug('❌ JACK status check failed:', error.message);
      this.statusCache = { running: false, lastCheck: now };
      return false;
    }
  }

  async listConnections() {
    try {
      const response = await this.httpClient.get('/connections');

      if (response.data.success) {
        return this.convertConnectionsToLspFormat(response.data.connections);
      } else {
        throw new Error(response.data.error || 'Failed to list connections');
      }
    } catch (error) {
      logger.error('❌ Failed to list connections:', error.message);
      throw error;
    }
  }

  async listPorts() {
    try {
      const response = await this.httpClient.get('/ports');

      if (response.data.success) {
        return response.data.ports.join('\n');
      } else {
        throw new Error(response.data.error || 'Failed to list ports');
      }
    } catch (error) {
      logger.error('❌ Failed to list ports:', error.message);
      throw error;
    }
  }

  convertConnectionsToLspFormat(connections) {
    const portMap = new Map();

    connections.forEach((conn) => {
      if (!portMap.has(conn.from)) {
        portMap.set(conn.from, []);
      }
      portMap.get(conn.from).push(conn.to);
    });

    let output = '';
    portMap.forEach((destinations, source) => {
      output += source + '\n';
      destinations.forEach((dest) => {
        output += '   ' + dest + '\n';
      });
    });

    return output.trim();
  }

  parseConnections(connectionOutput) {
    const lines = connectionOutput.split('\n');
    const connections = [];
    let currentSource = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (/^[a-zA-Z0-9_:-]+\s*$/.test(line)) {
        currentSource = line.trim();
      } else if (/^\s+[a-zA-Z0-9_:-]+/.test(line) && currentSource) {
        const destination = line.trim();
        connections.push({
          from: currentSource,
          to: destination,
        });
      }
    }

    return connections;
  }

  async getCurrentConnections() {
    const connectionOutput = await this.listConnections();
    return this.parseConnections(connectionOutput);
  }

  async connectPorts(sourcePort, destinationPort) {
    try {
      logger.info(`🔗 Connecting: ${sourcePort} -> ${destinationPort}`);

      const response = await this.httpClient.post('/connect', {
        source: sourcePort,
        destination: destinationPort,
      });

      if (response.data.success) {
        logger.info(`✅ Connected: ${sourcePort} -> ${destinationPort}`);
        return response.data.already_connected
          ? 'already connected'
          : 'connected';
      } else {
        throw new Error(response.data.error || 'Connection failed');
      }
    } catch (error) {
      logger.error(
        `❌ Connection failed: ${sourcePort} -> ${destinationPort} - ${error.message}`
      );
      throw error;
    }
  }

  async disconnectPorts(sourcePort, destinationPort) {
    try {
      logger.info(`🔌 Disconnecting: ${sourcePort} -> ${destinationPort}`);

      const response = await this.httpClient.post('/disconnect', {
        source: sourcePort,
        destination: destinationPort,
      });

      if (response.data.success) {
        logger.info(`✅ Disconnected: ${sourcePort} -> ${destinationPort}`);
        return { method: 'bridge_api', success: true };
      } else {
        throw new Error(response.data.error || 'Disconnect failed');
      }
    } catch (error) {
      logger.error(
        `❌ Disconnect failed: ${sourcePort} -> ${destinationPort} - ${error.message}`
      );
      throw error;
    }
  }

  async clearAllConnections() {
    try {
      logger.info('🧹 Clearing all connections via Bridge API...');

      // Try the bridge's clear endpoint first
      try {
        const response = await this.httpClient.post(
          '/clear',
          {},
          {
            timeout: this.config.timeouts.clear,
          }
        );

        if (response.data.success) {
          const cleared = response.data.count || response.data.cleared || 0;
          logger.info(`✅ Cleared ${cleared} connections via bridge`);
          return {
            method: 'bridge_api',
            success: true,
            cleared: cleared,
          };
        } else {
          throw new Error(response.data.error || 'Bridge clear failed');
        }
      } catch (bridgeError) {
        logger.warn(
          '⚠️ Bridge clear failed, using fallback method:',
          bridgeError.message
        );

        // Fallback: Get connections and disconnect them individually
        logger.info('🔄 Using individual disconnect method...');

        const connections = await this.getCurrentConnections();
        let cleared = 0;
        const errors = [];

        logger.info(
          `📋 Found ${connections.length} connections to clear individually`
        );

        for (const conn of connections) {
          try {
            await this.disconnectPorts(conn.from, conn.to);
            cleared++;
          } catch (error) {
            errors.push(`${conn.from} -> ${conn.to}: ${error.message}`);
            logger.warn(
              `⚠️ Failed to disconnect ${conn.from} -> ${conn.to}: ${error.message}`
            );
          }
        }

        if (errors.length > 0) {
          logger.warn(
            `⚠️ ${errors.length} disconnections failed during clear all`
          );
        }

        logger.info(
          `✅ Cleared ${cleared}/${connections.length} connections via fallback method`
        );
        return {
          method: 'individual_disconnect',
          success: true,
          cleared: cleared,
          errors: errors,
          total: connections.length,
        };
      }
    } catch (error) {
      logger.error(`❌ Clear all failed completely: ${error.message}`);
      throw error;
    }
  }

  async arePortsConnected(sourcePort, destinationPort) {
    try {
      const connections = await this.getCurrentConnections();
      return connections.some(
        (conn) => conn.from === sourcePort && conn.to === destinationPort
      );
    } catch (error) {
      logger.error(`❌ Error checking connection: ${error.message}`);
      return false;
    }
  }

  async getPortConnections(portName) {
    try {
      const connections = await this.getCurrentConnections();
      return {
        outgoing: connections.filter((conn) => conn.from === portName),
        incoming: connections.filter((conn) => conn.to === portName),
      };
    } catch (error) {
      logger.error(`❌ Error getting port connections: ${error.message}`);
      return { outgoing: [], incoming: [] };
    }
  }

  async disconnectAllFromPort(portName) {
    try {
      logger.info(`🔌 Disconnecting all connections for port: ${portName}`);

      // Try bridge endpoint first
      try {
        const response = await this.httpClient.post('/disconnect_port', {
          port: portName,
        });

        if (response.data.success) {
          const disconnected = response.data.disconnected || 0;
          logger.info(
            `✅ Disconnected ${disconnected} connections from ${portName}`
          );
          return {
            disconnected,
            method: 'bridge_api',
            success: true,
          };
        }
      } catch (bridgeError) {
        logger.warn('⚠️ Bridge disconnect_port failed, using fallback');
      }

      // Fallback: Get port connections and disconnect individually
      const portConnections = await this.getPortConnections(portName);
      const allConnections = [
        ...portConnections.outgoing,
        ...portConnections.incoming,
      ];

      let disconnected = 0;
      for (const conn of allConnections) {
        try {
          if (conn.from === portName) {
            await this.disconnectPorts(conn.from, conn.to);
          } else {
            await this.disconnectPorts(conn.from, conn.to);
          }
          disconnected++;
        } catch (error) {
          logger.warn(`Failed to disconnect connection: ${error.message}`);
        }
      }

      logger.info(
        `✅ Disconnected ${disconnected} connections from ${portName} via fallback`
      );
      return {
        disconnected,
        method: 'individual_disconnect',
        success: true,
      };
    } catch (error) {
      logger.error(`❌ Error disconnecting all from port: ${error.message}`);
      throw error;
    }
  }

  // Health and status methods
  async getBridgeHealth() {
    try {
      const response = await this.httpClient.get('/health');
      return { healthy: true, ...response.data };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  getStatus() {
    return {
      initialized: this.initializationComplete,
      running: this.statusCache.running,
      lastCheck: this.statusCache.lastCheck,
      bridgeConnected: true,
      bridgeUrl: this.bridgeBaseUrl,
      mode: 'http_only_with_fallbacks',
      features: {
        connect: true,
        disconnect: true,
        clearAll: true,
        list_ports: true,
        list_connections: true,
        real_time_updates: false,
        fallback_methods: true,
      },
      availableMethods: {
        bridge_api: 'primary',
        individual_operations: 'fallback',
      },
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down JACK service...');
    this.initializationComplete = false;
    logger.info('✅ JACK service shutdown complete');
  }
}

module.exports = new JackService();
