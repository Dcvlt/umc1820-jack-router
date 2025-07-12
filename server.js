// Refactored server.js - Main entry point
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');

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
const { forceHTTPS } = require('./middleware/ssl');
const errorHandler = require('./middleware/errorHandler');

// Utils
const logger = require('./utils/logger');
const { getLocalIP } = require('./utils/network');

const app = express();

// Apply middleware
app.use(corsMiddleware);
app.use(express.json());

// Apply force HTTPS in production if enabled
if (!isDev && process.env.FORCE_HTTPS === 'true') {
  app.use(forceHTTPS);
}

// Mount routes
app.use('/', routes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Server startup
async function startServers() {
  logger.info('🎵 JACK Audio Router Service starting...');
  logger.info(`🔗 Mode: ${isDev ? 'Development (HMR enabled)' : 'Production'}`);

  const localIP = getLocalIP();

  // Start HTTP server
  const httpServer = http.createServer(app);
  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info(`🌐 HTTP Server running on port ${PORT}`);
    logger.info(`📡 HTTP API: http://localhost:${PORT}/api`);
    logger.info(`📡 HTTP API: http://${localIP}:${PORT}/api`);
    logger.info(`🌐 HTTP Web interface: http://localhost:${PORT}`);
    logger.info(`🌐 HTTP Web interface: http://${localIP}:${PORT}`);
  });

  // Try to start HTTPS server
  try {
    const sslOptions = await config.ssl.getSSLOptions();

    if (sslOptions) {
      const httpsServer = https.createServer(sslOptions, app);
      httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        logger.info(`🔒 HTTPS Server running on port ${HTTPS_PORT}`);
        logger.info(`🔐 HTTPS API: https://localhost:${HTTPS_PORT}/api`);
        logger.info(`🔐 HTTPS API: https://${localIP}:${HTTPS_PORT}/api`);
        logger.info(`🔒 HTTPS Web interface: https://localhost:${HTTPS_PORT}`);
        logger.info(`🔒 HTTPS Web interface: https://${localIP}:${HTTPS_PORT}`);
        logger.info(`🏠 Home Assistant iframe URL: https://${localIP}:${HTTPS_PORT}`);

        if (isDev) {
          logger.warn('⚠️ Using self-signed certificates - browsers will show security warnings');
          logger.info('   You can safely proceed by clicking "Advanced" -> "Proceed to localhost"');
        }
      });
    } else {
      logger.error('❌ HTTPS server not started - SSL certificates not available');
      logger.info('   The HTTP server is still running on port', PORT);
    }
  } catch (error) {
    logger.error('❌ Failed to start HTTPS server:', error.message);
    logger.info('   The HTTP server is still running on port', PORT);
  }

  // Initialize services
  await initializeServices();

  // Setup graceful shutdown
  setupGracefulShutdown();
}

async function initializeServices() {
  logger.info('🔍 Initializing services...');

  // Initialize JACK service
  jackService.initialize();

  // Initialize MQTT service if enabled
  if (config.MQTT_ENABLED) {
    const { DEVICE_CONFIG, ROUTING_PRESETS } = require('./constants/constants.cjs');
    const mqttInitialized = mqttService.initialize({
      deviceConfig: DEVICE_CONFIG,
      routingPresets: ROUTING_PRESETS
    });
    
    if (mqttInitialized) {
      logger.info('📡 MQTT service initialized');
    } else {
      logger.warn('📡 MQTT service failed to initialize');
    }
  } else {
    logger.info('📡 MQTT service disabled');
  }

  // Check JACK status and load state
  setTimeout(async () => {
    logger.info('🔍 Checking JACK status...');
    const jackRunning = await jackService.checkStatus();

    if (jackRunning) {
      logger.info('✅ JACK server is running');
      await stateService.loadState();
      
      // Publish initial MQTT status
      if (config.MQTT_ENABLED && mqttService.getStatus().connected) {
        mqttService.publishStatus();
      }
    } else {
      logger.error('❌ JACK server is not running');
      logger.info('   Please start JACK server to enable audio routing');
    }

    // Mark initialization as complete
    jackService.setInitializationComplete();
  }, 1000);

  // Setup auto-save state
  stateService.setupAutoSave();
}

function setupGracefulShutdown() {
  const gracefulShutdown = async (signal) => {
    logger.info(`\n🛑 Received ${signal}, shutting down gracefully...`);

    if (!jackService.isInitializing()) {
      logger.info('💾 Saving current state...');
      await stateService.saveState();
    }

    // Shutdown MQTT service
    if (config.MQTT_ENABLED) {
      mqttService.shutdown();
    }

    logger.info('👋 Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

// Start the application
if (require.main === module) {
  startServers().catch((error) => {
    logger.error('❌ Failed to start servers:', error);
    process.exit(1);
  });
}

module.exports = { app, startServers };