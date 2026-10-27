/* Independent, opt-in diagnostic probe. Never read application data or URLs. */
(function () {
  'use strict';
  var reportBox = document.getElementById('sia-render-report');
  var expectedBox = document.getElementById('sia-render-expected');
  var status = document.getElementById('sia-render-status');
  if (!reportBox || !expectedBox || !status) return;
  var initial;
  try { initial = JSON.parse(reportBox.value); } catch (_) { return; }
  var afterReached = false;
  var sequence = 0;
  var errors = [];
  var latest = initial;

  function publish(report, message) {
    latest = report;
    reportBox.value = JSON.stringify(report, null, 2);
    status.textContent = message;
  }
  function freshReport() { return JSON.parse(JSON.stringify(initial)); }
  function codeUnit(text, index) {
    if (index < 0 || index >= text.length) return null;
    return 'U+' + ('0000' + text.charCodeAt(index).toString(16).toUpperCase()).slice(-4);
  }
  function position(text, offset) {
    var before = text.slice(0, offset);
    var lineStart = before.lastIndexOf('\n') + 1;
    return { offsetUTF16: offset, line: before.split('\n').length, columnUTF16: offset - lineStart + 1 };
  }
  function facts(text) {
    var lines = text.split('\n');
    var found = [];
    var offset = text.indexOf('Pustaka');
    while (offset !== -1 && found.length < 8) {
      var location = position(text, offset);
      var nearby = [];
      for (var line = Math.max(1, location.line - 15); line <= Math.min(lines.length, location.line + 2); line++) {
        var value = lines[line - 1];
        nearby.push({ line: line, lengthUTF16: value.length,
          backticks: (value.match(/\x60/g) || []).length,
          singleQuotes: (value.match(/'/g) || []).length,
          doubleQuotes: (value.match(/"/g) || []).length,
          finalCodeUnit: codeUnit(value, value.length - 1) });
      }
      location.precedingCodeUnit = codeUnit(text, offset - 1);
      location.nearbyQuoteCounts = nearby;
      found.push(location);
      offset = text.indexOf('Pustaka', offset + 7);
    }
    return { utf16Units: text.length, lines: lines.length, cr: (text.match(/\r/g) || []).length,
      debugAnnotations: (text.match(/\/\/[#@]\s*source(?:Mapping)?URL\s*=/g) || []).length,
      pustaka: found };
  }
  function fingerprint(text) {
    var result = facts(text);
    var bytes = new TextEncoder().encode(text);
    result.bytes = bytes.length;
    if (!window.crypto || !window.crypto.subtle) {
      result.sha256 = null;
      return Promise.resolve(result);
    }
    return window.crypto.subtle.digest('SHA-256', bytes).then(function (hash) {
      var hex = '';
      var values = new Uint8Array(hash);
      for (var index = 0; index < values.length; index++) hex += ('0' + values[index].toString(16)).slice(-2);
      result.sha256 = hex;
      return result;
    });
  }
  function difference(expected, actual) {
    var offset = 0;
    while (offset < Math.min(expected.length, actual.length) && expected.charAt(offset) === actual.charAt(offset)) offset++;
    if (offset === expected.length && offset === actual.length) return null;
    var result = position(actual, offset);
    result.expectedPosition = position(expected, offset);
    result.expectedCodeUnit = codeUnit(expected, offset);
    result.actualCodeUnit = codeUnit(actual, offset);
    result.expectedEnded = offset === expected.length;
    result.actualEnded = offset === actual.length;
    return result;
  }
  function capture() {
    var request = ++sequence;
    var report = freshReport();
    var elements = document.querySelectorAll('#sia-render-core');
    report.browser = { status: 'capturing', beforeProbeRan: true, afterCoreReached: afterReached,
      coreCount: elements.length, errors: errors.slice(), coreNamespacePresent: !!window.SIA };
    if (elements.length !== 1) {
      report.browser.status = 'core_not_found_or_ambiguous';
      publish(report, 'Core tidak ditemukan atau ambigu. Laporan server tetap tersedia.');
      return;
    }
    if (typeof TextEncoder !== 'function' || typeof TextDecoder !== 'function') {
      report.browser.status = 'text_tools_unavailable';
      publish(report, 'Browser tidak mendukung pemeriksaan byte. Laporan server tetap tersedia.');
      return;
    }
    try {
      var binary = atob(expectedBox.value);
      var bytes = new Uint8Array(binary.length);
      for (var index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      var expected = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      var actual = elements[0].textContent;
      Promise.all([fingerprint(expected), fingerprint(actual)]).then(function (values) {
        if (request !== sequence) return;
        report.browser.expectedRetrievedCore = values[0];
        report.browser.core = values[1];
        report.browser.firstDifference = difference(expected, actual);
        report.browser.matchesRetrievedCore = values[1].sha256 && values[0].sha256
          ? values[1].sha256 === values[0].sha256 && values[1].bytes === values[0].bytes : null;
        report.browser.matchesBuildCore = values[1].sha256 && report.build && report.build.core
          ? values[1].sha256 === report.build.core.sha256 && values[1].bytes === report.build.core.bytes : null;
        var evaluated = report.server && report.server.evaluated && report.server.evaluated.core;
        report.browser.matchesEvaluatedCore = values[1].sha256 && evaluated
          ? values[1].sha256 === evaluated.sha256 && values[1].bytes === evaluated.bytes : null;
        report.browser.status = values[1].sha256 ? 'complete' : 'hash_unavailable';
        publish(report, values[1].sha256 ? 'Laporan browser siap. Unduh atau salin laporan di bawah.' : 'Hash browser tidak tersedia. Metadata server dan posisi tetap dapat disalin.');
      }).catch(function () {
        if (request !== sequence) return;
        report.browser.status = 'capture_failed';
        publish(report, 'Probe tidak dapat menyelesaikan pemeriksaan. Salin laporan server dan sumber VM dari DevTools.');
      });
    } catch (_) {
      report.browser.status = 'expected_payload_invalid';
      publish(report, 'Data pembanding tidak utuh. Salin laporan server.');
    }
  }
  window.addEventListener('error', function (event) {
    if (errors.length >= 8) return;
    var message = String(event.message || '');
    var kind = /Pustaka/.test(message) && /Unexpected identifier/.test(message) ? 'SYNTAX_PUSTAKA'
      : /SyntaxError|Invalid or unexpected token|Unexpected identifier/.test(message) ? 'SYNTAX_OTHER' : 'OTHER';
    errors.push({ kind: kind, line: Number(event.lineno) || 0, column: Number(event.colno) || 0 });
    setTimeout(capture, 0);
  });
  var refresh = document.getElementById('sia-render-refresh');
  if (refresh) refresh.addEventListener('click', capture);
  var download = document.getElementById('sia-render-download');
  if (download) download.addEventListener('click', function () {
    try {
      var blob = new Blob([JSON.stringify(latest, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'sia-render-' + String(initial.build && initial.build.id || 'unknown').slice(0, 12) + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (_) { status.textContent = 'Unduh dibatasi browser. Pilih dan salin seluruh isi kotak laporan.'; }
  });
  window.SIA_RENDER_PROBE = { afterCore: function () { afterReached = true; capture(); } };
  var started = freshReport();
  started.browser = { status: 'probe_started', beforeProbeRan: true, afterCoreReached: false };
  publish(started, 'Probe browser aktif; menunggu core dan akhir parsing.');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', capture);
  else setTimeout(capture, 0);
})();
