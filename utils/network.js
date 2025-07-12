// utils/network.js - Network utilities
const os = require('os');
const logger = require('./logger');

/**
 * Get the local IP address of the machine
 * @returns {string} Local IP address or 'localhost' if not found
 */
function getLocalIP() {
  try {
    const networkInterfaces = os.networkInterfaces();
    
    // Priority order for interface names (most common first)
    const interfacePriority = [
      'eth0', 'en0', 'wlan0', 'wi-fi', 'ethernet', 'wireless'
    ];
    
    // First try priority interfaces
    for (const interfaceName of interfacePriority) {
      const addresses = networkInterfaces[interfaceName];
      if (addresses) {
        for (const address of addresses) {
          if (address.family === 'IPv4' && !address.internal) {
            logger.debug(`Found IP on ${interfaceName}: ${address.address}`);
            return address.address;
          }
        }
      }
    }
    
    // If no priority interface found, check all interfaces
    for (const interfaceName of Object.keys(networkInterfaces)) {
      const addresses = networkInterfaces[interfaceName];
      for (const address of addresses) {
        if (address.family === 'IPv4' && !address.internal) {
          logger.debug(`Found IP on ${interfaceName}: ${address.address}`);
          return address.address;
        }
      }
    }
    
    logger.warn('No external IPv4 address found, using localhost');
    return 'localhost';
  } catch (error) {
    logger.error('Error detecting local IP:', error.message);
    return 'localhost';
  }
}

/**
 * Get all network interfaces with their IP addresses
 * @returns {Array} Array of network interface objects
 */
function getAllNetworkInterfaces() {
  try {
    const networkInterfaces = os.networkInterfaces();
    const interfaces = [];
    
    for (const [name, addresses] of Object.entries(networkInterfaces)) {
      for (const address of addresses) {
        interfaces.push({
          name,
          address: address.address,
          family: address.family,
          internal: address.internal,
          mac: address.mac
        });
      }
    }
    
    return interfaces;
  } catch (error) {
    logger.error('Error getting network interfaces:', error.message);
    return [];
  }
}

/**
 * Check if a given IP address is accessible
 * @param {string} ip - IP address to check
 * @param {number} port - Port to check
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>} True if accessible, false otherwise
 */
function checkIPAccessibility(ip, port, timeout = 5000) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    
    const onConnect = () => {
      socket.destroy();
      resolve(true);
    };
    
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    
    socket.setTimeout(timeout);
    socket.once('connect', onConnect);
    socket.once('error', onError);
    socket.once('timeout', onError);
    
    socket.connect(port, ip);
  });
}

/**
 * Get hostname of the machine
 * @returns {string} Hostname
 */
function getHostname() {
  try {
    return os.hostname();
  } catch (error) {
    logger.error('Error getting hostname:', error.message);
    return 'unknown';
  }
}

/**
 * Get platform information
 * @returns {Object} Platform information
 */
function getPlatformInfo() {
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    hostname: getHostname(),
    uptime: os.uptime(),
    loadavg: os.loadavg(),
    totalmem: os.totalmem(),
    freemem: os.freemem(),
    cpus: os.cpus().length
  };
}

module.exports = {
  getLocalIP,
  getAllNetworkInterfaces,
  checkIPAccessibility,
  getHostname,
  getPlatformInfo
};