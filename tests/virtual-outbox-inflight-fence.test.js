'use strict';
// Synthetic-only outbox lifecycle tests, no WhatsApp, network, or Firebase.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createVirtualOutbox } = require('../src/virtualOutbox');
const A = 'synthetic-first@s.whatsapp.net';
const B = 'synthetic-second@s.whatsapp.net';

async function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-inflight-fence-'));
  let clock = Date.now();
  const now = () => clock;
  const box = createVirtualOutbox({ dataDir:dir, now, exclusive:true });
  try { await fn({box, dir, now}); }
  finally {
    try { box.close(); } catch {}
    fs.rmSync(dir, {recursive:true, force:true});
  }
}
function makeObservation(now, phase='DANGER', offset=1000) {
  return {topic:'water', phase, sourceAt:now()-offset};
}
function enqueue(box, o) {
  box.observe(o);
  box.enqueue({key:'synthetic-danger-1', topic:o.topic, phase:o.phase,
    sourceAt:o.sourceAt, recipients:[A,B],
    text:'SYNTHETIC ALERT - NOT A REAL FLOOD WARNING', ttlMs:7000});
}
function deferred() {
  let release;
  const promise = new Promise(resolve => {release=resolve;});
  return {promise,release};
}

test('SAFE supersession during a slow first delivery prevents remaining DANGER sends', () =>
  fixture(async({box,now})=>{
    const danger=makeObservation(now);
    enqueue(box,danger);
    const gate=deferred(), entered=deferred(), seen=[];
    const running=box.drain({observation:danger,
      authorizedRecipients:new Set([A,B]),sendTimeoutMs:3000,
      send:async jid=>{
        seen.push(jid);
        if(jid===A) {entered.release(); await gate.promise;}
      }
    });
    await entered.promise;
    const safe={...danger,phase:'SAFE',sourceAt:danger.sourceAt+100};
    assert.equal(box.observe(safe),true);
    gate.release();
    await running;
    assert.deepEqual(seen,[A], 'the still-pending B must never receive superseded DANGER');
    assert.equal(box.summary().pending,0);
    assert.equal(box.summary().superseded,2);
  })
);

test('exclusive ownership cannot be released while a remote send is in progress', () =>
  fixture(async({box,dir,now})=>{
    const danger=makeObservation(now);
    enqueue(box,danger);
    const gate=deferred(),entered=deferred();
    const running=box.drain({observation:danger,
      authorizedRecipients:new Set([A,B]),sendTimeoutMs:3000,
      send:async jid=>{
        if(jid===A){entered.release();await gate.promise;}
      }
    });
    await entered.promise;
    assert.throws(()=>box.close(),/in.?flight|drain|busy|active/i);
    assert.throws(()=>createVirtualOutbox({dataDir:dir,now,exclusive:true}),
      /exclusive|owner|locked/i);
    gate.release();
    await running;
    box.close();
    const subsequent=createVirtualOutbox({dataDir:dir,now,exclusive:true});
    subsequent.close();
  })
);

test('losing exclusive ownership during a remote send stops the old worker', () =>
  fixture(async({box,dir,now})=>{
    const danger=makeObservation(now);
    enqueue(box,danger);
    const gate=deferred(), entered=deferred(), seen=[];
    const running=box.drain({observation:danger,
      authorizedRecipients:new Set([A,B]),sendTimeoutMs:3000,
      send:async jid=>{
        seen.push(jid);
        if(jid===A){entered.release();await gate.promise;}
      }
    });
    await entered.promise;
    // Simulates deliberate operator intervention; not recommended recovery.
    fs.unlinkSync(path.join(dir,'alert-outbox-v1.owner'));
    const replacement=createVirtualOutbox({dataDir:dir,now,exclusive:true});
    try {
      gate.release();
      await assert.rejects(running,/exclusive|owner|lost/i);
      assert.deepEqual(seen,[A]);
      assert.equal(replacement.summary().ambiguous,1,
        'restart quarantines the in-flight attempt');
    } finally {replacement.close();}
  })
);


test('fake dispatch begins before a queued microtask can supersede the field observation', () =>
  fixture(async({box,now})=>{
    const danger=makeObservation(now);
    enqueue(box,danger);
    let safeApplied=false;
    const seen=[];
    const running=box.drain({observation:danger,
      authorizedRecipients:new Set([A,B]),sendTimeoutMs:3000,
      send:async jid=>{
        assert.equal(safeApplied,false,'send callback must not start after newer SAFE was observed');
        seen.push(jid);
      }
    });
    safeApplied=true;
    const safe={...danger,phase:'SAFE',sourceAt:danger.sourceAt+200};
    box.observe(safe);
    await running;
    assert.deepEqual(seen,[A], 'subsequent old DANGER job must not dispatch after SAFE');
  })
);
