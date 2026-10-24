/* Local demo transport. Synthetic data stays in server memory per browser session.
 * This adapter and its seed/runtime files never enter the Apps Script package.
 */
(() => {
  const sessionKey = 'sia-demo-session-v2';
  let session = sessionStorage.getItem(sessionKey);
  if (!session) { session = crypto.randomUUID(); sessionStorage.setItem(sessionKey, session); }
  const demo = new URLSearchParams(location.search).get('demo');
  const role = demo === 'teacher' ? 'guru' : 'admin';
  const schema = demo === 'legacy' ? 'v1' : 'v2';
  window.SIA_DEMO = {
    async call(method, args) {
      const response = await fetch('/__demo/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, role, schema, method, args }) });
      if (!response.ok) throw new Error('Server demo lokal mengalami gangguan.');
      const result = await response.json();
      if (!result.ok) {
        const error = new Error(result.error.message);
        error.code = result.error.code;
        throw error;
      }
      return result.data;
    }
  };
})();
