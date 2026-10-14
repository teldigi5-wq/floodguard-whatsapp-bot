// Legacy optional EC2 PM2 configuration; not a valid deployment target while AWS is inaccessible.
module.exports = {
  apps: [
    {
      name: "floodguard-whatsapp-bot",
      script: "bot.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      restart_delay: 5000,
      max_restarts: 20,
      max_memory_restart: "450M",
      env: {
        NODE_ENV: "production",
        FLOODGUARD_HOST_MODE: "ec2",
        HOST: "127.0.0.1",
        PORT: 8080,
        DATA_PATH: "/data"
      },
      out_file: "/data/logs/floodguard-out.log",
      error_file: "/data/logs/floodguard-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
