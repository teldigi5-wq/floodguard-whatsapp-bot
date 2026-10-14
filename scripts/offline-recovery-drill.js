'use strict';
// Offline-only teaching drill. No DATA_PATH, WhatsApp auth, credentials, live
// process, device, network or Firebase access. Synthetic data is disposable.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash,timingSafeEqual}=require('node:crypto');

const KIND='FLOODGUARD_SYNTHETIC_RECOVERY_V1';
function syntheticState(){
  return {
    kind:KIND,demoMode:true,source:'SYNTHETIC ONLY',scenario:'offline',
    water:null,rain:null,risk:'UNAVAILABLE',gate:'UNAVAILABLE',
    whatsapp:'NOT CONNECTED',firebase:'NOT CONNECTED',
    deliveryEnabled:false,hardwareControlEnabled:false
  };
}
function digest(payload){
  return createHash('sha256').update(JSON.stringify(payload),'utf8').digest('hex');
}
function createSyntheticBackup(){
  const payload=syntheticState();
  return {kind:'FLOODGUARD_OFFLINE_BACKUP_EXERCISE_V1',sha256:digest(payload),payload};
}
function verifySyntheticBackup(item){
  if(!item||item.kind!=='FLOODGUARD_OFFLINE_BACKUP_EXERCISE_V1'
     ||typeof item.sha256!=='string'||!/^[0-9a-f]{64}$/.test(item.sha256)
     ||!item.payload||typeof item.payload!=='object'){
    throw new Error('Invalid synthetic backup format');
  }
  const actual=Buffer.from(digest(item.payload),'hex');
  const supplied=Buffer.from(item.sha256,'hex');
  if(!timingSafeEqual(actual,supplied))throw new Error('Synthetic backup checksum mismatch');
  // Only the exact offline fixture is accepted: no real state can be restored.
  if(JSON.stringify(item.payload)!==JSON.stringify(syntheticState())){
    throw new Error('Only the fixed synthetic offline fixture is supported');
  }
  return structuredClone(item.payload);
}
function runOfflineRecoveryDrill(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'floodguard-offline-drill-'));
  let verified=false,restored=false,tamperingRejected=false;
  try{
    const backupPath=path.join(dir,'synthetic-backup.json');
    const restoreDir=path.join(dir,'restored');
    fs.mkdirSync(restoreDir,{mode:0o700});
    fs.writeFileSync(backupPath,JSON.stringify(createSyntheticBackup()),{flag:'wx',mode:0o600});
    const source=JSON.parse(fs.readFileSync(backupPath,'utf8'));
    const expected=verifySyntheticBackup(source);
    verified=true;
    const altered=structuredClone(source);
    altered.payload.risk='SAFE';
    try{verifySyntheticBackup(altered);}catch{tamperingRejected=true;}
    if(!tamperingRejected)throw new Error('Corrupted synthetic backup was accepted');
    const target=path.join(restoreDir,'synthetic-restored.json');
    fs.writeFileSync(target,JSON.stringify(expected),{flag:'wx',mode:0o600});
    const check=JSON.parse(fs.readFileSync(target,'utf8'));
    restored=JSON.stringify(check)===JSON.stringify(syntheticState());
    if(!restored)throw new Error('Synthetic restore differs from original fixture');
  }finally{
    // The rehearsal only ever removes its own uniquely created temp folder.
    fs.rmSync(dir,{recursive:true,force:true});
  }
  return Object.freeze({
    mode:'SYNTHETIC OFFLINE ONLY',verified,restored,tamperingRejected,
    temporaryFilesRemoved:!fs.existsSync(dir),actualSessionBackupCreated:false,
    externalServicesContacted:false
  });
}
if(require.main===module){
  try{
    const result=runOfflineRecoveryDrill();
    process.stdout.write('FloodGuard synthetic recovery drill: '+(Object.values(result).slice(1,5).every(Boolean)?'PASS':'FAIL')+'\n');
    process.stdout.write('Backup integrity, tamper rejection, restore and cleanup checked in temporary synthetic storage only.\n');
    process.stdout.write('No WhatsApp auth, real DATA_PATH, Firebase or hardware was accessed. This does not validate a real encrypted backup.\n');
    if(!result.verified||!result.restored||!result.tamperingRejected||!result.temporaryFilesRemoved)process.exitCode=1;
  }catch{
    process.stderr.write('Synthetic recovery drill FAILED; no live services or session storage were accessed.\n');
    process.exitCode=1;
  }
}
module.exports={syntheticState,createSyntheticBackup,verifySyntheticBackup,runOfflineRecoveryDrill};
