// Refactored server.js - Main entry point with enhanced startup/shutdown logging and connectionService integration
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
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler'); // Fix: destructure the exports

// Utils
const logger = require('./utils/logger');
const { getLocalIP } = require('./utils/network');

const app = express();

// Progress tracking
let startupStep = 0;
let shutdownStep = 0;
const totalStartupSteps = 9;
const totalShutdownSteps = 5;

// State tracking
let isStartingUp = true;
let isShuttingDown = false;
let httpServer = null;
let httpsServer = null;

function createProgressBar(current, total, width = 20) {
  const progress = Math.round((current / total) * 100);
  const filled = Math.floor((progress / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function logStartupStep(step, message, details = null) {
  startupStep = step;
  const progress = Math.round((step / totalStartupSteps) * 100);
  const progressBar = createProgressBar(step, totalStartupSteps);

  logger.info(
    `🚀 [${step}/${totalStartupSteps}] ${progressBar} ${progress}% - ${message}`
  );

  if (details) {
    if (Array.isArray(details)) {
      details.forEach((detail) => logger.info(`   ${detail}`));
    } else {
      logger.info(`   ${details}`);
    }
  }
}

function logShutdownStep(step, message, details = null) {
  shutdownStep = step;
  const progress = Math.round((step / totalShutdownSteps) * 100);
  const progressBar = createProgressBar(step, totalShutdownSteps);

  logger.info(
    `🛑 [${step}/${totalShutdownSteps}] ${progressBar} ${progress}% - ${message}`
  );

  if (details) {
    if (Array.isArray(details)) {
      details.forEach((detail) => logger.info(`   ${detail}`));
    } else {
      logger.info(`   ${details}`);
    }
  }
}

function logServiceReady() {
  const localIP = getLocalIP();

  logger.info('');
  logger.info('🎉 ═══════════════════════════════════════════════════════════');
  logger.info('🎉 ✅ JACK Audio Router Service is Ready!');
  logger.info('🎉 ═══════════════════════════════════════════════════════════');
  logger.info('');
  logger.info('🌐 Available Endpoints:');
  logger.info(`   📡 HTTP API: http://localhost:${PORT}/api`);
  logger.info(`   📡 HTTP API: http://${localIP}:${PORT}/api`);
  logger.info(`   🌐 HTTP Web: http://localhost:${PORT}`);
  logger.info(`   🌐 HTTP Web: http://${localIP}:${PORT}`);

  if (httpsServer) {
    logger.info(`   🔐 HTTPS API: https://localhost:${HTTPS_PORT}/api`);
    logger.info(`   🔐 HTTPS API: https://${localIP}:${HTTPS_PORT}/api`);
    logger.info(`   🔒 HTTPS Web: https://localhost:${HTTPS_PORT}`);
    logger.info(`   🔒 HTTPS Web: https://${localIP}:${HTTPS_PORT}`);
    logger.info(`   🏠 Home Assistant: https://${localIP}:${HTTPS_PORT}`);
  }

  logger.info('');
  logger.info('💡 Quick Commands:');
  logger.info('   🔍 Check status: GET /api/status');
  logger.info('   🔗 List connections: GET /api/connections');
  logger.info('   🎯 Apply preset: POST /api/preset/{presetName}');
  logger.info('   💾 Save state: POST /api/state/save');
  logger.info('');
}

// Apply middleware
logStartupStep(1, 'Initializing Express application', [
  '🔧 Setting up CORS middleware',
  '🔧 Configuring JSON parsing',
  '🔧 Setting up SSL middleware (if enabled)',
]);

app.use(corsMiddleware);
app.use(express.json());

// Apply force HTTPS in production if enabled
if (!isDev && process.env.FORCE_HTTPS === 'true') {
  app.use(forceHTTPS);
  logger.info('   🔒 Force HTTPS enabled for production');
}

// Mount routes
logStartupStep(
  2,
  'Mounting application routes',
  '🛣️ API and web routes configured'
);
app.use('/', routes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Server startup
async function startServers() {
  logger.info('');
  logger.info('🎵 ═══════════════════════════════════════════════════════════');
  logger.info('🎵 JACK Audio Router Service Starting...');
  logger.info('🎵 ═══════════════════════════════════════════════════════════');
  logger.info(`🎵 Mode: ${isDev ? 'Development (HMR enabled)' : 'Production'}`);
  logger.info(`🎵 Node.js Version: ${process.version}`);
  logger.info(`🎵 Platform: ${process.platform} ${process.arch}`);
  logger.info('');

  const localIP = getLocalIP();

  // Start HTTP server
  logStartupStep(3, 'Starting HTTP server', `🌐 Binding to 0.0.0.0:${PORT}`);

  httpServer = http.createServer(app);

  await new Promise((resolve, reject) => {
    httpServer.listen(PORT, '0.0.0.0', (error) => {
      if (error) {
        logger.error(`❌ Failed to start HTTP server: ${error.message}`);
        reject(error);
        return;
      }

      logger.info(`   ✅ HTTP Server listening on port ${PORT}`);
      resolve();
    });
  });

  // Try to start HTTPS server
  logStartupStep(
    4,
    'Starting HTTPS server',
    '🔒 Attempting to load SSL certificates'
  );

  try {
    const sslOptions = await config.ssl.getSSLOptions();

    if (sslOptions) {
      httpsServer = https.createServer(sslOptions, app);

      await new Promise((resolve, reject) => {
        httpsServer.listen(HTTPS_PORT, '0.0.0.0', (error) => {
          if (error) {
            logger.error(`❌ Failed to start HTTPS server: ${error.message}`);
            reject(error);
            return;
          }

          logger.info(`   ✅ HTTPS Server listening on port ${HTTPS_PORT}`);

          if (isDev) {
            logger.warn(
              '   ⚠️ Using self-signed certificates - browsers will show security warnings'
            );
            logger.info(
              '     You can safely proceed by clicking "Advanced" -> "Proceed to localhost"'
            );
          }
          resolve();
        });
      });
    } else {
      logger.warn(
        '   ⚠️ HTTPS server not started - SSL certificates not available'
      );
      logger.info('     The HTTP server is still running on port ' + PORT);
    }
  } catch (error) {
    logger.error(`   ❌ Failed to start HTTPS server: ${error.message}`);
    logger.info('     The HTTP server is still running on port ' + PORT);
  }

  // Initialize services
  await initializeServices();

  // Setup graceful shutdown
  logStartupStep(9, 'Setting up graceful shutdown handlers', [
    '🛡️ SIGINT handler registered',
    '🛡️ SIGTERM handler registered',
    '🛡️ Process exit handler registered',
  ]);
  setupGracefulShutdown();

  // Mark startup as complete
  isStartingUp = false;

  logServiceReady();
}

async function initializeServices() {
  logStartupStep(
    5,
    'Initializing core services',
    '🔧 Starting service initialization'
  );

  // Initialize JACK service
  logger.info('   🎛️ Initializing JACK service...');
  jackService.initialize();
  logger.info('   ✅ JACK service initialized');

  // Initialize connection service (it uses jackService internally)
  logger.info('   🔗 Initializing connection service...');
  // ConnectionService is already instantiated in its module
  logger.info('   ✅ Connection service initialized');

  // Initialize MQTT service if enabled
  if (config.mqtt.enabled) {
    logStartupStep(
      6,
      'Initializing MQTT service',
      '📡 Loading device configuration and presets'
    );

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
        logger.info('   ✅ MQTT service initialized successfully');
        logger.info('   📡 MQTT broker connection established');
      } else {
        logger.warn('   ⚠️ MQTT service failed to initialize');
        logger.warn('   📡 MQTT functionality will be disabled');
      }
    } catch (error) {
      logger.error(`   ❌ MQTT initialization error: ${error.message}`);
      logger.warn('   📡 MQTT functionality will be disabled');
    }
  } else {
    logger.info('   📡 MQTT service disabled in configuration');
  }

  // Check JACK status and load state
  logStartupStep(7, 'Performing JACK status check and state restoration', [
    '🔍 Checking JACK server connectivity',
    '💾 Loading previous audio routing state',
  ]);

  // Use a timeout to prevent hanging on JACK check
  const jackCheckTimeout = new Promise((resolve) => {
    setTimeout(() => {
      logger.warn('   ⚠️ JACK status check timed out after 5 seconds');
      resolve(false);
    }, 5000);
  });

  const jackCheckPromise = new Promise(async (resolve) => {
    try {
      logger.info('   🔍 Checking JACK server status...');
      const jackRunning = await jackService.checkStatus();
      resolve(jackRunning);
    } catch (error) {
      logger.error(`   ❌ JACK status check failed: ${error.message}`);
      resolve(false);
    }
  });

  const jackRunning = await Promise.race([jackCheckPromise, jackCheckTimeout]);

  if (jackRunning) {
    logger.info('   ✅ JACK server is running and accessible');

    // Test connection service integration
    try {
      logger.info('   🔗 Testing connection service integration...');
      const trackedCount = connectionService.getTrackedConnectionsCount();
      logger.info(
        `   📊 Connection tracker initialized (${trackedCount} tracked connections)`
      );
    } catch (error) {
      logger.warn(
        `   ⚠️ Connection service integration test failed: ${error.message}`
      );
    }

    try {
      logger.info('   💾 Loading previous audio routing state...');
      await stateService.loadState();
      logger.info('   ✅ Previous state loaded successfully');
    } catch (error) {
      logger.warn(`   ⚠️ Failed to load previous state: ${error.message}`);
    }

    // Publish initial MQTT status
    if (config.mqtt.enabled && mqttService.getStatus().connected) {
      logger.info('   📡 Publishing initial MQTT status...');
      try {
        mqttService.publishStatus();
        logger.info('   ✅ Initial MQTT status published');
      } catch (error) {
        logger.warn(`   ⚠️ Failed to publish MQTT status: ${error.message}`);
      }
    }
  } else {
    logger.error('   ❌ JACK server is not running or not accessible');
    logger.info('   💡 Please start JACK server to enable audio routing');
    logger.info(
      '   💡 The web interface will still be available for configuration'
    );
  }

  // Setup auto-save and periodic tasks
  logStartupStep(8, 'Setting up periodic tasks', [
    '💾 Configuring automatic state saving',
    '🔄 Setting up connection health checks',
  ]);

  // Mark initialization as complete
  jackService.setInitializationComplete();
  logger.info('   🎯 Service initialization marked as complete');

  // Setup auto-save state
  try {
    logger.info('   💾 Setting up automatic state saving...');
    stateService.setupAutoSave();
    logger.info('   ✅ Auto-save configured successfully (30s intervals)');
  } catch (error) {
    logger.warn(`   ⚠️ Failed to setup auto-save: ${error.message}`);
  }

  // Setup periodic connection health check
  try {
    logger.info('   🔄 Setting up connection health monitoring...');
    setInterval(async () => {
      if (!isStartingUp && !isShuttingDown) {
        try {
          const currentConnections =
            await connectionService.getCurrentConnections();
          const trackedCount = connectionService.getTrackedConnectionsCount();

          // Log health status periodically (every 10 minutes)
          if (Date.now() % 600000 < 30000) {
            // Rough 10-minute interval
            logger.info(
              `🔄 Connection Health: ${currentConnections.length} active, ${trackedCount} tracked`
            );
          }
        } catch (error) {
          // Silent fail for health checks to avoid spam
        }
      }
    }, 30000); // Check every 30 seconds

    logger.info('   ✅ Connection health monitoring configured');
  } catch (error) {
    logger.warn(
      `   ⚠️ Failed to setup connection monitoring: ${error.message}`
    );
  }

  // Log final service status
  logger.info('');
  logger.info('📊 Service Status Summary:');
  logger.info(
    `   🎛️ JACK Service: ${jackRunning ? '✅ Connected' : '❌ Disconnected'}`
  );
  logger.info(
    `   🔗 Connection Service: ✅ Active (${connectionService.getTrackedConnectionsCount()} tracked)`
  );
  logger.info(
    `   📡 MQTT Service: ${config.mqtt.enabled ? (mqttService.getStatus().connected ? '✅ Connected' : '❌ Disconnected') : '➖ Disabled'}`
  );
  logger.info(`   💾 State Service: ✅ Active`);
  logger.info(`   🌐 HTTP Server: ✅ Running on port ${PORT}`);
  logger.info(
    `   🔒 HTTPS Server: ${httpsServer ? '✅ Running on port ' + HTTPS_PORT : '➖ Disabled'}`
  );
  logger.info('');
}

function setupGracefulShutdown() {
  // Enhanced graceful shutdown with progress tracking
  async function gracefulShutdown(signal) {
    if (isShuttingDown) {
      logger.warn('🛑 Shutdown already in progress, forcing exit...');
      process.exit(1);
    }

    isShuttingDown = true;

    logger.info('');
    logger.info(
      '🛑 ═══════════════════════════════════════════════════════════'
    );
    logger.info(`🛑 Received ${signal}, initiating graceful shutdown...`);
    logger.info(
      '🛑 ═══════════════════════════════════════════════════════════'
    );
    logger.info('');

    try {
      // Step 1: Save current state
      logShutdownStep(1, 'Saving current application state', [
        '💾 Persisting audio routing configuration',
        '🔗 Saving connection tracker state',
      ]);

      if (!isStartingUp) {
        try {
          await stateService.saveState();
          logger.info('   ✅ Application state saved successfully');

          // Save connection tracker state
          const trackedConnections = connectionService.getTrackedConnections();
          logger.info(
            `   📊 Saved ${trackedConnections.length} tracked connections`
          );
        } catch (error) {
          logger.error(`   ❌ Failed to save state: ${error.message}`);
        }
      } else {
        logger.info('   ℹ️ Skipping state save - startup was incomplete');
      }

      // Step 2: Stop MQTT service
      logShutdownStep(
        2,
        'Stopping MQTT service',
        '📡 Closing MQTT connections'
      );

      if (config.mqtt.enabled) {
        try {
          mqttService.disconnect();
          logger.info('   ✅ MQTT service stopped');
        } catch (error) {
          logger.warn(`   ⚠️ MQTT service stop error: ${error.message}`);
        }
      } else {
        logger.info('   ➖ MQTT service was not enabled');
      }

      // Step 3: Stop HTTP servers
      logShutdownStep(3, 'Stopping HTTP/HTTPS servers', [
        '🌐 Closing HTTP server connections',
        '🔒 Closing HTTPS server connections',
      ]);

      const serverClosePromises = [];

      if (httpServer) {
        serverClosePromises.push(
          new Promise((resolve) => {
            httpServer.close((error) => {
              if (error) {
                logger.warn(`   ⚠️ HTTP server close error: ${error.message}`);
              } else {
                logger.info('   ✅ HTTP server stopped');
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
                logger.warn(`   ⚠️ HTTPS server close error: ${error.message}`);
              } else {
                logger.info('   ✅ HTTPS server stopped');
              }
              resolve();
            });
          })
        );
      }

      await Promise.all(serverClosePromises);

      // Step 4: Clean up services
      logShutdownStep(4, 'Cleaning up services', [
        '🧹 Clearing connection tracker',
        '🔧 Stopping periodic tasks',
      ]);

      try {
        connectionService.clearTracker();
        logger.info('   ✅ Connection tracker cleared');
      } catch (error) {
        logger.warn(`   ⚠️ Connection tracker cleanup error: ${error.message}`);
      }

      // Step 5: Final shutdown
      logShutdownStep(5, 'Finalizing shutdown', '👋 Preparing to exit process');

      logger.info('');
      logger.info(
        '✅ ═══════════════════════════════════════════════════════════'
      );
      logger.info('✅ Graceful shutdown completed successfully');
      logger.info(
        '✅ ═══════════════════════════════════════════════════════════'
      );
      logger.info('👋 Goodbye!');
      logger.info('');

      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during graceful shutdown:', error.message);
      logger.error('🛑 Forcing exit...');
      process.exit(1);
    }
  }

  // Register signal handlers
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught Exception:', error.message);
    logger.error('🛑 Stack trace:', error.stack);
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
  httpServer,
  httpsServer,
};
