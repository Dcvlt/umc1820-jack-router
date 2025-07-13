// config/ssl.js - Updated to work with your current environment structure
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const config = require('./environment'); // Import environment directly

const execAsync = promisify(exec);

class SSLManager {
  constructor() {
    // Create SSL paths object based on your current config structure
    this.sslPaths = {
      dir: config.SSL_DIR,
      key: path.join(config.SSL_DIR, 'private.key'),
      cert: path.join(config.SSL_DIR, 'certificate.crt'),
      ca: path.join(config.SSL_DIR, 'ca_bundle.crt'),
    };
  }

  /**
   * Get SSL options for HTTPS server
   */
  async getSSLOptions() {
    try {
      const options = {
        key: await fs.readFile(this.sslPaths.key, 'utf8'),
        cert: await fs.readFile(this.sslPaths.cert, 'utf8'),
      };

      // Add CA bundle if it exists
      try {
        const ca = await fs.readFile(this.sslPaths.ca, 'utf8');
        options.ca = ca;
      } catch (error) {
        console.log('ℹ️ No CA bundle found, proceeding without it');
      }

      return options;
    } catch (error) {
      console.error('❌ SSL certificate files not found:', error.message);

      // Auto-generate if enabled
      if (config.SSL_AUTO_GENERATE) {
        console.log(
          '🔐 SSL_AUTO_GENERATE is enabled, attempting to generate certificates...'
        );
        const generated = await this.generateSelfSignedCert();
        if (generated) {
          // Recursively try to get SSL options after generation
          return await this.getSSLOptions();
        }
      }

      this._printSSLInstructions();
      return null;
    }
  }

  /**
   * Generate self-signed certificate for development
   */
  async generateSelfSignedCert() {
    try {
      // Create ssl directory if it doesn't exist
      await fs.mkdir(this.sslPaths.dir, { recursive: true });

      // Check if certificates already exist
      if (await this._certificatesExist()) {
        console.log('✅ SSL certificates already exist');
        return true;
      }

      console.log('🔐 Generating self-signed SSL certificate...');

      const opensslCommand = `openssl req -x509 -newkey rsa:4096 -keyout "${this.sslPaths.key}" -out "${this.sslPaths.cert}" -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:0.0.0.0"`;

      await execAsync(opensslCommand);

      console.log('✅ Self-signed SSL certificate generated successfully');
      console.log(
        '⚠️ Note: Browsers will show a security warning for self-signed certificates'
      );
      console.log(
        '   You can safely proceed by clicking "Advanced" -> "Proceed to localhost"'
      );

      return true;
    } catch (error) {
      console.error(
        '❌ Failed to generate self-signed certificate:',
        error.message
      );
      this._printOpenSSLInstructions();
      return false;
    }
  }

  /**
   * Check if certificates exist
   */
  async _certificatesExist() {
    try {
      await fs.access(this.sslPaths.key);
      await fs.access(this.sslPaths.cert);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Print SSL setup instructions
   */
  _printSSLInstructions() {
    console.log('📝 To use HTTPS, you need to:');
    console.log('   1. Create an "ssl" directory in your project root');
    console.log('   2. Place your SSL certificate files:');
    console.log('      - ssl/private.key (private key)');
    console.log('      - ssl/certificate.crt (certificate)');
    console.log(
      '      - ssl/ca_bundle.crt (certificate authority bundle - optional)'
    );
    console.log('   3. Or set SSL_AUTO_GENERATE=true in your .env file');
  }

  /**
   * Print OpenSSL installation instructions
   */
  _printOpenSSLInstructions() {
    console.log('💡 Make sure OpenSSL is installed and available in your PATH');
    console.log(
      '   Windows: Download from https://slproweb.com/products/Win32OpenSSL.html'
    );
    console.log(
      '   Or use Windows Subsystem for Linux (WSL) with OpenSSL installed'
    );
  }

  /**
   * Force HTTPS redirect middleware
   */
  forceHTTPS(req, res, next) {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  }
}

module.exports = new SSLManager();
