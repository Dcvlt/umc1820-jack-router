// middleware/ssl.js - SSL redirect middleware
const logger = require('../utils/logger');

/**
 * Force HTTPS redirect middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function forceHTTPS(req, res, next) {
  if (req.header('x-forwarded-proto') !== 'https') {
    const httpsUrl = `https://${req.header('host')}${req.url}`;
    logger.info(`🔄 Redirecting HTTP to HTTPS: ${httpsUrl}`);
    res.redirect(httpsUrl);
  } else {
    next();
  }
}

module.exports = {
  forceHTTPS
};