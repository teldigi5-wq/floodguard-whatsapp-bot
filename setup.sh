#!/bin/bash
set -e
REPO_URL="${REPO_URL:-https://github.com/YOUR_USERNAME/floodguard-whatsapp-bot.git}"
BOT_DIR="$HOME/floodguard-whatsapp-bot"
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs git
sudo npm install -g pm2
sudo mkdir -p /data/logs /data/auth
sudo chown -R ec2-user:ec2-user /data
if [ -d "$BOT_DIR/.git" ]; then cd "$BOT_DIR"; git fetch origin; git reset --hard origin/main; else git clone "$REPO_URL" "$BOT_DIR"; cd "$BOT_DIR"; fi
npm ci --omit=dev || npm install --omit=dev
[ -f .env ] || cp .env.example .env
pm2 delete floodguard-whatsapp-bot 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
echo "Run: pm2 startup"
echo "Open http://YOUR_EC2_IP:8080"
