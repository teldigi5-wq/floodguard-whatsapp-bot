'use strict';
require('dotenv').config();
const { parseMode }=require('../src/hosting');
const mode=parseMode(process.argv[2]||process.env.FLOODGUARD_HOST_MODE||'pc');
process.env.FLOODGUARD_HOST_MODE=mode;
process.stdout.write(mode==='pc'
  ? 'Starting FloodGuard on this PC (runs only while this computer is online).\n'
  : 'EC2 profile selected: requires your own approved VM and persistent storage.\n');
require('../bot');
