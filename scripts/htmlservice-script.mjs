// Apply after bundling: esbuild can emit XML and raw binary character literals.
// Keep host HTML processing separate from JavaScript's runtime string values.
export function escapeHtmlServiceScript(source) {
  const escaped = source
    // HTML parsing normalizes CRLF/lone CR before script execution. Emit that
    // representation at build time, including sources from Windows checkouts.
    .replace(/\r\n?/g, '\n')
    .replace(/<\?/g, '\\u003c?')
    .replace(/\?>/g, '?\\u003e')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
      (value) => `\\u${value.charCodeAt(0).toString(16).padStart(4, '0')}`);
  // Owned source is also inlined. Reject an accidental HTML script terminator
  // even when the JavaScript itself would parse successfully in vm.Script.
  if (/<\/script(?=[\s/>])/i.test(escaped)) throw new Error('Unsafe closing script tag in inline JavaScript.');
  return escaped;
}
