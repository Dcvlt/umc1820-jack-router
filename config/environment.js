// config/environment.js - Environment configuration
const path = require('path');

/**
 * Environment configuration with defaults and validation
 */

// Load environment variables from .env file if it exists
try {
  require('dotenv').config();
} catch (error) {
  // dotenv is optional, continue without it
}

// Environment detection
const NODE_ENV = process.env.NODE_ENV || 'development';
const isDev = NODE_ENV === 'development';
const isProd = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

// Server configuration
const PORT = parseInt(process.env.PORT || '3001', 10);
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '3443', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Validate ports
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}. Must be a number between 1 and 65535.`);
}

if (isNaN(HTTPS_PORT) || HTTPS_PORT < 1 || HTTPS_PORT > 65535) {
  throw new Error(`Invalid HTTPS_PORT: ${process.env.HTTPS_PORT}. Must be a number between 1 and 65535.`);
}

// SSL configuration
const FORCE_HTTPS = process.env.FORCE_HTTPS === 'true';
const SSL_AUTO_GENERATE = process.env.SSL_AUTO_GENERATE !== 'false'; // Default to true

// Logging configuration
const LOG_LEVEL = (process.env.LOG_LEVEL || (isDev ? 'DEBUG' : 'INFO')).toUpperCase();
const LOG_COLORS = process.env.LOG_COLORS !== 'false'; // Default to true unless explicitly disabled

// Validate log level
const validLogLevels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
if (!validLogLevels.includes(LOG_LEVEL)) {
  console.warn(`Invalid LOG_LEVEL: ${LOG_LEVEL}. Using INFO. Valid levels: ${validLogLevels.join(', ')}`);
}

// JACK configuration
const JACK_TIMEOUT = parseInt(process.env.JACK_TIMEOUT || '10000', 10);
const JACK_STATUS_CACHE_TTL = parseInt(process.env.JACK_STATUS_CACHE_TTL || '5000', 10);
const JACK_TOOLS_PATH = process.env.JACK_TOOLS_PATH || 'C:/PROGRA~1/JACK2/tools';

// State management configuration
const STATE_AUTO_SAVE_INTERVAL = parseInt(process.env.STATE_AUTO_SAVE_INTERVAL || '30000', 10);
const STATE_BACKUP_ENABLED = process.env.STATE_BACKUP_ENABLED !== 'false';

// Paths
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SSL_DIR = path.join(PROJECT_ROOT, 'ssl');
const STATE_DIR = path.join(PROJECT_ROOT, 'state');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

// CORS configuration
const CORS_ORIGINS = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : isDev 
    ? [
        'http://localhost:3000',
        'http://localhost:3001', 
        'http://localhost:5173',
        'https://localhost:3443'
      ]
    : ['*']; // Allow all in production by default (adjust as needed)

// Security configuration
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED === 'true';
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

// Health check configuration
const HEALTH_CHECK_TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10);
const HEALTH_CHECK_CACHE_TTL = parseInt(process.env.HEALTH_CHECK_CACHE_TTL || '10000', 10);

// Development configuration
const DEV_PROXY_TARGET = process.env.DEV_PROXY_TARGET || 'http://localhost:5173';
const HOT_RELOAD_ENABLED = process.env.HOT_RELOAD_ENABLED !== 'false' && isDev;

// Feature flags
const FEATURES = {
  SSL_ENABLED: process.env.FEATURE_SSL_ENABLED !== 'false',
  STATE_PERSISTENCE: process.env.FEATURE_STATE_PERSISTENCE !== 'false',
  CONNECTION_TRACKING: process.env.FEATURE_CONNECTION_TRACKING !== 'false',
  HEALTH_MONITORING: process.env.FEATURE_HEALTH_MONITORING !== 'false',
  PRESET_VALIDATION: process.env.FEATURE_PRESET_VALIDATION !== 'false'
};

// Validation functions
function validateTimeout(value, name, defaultValue) {
  const timeout = parseInt(value || defaultValue, 10);
  if (isNaN(timeout) || timeout < 1000) {
    console.warn(`Invalid ${name}: ${value}. Using default: ${defaultValue}ms`);
    return parseInt(defaultValue, 10);
  }
  return timeout;
}

// Apply validation
const validatedConfig = {
  // Environment
  NODE_ENV,
  isDev,
  isProd,
  isTest,
  
  // Server
  PORT,
  HTTPS_PORT,
  HOST,
  
  // SSL
  FORCE_HTTPS,
  SSL_AUTO_GENERATE,
  
  // Logging
  LOG_LEVEL,
  LOG_COLORS,
  
  // JACK
  JACK_TIMEOUT: validateTimeout(process.env.JACK_TIMEOUT, 'JACK_TIMEOUT', '10000'),
  JACK_STATUS_CACHE_TTL: validateTimeout(process.env.JACK_STATUS_CACHE_TTL, 'JACK_STATUS_CACHE_TTL', '5000'),
  JACK_TOOLS_PATH,
  
  // State
  STATE_AUTO_SAVE_INTERVAL: validateTimeout(process.env.STATE_AUTO_SAVE_INTERVAL, 'STATE_AUTO_SAVE_INTERVAL', '30000'),
  STATE_BACKUP_ENABLED,
  
  // MQTT
  MQTT_ENABLED,
  MQTT_HOST,
  MQTT_USERNAME,
  MQTT_PASSWORD,
  MQTT_CLIENT_ID,
  MQTT_KEEPALIVE,
  MQTT_RECONNECT_PERIOD,
  
  // Device info
  DEVICE_MODEL,
  DEVICE_MANUFACTURER,
  
  // Paths
  PROJECT_ROOT,
  SSL_DIR,
  STATE_DIR,
  DIST_DIR,
  
  // CORS
  CORS_ORIGINS,
  
  // Security
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  
  // Health
  HEALTH_CHECK_TIMEOUT: validateTimeout(process.env.HEALTH_CHECK_TIMEOUT, 'HEALTH_CHECK_TIMEOUT', '5000'),
  HEALTH_CHECK_CACHE_TTL: validateTimeout(process.env.HEALTH_CHECK_CACHE_TTL, 'HEALTH_CHECK_CACHE_TTL', '10000'),
  
  // Development
  DEV_PROXY_TARGET,
  HOT_RELOAD_ENABLED,
  
  // Features
  FEATURES
};

// Environment-specific overrides
if (isTest) {
  validatedConfig.LOG_LEVEL = 'ERROR'; // Reduce noise in tests
  validatedConfig.STATE_AUTO_SAVE_INTERVAL = 60000; // Less frequent saves in tests
  validatedConfig.JACK_STATUS_CACHE_TTL = 1000; // Shorter cache for tests
}

// Log configuration summary in development
if (isDev) {
  console.log('🔧 Environment Configuration:');
  console.log(`   Environment: ${NODE_ENV}`);
  console.log(`   HTTP Port: ${PORT}`);
  console.log(`   HTTPS Port: ${HTTPS_PORT}`);
  console.log(`   Log Level: ${validatedConfig.LOG_LEVEL}`);
  console.log(`   JACK Tools: ${JACK_TOOLS_PATH}`);
  console.log(`   SSL Auto-Generate: ${SSL_AUTO_GENERATE}`);
  console.log(`   Features: ${Object.entries(FEATURES).filter(([_, enabled]) => enabled).map(([name]) => name).join(', ')}`);
}

// Export configuration object
module.exports = validatedConfig;

// Export individual values for convenience
module.exports.NODE_ENV = NODE_ENV;
module.exports.isDev = isDev;
module.exports.isProd = isProd;
module.exports.isTest = isTest;
module.exports.PORT = PORT;
module.exports.HTTPS_PORT = HTTPS_PORT;
module.exports.HOST = HOST;
module.exports.LOG_LEVEL = validatedConfig.LOG_LEVEL;
module.exports.JACK_TIMEOUT = validatedConfig.JACK_TIMEOUT;
module.exports.JACK_TOOLS_PATH = JACK_TOOLS_PATH;
module.exports.FEATURES = FEATURES;