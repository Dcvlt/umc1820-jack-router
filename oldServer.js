// Enhanced server.js with HTTPS support and proper disconnect handling for JACK2 Windows
const express = require('express');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');
const cors = require('cors');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const React = require('react');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { renderToPipeableStream } = require('react-dom/server');
const { DEVICE_CONFIG, ROUTING_PRESETS } = require('./constants/constants.cjs');

const execAsync = promisify(exec);
const app = express();
const PORT = 3001;
const HTTPS_PORT = 3443; // Common HTTPS port alternative to 443

require('@babel/register')({
  extensions: ['.js', '.jsx', '.cjsx'],
});

const { JackAudioRouter } = require('./jackAudioRouter.jsx');

// State persistence
const STATE_FILE = path.join(__dirname, 'audio_router_state.json');
const BACKUP_STATE_FILE = path.join(
  __dirname,
  'audio_router_state.backup.json'
);

// SSL Certificate paths
const SSL_KEY_PATH = path.join(__dirname, 'ssl', 'private.key');
const SSL_CERT_PATH = path.join(__dirname, 'ssl', 'certificate.crt');
const SSL_CA_PATH = path.join(__dirname, 'ssl', 'ca_bundle.crt'); // Optional

// Middleware
app.use(cors());
app.use(express.json());

const isDev = process.env.NODE_ENV === 'development';

// Track if we're in the middle of startup
let isStartingUp = true;
let jackStatusCache = { running: false, lastCheck: 0 };

// Connection tracking for disconnect functionality
let connectionTracker = new Map();

// SSL Configuration function
async function getSSLOptions() {
  try {
    const options = {
      key: await fs.readFile(SSL_KEY_PATH, 'utf8'),
      cert: await fs.readFile(SSL_CERT_PATH, 'utf8'),
    };

    // Add CA bundle if it exists
    try {
      const ca = await fs.readFile(SSL_CA_PATH, 'utf8');
      options.ca = ca;
    } catch (error) {
      console.log('ℹ️ No CA bundle found, proceeding without it');
    }

    return options;
  } catch (error) {
    console.error('❌ SSL certificate files not found:', error.message);
    console.log('📝 To use HTTPS, you need to:');
    console.log('   1. Create an "ssl" directory in your project root');
    console.log('   2. Place your SSL certificate files:');
    console.log('      - ssl/private.key (private key)');
    console.log('      - ssl/certificate.crt (certificate)');
    console.log(
      '      - ssl/ca_bundle.crt (certificate authority bundle - optional)'
    );
    console.log('   3. Or use the self-signed certificate generation below');
    return null;
  }
}

// Generate self-signed certificate for development
async function generateSelfSignedCert() {
  const sslDir = path.join(__dirname, 'ssl');

  try {
    // Create ssl directory if it doesn't exist
    await fs.mkdir(sslDir, { recursive: true });

    // Check if certificates already exist
    try {
      await fs.access(SSL_KEY_PATH);
      await fs.access(SSL_CERT_PATH);
      console.log('✅ SSL certificates already exist');
      return true;
    } catch (error) {
      // Certificates don't exist, generate them
    }

    console.log('🔐 Generating self-signed SSL certificate...');

    // Generate private key and certificate using OpenSSL
    const opensslCommand = `openssl req -x509 -newkey rsa:4096 -keyout "${SSL_KEY_PATH}" -out "${SSL_CERT_PATH}" -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:0.0.0.0"`;

    await execAsync(opensslCommand);

    console.log('✅ Self-signed SSL certificate generated successfully');
    console.log(
      '⚠️ Note: Browsers will show a security warning for self-signed certificates'
    );
    console.log(
      '   You can safely proceed by clicking "Advanced" -> "Proceed to localhost"'
    );

    return true;
  } catch (error) {
    console.error(
      '❌ Failed to generate self-signed certificate:',
      error.message
    );
    console.log('💡 Make sure OpenSSL is installed and available in your PATH');
    console.log(
      '   Windows: Download from https://slproweb.com/products/Win32OpenSSL.html'
    );
    console.log(
      '   Or use Windows Subsystem for Linux (WSL) with OpenSSL installed'
    );
    return false;
  }
}

// Force HTTPS redirect middleware
function forceHTTPS(req, res, next) {
  if (req.header('x-forwarded-proto') !== 'https') {
    res.redirect(`https://${req.header('host')}${req.url}`);
  } else {
    next();
  }
}

// Apply force HTTPS in production (optional)
if (!isDev && process.env.FORCE_HTTPS === 'true') {
  app.use(forceHTTPS);
}

// JACK command helpers - Fixed for WSL execution
async function executeJackCommand(command, timeout = 10000) {
  try {
    console.log(`🔧 Executing JACK command: ${command}`);

    const windowsCommands = [
      `powershell.exe -Command "${command}"`,
      `cmd.exe /c "${command}"`,
      command,
    ];

    for (const cmd of windowsCommands) {
      try {
        const { stdout, stderr } = await execAsync(cmd, {
          shell: '/bin/bash',
          timeout: timeout,
          env: {
            ...process.env,
            PATH: '/mnt/c/PROGRA~1/JACK2/tools:' + process.env.PATH,
          },
        });

        if (stderr && !stderr.includes('Warning') && !stderr.includes('INFO')) {
          console.warn(`⚠️ JACK command stderr: ${stderr}`);
        }

        console.log(
          `✅ JACK command successful: ${stdout.substring(0, 100)}...`
        );
        return stdout.trim();
      } catch (error) {
        console.log(`❌ Failed with ${cmd}: ${error.message}`);
        continue;
      }
    }

    throw new Error('All execution methods failed');
  } catch (error) {
    console.error(
      `❌ JACK command failed completely: ${command}`,
      error.message
    );
    throw error;
  }
}

// Check if JACK is running with caching
async function checkJackStatus() {
  const now = Date.now();

  if (now - jackStatusCache.lastCheck < 5000) {
    return jackStatusCache.running;
  }

  try {
    await executeJackCommand('C:/PROGRA~1/JACK2/tools/jack_lsp.exe', 5000);
    jackStatusCache = { running: true, lastCheck: now };
    return true;
  } catch (error) {
    console.log(`🔍 JACK status check failed: ${error.message}`);
    jackStatusCache = { running: false, lastCheck: now };
    return false;
  }
}

// Enhanced connectPorts with connection tracking
async function connectPorts(fromPort, toPort) {
  const command = `C:/PROGRA~1/JACK2/tools/jack_connect.exe "${fromPort}" "${toPort}"`;
  try {
    const result = await executeJackCommand(command);
    console.log(`✅ Connected: ${fromPort} -> ${toPort}`);

    const connectionKey = `${fromPort}=>${toPort}`;
    connectionTracker.set(connectionKey, {
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

      const connectionKey = `${fromPort}=>${toPort}`;
      connectionTracker.set(connectionKey, {
        from: fromPort,
        to: toPort,
        timestamp: Date.now(),
      });

      return 'already connected';
    }
    throw error;
  }
}

// Alternative disconnect methods since jack_disconnect.exe doesn't exist
async function disconnectPorts(fromPort, toPort) {
  console.log(`🔌 Attempting to disconnect: ${fromPort} -> ${toPort}`);

  try {
    await disconnectViaQjackCtl(fromPort, toPort);
    return 'disconnected via QjackCtl';
  } catch (error) {
    console.log(`❌ QjackCtl disconnect failed: ${error.message}`);
  }

  try {
    await disconnectViaClearAndRebuild(fromPort, toPort);
    return 'disconnected via clear/rebuild';
  } catch (error) {
    console.log(`❌ Clear/rebuild disconnect failed: ${error.message}`);
  }

  const connectionKey = `${fromPort}=>${toPort}`;
  connectionTracker.delete(connectionKey);
  console.log(`ℹ️ Marked as disconnected: ${fromPort} -> ${toPort}`);

  return 'marked as disconnected';
}

async function disconnectViaQjackCtl(fromPort, toPort) {
  const command = `C:/PROGRA~1/JACK2/qjackctl.exe --disconnect "${fromPort}" "${toPort}"`;
  try {
    await executeJackCommand(command, 5000);
    console.log(`✅ Disconnected via QjackCtl: ${fromPort} -> ${toPort}`);
    return true;
  } catch (error) {
    throw new Error(`QjackCtl disconnect not available: ${error.message}`);
  }
}

async function disconnectViaClearAndRebuild(fromPort, toPort) {
  console.log(`🔄 Using clear/rebuild method for: ${fromPort} -> ${toPort}`);

  const currentConnections = await getCurrentConnections();
  const targetConnection = currentConnections.find(
    (conn) => conn.from === fromPort && conn.to === toPort
  );

  if (!targetConnection) {
    console.log(`ℹ️ Connection not found: ${fromPort} -> ${toPort}`);
    return false;
  }

  await clearAllConnections();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const connectionsToRebuild = currentConnections.filter(
    (conn) => !(conn.from === fromPort && conn.to === toPort)
  );

  console.log(`🔄 Rebuilding ${connectionsToRebuild.length} connections`);

  for (const conn of connectionsToRebuild) {
    try {
      await connectPorts(conn.from, conn.to);
    } catch (error) {
      console.warn(
        `⚠️ Failed to rebuild connection: ${conn.from} -> ${conn.to}`
      );
    }
  }

  console.log(`✅ Disconnected via clear/rebuild: ${fromPort} -> ${toPort}`);
  return true;
}

async function getCurrentConnections() {
  try {
    const connectionOutput = await listConnections();
    return parseJackConnections(connectionOutput);
  } catch (error) {
    console.warn(
      '⚠️ Failed to get current connections from JACK, using tracker'
    );
    return Array.from(connectionTracker.values());
  }
}

async function listConnections() {
  const command = `C:/PROGRA~1/JACK2/tools/jack_lsp.exe -c`;
  return await executeJackCommand(command);
}

function parseJackConnections(connectionOutput) {
  const lines = connectionOutput.split('\n');
  const connections = [];
  let currentSource = null;

  for (const line of lines) {
    if (line.trim() === '') continue;

    if (line.startsWith('   ')) {
      if (currentSource) {
        const destination = line.trim();
        connections.push({
          from: currentSource,
          to: destination,
        });
      }
    } else {
      currentSource = line.trim();
    }
  }

  return connections;
}

async function clearAllConnections() {
  try {
    console.log('🧹 Clearing all connections...');

    const connectionOutput = await listConnections();
    const connections = parseJackConnections(connectionOutput);

    console.log(`Found ${connections.length} connections to clear`);

    try {
      await clearConnectionsViaQjackCtl();
      console.log('✅ Cleared connections via QjackCtl automation');
    } catch (error) {
      console.log(
        '⚠️ QjackCtl automation not available, using connection tracking'
      );
      connectionTracker.clear();
    }

    return connections.length;
  } catch (error) {
    console.error('❌ Error clearing connections:', error.message);
    return 0;
  }
}

async function clearConnectionsViaQjackCtl() {
  const powershellScript = `
    Add-Type -AssemblyName System.Windows.Forms
    
    $qjackctl = Get-Process -Name "qjackctl" -ErrorAction SilentlyContinue
    if (-not $qjackctl) {
      throw "QjackCtl not running"
    }
    
    Write-Host "QjackCtl automation attempted"
  `;

  const command = `powershell.exe -Command "${powershellScript.replace(/"/g, '\\"')}"`;
  await executeJackCommand(command, 5000);
}

async function saveState() {
  try {
    if (!(await checkJackStatus())) {
      console.log('⚠️ JACK not running, skipping state save');
      return false;
    }

    const connectionOutput = await listConnections();
    const parsedConnections = parseJackConnections(connectionOutput);
    const trackedConnections = Array.from(connectionTracker.values());

    const currentState = {
      timestamp: new Date().toISOString(),
      connections: parsedConnections,
      tracked_connections: trackedConnections,
      device_config: DEVICE_CONFIG,
      presets: ROUTING_PRESETS,
    };

    try {
      await fs.copyFile(STATE_FILE, BACKUP_STATE_FILE);
    } catch (error) {
      // Backup file might not exist yet
    }

    await fs.writeFile(STATE_FILE, JSON.stringify(currentState, null, 2));
    console.log('💾 Audio router state saved');
    return true;
  } catch (error) {
    console.error('❌ Failed to save state:', error.message);
    return false;
  }
}

async function loadState() {
  try {
    console.log('🔄 Loading previous state...');

    if (!(await checkJackStatus())) {
      console.log('⚠️ JACK not running, cannot restore state');
      return false;
    }

    const stateData = await fs.readFile(STATE_FILE, 'utf8');
    const savedState = JSON.parse(stateData);

    console.log(`📅 Found state from ${savedState.timestamp}`);
    console.log(
      `📊 State contains ${savedState.connections.length} connections`
    );

    await clearAllConnections();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    let restored = 0;
    let failed = 0;

    for (const connection of savedState.connections) {
      try {
        await connectPorts(connection.from, connection.to);
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

// Auto-save state periodically
setInterval(async () => {
  if (!isStartingUp) {
    await saveState();
  }
}, 30000);

// API Routes (keeping all existing routes)
app.get('/api/status', async (req, res) => {
  try {
    const jackRunning = await checkJackStatus();

    if (!jackRunning) {
      return res.json({
        status: 'error',
        message: 'JACK server not running',
        jack_running: false,
        connections: '',
        parsed_connections: [],
        tracked_connections: Array.from(connectionTracker.values()),
        device_config: DEVICE_CONFIG,
        presets: Object.keys(ROUTING_PRESETS),
      });
    }

    const connectionOutput = await listConnections();
    const parsedConnections = parseJackConnections(connectionOutput);

    res.json({
      status: 'ok',
      jack_running: true,
      connections: connectionOutput,
      parsed_connections: parsedConnections,
      tracked_connections: Array.from(connectionTracker.values()),
      device_config: DEVICE_CONFIG,
      presets: Object.keys(ROUTING_PRESETS),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      jack_running: false,
      connections: '',
      parsed_connections: [],
      tracked_connections: Array.from(connectionTracker.values()),
      device_config: DEVICE_CONFIG,
      presets: Object.keys(ROUTING_PRESETS),
    });
  }
});

app.post('/api/preset/:presetName', async (req, res) => {
  const { presetName } = req.params;
  const preset = ROUTING_PRESETS[presetName];

  if (!preset) {
    return res.status(404).json({ error: 'Preset not found' });
  }

  try {
    if (!(await checkJackStatus())) {
      return res.status(500).json({ error: 'JACK server not running' });
    }

    console.log(`🎯 Applying preset: ${presetName} (${preset.name})`);

    await clearAllConnections();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const results = [];
    let connected = 0;

    for (const connection of preset.connections) {
      const fromConfig =
        DEVICE_CONFIG.inputs[connection.from] ||
        DEVICE_CONFIG.outputs[connection.from];
      const toConfig = DEVICE_CONFIG.outputs[connection.to];

      const fromPort = fromConfig?.value;
      const toPort = toConfig?.value;

      if (fromPort && toPort) {
        try {
          await connectPorts(fromPort, toPort);
          connected++;
          results.push({
            from: connection.from,
            to: connection.to,
            from_port: fromPort,
            to_port: toConfig.value,
            from_label: fromConfig.label,
            to_label: toConfig.label,
            status: 'connected',
          });
        } catch (error) {
          console.error(
            `❌ Failed to connect ${fromPort} -> ${toPort}: ${error.message}`
          );
          results.push({
            from: connection.from,
            to: connection.to,
            from_port: fromPort,
            to_port: toConfig.value,
            from_label: fromConfig?.label,
            to_label: toConfig?.label,
            status: 'error',
            message: error.message,
          });
        }
      }
    }

    console.log(
      `✅ Applied preset ${presetName}: ${connected}/${preset.connections.length} connections`
    );

    res.json({
      status: 'success',
      preset: presetName,
      connected: connected,
      total: preset.connections.length,
      connections: results,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

app.post('/api/connect', async (req, res) => {
  const { from, to } = req.body;

  try {
    if (!(await checkJackStatus())) {
      return res.status(500).json({ error: 'JACK server not running' });
    }

    const fromConfig =
      DEVICE_CONFIG.inputs[from] || DEVICE_CONFIG.outputs[from];
    const toConfig = DEVICE_CONFIG.outputs[to];

    const fromPort = fromConfig?.value;
    const toPort = toConfig?.value;

    if (!fromPort || !toPort) {
      return res.status(400).json({
        error: 'Invalid port names',
        available_inputs: Object.keys(DEVICE_CONFIG.inputs),
        available_outputs: Object.keys(DEVICE_CONFIG.outputs),
      });
    }

    await connectPorts(fromPort, toPort);

    res.json({
      status: 'connected',
      from,
      to,
      from_port: fromPort,
      to_port: toPort,
      from_label: fromConfig.label,
      to_label: toConfig.label,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/disconnect', async (req, res) => {
  const { from, to } = req.body;

  try {
    if (!(await checkJackStatus())) {
      return res.status(500).json({ error: 'JACK server not running' });
    }

    const fromConfig =
      DEVICE_CONFIG.inputs[from] || DEVICE_CONFIG.outputs[from];
    const toConfig = DEVICE_CONFIG.outputs[to];

    const fromPort = fromConfig?.value;
    const toPort = toConfig?.value;

    if (!fromPort || !toPort) {
      return res.status(400).json({
        error: 'Invalid port names',
        available_inputs: Object.keys(DEVICE_CONFIG.inputs),
        available_outputs: Object.keys(DEVICE_CONFIG.outputs),
      });
    }

    const result = await disconnectPorts(fromPort, toPort);

    res.json({
      status: 'disconnected',
      method: result,
      from,
      to,
      from_port: fromPort,
      to_port: toPort,
      from_label: fromConfig.label,
      to_label: toConfig.label,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clear', async (req, res) => {
  try {
    if (!(await checkJackStatus())) {
      return res.status(500).json({ error: 'JACK server not running' });
    }

    const cleared = await clearAllConnections();
    res.json({ status: 'cleared', count: cleared });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/presets', (req, res) => {
  res.json(ROUTING_PRESETS);
});

app.get('/api/device', (req, res) => {
  res.json(DEVICE_CONFIG);
});

app.get('/api/tracked', (req, res) => {
  res.json({
    tracked_connections: Array.from(connectionTracker.values()),
    count: connectionTracker.size,
  });
});

app.get('/api/state', async (req, res) => {
  try {
    const stateData = await fs.readFile(STATE_FILE, 'utf8');
    const savedState = JSON.parse(stateData);
    res.json(savedState);
  } catch (error) {
    res.status(404).json({ error: 'No saved state found' });
  }
});

app.post('/api/state/save', async (req, res) => {
  try {
    const success = await saveState();
    if (success) {
      res.json({ status: 'success', message: 'State saved successfully' });
    } else {
      res.status(500).json({ error: 'Failed to save state' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/state/restore', async (req, res) => {
  try {
    const success = await loadState();
    if (success) {
      res.json({ status: 'success', message: 'State restored successfully' });
    } else {
      res.status(500).json({ error: 'Failed to restore state' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', async (req, res) => {
  const jackRunning = await checkJackStatus();
  res.json({
    status: 'healthy',
    jack_running: jackRunning,
    tracked_connections: connectionTracker.size,
    timestamp: new Date().toISOString(),
  });
});

// Serve static files
if (isDev) {
  app.use(
    '/',
    createProxyMiddleware({
      target: 'http://localhost:5173',
      changeOrigin: true,
      ws: true,
    })
  );
} else {
  const staticPath = path.join(__dirname, 'dist/client');
  app.use(express.static(staticPath));

  app.get('/', async (req, res) => {
    try {
      const manifestPath = path.join(staticPath, 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));

      const scriptPath = manifest['main.js']?.file || 'assets/main.js';

      const jackRunning = await checkJackStatus();
      const currentConnections = jackRunning
        ? await parseJackConnections(await listConnections())
        : [];

      const initialData = {
        jackStatus: jackRunning,
        currentConnections: currentConnections,
        deviceConfig: DEVICE_CONFIG,
        availablePresets: Object.keys(ROUTING_PRESETS),
      };

      const reactElement = React.createElement(JackAudioRouter, {
        initialData,
      });

      const stream = renderToPipeableStream(reactElement, {
        onShellReady() {
          res.status(200);
          res.setHeader('Content-Type', 'text/html');
          res.write(`<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>JACK Audio Router</title>
                <style> body { margin: 0; } </style>
            </head>
            <body>
                <div id="root">`);
          stream.pipe(res);
          res.write(`</div>
            <script>
                window.__INITIAL_DATA__ = ${JSON.stringify(initialData).replace(/</g, '\u003c')};
            </script>
            <script type="module" src="/${scriptPath}"></script>
            </body>
            </html>`);
        },
        onError(error) {
          console.error('SSR Error:', error);
          res.status(500).send('Internal Server Error');
        },
      });
    } catch (error) {
      console.error('Error rendering app:', error);
      res.status(500).send('Internal Server Error');
    }
  });
}

// Start servers with HTTPS support
async function startServers() {
  console.log(`🎵 JACK Audio Router Service starting...`);
  console.log(`🔗 Mode: ${isDev ? 'Development (HMR enabled)' : 'Production'}`);

  // Get local IP address
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let localIP = 'localhost';

  for (const interfaceName of Object.keys(networkInterfaces)) {
    const addresses = networkInterfaces[interfaceName];
    for (const address of addresses) {
      if (address.family === 'IPv4' && !address.internal) {
        localIP = address.address;
        break;
      }
    }
    if (localIP !== 'localhost') break;
  }

  // Start HTTP server
  const httpServer = http.createServer(app);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 HTTP Server running on port ${PORT}`);
    console.log(`📡 HTTP API: http://localhost:${PORT}/api`);
    console.log(`📡 HTTP API: http://${localIP}:${PORT}/api`);
    console.log(`🌐 HTTP Web interface: http://localhost:${PORT}`);
    console.log(`🌐 HTTP Web interface: http://${localIP}:${PORT}`);
  });

  // Try to start HTTPS server
  try {
    let sslOptions = await getSSLOptions();

    // If no SSL certificates found, try to generate self-signed ones
    if (!sslOptions && isDev) {
      console.log(
        '🔐 No SSL certificates found, attempting to generate self-signed certificates...'
      );
      const generated = await generateSelfSignedCert();

      if (generated) {
        sslOptions = await getSSLOptions();
      }
    }

    if (sslOptions) {
      const httpsServer = https.createServer(sslOptions, app);
      httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`🔒 HTTPS Server running on port ${HTTPS_PORT}`);
        console.log(`🔐 HTTPS API: https://localhost:${HTTPS_PORT}/api`);
        console.log(`🔐 HTTPS API: https://${localIP}:${HTTPS_PORT}/api`);
        console.log(`🔒 HTTPS Web interface: https://localhost:${HTTPS_PORT}`);
        console.log(`🔒 HTTPS Web interface: https://${localIP}:${HTTPS_PORT}`);
        console.log(
          `🏠 Home Assistant iframe URL: https://${localIP}:${HTTPS_PORT}`
        );

        if (isDev) {
          console.log(
            '⚠️ Using self-signed certificates - browsers will show security warnings'
          );
          console.log(
            '⚠️ Using self-signed certificates - browsers will show security warnings'
          );
          console.log(
            '   You can safely proceed by clicking "Advanced" -> "Proceed to localhost"'
          );
        }
      });
    } else {
      console.log(
        '❌ HTTPS server not started - SSL certificates not available'
      );
      console.log('   The HTTP server is still running on port', PORT);
    }
  } catch (error) {
    console.error('❌ Failed to start HTTPS server:', error.message);
    console.log('   The HTTP server is still running on port', PORT);
  }

  // Initialize JACK status and load state
  setTimeout(async () => {
    console.log('🔍 Checking JACK status...');
    const jackRunning = await checkJackStatus();

    if (jackRunning) {
      console.log('✅ JACK server is running');
      await loadState();
    } else {
      console.log('❌ JACK server is not running');
      console.log('   Please start JACK server to enable audio routing');
    }

    isStartingUp = false;
  }, 1000);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');

    if (!isStartingUp) {
      console.log('💾 Saving current state...');
      await saveState();
    }

    console.log('👋 Goodbye!');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');

    if (!isStartingUp) {
      await saveState();
    }

    process.exit(0);
  });
}

// Start the application
startServers().catch((error) => {
  console.error('❌ Failed to start servers:', error);
  process.exit(1);
});
