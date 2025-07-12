// utils/logger.js - Logging utilities
const { isDev } = require('../config/environment');

/**
 * Logger utility with different log levels
 */
class Logger {
  constructor() {
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };
    
    this.currentLevel = isDev ? this.levels.DEBUG : this.levels.INFO;
    this.colors = {
      ERROR: '\x1b[31m', // Red
      WARN: '\x1b[33m',  // Yellow
      INFO: '\x1b[36m',  // Cyan
      DEBUG: '\x1b[90m', // Gray
      RESET: '\x1b[0m'
    };
  }

  /**
   * Format log message with timestamp and level
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @returns {string} Formatted message
   */
  formatMessage(level, message) {
    const timestamp = new Date().toISOString();
    const color = this.colors[level] || '';
    const reset = this.colors.RESET;
    
    return `${color}[${timestamp}] ${level}: ${message}${reset}`;
  }

  /**
   * Log message if level is enabled
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  log(level, message, ...args) {
    if (this.levels[level] <= this.currentLevel) {
      const formattedMessage = this.formatMessage(level, message);
      console.log(formattedMessage, ...args);
    }
  }

  /**
   * Error level logging
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  error(message, ...args) {
    this.log('ERROR', message, ...args);
  }

  /**
   * Warning level logging
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  warn(message, ...args) {
    this.log('WARN', message, ...args);
  }

  /**
   * Info level logging
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  info(message, ...args) {
    this.log('INFO', message, ...args);
  }

  /**
   * Debug level logging
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  debug(message, ...args) {
    this.log('DEBUG', message, ...args);
  }

  /**
   * Set log level
   * @param {string} level - Log level to set
   */
  setLevel(level) {
    const upperLevel = level.toUpperCase();
    if (this.levels[upperLevel] !== undefined) {
      this.currentLevel = this.levels[upperLevel];
      this.info(`Log level set to ${upperLevel}`);
    } else {
      this.warn(`Invalid log level: ${level}. Available levels: ${Object.keys(this.levels).join(', ')}`);
    }
  }

  /**
   * Get current log level
   * @returns {string} Current log level
   */
  getLevel() {
    return Object.keys(this.levels).find(
      level => this.levels[level] === this.currentLevel
    );
  }
}

// Export singleton instance
const logger = new Logger();

// Set log level from environment variable if provided
const envLogLevel = process.env.LOG_LEVEL;
if (envLogLevel) {
  logger.setLevel(envLogLevel);
}

module.exports = logger;