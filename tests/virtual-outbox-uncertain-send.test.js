'use strict';
// Offline-only test; never imports the actual WhatsApp session or Firebase.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createVirtualOutbox } = require('../src/virtualOutbox');
const A = 'fictional-a@s.whatsapp.net';
const B = 'fictional-b@s.whatsapp.net';

async function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-ambiguous-outbox-'));
  let time = Date.now();
  const now = () => time;
  const outbox = createVirtualOutbox({ dataDir: dir, now });
  const obs = { topic: 'water', phase: 'DANGER', sourceAt: now() - 1000 };
  outbox.observe(obs);
  try { await fn({ dir, outbox, obs, now }); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function queue(o, recipients=[A], key='fictional-hazard-1') {
  return { key, topic:o.topic, phase:o.phase, sourceAt:o.sourceAt,
    recipients, text:'SYNTHETIC DANGER: NOT A REAL WARNING', ttlMs:7000 };
}
function bounded(p, timeout=350) {
  return Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error('virtual drain hung')), timeout))
  ]);
}

test('a sender that never settles must time out and quarantine, not silently retry', () =>
  fixture(async ({outbox,obs,dir,now}) => {
    outbox.enqueue(queue(obs));
    let seenSignal;
    const result = await bounded(outbox.drain({
      observation:obs, authorizedRecipients:new Set([A]), sendTimeoutMs:20,
      send:async (_jid,_text,context) => {
        seenSignal=context?.signal;
        return new Promise(() => {});
      }
    }));
    assert.equal(result.attempted,1);
    assert.equal(result.ambiguous,1);
    assert.equal(result.accepted,0);
    assert.equal(result.failed,0);
    assert.equal(result.pending,0);
    assert.equal(outbox.summary().ambiguous,1);
    assert.ok(seenSignal instanceof AbortSignal);
    assert.equal(seenSignal.aborted,true,'abort is best-effort only');
    const reopened=createVirtualOutbox({dataDir:dir,now});
    reopened.observe(obs);
    let resend=0;
    const again=await bounded(reopened.drain({
      observation:obs,authorizedRecipients:new Set([A]),sendTimeoutMs:20,
      send:async()=>resend++
    }));
    assert.equal(again.attempted,0);
    assert.equal(resend,0,'uncertain remote acceptance must not be replayed');
  })
);

test('timeout on first recipient must not block subsequent synthetic recipient', () =>
  fixture(async ({outbox,obs}) => {
    outbox.enqueue(queue(obs,[A,B]));
    const seen=[];
    const result=await bounded(outbox.drain({
      observation:obs, authorizedRecipients:new Set([A,B]),sendTimeoutMs:20,
      send:async (jid) => {
        seen.push(jid);
        if(jid===A) return new Promise(()=>{});
      }
    }));
    assert.deepEqual(seen,[A,B]);
    assert.equal(result.ambiguous,1);
    assert.equal(result.accepted,1);
    assert.equal(result.pending,0);
  })
);

test('a late Promise fulfillment cannot restore an ambiguous job or trigger replay', () =>
  fixture(async ({outbox,obs,dir,now}) => {
    outbox.enqueue(queue(obs));
    let lateResolve;
    const result=await bounded(outbox.drain({
      observation:obs,authorizedRecipients:new Set([A]),sendTimeoutMs:20,
      send:async()=>new Promise(resolve=>{lateResolve=resolve;})
    }));
    assert.equal(result.ambiguous,1);
    lateResolve({synthetic:true});
    await new Promise(resolve=>setImmediate(resolve));
    const reopened=createVirtualOutbox({dataDir:dir,now});
    assert.equal(reopened.summary().pending,0);
    assert.equal(reopened.summary().ambiguous,1);
  })
);

test('unbounded, negative and noninteger remote send timeouts fail closed', () =>
  fixture(async ({outbox,obs}) => {
    outbox.enqueue(queue(obs));
    for(const sendTimeoutMs of [0,-1,6000,1.5,NaN,Infinity]) {
      await assert.rejects(outbox.drain({
        observation:obs,authorizedRecipients:new Set([A]),sendTimeoutMs,
        send:async()=>{}
      }),/timeout/i);
    }
    assert.equal(outbox.summary().pending,1);
  })
);


test('a restarted process quarantines a persisted in-flight attempt before any send', () =>
  fixture(async ({outbox,obs,dir,now}) => {
    outbox.enqueue(queue(obs));
    const filename=path.join(dir, 'alert-outbox-v1.json');
    const stored=JSON.parse(fs.readFileSync(filename,'utf8'));
    stored.pending[0].attempts=1;
    stored.pending[0].inFlight=true; // synthetic crash after remote attempt started
    fs.writeFileSync(filename,JSON.stringify(stored));
    const restarted=createVirtualOutbox({dataDir:dir,now});
    assert.equal(restarted.summary().pending,0);
    assert.equal(restarted.summary().ambiguous,1);
    restarted.observe(obs);
    let sends=0;
    const report=await restarted.drain({observation:obs,authorizedRecipients:new Set([A]),
      send:async()=>{sends++}});
    assert.equal(report.attempted,0);
    assert.equal(sends,0);
    const secondRestart=createVirtualOutbox({dataDir:dir,now});
    assert.equal(secondRestart.summary().ambiguous,1,
      'crash quarantine must only count an ambiguous job once');
  })
);

test('valid older outbox records without ambiguous counter remain readable', () =>
  fixture(async ({outbox,obs,dir,now}) => {
    outbox.enqueue(queue(obs));
    const filename=path.join(dir,'alert-outbox-v1.json');
    const stored=JSON.parse(fs.readFileSync(filename,'utf8'));
    delete stored.ambiguous;
    delete stored.pending[0].inFlight;
    fs.writeFileSync(filename,JSON.stringify(stored));
    const reopened=createVirtualOutbox({dataDir:dir,now});
    assert.equal(reopened.summary().pending,1);
    assert.equal(reopened.summary().ambiguous,0);
  })
);
