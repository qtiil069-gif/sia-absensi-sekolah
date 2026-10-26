import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { escapeHtmlServiceScript } from '../scripts/htmlservice-script.mjs';

const evaluate = (source) => {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return Array.from(context.values);
};

test('inline source uses canonical LF for CRLF and lone CR without changing JavaScript values', () => {
  const lf = [
    'const multiline = `A', 'B', 'C`;',
    String.raw`const escaped = "\r\n";`,
    'const continued = "A' + '\\', 'B";',
    'const raw = String.raw`A', 'B`;',
    'globalThis.values = [multiline, escaped, continued, raw, "Sekolah … 日本語", "AAAL0AAA=="];', ''
  ].join('\n');
  const expected = ['A\nB\nC', '\r\n', 'AB', 'A\nB', 'Sekolah … 日本語', 'AAAL0AAA=='];
  for (const ending of ['\n', '\r\n', '\r']) {
    const source = lf.replace(/\n/g, ending);
    const encoded = escapeHtmlServiceScript(source);
    assert.equal(encoded, escapeHtmlServiceScript(lf));
    assert.doesNotMatch(encoded, /\r/);
    assert.deepEqual(evaluate(source), expected);
    assert.deepEqual(evaluate(encoded), expected);
    assert.equal(escapeHtmlServiceScript(encoded), encoded);
  }
});

test('canonicalization retains escaped CR/LF, content changes and significant byte differences', () => {
  const source = String.raw`const value = "\r\n ABC …";` + '\n';
  assert.equal(escapeHtmlServiceScript(source.replace(/\n/g, '\r\n')), source);
  assert.notEqual(escapeHtmlServiceScript(source.replace('ABC', 'ABD')), source);
  assert.notEqual(escapeHtmlServiceScript(source.trimEnd()), source);
  assert.notEqual(escapeHtmlServiceScript('\n' + source), source);
  assert.notEqual(escapeHtmlServiceScript(source + ' '), source);
});

test('inline source rejects debug directives embedded inside valid string literals', () => {
  for (const marker of ['//# sourceURL=asset.js', '//@ sourceURL=asset.js',
    '//# sourceMappingURL=asset.js.map', '//@ sourceMappingURL=asset.js.map']) {
    const source = 'const debug = ' + JSON.stringify('\n' + marker + '\n') + ';';
    assert.doesNotThrow(() => new vm.Script(source));
    assert.throws(() => escapeHtmlServiceScript(source), /sourceURL\/sourceMappingURL/);
  }
});
