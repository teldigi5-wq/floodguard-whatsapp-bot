#!/usr/bin/env node
'use strict';
// Offline, read-only recipient-integrity audit. Do not import src/store:
// that module creates a data directory and can seal legacy subscriber files.
// Never print identifiers, file paths, secrets, raw errors or record counts.
const fs = require('node:fs');
const path = require('node:path');
const MAX_BYTES = 128 * 1024;
const MAX_RECIPIENTS = 512;
const VALID_JID = /^[A-Za-z0-9._:+-]{1,128}@(s\.whatsapp\.net|lid|g\.us)$/;
const failed = () => ({
  status: 'REGISTRY_UNAVAILABLE', operatorReviewRequired: true,
  manualFallbackRequired: true
});
const report = (status, review) => ({
  status, operatorReviewRequired: review, manualFallbackRequired: review
});
function regularStatus(filename) {
  try {
    const info = fs.lstatSync(filename);
    if (!info.isFile() || info.isSymbolicLink()) throw Error('Unsafe private record');
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw Error('Unavailable private record');
  }
}
function inspect() {
  let fd;
  try {
    const directory = process.env.DATA_PATH || path.join(process.cwd(), 'data');
    const dirInfo = fs.lstatSync(directory);
    if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink()) return failed();
    const canonical = path.join(directory, 'subscribers.json');
    const marker = path.join(directory, 'subscribers.ever-recorded');
    const hasMarker = regularStatus(marker);
    const hasCanonical = regularStatus(canonical);
    if (!hasCanonical && hasMarker) return failed();
    if (!hasCanonical) return report('NO_RECORDED_ENROLLMENT', true);
    fd = fs.openSync(canonical,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const info = fs.fstatSync(fd);
    if (!info.isFile() || !Number.isSafeInteger(info.size) ||
        info.size < 2 || info.size > MAX_BYTES) return failed();
    const buffer = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < info.size) {
      const got = fs.readSync(fd, buffer, offset, info.size - offset, offset);
      if (!got) return failed();
      offset += got;
    }
    const recipients = JSON.parse(buffer.toString('utf8'));
    if (!Array.isArray(recipients) || recipients.length > MAX_RECIPIENTS ||
        recipients.some(jid => typeof jid !== 'string' || !VALID_JID.test(jid)) ||
        new Set(recipients).size !== recipients.length) return failed();
    if (!hasMarker) return report('LEGACY_REGISTRY_UNSEALED', true);
    if (recipients.length === 0) return report('EMPTY_ENROLLMENT', true);
    return report('REGISTRY_PRESENT', false);
  } catch {
    return failed();
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
  }
}
const result = inspect();
process.stdout.write(JSON.stringify(result) + '\n');
process.exitCode = result.status === 'REGISTRY_UNAVAILABLE' ? 3 :
  result.operatorReviewRequired ? 2 : 0;
