// routes/health.js - Health check routes
const express = require('express');
const jackService = require('../services/jackService');
const connectionService = require('../services/connectionService');
const stateService = require('../services/stateService');
const { getPlatformInfo } = require('../utils/network');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Basic health check endpoint
 */
router.get('/', async (req, res) => {
  try {
    const jackRunning = await jackService.checkStatus();
    const trackedConnections = connectionService.getTrackedConnections();
    
    const health = {
      status: 'healthy',
      jack_running: jackRunning,
      tracked_connections: trackedConnections.length,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory_usage: process.memoryUsage(),
      version: process.version
    };

    // Set appropriate HTTP status based on JACK status
    const httpStatus = jackRunning ? 200 : 503;
    
    res.status(httpStatus).json(health);
  } catch (error) {
    logger.error('Error in health check:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Detailed health check with system information
 */
router.get('/detailed', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Check JACK service
    const jackStatus = await checkJackServiceHealth();
    
    // Check connection service
    const connectionStatus = checkConnectionServiceHealth();
    
    // Check state service
    const stateStatus = await checkStateServiceHealth();
    
    // Get system information
    const systemInfo = getPlatformInfo();
    
    const responseTime = Date.now() - startTime;
    
    const detailedHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      services: {
        jack: jackStatus,
        connection: connectionStatus,
        state: stateStatus
      },
      system: systemInfo,
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu_usage: process.cpuUsage(),
        version: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };

    // Determine overall health status
    const allServicesHealthy = [jackStatus, connectionStatus, stateStatus]
      .every(service => service.status === 'healthy');
    
    if (!allServicesHealthy) {
      detailedHealth.status = 'degraded';
    }

    const httpStatus = allServicesHealthy ? 200 : 503;
    res.status(httpStatus).json(detailedHealth);
  } catch (error) {
    logger.error('Error in detailed health check:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Liveness probe (for container orchestration)
 */
router.get('/live', (req, res) => {
  // Basic liveness check - just confirm the process is running
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Readiness probe (for container orchestration)
 */
router.get('/ready', async (req, res) => {
  try {
    // Check if all critical services are ready
    const jackRunning = await jackService.checkStatus();
    
    // Service is ready if JACK is running OR if we're in initialization phase
    const isReady = jackRunning || jackService.isInitializing();
    
    if (isReady) {
      res.status(200).json({
        status: 'ready',
        jack_running: jackRunning,
        initializing: jackService.isInitializing(),
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        jack_running: false,
        reason: 'JACK server not available',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Error in readiness check:', error);
    res.status(503).json({
      status: 'not_ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Service-specific health checks
 */
router.get('/services/:serviceName', async (req, res) => {
  const { serviceName } = req.params;
  
  try {
    let serviceHealth;
    
    switch (serviceName.toLowerCase()) {
      case 'jack':
        serviceHealth = await checkJackServiceHealth();
        break;
      case 'connection':
        serviceHealth = checkConnectionServiceHealth();
        break;
      case 'state':
        serviceHealth = await checkStateServiceHealth();
        break;
      default:
        return res.status(404).json({
          error: 'Service not found',
          available_services: ['jack', 'connection', 'state'],
          requested: serviceName,
          timestamp: new Date().toISOString()
        });
    }
    
    const httpStatus = serviceHealth.status === 'healthy' ? 200 : 503;
    res.status(httpStatus).json({
      service: serviceName,
      ...serviceHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error checking ${serviceName} service health:`, error);
    res.status(503).json({
      service: serviceName,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Check JACK service health
 */
async function checkJackServiceHealth() {
  try {
    const startTime = Date.now();
    const isRunning = await jackService.checkStatus();
    const responseTime = Date.now() - startTime;
    
    let status = 'healthy';
    let issues = [];
    
    if (!isRunning) {
      status = 'unhealthy';
      issues.push('JACK server not running');
    }
    
    if (responseTime > 5000) {
      status = status === 'healthy' ? 'degraded' : status;
      issues.push(`Slow response time: ${responseTime}ms`);
    }
    
    return {
      status,
      jack_running: isRunning,
      response_time_ms: responseTime,
      last_check: jackService.getLastCheckTime(),
      cache_age_ms: Date.now() - jackService.getLastCheckTime(),
      issues: issues.length > 0 ? issues : undefined
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      jack_running: false,
      error: error.message,
      issues: ['Failed to check JACK status']
    };
  }
}

/**
 * Check connection service health
 */
function checkConnectionServiceHealth() {
  try {
    const trackedConnections = connectionService.getTrackedConnections();
    const connectionCount = trackedConnections.length;
    
    // Check for stale connections (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const staleConnections = trackedConnections.filter(
      conn => conn.timestamp && conn.timestamp < oneHourAgo
    ).length;
    
    let status = 'healthy';
    let issues = [];
    
    if (staleConnections > 0) {
      status = 'degraded';
      issues.push(`${staleConnections} stale connections detected`);
    }
    
    return {
      status,
      tracked_connections: connectionCount,
      stale_connections: staleConnections,
      memory_usage: connectionService.getMemoryUsage ? connectionService.getMemoryUsage() : 'unknown',
      issues: issues.length > 0 ? issues : undefined
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      issues: ['Failed to check connection service']
    };
  }
}

/**
 * Check state service health
 */
async function checkStateServiceHealth() {
  try {
    let status = 'healthy';
    let issues = [];
    let stateInfo = {};
    
    // Check if state file exists and is readable
    try {
      const state = await stateService.getState();
      stateInfo = {
        has_saved_state: true,
        state_timestamp: state.timestamp,
        connection_count: state.connections ? state.connections.length : 0
      };
      
      // Check if state is very old (more than 7 days)
      if (state.timestamp) {
        const stateAge = Date.now() - new Date(state.timestamp).getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        
        if (stateAge > sevenDays) {
          status = 'degraded';
          issues.push('Saved state is older than 7 days');
        }
      }
    } catch (error) {
      stateInfo = {
        has_saved_state: false,
        error: error.message
      };
      
      if (error.message.includes('No saved state found')) {
        // This is normal for new installations
        status = 'healthy';
      } else {
        status = 'degraded';
        issues.push('Cannot read state file');
      }
    }
    
    // Check auto-save functionality
    const autoSaveEnabled = stateService.isAutoSaveEnabled ? stateService.isAutoSaveEnabled() : true;
    if (!autoSaveEnabled) {
      status = 'degraded';
      issues.push('Auto-save is disabled');
    }
    
    return {
      status,
      auto_save_enabled: autoSaveEnabled,
      ...stateInfo,
      issues: issues.length > 0 ? issues : undefined
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      issues: ['Failed to check state service']
    };
  }
}

/**
 * Get service metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime_seconds: process.uptime(),
      memory_usage_bytes: process.memoryUsage(),
      cpu_usage: process.cpuUsage(),
      
      // JACK metrics
      jack_status: await jackService.checkStatus() ? 1 : 0,
      jack_response_time_ms: 0, // Will be updated by health check
      
      // Connection metrics
      tracked_connections_count: connectionService.getTrackedConnections().length,
      
      // HTTP metrics (if available)
      http_requests_total: 0, // Could be implemented with middleware
      http_request_duration_ms: 0 // Could be implemented with middleware
    };
    
    // Add response time for JACK check
    const startTime = Date.now();
    await jackService.checkStatus();
    metrics.jack_response_time_ms = Date.now() - startTime;
    
    res.json(metrics);
  } catch (error) {
    logger.error('Error getting metrics:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;