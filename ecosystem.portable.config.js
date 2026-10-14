// Portable single-instance PM2 config for a VM with persistent local disk.
// Not connected to any cloud provider's deploy API.
const path = require('node:path');
module.exports = {
  apps: [{
    name: 'floodguard-whatsapp-bot',
    cwd: __dirname,
    script: 'bot.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    autorestart: true,
    restart_delay: 5000,
    max_memory_restart: '450M',
    env: {
      NODE_ENV: 'production',
      FLOODGUARD_HOST_MODE: process.env.FLOODGUARD_HOST_MODE || 'pc',
      HOST: process.env.HOST || '127.0.0.1',
      PORT: process.env.PORT || '8080',
      DATA_PATH: process.env.DATA_PATH || path.join(__dirname, 'data')
    }
  }]
};
