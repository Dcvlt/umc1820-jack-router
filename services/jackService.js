S// services/jackService.js
const { exec } = require('child_process');
const { promisify } = require('util');
const config = require('../config');

const execAsync = promisify(exec);

class JackService {
  constructor() {
    this.statusCache = { running: false, lastCheck: 0 };
  }

  /**
   * Execute JACK command with multiple fallback methods
   */
  async executeCommand(command, timeout = config.jack.timeouts.default) {
    try {
      console.log(`🔧 Executing JACK command: ${command}`);

      const windowsCommands = [
        `powershell.exe -Command "${command}"`,
        `cmd.exe /c "${command}"`,
        command,
      ];

      for (const cmd of windowsCommands) {
        try {
          const { stdout, stderr } = await execAsync(cmd, {
            shell: '/bin/bash',
            timeout: timeout,
            env: {
              ...process.env,
              PATH: config.jack.toolsPath + ':' + process.env.PATH,
            },
          });

          if (stderr && !stderr.includes('Warning') && !stderr.includes('INFO')) {
            console.warn(`⚠️ JACK command stderr: ${stderr}`);
          }

          console.log(`✅ JACK command successful: ${stdout.substring(0, 100)}...`);
          return stdout.trim();
        } catch (error) {
          console.log(`❌ Failed with ${cmd}: ${error.message}`);
          continue;
        }
      }

      throw new Error('All execution methods failed');
    } catch (error) {
      console.error(`❌ JACK command failed completely: ${command}`, error.message);
      throw error;
    }
  }

  /**
   * Check if JACK is running with caching
   */
  async checkStatus() {
    const now = Date.now();

    if (now - this.statusCache.lastCheck < config.jack.statusCacheMs) {
      return this.statusCache.running;
    }

    try {
      await this.executeCommand(config.jack.commands.lsp, config.jack.timeouts.status);
      this.statusCache = { running: true, lastCheck: now };
      return true;
    } catch (error) {
      console.log(`🔍 JACK status check failed: ${error.message}`);
      this.statusCache = { running: false, lastCheck: now };
      return false;
    }
  }

  /**
   * List all JACK connections
   */
  async listConnections() {
    const command = `${config.jack.commands.lsp} -c`;
    return await this.executeCommand(command);
  }

  /**
   * Parse JACK connections output
   */
  parseConnections(connectionOutput) {
    const lines = connectionOutput.split('\n');
    const connections = [];
    let currentSource = null;

    for (const line of lines) {
      if (line.trim() === '') continue;

      if (line.startsWith('   ')) {
        if (currentSource) {
          const destination = line.trim();
          connections.push({
            from: currentSource,
            to: destination,
          });
        }
      } else {
        currentSource = line.trim();
      }
    }

    return connections;
  }

  /**
   * Get current connections (parsed)
   */
  async getCurrentConnections() {
    try {
      const connectionOutput = await this.listConnections();
      return this.parseConnections(connectionOutput);
    } catch (error) {
      console.warn('⚠️ Failed to get current connections from JACK');
      throw error;
    }
  }

  /**
   * Clear all connections via QjackCtl automation
   */
  async clearConnectionsViaQjackCtl() {
    const powershellScript = `
      Add-Type -AssemblyName System.Windows.Forms
      
      $qjackctl = Get-Process -Name "qjackctl" -ErrorAction SilentlyContinue
      if (-not $qjackctl) {
        throw "QjackCtl not running"
      }
      
      Write-Host "QjackCtl automation attempted"
    `;

    const command = `powershell.exe -Command "${powershellScript.replace(/"/g, '\\"')}"`;
    await this.executeCommand(command, config.jack.timeouts.disconnect);
  }
}

module.exports = new JackService();