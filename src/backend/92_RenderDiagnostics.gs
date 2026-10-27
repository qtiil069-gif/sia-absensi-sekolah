/** Opt-in rendering evidence. Never export page source, identities, or configuration. */
function renderDiagnostics_() {
  try { admin_(authorize_()); }
  catch (error) { return renderDiagnosticUnavailable_(); }

  var build;
  try { build = renderBuildMetadata_(); }
  catch (error) { return renderDiagnosticUnavailable_(); }
  var report = { schema: 1, build: build, server: { files: {},
    evaluated: { status: 'unavailable', coreCount: 0, core: null, coreMatchesRetrieved: false } },
    browser: { status: 'pending' } };
  var files = {};
  ['Index', 'Styles', 'Scripts', 'RenderProbe'].forEach(function (name) {
    try {
      files[name] = HtmlService.createHtmlOutputFromFile(name).getContent();
      var actual = renderFingerprint_(files[name]);
      actual.matchesBuild = renderSameFingerprint_(actual, build.files[name]);
      report.server.files[name] = actual;
    } catch (error) { report.server.files[name] = { status: 'unavailable', matchesBuild: false }; }
  });

  var retrieved = typeof files.Scripts === 'string' ? renderScriptCandidates_(files.Scripts) : [];
  var expected = retrieved.length === 1 && !retrieved[0].external &&
    !files.Scripts.slice(0, retrieved[0].start).trim() && !files.Scripts.slice(retrieved[0].end).trim() ? retrieved[0] : null;
  if (expected) {
    report.server.retrievedCore = renderFingerprint_(expected.body);
    report.server.retrievedCore.matchesBuild = renderSameFingerprint_(report.server.retrievedCore, build.core);
  } else report.server.retrievedCore = { status: 'ambiguous-core', coreCount: retrieved.length, matchesBuild: false };

  var evaluated;
  var candidates = [];
  try {
    evaluated = HtmlService.createTemplateFromFile('Index').evaluate()
      .setTitle('SIA Sekolah · Dashboard')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1').getContent();
    var result = renderFingerprint_(evaluated);
    candidates = renderScriptCandidates_(evaluated);
    result.status = candidates.length === 1 && !candidates[0].external ? 'ok' : 'ambiguous-core';
    result.coreCount = candidates.length;
    result.core = result.status === 'ok' ? renderFingerprint_(candidates[0].body) : null;
    if (result.core) result.core.matchesBuild = renderSameFingerprint_(result.core, build.core);
    result.coreMatchesRetrieved = !!result.core && !!expected && renderSameFingerprint_(result.core, report.server.retrievedCore);
    report.server.evaluated = result;
  } catch (error) { /* Metadata already records the failed stage; never serialize exceptions. */ }

  var usable = typeof evaluated === 'string' && report.server.evaluated.status === 'ok' && expected &&
    typeof files.RenderProbe === 'string' && /<body\b[^>]*>/i.test(evaluated);
  if (!usable) {
    var standalone = '<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Diagnostik rendering</title></head><body>' +
      renderDiagnosticControls_(report, expected ? expected.body : '') + (files.RenderProbe || '') + '</body></html>';
    return renderDiagnosticOutput_(standalone);
  }
  var core = candidates[0];
  // Change only the opening tag in this explicitly requested diagnostic page.
  // Attribute tokens consume quoted values completely before matching an id.
  var opening = core.opening.replace(/(\s+)([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g,
    function (attribute, space, name) { return name.toLowerCase() === 'id' ? '' : attribute; });
  opening = opening.replace(/<script\b/i, '<script id="sia-render-core"');
  var after = '<script>window.SIA_RENDER_PROBE && window.SIA_RENDER_PROBE.afterCore();</script>';
  var page = evaluated.slice(0, core.start) + files.RenderProbe + opening + core.body + core.closing + after + evaluated.slice(core.end);
  page = page.replace(/<body\b[^>]*>/i, function (tag) { return tag + renderDiagnosticControls_(report, expected.body); });
  return renderDiagnosticOutput_(page);
}

function renderDiagnosticUnavailable_() {
  return renderDiagnosticOutput_('<!doctype html><html lang="id"><head><meta charset="utf-8"></head><body>' +
    '<p>Diagnostik rendering tidak tersedia untuk permintaan ini.</p></body></html>');
}

function renderDiagnosticOutput_(html) {
  return HtmlService.createHtmlOutput(html).setTitle('Diagnostik rendering · SIA Sekolah')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function renderFingerprint_(text) {
  if (typeof text !== 'string') throw new Error('Static content unavailable.');
  return { bytes: Utilities.newBlob(text, 'text/plain').getBytes().length,
    sha256: Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
      .map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('') };
}

function renderSameFingerprint_(left, right) {
  return !!left && !!right && left.bytes === right.bytes && left.sha256 === right.sha256;
}

function renderBuildMetadata_() {
  var raw = RenderBuild_;
  if (!raw || raw.schema !== 1 || typeof raw.id !== 'string' || !/^[a-f0-9]{64}$/.test(raw.id) || !raw.files) {
    throw new Error('Build evidence unavailable.');
  }
  function onlyFingerprint(value) {
    if (!value || !Number.isInteger(value.bytes) || value.bytes < 0 || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) {
      throw new Error('Build fingerprint unavailable.');
    }
    return { bytes: value.bytes, sha256: value.sha256 };
  }
  var clean = { schema: 1, id: raw.id, files: {}, core: onlyFingerprint(raw.core) };
  ['Index', 'Styles', 'Scripts', 'RenderProbe'].forEach(function (name) { clean.files[name] = onlyFingerprint(raw.files[name]); });
  return clean;
}

function renderScriptCandidates_(html) {
  var result = [];
  var expression = /(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi;
  var match;
  while ((match = expression.exec(html))) {
    var type = /(?:\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(match[1]);
    var value = type ? (type[1] || type[2] || type[3] || '').trim().toLowerCase() : '';
    if (value && value !== 'module' && !/^(?:text|application)\/(?:java|ecma)script$/.test(value)) continue;
    result.push({ start: match.index, end: expression.lastIndex, opening: match[1], body: match[2], closing: match[3],
      external: /\ssrc\s*=/i.test(match[1]) });
  }
  return result;
}

function renderEscapeText_(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderDiagnosticControls_(report, expected) {
  var encoded = Utilities.base64Encode(expected, Utilities.Charset.UTF_8);
  return '<section id="sia-render-diagnostics" aria-label="Diagnostik rendering" style="position:relative;z-index:1000;background:white;padding:16px;margin:16px;overflow-wrap:anywhere">' +
    '<h1>Diagnostik rendering</h1><p>Build: <code id="sia-render-build">' + renderEscapeText_(report.build.id) + '</code></p>' +
    '<p>Laporan hanya memuat metadata berkas statis, tanpa data sekolah atau identitas akun. Jika tombol tidak bekerja, pilih dan salin isi kotak laporan secara manual.</p>' +
    '<p id="sia-render-status" role="status">Laporan server tersedia. Menunggu pemeriksaan browser.</p>' +
    '<button type="button" id="sia-render-refresh">Perbarui laporan</button> ' +
    '<button type="button" id="sia-render-download">Unduh laporan JSON</button>' +
    '<textarea id="sia-render-report" aria-label="Laporan diagnostik" rows="14" readonly style="display:block;width:100%;box-sizing:border-box;font:12px/1.5 monospace">' + renderEscapeText_(JSON.stringify(report, null, 2)) + '</textarea>' +
    '<textarea id="sia-render-expected" hidden readonly aria-hidden="true">' + encoded + '</textarea></section>';
}
