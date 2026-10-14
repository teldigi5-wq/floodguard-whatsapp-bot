# FloodGuard dual hosting — Windows PC and optional EC2

Status: draft PR only, not installed on either host.

## Runtime and settings

Use FLOODGUARD_HOST_MODE=pc or ec2 inside each host's private .env. The same bot.js, Firebase reader and DATA_PATH work in both environments. The protected Setup page reports the currently running profile and lets an operator preview PC/EC2 setup recommendations. The profile selector never changes a remote host or commits secrets: changing the actual host requires updating its own .env and restarting the process.

## Windows PC

1. Install Node.js >=20 and Git on your PC. Clone the reviewed repository and enter its directory.
2. Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1
3. The script creates a private .env, random admin token and ./data directory if absent; an existing .env is never overwritten. Keep .env and data/auth away from GitHub, email and public files.
4. Run: npm ci ; npm test ; npm run start:pc
5. Open http://127.0.0.1:8080 on the SAME computer. Enter username admin and password from FLOODGUARD_SETUP_TOKEN in .env. Scan a new WhatsApp QR on your authorized phone only if an old secure auth backup is unavailable.
6. To stop use Ctrl+C. The PC must stay awake and connected for message delivery. Back up your private data directory securely.

## EC2 (only when a valid AWS account and approved VM are available)

On a separately approved EC2 VM, install Node 20+, mount a persistent writable disk and set the private .env with FLOODGUARD_HOST_MODE=ec2, HOST=127.0.0.1, PORT=8080 and DATA_PATH pointing to its durable disk. Choose npm run start:ec2 for an initial supervised test, or a single PM2 instance via ecosystem.portable.config.js after operator review. Restrict security groups; use a private SSH tunnel or HTTPS reverse proxy to access setup and QR. The previous inaccessible AWS instance and its GitHub workflow cannot be assumed to work with a new VM.

## Security and transitions

Settings only reveal mode, port, loopback/network scope, and a basic storage-accessibility test. They never reveal tokens, network addresses, filesystem paths or Wi-Fi values. A writable directory does not prove durable persistence. Switch environments only by stopping the previous process, backing up and transferring auth files privately if legitimately available, then starting ONE new instance. Never run both bots linked to the same WhatsApp account simultaneously.

The Arduino and ESP8266 were already flashed and worked correctly according to the owner; no firmware changes or physical gate commands are involved. Phase A/Phase B Firebase rules and all deployments remain separate approval gates.
