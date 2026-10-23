import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build, root } from './build.mjs';

await build();
const port = Number(process.env.PORT || 4173);
const server = createServer(async (req, res) => {
  if (req.url?.split('?')[0] !== '/' && req.url?.split('?')[0] !== '/index.html') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Tidak ditemukan');
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  try {
    const html = await readFile(path.join(root, '.preview/index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : html);
  } catch {
    res.writeHead(500);
    res.end('Build lokal tidak tersedia. Jalankan ulang npm run dev.');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Server demo aktif pada port ${port}. Data dummy, tanpa penyimpanan. Mulai ulang setelah mengubah sumber.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
