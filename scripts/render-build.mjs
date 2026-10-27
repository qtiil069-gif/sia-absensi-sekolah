import { createHash } from 'node:crypto';

export function describeRenderContent(content) {
  const bytes = Buffer.from(content, 'utf8');
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

// No environment, timestamp or Git state: an ID identifies the emitted render
// files and the backend/configuration source used to build the same package.
export function createRenderBuild({ files, backend, manifest, schema }) {
  const metadata = Object.fromEntries(['Index', 'Styles', 'Scripts', 'RenderProbe'].map((name) =>
    [name, describeRenderContent(files[name])]));
  const scripts = files.Scripts;
  if (!scripts.startsWith('<script>') || !scripts.endsWith('</script>')) throw new Error('Invalid core script envelope.');
  const core = describeRenderContent(scripts.slice('<script>'.length, -'</script>'.length));
  const backendHashes = Object.fromEntries([...backend].sort(([a], [b]) => a === b ? 0 : a < b ? -1 : 1).map(([name, source]) =>
    [name, describeRenderContent(source).sha256]));
  const identity = JSON.stringify({ schema: 1, files: metadata, backend: backendHashes, manifest, databaseSchema: schema });
  return { schema: 1, id: createHash('sha256').update(identity, 'utf8').digest('hex'), files: metadata, core };
}
