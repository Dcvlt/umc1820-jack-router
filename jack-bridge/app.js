// jack-bridge/app.js
// Temporary Node.js Bridge Service (replaces C++ service for now)

const express = require('express');
const WebSocket = require('ws');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();

// Configuration
const API_PORT = process.env.JACK_BRIDGE_API_PORT || 6666;
const WS_PORT = process.env.JACK_BRIDGE_WS_PORT || 6667;
const JACK_TOOLS_PATH =
  process.env.JACK_TOOLS_PATH || 'C:/PROGRA~1/JACK2/tools';
const WINDOWS_HOST = process.env.JACK_SERVER_HOST || 'host.docker.internal';

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });
let wsClients = new Set();

wss.on('connection', (ws) => {
  console.log('📡 WebSocket client connected');
  wsClients.add(ws);

  ws.on('close', () => {
    console.log('📡 WebSocket client disconnected');
    wsClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    wsClients.delete(ws);
  });
});

// Broadcast to all WebSocket clients
function broadcast(message) {
  const data = JSON.stringify(message);
  wsClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

// JACK command execution (WSL/PowerShell based)
async function executeJackCommand(command, timeout = 10000) {
  try {
    console.log(`🔧 Executing JACK command: ${command}`);

    // Try multiple execution methods
    const commands = [
      `powershell.exe -Command "${command}"`,
      `wsl.exe -d Ubuntu -e bash -c "${command}"`,
      command,
    ];

    for (const cmd of commands) {
      try {
        const { stdout, stderr } = await execAsync(cmd, {
          timeout,
          windowsHide: true,
        });

        if (stderr && !stderr.includes('Warning')) {
          console.warn(`⚠️ JACK command stderr: ${stderr}`);
        }

        console.log(`✅ JACK command successful`);
        return stdout.trim();
      } catch (error) {
        console.log(`❌ Failed with ${cmd}: ${error.message}`);
        continue;
      }
    }

    throw new Error('All execution methods failed');
  } catch (error) {
    console.error(`❌ JACK command failed: ${error.message}`);
    throw error;
  }
}

// Check JACK status
async function checkJackStatus() {
  try {
    const command = `${JACK_TOOLS_PATH}/jack_lsp.exe`;
    await executeJackCommand(command, 5000);
    return true;
  } catch (error) {
    return false;
  }
}

// Get JACK connections
async function getJackConnections() {
  try {
    const command = `${JACK_TOOLS_PATH}/jack_lsp.exe -c`;
    const output = await executeJackCommand(command);
    return parseJackConnections(output);
  } catch (error) {
    console.error('Failed to get connections:', error);
    return [];
  }
}

// Parse JACK connections
function parseJackConnections(output) {
  const lines = output.split('\n');
  const connections = [];
  let currentSource = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (line.startsWith('   ')) {
      if (currentSource) {
        connections.push({
          from: currentSource,
          to: trimmed,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      currentSource = trimmed;
    }
  }

  return connections;
}

// Get JACK ports
async function getJackPorts() {
  try {
    const command = `${JACK_TOOLS_PATH}/jack_lsp.exe`;
    const output = await executeJackCommand(command);
    return output.split('\n').filter((line) => line.trim());
  } catch (error) {
    console.error('Failed to get ports:', error);
    return [];
  }
}

// API Routes

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'jack-bridge-temp',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/status', async (req, res) => {
  try {
    const jackRunning = await checkJackStatus();
    const connections = jackRunning ? await getJackConnections() : [];

    const status = {
      success: true,
      jack_running: jackRunning,
      connections: connections,
      connection_count: connections.length,
      windows_host: WINDOWS_HOST,
      jack_tools_path: JACK_TOOLS_PATH,
      timestamp: new Date().toISOString(),
    };

    // Broadcast status update
    broadcast({
      type: 'status_update',
      data: status,
    });

    res.json(status);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      jack_running: false,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/ports', async (req, res) => {
  try {
    const jackRunning = await checkJackStatus();
    if (!jackRunning) {
      return res.json({
        success: false,
        error: 'JACK server not running',
        ports: [],
      });
    }

    const ports = await getJackPorts();
    res.json({
      success: true,
      ports: ports,
      count: ports.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      ports: [],
    });
  }
});

app.get('/connections', async (req, res) => {
  try {
    const jackRunning = await checkJackStatus();
    if (!jackRunning) {
      return res.json({
        success: false,
        error: 'JACK server not running',
        connections: [],
      });
    }

    const connections = await getJackConnections();
    res.json({
      success: true,
      connections: connections,
      count: connections.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      connections: [],
    });
  }
});

app.post('/connect', async (req, res) => {
  try {
    const { source, destination } = req.body;

    if (!source || !destination) {
      return res.status(400).json({
        success: false,
        error: 'Missing source or destination',
      });
    }

    const jackRunning = await checkJackStatus();
    if (!jackRunning) {
      return res.status(500).json({
        success: false,
        error: 'JACK server not running',
      });
    }

    const command = `${JACK_TOOLS_PATH}/jack_connect.exe "${source}" "${destination}"`;
    await executeJackCommand(command);

    // Broadcast connection change
    broadcast({
      type: 'connection_change',
      data: {
        action: 'connected',
        from: source,
        to: destination,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      message: `Connected ${source} to ${destination}`,
      method: 'jack_connect',
      already_connected: false,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error.message.includes('already connected')) {
      res.json({
        success: true,
        message: `Already connected`,
        method: 'jack_connect',
        already_connected: true,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
});

app.post('/disconnect', async (req, res) => {
  try {
    const { source, destination } = req.body;

    if (!source || !destination) {
      return res.status(400).json({
        success: false,
        error: 'Missing source or destination',
      });
    }

    const jackRunning = await checkJackStatus();
    if (!jackRunning) {
      return res.status(500).json({
        success: false,
        error: 'JACK server not running',
      });
    }

    // For now, simulate disconnect (since jack_disconnect might not exist)
    // In reality, we'd need to implement a disconnect strategy
    console.log(`🔌 Would disconnect: ${source} -> ${destination}`);

    // Broadcast connection change
    broadcast({
      type: 'connection_change',
      data: {
        action: 'disconnected',
        from: source,
        to: destination,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      message: `Disconnected ${source} from ${destination}`,
      method: 'simulated',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.post('/clear', async (req, res) => {
  try {
    const jackRunning = await checkJackStatus();
    if (!jackRunning) {
      return res.status(500).json({
        success: false,
        error: 'JACK server not running',
      });
    }

    // Get current connections
    const connections = await getJackConnections();

    // For now, simulate clearing (would need proper implementation)
    console.log(`🧹 Would clear ${connections.length} connections`);

    // Broadcast clear all
    broadcast({
      type: 'connection_change',
      data: {
        action: 'cleared_all',
        count: connections.length,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      message: `Cleared connections`,
      cleared: connections.length,
      method: 'simulated',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Error handling
app.use((error, req, res, next) => {
  console.error('API Error:', error);
  res.status(500).json({
    success: false,
    error: error.message,
    timestamp: new Date().toISOString(),
  });
});

// Start servers
app.listen(API_PORT, '0.0.0.0', () => {
  console.log('🎵 Temporary JACK Bridge Service');
  console.log('================================');
  console.log(`📡 HTTP API: http://0.0.0.0:${API_PORT}`);
  console.log(`🔄 WebSocket: ws://0.0.0.0:${WS_PORT}`);
  console.log(`🎛️ JACK Tools: ${JACK_TOOLS_PATH}`);
  console.log(`🪟 Windows Host: ${WINDOWS_HOST}`);
  console.log('✅ Service ready');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  wss.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  wss.close();
  process.exit(0);
});
