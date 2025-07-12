// utils/jackParser.js - JACK output parsing utilities
const logger = require('./logger');

/**
 * Parse JACK connection output into structured data
 * @param {string} connectionOutput - Raw output from jack_lsp -c
 * @returns {Array} Array of connection objects
 */
function parseJackConnections(connectionOutput) {
  try {
    if (!connectionOutput || typeof connectionOutput !== 'string') {
      logger.warn('Invalid connection output provided to parser');
      return [];
    }

    const lines = connectionOutput.split('\n');
    const connections = [];
    let currentSource = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (trimmedLine === '') {
        continue;
      }

      // Lines starting with spaces are destinations
      if (line.startsWith('   ')) {
        if (currentSource) {
          const destination = trimmedLine;
          connections.push({
            from: currentSource,
            to: destination,
            timestamp: Date.now()
          });
        }
      } else {
        // Lines without leading spaces are sources
        currentSource = trimmedLine;
      }
    }

    logger.debug(`Parsed ${connections.length} connections from JACK output`);
    return connections;
  } catch (error) {
    logger.error('Error parsing JACK connections:', error.message);
    return [];
  }
}

/**
 * Parse JACK port list output
 * @param {string} portOutput - Raw output from jack_lsp
 * @returns {Array} Array of port objects
 */
function parseJackPorts(portOutput) {
  try {
    if (!portOutput || typeof portOutput !== 'string') {
      logger.warn('Invalid port output provided to parser');
      return [];
    }

    const lines = portOutput.split('\n');
    const ports = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine === '') {
        continue;
      }

      // Parse port information
      const port = {
        name: trimmedLine,
        type: detectPortType(trimmedLine),
        direction: detectPortDirection(trimmedLine),
        client: extractClientName(trimmedLine),
        timestamp: Date.now()
      };

      ports.push(port);
    }

    logger.debug(`Parsed ${ports.length} ports from JACK output`);
    return ports;
  } catch (error) {
    logger.error('Error parsing JACK ports:', error.message);
    return [];
  }
}

/**
 * Detect port type based on port name
 * @param {string} portName - JACK port name
 * @returns {string} Port type (audio, midi, unknown)
 */
function detectPortType(portName) {
  if (portName.includes('audio') || portName.includes('capture') || portName.includes('playback')) {
    return 'audio';
  } else if (portName.includes('midi')) {
    return 'midi';
  } else {
    return 'unknown';
  }
}

/**
 * Detect port direction based on port name
 * @param {string} portName - JACK port name
 * @returns {string} Port direction (input, output, unknown)
 */
function detectPortDirection(portName) {
  if (portName.includes('capture') || portName.includes('input')) {
    return 'input';
  } else if (portName.includes('playback') || portName.includes('output')) {
    return 'output';
  } else {
    return 'unknown';
  }
}

/**
 * Extract client name from port name
 * @param {string} portName - JACK port name
 * @returns {string} Client name
 */
function extractClientName(portName) {
  try {
    const colonIndex = portName.indexOf(':');
    if (colonIndex > 0) {
      return portName.substring(0, colonIndex);
    }
    return portName;
  } catch (error) {
    logger.error('Error extracting client name:', error.message);
    return 'unknown';
  }
}

/**
 * Group connections by source client
 * @param {Array} connections - Array of connection objects
 * @returns {Object} Grouped connections
 */
function groupConnectionsBySource(connections) {
  try {
    const grouped = {};
    
    for (const connection of connections) {
      const sourceClient = extractClientName(connection.from);
      
      if (!grouped[sourceClient]) {
        grouped[sourceClient] = [];
      }
      
      grouped[sourceClient].push(connection);
    }
    
    return grouped;
  } catch (error) {
    logger.error('Error grouping connections by source:', error.message);
    return {};
  }
}

/**
 * Group connections by destination client
 * @param {Array} connections - Array of connection objects
 * @returns {Object} Grouped connections
 */
function groupConnectionsByDestination(connections) {
  try {
    const grouped = {};
    
    for (const connection of connections) {
      const destClient = extractClientName(connection.to);
      
      if (!grouped[destClient]) {
        grouped[destClient] = [];
      }
      
      grouped[destClient].push(connection);
    }
    
    return grouped;
  } catch (error) {
    logger.error('Error grouping connections by destination:', error.message);
    return {};
  }
}

/**
 * Find connections for a specific port
 * @param {Array} connections - Array of connection objects
 * @param {string} portName - Port name to find connections for
 * @returns {Object} Object with incoming and outgoing connections
 */
function findConnectionsForPort(connections, portName) {
  try {
    const result = {
      incoming: [],
      outgoing: []
    };
    
    for (const connection of connections) {
      if (connection.to === portName) {
        result.incoming.push(connection);
      }
      if (connection.from === portName) {
        result.outgoing.push(connection);
      }
    }
    
    return result;
  } catch (error) {
    logger.error('Error finding connections for port:', error.message);
    return { incoming: [], outgoing: [] };
  }
}

/**
 * Validate connection object structure
 * @param {Object} connection - Connection object to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateConnection(connection) {
  return (
    connection &&
    typeof connection === 'object' &&
    typeof connection.from === 'string' &&
    typeof connection.to === 'string' &&
    connection.from.length > 0 &&
    connection.to.length > 0
  );
}

/**
 * Filter connections by client name
 * @param {Array} connections - Array of connection objects
 * @param {string} clientName - Client name to filter by
 * @returns {Array} Filtered connections
 */
function filterConnectionsByClient(connections, clientName) {
  try {
    return connections.filter(connection => 
      extractClientName(connection.from) === clientName ||
      extractClientName(connection.to) === clientName
    );
  } catch (error) {
    logger.error('Error filtering connections by client:', error.message);
    return [];
  }
}

module.exports = {
  parseJackConnections,
  parseJackPorts,
  detectPortType,
  detectPortDirection,
  extractClientName,
  groupConnectionsBySource,
  groupConnectionsByDestination,
  findConnectionsForPort,
  validateConnection,
  filterConnectionsByClient
};