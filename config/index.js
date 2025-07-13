// config/index.js - Configuration loader
const environment = require('./environment');
const ssl = require('./ssl');

/**
 * Main configuration module that aggregates all configuration sources
 * This is the single entry point for all configuration needs
 */

// Re-export environment configuration
const config = {
  ...environment,

  // Add SSL configuration
  ssl: ssl,

  // Additional derived configuration
  server: {
    http: {
      port: environment.PORT,
      host: environment.HOST,
    },
    https: {
      port: environment.HTTPS_PORT,
      host: environment.HOST,
      enabled: environment.FEATURES.SSL_ENABLED,
    },
  },

  // MQTT configuration
  mqtt: {
    enabled: environment.MQTT_ENABLED,
    host: environment.MQTT_HOST,
    clientId: environment.MQTT_CLIENT_ID,
    username: environment.MQTT_USERNAME,
    password: environment.MQTT_PASSWORD,
  },

  // JACK configuration object
  jack: {
    toolsPath: environment.JACK_TOOLS_PATH,
    timeout: environment.JACK_TIMEOUT,
    statusCacheTTL: environment.JACK_STATUS_CACHE_TTL,
    commands: {
      lsp: `${environment.JACK_TOOLS_PATH}/jack_lsp.exe`,
      connect: `${environment.JACK_TOOLS_PATH}/jack_connect.exe`,
      qjackctl: 'C:/PROGRA~1/JACK2/qjackctl.exe',
    },
  },

  // State management configuration
  state: {
    autoSaveInterval: environment.STATE_AUTO_SAVE_INTERVAL,
    backupEnabled: environment.STATE_BACKUP_ENABLED,
    stateFile: require('path').join(
      environment.STATE_DIR,
      'audio_router_state.json'
    ),
    backupFile: require('path').join(
      environment.STATE_DIR,
      'audio_router_state.backup.json'
    ),
  },

  // CORS configuration
  cors: {
    origins: environment.CORS_ORIGINS,
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  },

  // Rate limiting configuration
  rateLimit: {
    enabled: environment.RATE_LIMIT_ENABLED,
    windowMs: environment.RATE_LIMIT_WINDOW_MS,
    maxRequests: environment.RATE_LIMIT_MAX_REQUESTS,
  },

  // Health check configuration
  health: {
    timeout: environment.HEALTH_CHECK_TIMEOUT,
    cacheTTL: environment.HEALTH_CHECK_CACHE_TTL,
  },

  // Development configuration
  development: {
    proxyTarget: environment.DEV_PROXY_TARGET,
    hotReload: environment.HOT_RELOAD_ENABLED,
  },
};

/**
 * Get configuration value by path
 * @param {string} path - Dot-separated path to configuration value
 * @param {*} defaultValue - Default value if path not found
 * @returns {*} Configuration value
 *
 * @example
 * config.get('server.http.port') // Returns HTTP port
 * config.get('jack.timeout', 5000) // Returns JACK timeout or 5000 if not found
 */
config.get = function (path, defaultValue) {
  const keys = path.split('.');
  let current = this;

  for (const key of keys) {
    if (current === null || current === undefined || !(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }

  return current;
};

/**
 * Check if a feature is enabled
 * @param {string} featureName - Name of the feature
 * @returns {boolean} True if feature is enabled
 */
config.isFeatureEnabled = function (featureName) {
  return this.FEATURES[featureName] === true;
};

/**
 * Get SSL options for HTTPS server
 * @returns {Promise<Object|null>} SSL options or null if not available
 */
config.getSSLOptions = function () {
  return ssl.getSSLOptions();
};

/**
 * Generate self-signed certificate for development
 * @returns {Promise<boolean>} True if successful
 */
config.generateSelfSignedCert = function () {
  return ssl.generateSelfSignedCert();
};

// Replace the JACK validation section in config/index.js validate() function:

/**
 * Validate configuration
 * @returns {Array} Array of validation errors (empty if valid)
 */
config.validate = function () {
  const errors = [];

  // Check required paths exist
  const fs = require('fs');
  const path = require('path');

  try {
    // Create state directory if it doesn't exist
    if (!fs.existsSync(this.STATE_DIR)) {
      fs.mkdirSync(this.STATE_DIR, { recursive: true });
    }
  } catch (error) {
    errors.push(`Cannot create state directory: ${error.message}`);
  }

  // More flexible JACK tools validation for WSL/development
  if (process.env.JACK_VALIDATION_DISABLED !== 'true') {
    // Check if we're in a WSL environment
    const isWSL = process.env.WSL_DISTRO_NAME || process.platform === 'linux';

    if (isWSL) {
      // In WSL, we can call Windows executables directly
      // Don't validate file existence, just warn if needed
      console.log(
        'ℹ️ WSL environment detected - JACK will use Windows tools via WSL'
      );
      console.log(`   JACK Tools Path: ${this.JACK_TOOLS_PATH}`);
    } else if (process.platform === 'win32') {
      // Pure Windows environment - validate normally
      const jackLspPath = path.join(this.JACK_TOOLS_PATH, 'jack_lsp.exe');
      if (!fs.existsSync(jackLspPath)) {
        errors.push(
          `JACK tools not found at ${jackLspPath}. Please install JACK2 or update JACK_TOOLS_PATH`
        );
      }
    } else {
      // Linux environment - check if jack tools are in PATH
      try {
        require('child_process').execSync('which jack_lsp', {
          stdio: 'ignore',
        });
        console.log('✅ JACK tools found in PATH');
      } catch (error) {
        console.warn(
          '⚠️ jack_lsp not found in PATH. Install with: sudo apt install jackd2 jack-tools'
        );
        // Don't add to errors to allow server to start
      }
    }
  } else {
    console.log(
      'ℹ️ JACK validation disabled via JACK_VALIDATION_DISABLED environment variable'
    );
  }

  // Validate port conflicts
  if (this.PORT === this.HTTPS_PORT) {
    errors.push(
      `Port conflict: HTTP and HTTPS ports cannot be the same (${this.PORT})`
    );
  }

  // Validate log level
  const validLogLevels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
  if (!validLogLevels.includes(this.LOG_LEVEL)) {
    errors.push(
      `Invalid log level: ${this.LOG_LEVEL}. Valid levels: ${validLogLevels.join(', ')}`
    );
  }

  return errors;
};

/**
 * Print configuration summary
 */
config.printSummary = function () {
  if (!this.isDev) return; // Only in development

  console.log('\n📋 Configuration Summary:');
  console.log('─'.repeat(50));
  console.log(`Environment: ${this.NODE_ENV}`);
  console.log(`HTTP Server: ${this.HOST}:${this.PORT}`);
  console.log(
    `HTTPS Server: ${this.HOST}:${this.HTTPS_PORT} ${this.server.https.enabled ? '(enabled)' : '(disabled)'}`
  );
  console.log(`Log Level: ${this.LOG_LEVEL}`);
  console.log(`JACK Tools: ${this.JACK_TOOLS_PATH}`);
  console.log(`State Auto-save: ${this.STATE_AUTO_SAVE_INTERVAL}ms`);
  console.log(
    `Features: ${Object.entries(this.FEATURES)
      .filter(([_, enabled]) => enabled)
      .map(([name]) => name)
      .join(', ')}`
  );
  console.log('─'.repeat(50));

  // Validate and show any errors
  const errors = this.validate();
  if (errors.length > 0) {
    console.log('❌ Configuration Errors:');
    errors.forEach((error) => console.log(`   ${error}`));
    console.log('─'.repeat(50));
  }
};

// Validate configuration on load
const validationErrors = config.validate();
if (validationErrors.length > 0 && !config.isTest) {
  console.error('❌ Configuration validation failed:');
  validationErrors.forEach((error) => console.error(`   ${error}`));

  if (
    validationErrors.some((error) => error.includes('JACK tools not found'))
  ) {
    console.log('\n💡 To fix JACK tools issue:');
    console.log(
      '   1. Install JACK2 for Windows from https://jackaudio.org/downloads/'
    );
    console.log(
      '   2. Or set JACK_TOOLS_PATH environment variable to correct path'
    );
    console.log('   3. Or run in WSL with JACK2 installed');
  }
}

module.exports = config;
