// services/jackService.js - HTTP client for Windows JACK Controller service
const { exec } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const config = require('../config/environment');

const execAsync = promisify(exec);

class JackService {
  constructor() {
    this.statusCache = { running: false, lastCheck: 0 };
    this.initializationComplete = false;

    this.config = {
      timeouts: {
        default: config.JACK_TIMEOUT || 10000,
        status: 5000,
      },
      statusCacheMs: config.JACK_STATUS_CACHE_TTL || 5000,
      jackController: {
        host: 'localhost',
        port: 6666,
        baseUrl: 'http://localhost:6666',
      },
      commands: {
        lsp: '/mnt/c/PROGRA~1/JACK2/tools/jack_lsp.exe',
        connect: '/mnt/c/PROGRA~1/JACK2/tools/jack_connect.exe',
      },
    };

    // Configure axios defaults
    this.httpClient = axios.create({
      baseURL: this.config.jackController.baseUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async initialize() {
    console.log('🎛️ Initializing JACK service with Windows HTTP controller...');
    console.log(`   Controller URL: ${this.config.jackController.baseUrl}`);
    console.log(`   Fallback Tools: ${this.config.commands.lsp}`);

    // Check if JACK Controller service is running
    try {
      const response = await this.httpClient.get('/status');
      if (response.data.success && response.data.connected) {
        console.log('✅ JACK Controller service is running and connected');
        this.statusCache = { running: true, lastCheck: Date.now() };
      } else {
        console.log(
          '⚠️ JACK Controller service running but JACK not connected'
        );
      }
    } catch (error) {
      console.log(
        '❌ JACK Controller service not available, using fallback methods'
      );
      console.log('   Start the jack_controller.exe service first!');
    }
  }

  setInitializationComplete() {
    this.initializationComplete = true;
  }

  async executeCommand(command, timeout = null) {
    try {
      const actualTimeout = timeout || this.config.timeouts.default;

      const { stdout, stderr } = await execAsync(command, {
        timeout: actualTimeout,
        shell: '/bin/bash',
        killSignal: 'SIGKILL',
      });

      if (
        stderr &&
        stderr.includes('Client name') &&
        stderr.includes('conflits')
      ) {
        console.log(`ℹ️ JACK client name conflict (continuing anyway)`);
        return stdout.trim();
      }

      if (stderr && !stderr.includes('Warning')) {
        throw new Error(stderr);
      }
      return stdout.trim();
    } catch (error) {
      if (
        error.stderr &&
        error.stderr.includes('Client name') &&
        error.stdout
      ) {
        console.log(`ℹ️ JACK client name conflict but got data anyway`);
        return error.stdout.trim();
      }

      console.error(`Command failed: ${command}`, error.message);
      throw error;
    }
  }

  async checkStatus() {
    const now = Date.now();
    if (now - this.statusCache.lastCheck < this.config.statusCacheMs) {
      return this.statusCache.running;
    }

    try {
      // Try HTTP controller first
      const response = await this.httpClient.get('/status');
      if (response.data.success && response.data.connected) {
        this.statusCache = { running: true, lastCheck: now };
        return true;
      }
    } catch (error) {
      // Fallback to command line check
      try {
        const command = `'${this.config.commands.lsp}'`;
        await this.executeCommand(command, this.config.timeouts.status);
        this.statusCache = { running: true, lastCheck: now };
        return true;
      } catch (cmdError) {
        if (
          cmdError.message.includes('Client name') &&
          cmdError.message.includes('conflits')
        ) {
          console.log(`ℹ️ JACK running (client name conflict ignored)`);
          this.statusCache = { running: true, lastCheck: now };
          return true;
        }
      }
    }

    console.log(`🔍 JACK status check failed`);
    this.statusCache = { running: false, lastCheck: now };
    return false;
  }

  async listConnections() {
    try {
      // Try HTTP controller first
      const response = await this.httpClient.get('/connections');
      if (response.data.success) {
        // Convert HTTP response format to lsp format for compatibility
        return this.convertConnectionsToLspFormat(response.data.connections);
      }
    } catch (error) {
      console.log('ℹ️ HTTP controller unavailable, using fallback');
    }

    // Fallback to command line
    const command = `'${this.config.commands.lsp}' -c`;
    return await this.executeCommand(command);
  }

  async listPorts() {
    try {
      // Try HTTP controller first
      const response = await this.httpClient.get('/ports');
      if (response.data.success) {
        return response.data.ports.join('\n');
      }
    } catch (error) {
      console.log('ℹ️ HTTP controller unavailable, using fallback');
    }

    // Fallback to command line
    const command = `'${this.config.commands.lsp}'`;
    return await this.executeCommand(command);
  }

  convertConnectionsToLspFormat(connections) {
    // Convert [{from: "a", to: "b"}] to lsp -c format
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
      // Try HTTP controller first
      const response = await this.httpClient.post('/connect', {
        source: sourcePort,
        destination: destinationPort,
      });

      if (response.data.success) {
        console.log(
          `✅ JACK Connected (HTTP): ${sourcePort} -> ${destinationPort}`
        );
        return response.data.method === 'already_connected'
          ? 'already connected'
          : 'connected';
      }
    } catch (error) {
      console.log(
        `ℹ️ HTTP connect failed: ${error.message}, trying command line`
      );
    }

    // Fallback to command line
    const command = `'${this.config.commands.connect}' '${sourcePort}' '${destinationPort}'`;

    try {
      const result = await this.executeCommand(command);
      console.log(
        `✅ JACK Connected (CLI): ${sourcePort} -> ${destinationPort}`
      );
      return result;
    } catch (error) {
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('already connected')) {
        console.log(
          `ℹ️ JACK Already connected: ${sourcePort} -> ${destinationPort}`
        );
        return 'already connected';
      }

      console.error(
        `❌ JACK Connection failed: ${sourcePort} -> ${destinationPort} - ${error.message}`
      );
      throw error;
    }
  }

  /**
   * NATIVE DISCONNECT using HTTP controller
   */
  async disconnectPorts(sourcePort, destinationPort) {
    console.log(
      `🔌 Attempting to disconnect: ${sourcePort} -> ${destinationPort}`
    );

    try {
      // Try HTTP controller first
      const response = await this.httpClient.post('/disconnect', {
        source: sourcePort,
        destination: destinationPort,
      });

      if (response.data.success) {
        console.log(
          `✅ Disconnected (HTTP): ${sourcePort} -> ${destinationPort}`
        );
        return { method: 'jack_disconnect_http', success: true };
      } else {
        throw new Error(`HTTP disconnect failed: ${response.data.error}`);
      }
    } catch (error) {
      console.log(`❌ HTTP disconnect failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * NATIVE CLEAR ALL using HTTP controller
   */
  async clearAllConnections() {
    console.log(`🧹 Clearing all connections via HTTP controller...`);

    try {
      const response = await this.httpClient.post('/clear');

      if (response.data.success) {
        console.log(`✅ Cleared ${response.data.cleared} connections via HTTP`);
        return {
          method: 'jack_disconnect_http',
          success: true,
          cleared: response.data.cleared,
        };
      } else {
        throw new Error(`HTTP clear failed: ${response.data.error}`);
      }
    } catch (error) {
      console.log(`❌ HTTP clear failed: ${error.message}`);
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
      console.error(`❌ Error checking connection: ${error.message}`);
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
      console.error(`❌ Error getting port connections: ${error.message}`);
      return { outgoing: [], incoming: [] };
    }
  }

  async disconnectAllFromPort(portName) {
    try {
      console.log(`🔌 Disconnecting all connections for port: ${portName}`);

      const connections = await this.getPortConnections(portName);
      const allPortConnections = [
        ...connections.outgoing,
        ...connections.incoming,
      ];

      if (allPortConnections.length === 0) {
        console.log(`ℹ️ No connections found for port: ${portName}`);
        return { disconnected: 0, method: 'none_found' };
      }

      console.log(
        `🔄 Disconnecting ${allPortConnections.length} connections...`
      );

      let disconnected = 0;
      for (const conn of allPortConnections) {
        try {
          await this.disconnectPorts(conn.from, conn.to);
          disconnected++;
        } catch (error) {
          console.warn(`⚠️ Failed to disconnect: ${conn.from} -> ${conn.to}`);
        }
      }

      console.log(
        `✅ Disconnected ${disconnected}/${allPortConnections.length} connections from ${portName}`
      );

      return {
        disconnected,
        method: 'jack_disconnect_http',
        total: allPortConnections.length,
      };
    } catch (error) {
      console.error(`❌ Error disconnecting all from port: ${error.message}`);
      throw error;
    }
  }

  getStatus() {
    return {
      initialized: this.initializationComplete,
      running: this.statusCache.running,
      lastCheck: this.statusCache.lastCheck,
      config: this.config,
      httpController: this.config.jackController,
      features: {
        connect: true,
        disconnect: 'jack_disconnect_http',
        clearAll: 'jack_disconnect_http',
        list_ports: true,
        list_connections: true,
      },
      availableMethods: {
        jack_disconnect_http: 'primary',
        command_line: 'fallback',
      },
    };
  }
}

module.exports = new JackService();
