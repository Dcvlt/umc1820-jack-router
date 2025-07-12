// middleware/errorHandler.js - Error handling middleware
const logger = require('../utils/logger');
const { isDev } = require('../config/environment');

/**
 * Global error handler middleware
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(error, req, res, next) {
  logger.error('❌ Unhandled error:', error);

  // Don't log the stack trace in production unless it's a server error
  if (isDev || res.statusCode >= 500) {
    logger.error('Stack trace:', error.stack);
  }

  // If response already sent, delegate to Express default error handler
  if (res.headersSent) {
    return next(error);
  }

  // Determine status code
  const statusCode = error.statusCode || error.status || 500;

  // Prepare error response
  const errorResponse = {
    status: 'error',
    message: error.message || 'Internal Server Error',
    timestamp: new Date().toISOString(),
    path: req.originalUrl || req.url,
    method: req.method
  };

  // Include stack trace in development
  if (isDev) {
    errorResponse.stack = error.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * 404 handler for unmatched routes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function notFoundHandler(req, res) {
  logger.warn(`🔍 404 - Route not found: ${req.method} ${req.originalUrl}`);
  
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};