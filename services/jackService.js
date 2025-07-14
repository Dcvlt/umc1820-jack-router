// services/jackService.js - Updated for Docker with C++ Bridge communication
const axios = require('axios');
const WebSocket = require('ws');
const config = require('../config/environment');
const logger = require('../utils/logger');

class JackService {
  constructor() {
    this.bridgeHost = process.env.JACK_BRIDGE_HOST || 'jack-bridge';
    this.bridgePort = process.env.JACK_BRIDGE_PORT || 6666;
    this.bridgeWsPort = process.env.JACK_BRIDGE_WS_PORT || 6667;
    this.bridgeBaseUrl = `http://${this.bridgeHost}:${this.bridgePort}`;

    this.statusCache = { running: false, lastCheck: 0 };
    this.initializationComplete = false;
    this.websocket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;

    this.config = {
      timeouts: {
        default: config.JACK_TIMEOUT || 10000,
        status: 5000,
      },
      statusCacheMs: config.JACK_STATUS_CACHE_TTL || 5000,
      reconnectInterval: 5000,
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
          logger.warn('🔌 JACK Bridge service not available, retrying...');
        } else {
          logger.error('❌ JACK Bridge communication error:', error.message);
        }
        throw error;
      }
    );
  }

  async initialize() {
    logger.info('🎛️ Initializing JACK service with Docker Bridge...');
    logger.info(`   Bridge URL: ${this.bridgeBaseUrl}`);
    logger.info(
      `   WebSocket URL: ws://${this.bridgeHost}:${this.bridgeWsPort}`
    );

    // Wait for bridge service to be available
    await this.waitForBridgeService();

    // Setup WebSocket connection for real-time updates
    this.setupWebSocketConnection();

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

  async waitForBridgeService(maxAttempts = 30, interval = 2000) {
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
          throw new Error(
            `JACK Bridge service not available after ${maxAttempts} attempts`
          );
        }

        if (attempt % 5 === 0) {
          logger.info(
            `⏳ Still waiting for JACK Bridge service... (attempt ${attempt}/${maxAttempts})`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    return false;
  }

  setupWebSocketConnection() {
    const wsUrl = `ws://${this.bridgeHost}:${this.bridgeWsPort}`;
    logger.info(`🔄 Setting up WebSocket connection to ${wsUrl}`);

    try {
      this.websocket = new WebSocket(wsUrl);

      this.websocket.on('open', () => {
        logger.info('✅ WebSocket connection established');
        this.reconnectAttempts = 0;
      });

      this.websocket.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          logger.error('❌ Failed to parse WebSocket message:', error.message);
        }
      });

      this.websocket.on('close', (code, reason) => {
        logger.warn(
          `🔌 WebSocket connection closed (code: ${code}, reason: ${reason})`
        );
        this.scheduleWebSocketReconnect();
      });

      this.websocket.on('error', (error) => {
        logger.error('❌ WebSocket error:', error.message);
        this.scheduleWebSocketReconnect();
      });
    } catch (error) {
      logger.error('❌ Failed to setup WebSocket connection:', error.message);
      this.scheduleWebSocketReconnect();
    }
  }

  scheduleWebSocketReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('❌ Maximum WebSocket reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectInterval * this.reconnectAttempts,
      30000
    );

    logger.info(
      `🔄 Scheduling WebSocket reconnection in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    setTimeout(() => {
      this.setupWebSocketConnection();
    }, delay);
  }

  handleWebSocketMessage(message) {
    switch (message.type) {
      case 'status_update':
        this.statusCache = {
          running: message.data.jack_running,
          lastCheck: Date.now(),
        };
        logger.debug('📊 Received JACK status update:', message.data);
        break;

      case 'connection_change':
        logger.debug('🔗 Received connection change:', message.data);
        // Emit event for other services to listen to
        this.emit('connectionChange', message.data);
        break;

      case 'error':
        logger.error('❌ Bridge service error:', message.data);
        break;

      default:
        logger.debug('📨 Unknown WebSocket message type:', message.type);
    }
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
      const response = await this.httpClient.get('/status');
      const data = response.data;

      this.statusCache = {
        running: data.jack_running || false,
        lastCheck: now,
      };

      return this.statusCache.running;
    } catch (error) {
      logger.error('❌ JACK status check failed:', error.message);
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
    // Convert [{from: "a", to: "b"}] to lsp -c format for compatibility
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

      const response = await this.httpClient.post('/clear');

      if (response.data.success) {
        logger.info(`✅ Cleared ${response.data.cleared || 'all'} connections`);
        return {
          method: 'bridge_api',
          success: true,
          cleared: response.data.cleared || 0,
        };
      } else {
        throw new Error(response.data.error || 'Clear all failed');
      }
    } catch (error) {
      logger.error(`❌ Clear all failed: ${error.message}`);
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
      } else {
        throw new Error(
          response.data.error || 'Disconnect all from port failed'
        );
      }
    } catch (error) {
      logger.error(`❌ Error disconnecting all from port: ${error.message}`);
      throw error;
    }
  }

  // Health and status methods
  async getBridgeHealth() {
    try {
      const response = await this.httpClient.get('/health');
      return response.data;
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  getStatus() {
    return {
      initialized: this.initializationComplete,
      running: this.statusCache.running,
      lastCheck: this.statusCache.lastCheck,
      bridgeConnected:
        this.websocket && this.websocket.readyState === WebSocket.OPEN,
      bridgeUrl: this.bridgeBaseUrl,
      features: {
        connect: true,
        disconnect: true,
        clearAll: true,
        list_ports: true,
        list_connections: true,
        real_time_updates: true,
      },
      availableMethods: {
        bridge_api: 'primary',
        websocket_updates: 'real-time',
      },
    };
  }

  // Event emitter functionality for WebSocket events
  emit(event, data) {
    // Simple event emission - could be enhanced with proper EventEmitter
    if (this.eventHandlers && this.eventHandlers[event]) {
      this.eventHandlers[event].forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          logger.error(`❌ Event handler error for ${event}:`, error.message);
        }
      });
    }
  }

  on(event, handler) {
    if (!this.eventHandlers) {
      this.eventHandlers = {};
    }
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  off(event, handler) {
    if (this.eventHandlers && this.eventHandlers[event]) {
      const index = this.eventHandlers[event].indexOf(handler);
      if (index > -1) {
        this.eventHandlers[event].splice(index, 1);
      }
    }
  }

  // Cleanup method
  async shutdown() {
    logger.info('🛑 Shutting down JACK service...');

    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    // Clear any timeouts or intervals
    this.reconnectAttempts = this.maxReconnectAttempts;

    logger.info('✅ JACK service shutdown complete');
  }

  // Bridge service specific methods
  async getBridgeStatus() {
    try {
      const response = await this.httpClient.get('/status');
      return response.data;
    } catch (error) {
      logger.error('❌ Failed to get bridge status:', error.message);
      throw error;
    }
  }

  async testBridgeConnection() {
    try {
      const response = await this.httpClient.get('/health');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  // Batch operations support
  async executeBatchOperations(operations) {
    try {
      const response = await this.httpClient.post('/batch', {
        operations: operations,
      });

      if (response.data.success) {
        return response.data.results;
      } else {
        throw new Error(response.data.error || 'Batch operations failed');
      }
    } catch (error) {
      logger.error('❌ Batch operations failed:', error.message);
      throw error;
    }
  }

  // Get detailed bridge information
  async getBridgeInfo() {
    try {
      const response = await this.httpClient.get('/info');
      return response.data;
    } catch (error) {
      logger.error('❌ Failed to get bridge info:', error.message);
      return null;
    }
  }

  // Monitor bridge connection health
  startBridgeHealthMonitoring(interval = 30000) {
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
    }

    this.healthMonitorInterval = setInterval(async () => {
      try {
        const isHealthy = await this.testBridgeConnection();
        if (!isHealthy && this.statusCache.running) {
          logger.warn('⚠️ Bridge connection lost, attempting to reconnect...');
          this.scheduleWebSocketReconnect();
        }
      } catch (error) {
        // Silent health check - don't spam logs
      }
    }, interval);

    logger.info(`🏥 Bridge health monitoring started (${interval}ms interval)`);
  }

  stopBridgeHealthMonitoring() {
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
      this.healthMonitorInterval = null;
      logger.info('🏥 Bridge health monitoring stopped');
    }
  }
}

module.exports = new JackService();
