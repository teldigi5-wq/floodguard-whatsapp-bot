#!/usr/bin/env node
'use strict';
// Read-only local state inspection. No WhatsApp, Firebase, network, token
// access, state rewriting, quarantine unlocking, or alert replay.
const fs=require('node:fs');
const path=require('node:path');
const {assessDeliveryState}=require('../src/deliveryRecovery');

const MAX_BYTES=128*1024;
const failed=()=>({
  status:'INSPECTION_FAILED',automaticAlertsPaused:null,
  operatorReviewRequired:true,manualFallbackRequired:true
});
function inspect() {
  let fd;
  try{
    const dataDir=process.env.DATA_PATH || path.join(process.cwd(),'data');
    const filename=path.join(dataDir,'state.json');
    // Refuse symbolic links, including a symlink replaced between metadata
    // inspection and opening on platforms supporting O_NOFOLLOW.
    const metadata=fs.lstatSync(filename);
    if(!metadata.isFile() || metadata.isSymbolicLink()) return failed();
    const flags=fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
    fd=fs.openSync(filename,flags);
    const info=fs.fstatSync(fd);
    if(!info.isFile() || !Number.isSafeInteger(info.size) ||
       info.size < 2 || info.size > MAX_BYTES) return failed();
    const buffer=Buffer.alloc(info.size);
    const bytes=fs.readSync(fd,buffer,0,buffer.length,0);
    if(bytes!==info.size) return failed();
    return assessDeliveryState(JSON.parse(buffer.toString('utf8')));
  }catch{
    // Never write raw exception messages: they may include a private path,
    // account identifier, JSON content, or credentials.
    return failed();
  }finally{
    if(fd!==undefined){try{fs.closeSync(fd);}catch{}}
  }
}
const result=inspect();
process.stdout.write(JSON.stringify(result)+'\n');
process.exitCode=result.status==='INSPECTION_FAILED'?3:
  result.operatorReviewRequired?2:0;
