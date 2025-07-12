// routes/index.js - Route aggregator
const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const React = require('react');
const { renderToPipeableStream } = require('react-dom/server');
const fs = require('fs').promises;

const { isDev } = require('../config/environment');
const logger = require('../utils/logger');
const { notFoundHandler } = require('../middleware/errorHandler');

// Import route modules
const apiRoutes = require('./api');
const presetRoutes = require('./presets');
const healthRoutes = require('./health');
const mqttRoutes = require('./mqtt');

// Import services for SSR
const jackService = require('../services/jackService');
const { parseJackConnections } = require('../utils/jackParser');
const { DEVICE_CONFIG, ROUTING_PRESETS } = require('../constants/constants.cjs');

// Babel register for JSX
require('@babel/register')({
  extensions: ['.js', '.jsx', '.cjsx'],
});

const { JackAudioRouter } = require('../jackAudioRouter.jsx');

const router = express.Router();

// Mount API routes
router.use('/api', apiRoutes);
router.use('/api/presets', presetRoutes);
router.use('/api/mqtt', mqttRoutes);
router.use('/health', healthRoutes);

// Development: Proxy to Vite dev server
if (isDev) {
  logger.info('🔧 Setting up development proxy to Vite server');
  router.use(
    '/',
    createProxyMiddleware({
      target: 'http://localhost:5173',
      changeOrigin: true,
      ws: true,
      onError: (err, req, res) => {
        logger.error('Proxy error:', err.message);
        res.status(500).send('Proxy error occurred');
      }
    })
  );
} else {
  // Production: Serve static files and SSR
  const staticPath = path.join(__dirname, '..', 'dist', 'client');
  
  // Serve static assets
  router.use(express.static(staticPath, {
    maxAge: '1y', // Cache static assets for 1 year
    etag: true,
    lastModified: true
  }));

  // SSR route for the main application
  router.get('/', async (req, res) => {
    try {
      await renderApp(req, res);
    } catch (error) {
      logger.error('Error rendering app:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // Catch-all route for SPA routing (serve index.html for client-side routing)
  router.get('*', async (req, res) => {
    try {
      // Check if it's an asset request
      if (req.path.includes('.')) {
        return notFoundHandler(req, res);
      }
      
      // Serve the main app for client-side routing
      await renderApp(req, res);
    } catch (error) {
      logger.error('Error rendering app for SPA route:', error);
      res.status(500).send('Internal Server Error');
    }
  });
}

/**
 * Render the React application with SSR
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function renderApp(req, res) {
  try {
    const staticPath = path.join(__dirname, '..', 'dist', 'client');
    const manifestPath = path.join(staticPath, 'manifest.json');
    
    let manifest;
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    } catch (error) {
      logger.error('Failed to read manifest.json:', error.message);
      manifest = { 'main.js': { file: 'assets/main.js' } };
    }

    const scriptPath = manifest['main.js']?.file || 'assets/main.js';

    // Get initial data for SSR
    const initialData = await getInitialData();

    const reactElement = React.createElement(JackAudioRouter, {
      initialData,
    });

    const stream = renderToPipeableStream(reactElement, {
      onShellReady() {
        res.status(200);
        res.setHeader('Content-Type', 'text/html');
        res.write(`<!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>JACK Audio Router</title>
              <style> 
                body { 
                  margin: 0; 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                } 
                #loading {
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  font-size: 18px;
                  color: #666;
                }
              </style>
          </head>
          <body>
              <div id="loading">Loading JACK Audio Router...</div>
              <div id="root">`);
        stream.pipe(res);
        res.write(`</div>
          <script>
              // Hide loading indicator when React takes over
              document.getElementById('loading').style.display = 'none';
              window.__INITIAL_DATA__ = ${JSON.stringify(initialData).replace(/</g, '\\u003c')};
          </script>
          <script type="module" src="/${scriptPath}"></script>
          </body>
          </html>`);
      },
      onError(error) {
        logger.error('SSR Error:', error);
        res.status(500).send('Internal Server Error');
      },
    });
  } catch (error) {
    logger.error('Error in renderApp:', error);
    throw error;
  }
}

/**
 * Get initial data for SSR
 * @returns {Object} Initial data object
 */
async function getInitialData() {
  try {
    const jackRunning = await jackService.checkStatus();
    let currentConnections = [];

    if (jackRunning) {
      try {
        const connectionOutput = await jackService.listConnections();
        currentConnections = parseJackConnections(connectionOutput);
      } catch (error) {
        logger.warn('Failed to get connections for SSR:', error.message);
      }
    }

    return {
      jackStatus: jackRunning,
      currentConnections: currentConnections,
      deviceConfig: DEVICE_CONFIG,
      availablePresets: Object.keys(ROUTING_PRESETS),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error getting initial data:', error);
    return {
      jackStatus: false,
      currentConnections: [],
      deviceConfig: DEVICE_CONFIG,
      availablePresets: Object.keys(ROUTING_PRESETS),
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

// Handle 404 for unmatched routes
router.use(notFoundHandler);

module.exports = router;