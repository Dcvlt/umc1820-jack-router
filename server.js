// server.js - Updated for Docker with HTTPS and Home Assistant integration
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs').promises;

// Configuration
const config = require('./config');
const { isDev, PORT, HTTPS_PORT } = require('./config/environment');

// Services
const jackService = require('./services/jackService');
const connectionService = require('./services/connectionService');
const stateService = require('./services/stateService');
const mqttService = require('./services/mqttService');

// Routes
const routes = require('./routes');

// Middleware
const corsMiddleware = require('./middleware/cors');
const { errorHandler } = require('./middleware/errorHandler');

// Utils
const logger = require('./utils/logger');
const { getLocalIP } = require('./utils/network');

const app = express();

// Enhanced CORS for Home Assistant iframe support
const homeAssistantCors = (req, res, next) => {
  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim());
  const origin = req.headers.origin;

  // Allow requests from allowed origins
  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  // Required headers for Home Assistant iframe
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin,X-Requested-With,Content-Type,Accept,Authorization'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
};

// Security headers for Home Assistant integration
const securityHeaders = (req, res, next) => {
  // Content Security Policy for iframe embedding
  const frameAncestors =
    process.env.CSP_FRAME_ANCESTORS || 'https://homeassistant.local:8123';
  res.header(
    'Content-Security-Policy',
    `frame-ancestors ${frameAncestors}; default-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: wss:;`
  );

  // Remove X-Frame-Options to allow iframe embedding
  res.removeHeader('X-Frame-Options');

  // Set other security headers
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Permissions-Policy', 'microphone=(), camera=(), geolocation=()');

  next();
};

// Force HTTPS redirect (required for Home Assistant)
const forceHTTPS = (req, res, next) => {
  if (
    process.env.FORCE_HTTPS === 'true' &&
    req.header('x-forwarded-proto') !== 'https' &&
    !req.secure
  ) {
    const httpsUrl = `https://${req.get('host').replace(/:\d+/, `:${HTTPS_PORT}`)}${req.url}`;
    logger.info(`🔄 Redirecting HTTP to HTTPS: ${httpsUrl}`);
    return res.redirect(301, httpsUrl);
  }
  next();
};

// Apply middleware
app.use(forceHTTPS);
app.use(homeAssistantCors);
app.use(securityHeaders);
app.use(express.json());

// Mount routes
app.use('/', routes);

// Error handling middleware
app.use(errorHandler);

// Enhanced SSL configuration for Docker
async function getSSLOptions() {
  try {
    const sslKeyPath =
      process.env.SSL_KEY_PATH || path.join(__dirname, 'ssl', 'private.key');
    const sslCertPath =
      process.env.SSL_CERT_PATH ||
      path.join(__dirname, 'ssl', 'certificate.crt');
    const sslCaPath =
      process.env.SSL_CA_PATH || path.join(__dirname, 'ssl', 'ca_bundle.crt');

    logger.info(`🔒 Loading SSL certificates from Docker volume...`);
    logger.info(`   Key: ${sslKeyPath}`);
    logger.info(`   Cert: ${sslCertPath}`);

    const options = {
      key: await fs.readFile(sslKeyPath, 'utf8'),
      cert: await fs.readFile(sslCertPath, 'utf8'),
    };

    // Add CA bundle if it exists
    try {
      const ca = await fs.readFile(sslCaPath, 'utf8');
      options.ca = ca;
      logger.info(`   CA Bundle: ${sslCaPath}`);
    } catch (error) {
      logger.info('   No CA bundle found (optional)');
    }

    return options;
  } catch (error) {
    logger.error('❌ SSL certificate files not found:', error.message);

    // Auto-generate if enabled and in Docker
    if (process.env.SSL_AUTO_GENERATE === 'true') {
      logger.info(
        '🔐 SSL_AUTO_GENERATE is enabled, attempting to generate certificates...'
      );
      const generated = await generateSelfSignedCert();
      if (generated) {
        return await getSSLOptions();
      }
    }

    throw new Error(
      'SSL certificates not available and auto-generation failed'
    );
  }
}

// Generate self-signed certificate for Docker
async function generateSelfSignedCert() {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    const sslDir = path.join(__dirname, 'ssl');
    const keyPath = path.join(sslDir, 'private.key');
    const certPath = path.join(sslDir, 'certificate.crt');

    // Ensure SSL directory exists
    await fs.mkdir(sslDir, { recursive: true });

    // Check if certificates already exist
    try {
      await fs.access(keyPath);
      await fs.access(certPath);
      logger.info('✅ SSL certificates already exist');
      return true;
    } catch (error) {
      // Certificates don't exist, generate them
    }

    logger.info('🔐 Generating self-signed SSL certificate for Docker...');

    // Get container hostname and local IP
    const hostname = process.env.HOSTNAME || 'localhost';
    const localIP = getLocalIP();

    const opensslCommand = `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/C=US/ST=Docker/L=Container/O=JACK Audio Router/CN=${hostname}" -addext "subjectAltName=DNS:localhost,DNS:*.localhost,DNS:${hostname},IP:127.0.0.1,IP:0.0.0.0,IP:${localIP}"`;

    await execAsync(opensslCommand);

    logger.info('✅ Self-signed SSL certificate generated successfully');
    logger.warn(
      '⚠️ Note: Browsers will show a security warning for self-signed certificates'
    );
    logger.info(
      '   For Home Assistant: You can accept the certificate or add it to trusted certificates'
    );

    return true;
  } catch (error) {
    logger.error(
      '❌ Failed to generate self-signed certificate:',
      error.message
    );
    return false;
  }
}

// Server startup with Docker support
async function startServers() {
  logger.info('');
  logger.info('🎵 ═══════════════════════════════════════════════════════════');
  logger.info('🎵 JACK Audio Router Service Starting (Docker Mode)...');
  logger.info('🎵 ═══════════════════════════════════════════════════════════');
  logger.info(`🎵 Mode: ${isDev ? 'Development' : 'Production'}`);
  logger.info(`🎵 Node.js Version: ${process.version}`);
  logger.info(`🎵 Container: ${process.env.HOSTNAME || 'localhost'}`);
  logger.info('');

  const localIP = getLocalIP();
  let httpServer = null;
  let httpsServer = null;

  // Start HTTP server (will redirect to HTTPS if FORCE_HTTPS is enabled)
  logger.info(`🌐 Starting HTTP server on port ${PORT}...`);
  httpServer = http.createServer(app);

  await new Promise((resolve, reject) => {
    httpServer.listen(PORT, '0.0.0.0', (error) => {
      if (error) {
        logger.error(`❌ Failed to start HTTP server: ${error.message}`);
        reject(error);
        return;
      }
      logger.info(`✅ HTTP Server listening on port ${PORT}`);
      if (process.env.FORCE_HTTPS === 'true') {
        logger.info(`   (HTTP requests will be redirected to HTTPS)`);
      }
      resolve();
    });
  });

  // Start HTTPS server (REQUIRED for Home Assistant iframe)
  try {
    logger.info(`🔒 Starting HTTPS server on port ${HTTPS_PORT}...`);
    const sslOptions = await getSSLOptions();

    httpsServer = https.createServer(sslOptions, app);

    await new Promise((resolve, reject) => {
      httpsServer.listen(HTTPS_PORT, '0.0.0.0', (error) => {
        if (error) {
          logger.error(`❌ Failed to start HTTPS server: ${error.message}`);
          reject(error);
          return;
        }

        logger.info(`✅ HTTPS Server listening on port ${HTTPS_PORT}`);
        resolve();
      });
    });
  } catch (error) {
    logger.error(`❌ Failed to start HTTPS server: ${error.message}`);
    logger.error('🚨 HTTPS is REQUIRED for Home Assistant iframe integration!');
    throw error;
  }

  // Initialize services
  await initializeServices();

  // Setup graceful shutdown
  setupGracefulShutdown(httpServer, httpsServer);

  // Display access information
  logger.info('');
  logger.info('🎉 ═══════════════════════════════════════════════════════════');
  logger.info('🎉 ✅ JACK Audio Router Service is Ready!');
  logger.info('🎉 ═══════════════════════════════════════════════════════════');
  logger.info('');
  logger.info('🌐 Available Endpoints:');
  logger.info(`   🔒 HTTPS Web (Primary): https://localhost:${HTTPS_PORT}`);
  logger.info(`   🔒 HTTPS API: https://localhost:${HTTPS_PORT}/api`);
  logger.info(`   📡 HTTP (Redirects): http://localhost:${PORT}`);
  logger.info('');
  logger.info('🏠 Home Assistant Integration:');
  logger.info(`   🖼️ Iframe URL: https://localhost:${HTTPS_PORT}`);
  logger.info(`   📡 MQTT Broker: mqtt://localhost:1883`);
  logger.info(`   🔗 Bridge API: http://localhost:6666`);
  logger.info('');
  logger.info('💡 Important Notes:');
  logger.info('   • HTTPS is REQUIRED for Home Assistant iframe embedding');
  logger.info('   • Accept the self-signed certificate in your browser');
  logger.info(
    '   • Add the certificate to trusted certificates for production'
  );
  logger.info('');
}

// Initialize services with Docker awareness
async function initializeServices() {
  logger.info('🔧 Initializing services for Docker environment...');

  // Initialize JACK service (connects to Bridge container)
  logger.info('🎛️ Initializing JACK service...');
  await jackService.initialize();
  logger.info('✅ JACK service initialized');

  // Initialize connection service
  logger.info('🔗 Initializing connection service...');
  // ConnectionService is already instantiated
  logger.info('✅ Connection service initialized');

  // Initialize MQTT service if enabled
  if (process.env.MQTT_ENABLED === 'true') {
    logger.info('📡 Initializing MQTT service...');
    try {
      const {
        DEVICE_CONFIG,
        ROUTING_PRESETS,
      } = require('./constants/constants.cjs');
      const mqttInitialized = mqttService.initialize({
        deviceConfig: DEVICE_CONFIG,
        routingPresets: ROUTING_PRESETS,
      });

      if (mqttInitialized) {
        logger.info('✅ MQTT service initialized successfully');
      } else {
        logger.warn('⚠️ MQTT service failed to initialize');
      }
    } catch (error) {
      logger.error(`❌ MQTT initialization error: ${error.message}`);
    }
  } else {
    logger.info('📡 MQTT service disabled');
  }

  // Check JACK Bridge status
  logger.info('🌉 Checking JACK Bridge connection...');
  try {
    const bridgeHealth = await jackService.getBridgeHealth();
    if (bridgeHealth.healthy) {
      logger.info('✅ JACK Bridge service is healthy');
    } else {
      logger.warn('⚠️ JACK Bridge service health check failed');
    }
  } catch (error) {
    logger.error('❌ JACK Bridge service not available:', error.message);
  }

  // Setup auto-save
  logger.info('💾 Setting up automatic state saving...');
  stateService.startAutoSave();
  logger.info('✅ Auto-save configured');

  // Mark initialization as complete
  jackService.setInitializationComplete();
  logger.info('🎯 Service initialization complete');
}

// Graceful shutdown for Docker
function setupGracefulShutdown(httpServer, httpsServer) {
  async function gracefulShutdown(signal) {
    logger.info('');
    logger.info(`🛑 Received ${signal}, initiating graceful shutdown...`);

    try {
      // Stop auto-save
      stateService.stopAutoSave();

      // Save current state
      await stateService.saveState();
      logger.info('💾 Application state saved');

      // Stop MQTT service
      if (process.env.MQTT_ENABLED === 'true') {
        mqttService.shutdown();
        logger.info('📡 MQTT service stopped');
      }

      // Stop JACK service
      await jackService.shutdown();
      logger.info('🎛️ JACK service stopped');

      // Close servers
      const serverClosePromises = [];

      if (httpServer) {
        serverClosePromises.push(
          new Promise((resolve) => {
            httpServer.close((error) => {
              if (error) {
                logger.warn(`⚠️ HTTP server close error: ${error.message}`);
              } else {
                logger.info('🌐 HTTP server stopped');
              }
              resolve();
            });
          })
        );
      }

      if (httpsServer) {
        serverClosePromises.push(
          new Promise((resolve) => {
            httpsServer.close((error) => {
              if (error) {
                logger.warn(`⚠️ HTTPS server close error: ${error.message}`);
              } else {
                logger.info('🔒 HTTPS server stopped');
              }
              resolve();
            });
          })
        );
      }

      await Promise.all(serverClosePromises);

      logger.info('✅ Graceful shutdown completed successfully');
      logger.info('👋 Goodbye!');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during graceful shutdown:', error.message);
      process.exit(1);
    }
  }

  // Register signal handlers
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught Exception:', error.message);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Unhandled Rejection at:', promise);
    logger.error('❌ Reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
  });
}

// Start the application
startServers().catch((error) => {
  logger.error('❌ Failed to start servers:', error.message);
  logger.error('❌ Stack trace:', error.stack);
  process.exit(1);
});

// Export for testing
module.exports = {
  app,
  startServers,
};
