'use strict';
// Subprocess-backed fixture tests: operator inspection must never mutate
// subscriber data or expose a phone number, token, path or raw exception.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const inspector = path.resolve(__dirname, '../scripts/inspect-subscriber-registry.js');
const first = 'synthetic-first@s.whatsapp.net';
const second = 'synthetic-second@lid';
function fixture(work) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-inspect-registry-'));
  try { work(dir); } finally { fs.rmSync(dir, {recursive:true, force:true}); }
}
function inspect(dir) {
  const result = spawnSync(process.execPath, [inspector], {
    cwd: path.resolve(__dirname, '..'), timeout: 2500, maxBuffer: 16000,
    encoding: 'utf8',
    env: {...process.env, DATA_PATH: dir, PRIVATE_FAKE_TOKEN: 'synthetic-secret'}
  });
  assert.equal(result.stderr, '');
  assert.doesNotMatch(result.stdout,
    /synthetic-first|synthetic-second|synthetic-secret|fg-inspect-registry|@lid|whatsapp\.net/);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(parsed),
    ['status', 'operatorReviewRequired', 'manualFallbackRequired']);
  return {exit: result.status, ...parsed};
}
const missing = {
  exit:3, status:'REGISTRY_UNAVAILABLE',
  operatorReviewRequired:true, manualFallbackRequired:true
};
test('fresh empty directory reports missing enrollment without changing files',()=>{
  fixture(dir=>{
    assert.deepEqual(inspect(dir),{
      exit:2,status:'NO_RECORDED_ENROLLMENT',
      operatorReviewRequired:true,manualFallbackRequired:true
    });
    assert.deepEqual(fs.readdirSync(dir),[]);
  });
});
test('read-only inspector distinguishes a valid legacy file and never seals it',()=>{
  fixture(dir=>{
    const file = path.join(dir, 'subscribers.json');
    fs.writeFileSync(file, JSON.stringify([first]));
    const before=fs.readFileSync(file);
    const mtime=fs.statSync(file).mtimeMs;
    assert.deepEqual(inspect(dir),{
      exit:2,status:'LEGACY_REGISTRY_UNSEALED',
      operatorReviewRequired:true,manualFallbackRequired:true
    });
    assert.deepEqual(fs.readFileSync(file), before);
    assert.equal(fs.statSync(file).mtimeMs,mtime);
    assert.deepEqual(fs.readdirSync(dir),['subscribers.json']);
  });
});
test('sealed registry reports presence without returning count or recipient IDs',()=>{
  fixture(dir=>{
    const file=path.join(dir,'subscribers.json');
    const marker=path.join(dir,'subscribers.ever-recorded');
    fs.writeFileSync(file,JSON.stringify([first,second]));
    fs.writeFileSync(marker,'floodguard-subscribers-recorded-v1\n');
    const before=fs.readFileSync(file), markerBefore=fs.readFileSync(marker);
    assert.deepEqual(inspect(dir),{
      exit:0,status:'REGISTRY_PRESENT',
      operatorReviewRequired:false,manualFallbackRequired:false
    });
    assert.deepEqual(fs.readFileSync(file),before);
    assert.deepEqual(fs.readFileSync(marker),markerBefore);
  });
});
test('an empty sealed registry never claims there are alert recipients',()=>{
  fixture(dir=>{
    fs.writeFileSync(path.join(dir,'subscribers.json'),'[]');
    fs.writeFileSync(path.join(dir,'subscribers.ever-recorded'),'sealed');
    assert.equal(inspect(dir).status,'EMPTY_ENROLLMENT');
    assert.equal(inspect(dir).exit,2);
  });
});
test('registered-file loss fails closed after independent marker persists',()=>{
  fixture(dir=>{
    fs.writeFileSync(path.join(dir,'subscribers.ever-recorded'),'sealed');
    assert.deepEqual(inspect(dir),missing);
    assert.deepEqual(fs.readdirSync(dir),['subscribers.ever-recorded']);
  });
});
test('no existing directory and unsafe symlinked directory fail closed',()=>{
  fixture(dir=>{
    assert.deepEqual(inspect(path.join(dir,'absent')),missing);
    const target=path.join(dir,'actual');
    fs.mkdirSync(target);
    const alias=path.join(dir,'symlink-folder');
    fs.symlinkSync(target,alias,'dir');
    assert.deepEqual(inspect(alias),missing);
  });
});
test('symlinked marker or canonical file cannot expose the target',()=>{
  fixture(dir=>{
    const target=path.join(dir,'hidden');
    fs.writeFileSync(target,JSON.stringify([first]));
    const canon=path.join(dir,'subscribers.json');
    const mark=path.join(dir,'subscribers.ever-recorded');
    fs.symlinkSync(target,canon);
    assert.deepEqual(inspect(dir),missing);
    fs.unlinkSync(canon);
    fs.writeFileSync(canon,JSON.stringify([first]));
    fs.symlinkSync(target,mark);
    assert.deepEqual(inspect(dir),missing);
    assert.equal(fs.readFileSync(target,'utf8'),JSON.stringify([first]));
  });
});
test('malformed, duplicate, invalid and oversized registries return only fixed errors',()=>{
  fixture(dir=>{
    const file=path.join(dir,'subscribers.json');
    const marker=path.join(dir,'subscribers.ever-recorded');
    fs.writeFileSync(marker,'sealed');
    for(const payload of [
      '{"subscribers":["synthetic-secret"]}', '{', JSON.stringify([first,first]),
      JSON.stringify(['private-not-a-jid']), JSON.stringify(Array(513).fill(first)),
      'synthetic-secret'.repeat(9000)
    ]){
      fs.writeFileSync(file,payload);
      const before=fs.readFileSync(file);
      assert.deepEqual(inspect(dir),missing);
      assert.deepEqual(fs.readFileSync(file),before);
    }
  });
});
