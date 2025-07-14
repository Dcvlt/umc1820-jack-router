// routes/index.js - Route aggregator with conditional JSX loading
const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
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
const {
  DEVICE_CONFIG,
  ROUTING_PRESETS,
} = require('../constants/constants.cjs');

// Conditionally load JSX component
let JackAudioRouter = null;
let React = null;
let renderToPipeableStream = null;

try {
  // Only load React and JSX in production with SSR
  if (!isDev) {
    React = require('react');
    renderToPipeableStream = require('react-dom/server').renderToPipeableStream;

    // Babel register for JSX (only if needed)
    require('@babel/register')({
      extensions: ['.js', '.jsx', '.cjsx'],
      presets: ['@babel/preset-react'],
      cache: false,
    });

    // Try to load the JSX component
    try {
      const jackAudioModule = require('/src/jackAudioRouter.jsx');
      JackAudioRouter =
        jackAudioModule.JackAudioRouter || jackAudioModule.default;
    } catch (jsxError) {
      logger.warn(
        '⚠️ JSX component not found, SSR disabled:',
        jsxError.message
      );
      JackAudioRouter = null;
    }
  }
} catch (error) {
  logger.warn(
    '⚠️ React SSR setup failed, falling back to static serving:',
    error.message
  );
}

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
      },
    })
  );
} else {
  // Production: Serve static files and optionally SSR
  const staticPath = path.join(__dirname, '..', 'dist', 'client');

  // Serve static assets
  router.use(
    express.static(staticPath, {
      maxAge: '1y', // Cache static assets for 1 year
      etag: true,
      lastModified: true,
    })
  );

  // Main route - use SSR if available, otherwise serve static
  router.get('/', async (req, res) => {
    try {
      if (JackAudioRouter && React && renderToPipeableStream) {
        await renderApp(req, res);
      } else {
        await serveStaticIndex(req, res);
      }
    } catch (error) {
      logger.error('Error serving app:', error);
      await serveStaticIndex(req, res);
    }
  });

  // Catch-all route for SPA routing
  router.get('*', async (req, res) => {
    try {
      // Check if it's an asset request
      if (req.path.includes('.')) {
        return notFoundHandler(req, res);
      }

      // Serve the main app for client-side routing
      if (JackAudioRouter && React && renderToPipeableStream) {
        await renderApp(req, res);
      } else {
        await serveStaticIndex(req, res);
      }
    } catch (error) {
      logger.error('Error serving SPA route:', error);
      await serveStaticIndex(req, res);
    }
  });
}

/**
 * Serve static index.html file (fallback when SSR is not available)
 */
async function serveStaticIndex(req, res) {
  try {
    const staticPath = path.join(__dirname, '..', 'dist', 'client');
    const indexPath = path.join(staticPath, 'index.html');

    try {
      const indexContent = await fs.readFile(indexPath, 'utf-8');

      // Inject initial data into the static HTML
      const initialData = await getInitialData();
      const modifiedContent = indexContent.replace(
        '</head>',
        `<script>window.__INITIAL_DATA__ = ${JSON.stringify(initialData).replace(/</g, '\\u003c')};</script></head>`
      );

      res.setHeader('Content-Type', 'text/html');
      res.send(modifiedContent);
    } catch (fileError) {
      logger.error('Static index.html not found:', fileError.message);
      // Send a minimal HTML page
      res.setHeader('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>JACK Audio Router</title>
        </head>
        <body>
            <div id="root">
                <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
                    <div>
                        <h2>JACK Audio Router</h2>
                        <p>Service is running. Frontend not available.</p>
                        <p>API available at <a href="/api">/api</a></p>
                    </div>
                </div>
            </div>
        </body>
        </html>`);
    }
  } catch (error) {
    logger.error('Error serving static index:', error);
    res.status(500).send('Internal Server Error');
  }
}

/**
 * Render the React application with SSR
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
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error getting initial data:', error);
    return {
      jackStatus: false,
      currentConnections: [],
      deviceConfig: DEVICE_CONFIG,
      availablePresets: Object.keys(ROUTING_PRESETS),
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  }
}

// Handle 404 for unmatched routes
router.use(notFoundHandler);

module.exports = router;
