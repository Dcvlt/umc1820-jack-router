// routes/index.js - Development-optimized with live SSR
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

// SSR setup - optimized for development
let JackAudioRouter = null;
let React = null;
let renderToPipeableStream = null;

function setupSSR() {
  if (isDev) {
    logger.info('🔧 Setting up development SSR with live file reloading...');

    try {
      // Clear require cache for hot reloading in development
      const jsxPath = path.resolve(__dirname, '../src/jackAudioRouter.jsx');
      delete require.cache[jsxPath];
      delete require.cache[require.resolve('react')];
      delete require.cache[require.resolve('react-dom/server')];

      React = require('react');
      renderToPipeableStream =
        require('react-dom/server').renderToPipeableStream;

      // Setup Babel register for JSX compilation
      require('@babel/register')({
        extensions: ['.js', '.jsx', '.cjsx'],
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          ['@babel/preset-react', { runtime: 'automatic' }],
        ],
        cache: false, // Disable cache in development for hot reload
        ignore: [/node_modules/],
        only: [
          path.resolve(__dirname, '../src'),
          path.resolve(__dirname, '../components'),
          path.resolve(__dirname, '../hooks'),
        ],
      });

      // Try to load the JSX component from mounted source
      try {
        const jackAudioModule = require('../src/jackAudioRouter.jsx');
        JackAudioRouter =
          jackAudioModule.JackAudioRouter ||
          jackAudioModule.default ||
          jackAudioModule;

        if (typeof JackAudioRouter !== 'function') {
          throw new Error('Loaded module is not a React component');
        }

        logger.info('✅ Development SSR enabled with live JSX reloading');
        return true;
      } catch (jsxError) {
        logger.warn('⚠️ JSX component loading failed:', jsxError.message);
        logger.warn('📁 Expected file: src/jackAudioRouter.jsx');
        return false;
      }
    } catch (error) {
      logger.warn('⚠️ Development SSR setup failed:', error.message);
      return false;
    }
  }

  return false;
}

// Initialize SSR
const ssrEnabled = setupSSR();

const router = express.Router();

// Mount API routes
router.use('/api', apiRoutes);
router.use('/api/presets', presetRoutes);
router.use('/api/mqtt', mqttRoutes);
router.use('/health', healthRoutes);

// Development: Enhanced setup with SSR + Vite proxy
if (isDev) {
  logger.info('🔧 Setting up development environment...');
  logger.info(`   SSR Enabled: ${ssrEnabled ? '✅' : '❌'}`);
  logger.info('   Vite Proxy: ✅ (http://localhost:5173)');
  logger.info('   Hot Reload: ✅');

  // SSR for main route if available
  router.get('/', async (req, res) => {
    if (ssrEnabled && JackAudioRouter && React && renderToPipeableStream) {
      try {
        // Re-setup SSR on each request in development for hot reload
        setupSSR();
        await renderAppSSR(req, res);
        return;
      } catch (error) {
        logger.error(
          'Development SSR failed, falling back to proxy:',
          error.message
        );
      }
    }

    // Fallback to Vite proxy
    return createProxyMiddleware({
      target: 'http://localhost:5173',
      changeOrigin: true,
      ws: true,
      onError: (err, req, res) => {
        logger.error('Vite proxy error:', err.message);
        res.status(500).send(`
          <html>
            <body>
              <h1>Development Server Error</h1>
              <p>Both SSR and Vite proxy failed.</p>
              <p>Make sure Vite is running: <code>npm run dev:frontend</code></p>
              <pre>${err.message}</pre>
            </body>
          </html>
        `);
      },
    })(req, res);
  });

  // All other routes go to Vite (for HMR, assets, etc.)
  router.use(
    '/',
    createProxyMiddleware({
      target: 'http://localhost:5173',
      changeOrigin: true,
      ws: true, // Enable WebSocket proxy for HMR
      onError: (err, req, res) => {
        logger.error('Vite proxy error:', err.message);

        // Only send error response if headers haven't been sent
        if (!res.headersSent) {
          res.status(500).send('Vite development server not available');
        }
      },
    })
  );
} else {
  // Production: Serve static files with optional SSR
  const staticPath = path.join(__dirname, '..', 'dist', 'client');

  logger.info(`📁 Production mode: serving static files from ${staticPath}`);

  // Serve static assets
  router.use(
    express.static(staticPath, {
      maxAge: '1y',
      etag: true,
      lastModified: true,
    })
  );

  // Main route
  router.get('/', async (req, res) => {
    if (ssrEnabled) {
      await renderAppSSR(req, res);
    } else {
      await serveStaticIndex(req, res);
    }
  });

  // Catch-all route for SPA routing
  router.get('*', async (req, res) => {
    if (req.path.includes('.')) {
      return notFoundHandler(req, res);
    }

    if (ssrEnabled) {
      await renderAppSSR(req, res);
    } else {
      await serveStaticIndex(req, res);
    }
  });
}

/**
 * Render the React application with SSR (development + production)
 */
async function renderAppSSR(req, res) {
  try {
    logger.debug('🎭 Rendering with SSR');

    // In development, always get fresh initial data
    const initialData = await getInitialData();

    // In development, reload component for hot reload
    if (isDev) {
      setupSSR();
    }

    const reactElement = React.createElement(JackAudioRouter, {
      initialData,
    });

    const stream = renderToPipeableStream(reactElement, {
      onShellReady() {
        res.status(200);
        res.setHeader('Content-Type', 'text/html');

        // Enhanced HTML template for development
        const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JACK Audio Router${isDev ? ' (Development)' : ''}</title>
    ${isDev ? '<script type="module" src="/@vite/client"></script>' : ''}
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
      ${isDev ? '.dev-indicator { position: fixed; top: 10px; right: 10px; background: #ff6b35; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; z-index: 9999; }' : ''}
    </style>
</head>
<body>
    ${isDev ? '<div class="dev-indicator">DEV MODE</div>' : ''}
    <div id="loading">Loading JACK Audio Router...</div>
    <div id="root">`;

        res.write(htmlTemplate);
        stream.pipe(res);

        const scriptSrc = isDev ? '/src/client.jsx' : '/assets/main.js';
        res.write(`</div>
    <script>
        document.getElementById('loading').style.display = 'none';
        window.__INITIAL_DATA__ = ${JSON.stringify(initialData).replace(/</g, '\\u003c')};
    </script>
    <script type="module" src="${scriptSrc}"></script>
</body>
</html>`);
      },
      onError(error) {
        logger.error('SSR Error:', error);
        if (!res.headersSent) {
          res.status(500).send('Server-side rendering failed');
        }
      },
    });
  } catch (error) {
    logger.error('Error in renderAppSSR:', error);

    if (!res.headersSent) {
      if (isDev) {
        // In development, show detailed error
        res.status(500).send(`
          <html>
            <body>
              <h1>SSR Development Error</h1>
              <pre>${error.stack}</pre>
              <p><a href="/">Reload</a></p>
            </body>
          </html>
        `);
      } else {
        await serveStaticIndex(req, res);
      }
    }
  }
}

/**
 * Serve static index.html file (production fallback)
 */
async function serveStaticIndex(req, res) {
  try {
    const staticPath = path.join(__dirname, '..', 'dist', 'client');
    const indexPath = path.join(staticPath, 'index.html');

    try {
      const indexContent = await fs.readFile(indexPath, 'utf-8');
      const initialData = await getInitialData();

      const modifiedContent = indexContent.replace(
        '</head>',
        `<script>window.__INITIAL_DATA__ = ${JSON.stringify(initialData).replace(/</g, '\\u003c')};</script></head>`
      );

      res.setHeader('Content-Type', 'text/html');
      res.send(modifiedContent);
    } catch (fileError) {
      logger.error('Static index.html not found:', fileError.message);
      res.status(500).send('Application not built. Run npm run build first.');
    }
  } catch (error) {
    logger.error('Error serving static index:', error);
    res.status(500).send('Internal Server Error');
  }
}

/**
 * Get initial data for SSR/hydration
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
        logger.warn('Failed to get connections:', error.message);
      }
    }

    return {
      jackStatus: jackRunning,
      currentConnections: currentConnections,
      deviceConfig: DEVICE_CONFIG,
      availablePresets: Object.keys(ROUTING_PRESETS),
      timestamp: new Date().toISOString(),
      isDev: isDev,
    };
  } catch (error) {
    logger.error('Error getting initial data:', error);
    return {
      jackStatus: false,
      currentConnections: [],
      deviceConfig: DEVICE_CONFIG,
      availablePresets: Object.keys(ROUTING_PRESETS),
      timestamp: new Date().toISOString(),
      isDev: isDev,
      error: error.message,
    };
  }
}

// Handle 404 for unmatched routes
router.use(notFoundHandler);

module.exports = router;
