// middleware/cors.js - CORS configuration
const cors = require('cors');
const { isDev } = require('../config/environment');

const corsOptions = {
  origin: isDev
    ? [
        'http://localhost:3000',
        'http://localhost:5555',
        'http://localhost:5173',
        'https://localhost:5556',
      ]
    : true, // Allow all origins in production (adjust as needed)
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

module.exports = cors(corsOptions);
