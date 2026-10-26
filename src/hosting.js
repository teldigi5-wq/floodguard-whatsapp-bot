'use strict';
const fs=require('node:fs');
const path=require('node:path');

function parseMode(raw) {
  if(raw === undefined || raw === null || raw === '') return 'pc';
  const mode=String(raw).toLowerCase();
  if(mode !== 'pc' && mode !== 'ec2') throw new Error('FLOODGUARD_HOST_MODE must be pc or ec2');
  return mode;
}

function describeHost({mode,host,port,dataPath}={}) {
  const profile=parseMode(mode);
  const binding=host || '127.0.0.1';
  const listenPort=Number(port ?? 8080);
  if(!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  let storageAccessible=false;
  try {
    fs.accessSync(path.resolve(dataPath||'./data'),fs.constants.R_OK|fs.constants.W_OK);
    storageAccessible=true;
  } catch {
    storageAccessible=false;
  }
  // Do not expose data path, tokens, keys, hostname, public IP or Firebase URL.
  return Object.freeze({
    profile,
    port:listenPort,
    bindScope:['127.0.0.1','localhost','::1'].includes(binding)?'loopback':'network',
    storageAccessible,
    changesRequireRestart:true,
    remoteAdminRequiresTLS:true
  });
}

module.exports={parseMode,describeHost};
