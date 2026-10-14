'use strict';
const express=require('express');
const {createHash}=require('node:crypto');
const { createAdminGuard,validToken }=require('./adminAccess');
const { describeHost }=require('./hosting');
const { renderCommandCenter }=require('./demoCommandCenter');
const { previewReply }=require('./demoReplies');
const { getDemoState }=require('./demoFixtures');

// Synthetic admin/UI preview. DO NOT import bot.js, src/firebase.js,
// Baileys, any session store, or any real networking client here.
function createDemoApp({token,port=8080,host='127.0.0.1'}={}) {
  if (!validToken(token)) throw new Error('A strong private FLOODGUARD_SETUP_TOKEN is required for demo access.');
  if (host!=='127.0.0.1' && host!=='::1') throw new Error('Offline demo must bind to localhost only.');
  const app=express();
  app.disable('x-powered-by');
  // No inline JavaScript/style escape hatch. Hash only the static demo page's
  // exact contents, then block all other scripts, network origins and frames.
  const demoPage=renderCommandCenter();
  function inlineHash(tag){
    const startTag='<'+tag+'>';
    const start=demoPage.indexOf(startTag);
    const end=demoPage.indexOf('</'+tag+'>',start+startTag.length);
    if(start<0||end<0)throw new Error('Missing demo '+tag+' content');
    return "'sha256-"+createHash('sha256').update(demoPage.slice(start+startTag.length,end),'utf8').digest('base64')+"'";
  }
  const policy=[
    "default-src 'none'","connect-src 'self'","img-src 'none'",
    'script-src '+inlineHash('script'),'style-src '+inlineHash('style'),
    "base-uri 'none'","form-action 'none'","frame-ancestors 'none'",
    "object-src 'none'","upgrade-insecure-requests"
  ].join('; ');
  app.use((req,res,next)=>{
    res.set('Content-Security-Policy',policy);
    res.set('Cache-Control','private, no-store');
    res.set('X-Content-Type-Options','nosniff');
    res.set('Referrer-Policy','no-referrer');
    res.set('Cross-Origin-Resource-Policy','same-origin');
    res.set('X-Frame-Options','DENY');
    res.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    // Avoid browser DNS-rebinding or cross-site requests reaching a privileged
    // localhost demo. Check the *actual listener port*, not user-supplied data.
    const authority=(host==='::1'?'[::1]':'127.0.0.1')+':'+req.socket.localPort;
    if(req.get('host')!==authority)return res.status(421).type('text/plain').send('Unexpected local request authority.');
    const origin=req.get('origin');
    if(origin && origin!=='http://'+authority)return res.status(403).type('text/plain').send('Cross-origin access is not allowed.');
    const site=req.get('sec-fetch-site');
    if(site && site!=='none' && site!=='same-origin')return res.status(403).type('text/plain').send('Cross-site access is not allowed.');
    next();
  });
  const guard=createAdminGuard(token);
  app.get('/',guard,(_req,res)=>{
    res.set('Cache-Control','private, no-store');
    res.type('html').send(demoPage);
  });
  app.get('/status',guard,(_req,res)=>{
    res.set('Cache-Control','private, no-store');
    res.json({
      status:'demo',whatsapp:'DEMO_MODE',firebase:'NOT_CONNECTED',
      demoMode:true,connectedNumber:null,hasQr:false,
      qrVersion:null,qrGeneratedAt:0,lastError:null
    });
  });
  app.get('/hosting',guard,(_req,res)=>{
    res.set('Cache-Control','private, no-store');
    res.json({...describeHost({mode:'pc',host,port}),demoMode:true});
  });
  app.get('/demo/state',guard,(req,res)=>{
    res.set('Cache-Control','private, no-store');
    try {
      if(typeof req.query.scenario!=='string')return res.status(400).json({error:'Choose a synthetic scenario.'});
      res.json(getDemoState(req.query.scenario));
    } catch { res.status(400).json({error:'Unsupported synthetic scenario.'}); }
  });
  app.get('/demo/preview',guard,(req,res)=>{
    res.set('Cache-Control','private, no-store');
    try {
      const scenario=req.query.scenario;
      const command=req.query.command;
      if(typeof scenario!=='string'||typeof command!=='string')return res.status(400).json({error:'Choose a supported command and scenario.'});
      res.json({demoMode:true,delivered:false,reply:previewReply(command,scenario)});
    } catch {
      res.status(400).json({error:'Only approved read-only demo commands and scenarios are supported.'});
    }
  });
  // There is no WhatsApp QR code, no session and no pairing route.
  app.get('/qr',guard,(_req,res)=>res.sendStatus(404));
  app.get('/health',(_req,res)=>{
    res.set('Cache-Control','no-store');
    res.json({status:'ok',service:'FloodGuard offline demo'});
  });
  app.use((_req,res)=>res.sendStatus(404));
  return app;
}
module.exports={createDemoApp};
