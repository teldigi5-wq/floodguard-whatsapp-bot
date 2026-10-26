'use strict';

const fs=require('node:fs');
const path=require('node:path');
const { parseMode }=require('./hosting');
const { validToken }=require('./adminAccess');

// Read-only, offline checks. Never connect to Firebase/WhatsApp, inspect private
// session contents, or print environment variable values or filesystem paths.
function inspectConfig(env, options={}) {
  const cwd=options.cwd || process.cwd();
  const nodeVersion=options.nodeVersion || process.versions.node;
  const entries=[];
  const add=(kind,id,message)=>entries.push(Object.freeze({kind,id,message}));
  const match=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(nodeVersion));
  const parts=match ? match.slice(1).map(Number) : [];
  const [major,minor,patch]=parts;
  const patched=parts.length===3 && (
    (major===22 && (minor>23 || (minor===23 && patch>=4))) ||
    (major===24 && (minor>22 || (minor===22 && patch>=1)))
  );
  if(patched) add('pass','node','Patched Node.js 22/24 runtime detected.');
  else add('fail','node','A patched Node.js 22.23.4+ or 24.22.1+ runtime is required by the deployment policy.');

  let mode=null;
  try { mode=parseMode(env.FLOODGUARD_HOST_MODE);add('pass','mode','Host profile is valid.'); }
  catch { add('fail','mode','Host profile must be pc or ec2.'); }

  const host=env.HOST||'127.0.0.1';
  if(['127.0.0.1','localhost','::1'].includes(host)) {
    add('pass','binding','Admin HTTP listener is configured for local-only access.');
  } else {
    add('fail','binding','Bind admin HTTP to 127.0.0.1 and use a private tunnel or HTTPS reverse proxy.');
  }

  const port=Number(env.PORT||8080);
  if(Number.isInteger(port)&&port>=1&&port<=65535) add('pass','port','HTTP port is syntactically valid (availability not checked).');
  else add('fail','port','HTTP port must be an integer from 1 through 65535.');

  const token=env.FLOODGUARD_SETUP_TOKEN;
  if(validToken(token)&&new Set(token).size>=6) {
    add('pass','setup-token','Private setup token meets the basic length and format checks.');
  } else {
    add('fail','setup-token','Set a unique randomly generated setup token of at least 32 printable characters.');
  }

  try {
    const u=new URL(env.FIREBASE_DATABASE_URL||'');
    const accepted=/^[a-z0-9-]+\.(?:[a-z0-9-]+\.)*(?:firebasedatabase\.app|firebaseio\.com)$/i.test(u.hostname);
    if(u.protocol!=='https:'||!accepted||u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('invalid');
    add('pass','firebase-url','Firebase RTDB origin has an HTTPS URL format (connectivity not checked).');
  } catch { add('fail','firebase-url','Set an HTTPS Firebase Realtime Database origin without credentials or query strings.'); }

  const rawData=env.DATA_PATH||'./data';
  if(mode==='ec2'&&!path.isAbsolute(rawData)){
    add('fail','data-path','EC2 data directory must be an absolute path on durable storage.');
  } else {
    const dir=path.resolve(cwd,rawData);
    try {
      if(!fs.statSync(dir).isDirectory())throw Error('not directory');
      fs.accessSync(dir,fs.constants.R_OK|fs.constants.W_OK);
      add('pass','data-path','Session data directory exists and is accessible (durability not verified).');
      if(fs.existsSync(path.join(dir,'auth'))) {
        add('pass','session','Private session folder exists; WhatsApp session validity not checked.');
      } else {
        add('warn','session','No previous session folder was found; a new authorized QR pairing may be required.');
      }
    } catch {
      add('fail','data-path','Session data directory is missing or not accessible; create it privately before starting.');
    }
  }

  const threshold=Number(env.FLOODGUARD_STALE_MS || '15000');
  if(Number.isFinite(threshold)&&threshold>=1000&&threshold<=300000)
    add('pass','stale-threshold','Telemetry stale-data threshold is within expected bounds.');
  else
    add('fail','stale-threshold','Use a stale-data threshold between 1000 and 300000 milliseconds.');

  return Object.freeze({entries,ok:!entries.some(x=>x.kind==='fail')});
}
function formatReport(report) {
  const symbol={pass:'PASS',warn:'WARN',fail:'FAIL'};
  return [
    'FloodGuard offline deployment preflight (no network access)',
    ...report.entries.map(x=>symbol[x.kind]+' '+x.id+': '+x.message),
    report.ok?'RESULT: configuration checks passed; real connectivity still unverified.':'RESULT: configuration checks failed; do not start the bot yet.'
  ].join('\n');
}
module.exports={inspectConfig,formatReport};
