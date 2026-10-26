import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describeSource, compareSources } from '../scripts/audit-htmlservice.mjs';

test('audit compiles valid XML/Unicode/Base64 literals without executing copied JavaScript', () => {
  const source = 'globalThis.__auditMustNotExecute = true; const data = "AAAL0AAAAAACAAAAbW50clJHQi"; const xml = `<?xml?>`; const name = "Sekolah … 日本語";';
  const report = describeSource(source);
  assert.equal(report.bytes, Buffer.byteLength(source));
  assert.equal(report.sha256, createHash('sha256').update(source).digest('hex'));
  assert.equal(report.utf8Roundtrip, true);
  assert.equal(report.syntax.valid, true);
  assert.equal(globalThis.__auditMustNotExecute, undefined);
});

test('audit flags a deliberately cropped literal but does not label its production origin', () => {
  const full = 'const profile = "AAAL0AAAAAACAAAAbW50clJHQi";';
  const cropped = full.slice(0, -3);
  assert.equal(describeSource(full).syntax.valid, true);
  assert.equal(describeSource(cropped).syntax.valid, false);
  const comparison = compareSources(cropped, full);
  assert.equal(comparison.exactMatch, false);
  assert.equal(comparison.captureMatchesCandidatePrefix, true);
  assert.equal(comparison.commonPrefixBytes, Buffer.byteLength(cropped));
  assert.equal(comparison.firstDifference.captureEnded, true);
  assert.equal(comparison.firstDifference.candidateEnded, false);
  assert.ok(!JSON.stringify(comparison).includes('truncated'));
});

test('audit compares exact bytes, including Unicode, wrappers and trailing newlines', () => {
  const source = 'const name = "Sekolah …";\n';
  const same = compareSources(source, Buffer.from(source));
  assert.equal(same.exactMatch, true);
  assert.equal(same.firstDifference, null);
  assert.equal(same.commonPrefixBytes, Buffer.byteLength(source));
  assert.equal(same.commonSuffixBytes, Buffer.byteLength(source));
  assert.equal(compareSources(source.trimEnd(), source).exactMatch, false);
  assert.equal(compareSources(`<script>${source}</script>`, source).exactMatch, false);
  const different = compareSources('one\nSECOND\ntail', 'one\nsecond\ntail');
  assert.equal(different.commonPrefixBytes, 4);
  assert.equal(different.commonSuffixBytes, 5);
  assert.deepEqual(different.firstDifference.capture, { line: 2, columnBytes: 1 });
});

test('audit never prints captured source, identifier names or invalid UTF-8 bytes', () => {
  const secret = 'DO_NOT_ECHO_PRIVATE_IDENTIFIER';
  const report = describeSource(`const publicName = 1 ${secret};`);
  assert.equal(report.syntax.valid, false);
  assert.ok(!JSON.stringify(report).includes(secret));
  assert.equal(describeSource(Buffer.from([0xff, 0xfe, 0x00])).utf8Roundtrip, false);
});
