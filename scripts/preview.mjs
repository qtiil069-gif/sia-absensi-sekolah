import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build, root } from './build.mjs';
import { createDemo } from '../dev/seed.mjs';

await build();
const port = Number(process.env.PORT || 4173);
const sessions = new Map();
const methods = ['getBootstrap', 'getDashboard', 'listClasses', 'listStudents', 'queryStudents', 'getRosterOptions',
  'createClass', 'updateClass', 'deactivateClass', 'createStudent', 'updateStudent', 'deactivateStudent',
  'getAttendanceOptions', 'getAttendance', 'saveAttendance', 'getSchoolSettings', 'updateSchoolSettings', 'getStage3Status', 'migrateStage3', 'prepareStudentCards', 'exportStudentData', 'validateStudentQr', 'saveQrAttendance', 'getBrowserAsset'];
const server = createServer(async (req, res) => {
  if (req.url === '/__demo/rpc' && req.method === 'POST') {
    try {
      if (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`) throw new Error('Origin ditolak');
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 1048576) throw new Error('Permintaan terlalu besar');
      }
      const input = JSON.parse(body);
      if (!methods.includes(input.method) || !/^[a-f0-9-]{36}$/.test(input.session) || !['admin', 'guru'].includes(input.role)) throw new Error('Permintaan tidak valid');
      if (input.schema !== undefined && !['v1', 'v2'].includes(input.schema)) throw new Error('Skema demo tidak valid');
      const session = input.role + ':' + (input.schema || 'v2') + ':' + input.session;
      if (!sessions.has(session)) {
        if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
        sessions.set(session, createDemo(input.role, input.schema === 'v1'));
      }
      const result = sessions.get(session)[input.method](input.args);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(result));
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Permintaan demo ditolak.');
    }
    return;
  }
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
server.listen(port, '127.0.0.1', () => console.log(`Server demo aktif pada port ${port}. Data sintetis di memori sesi; tidak memakai Google. Mulai ulang setelah mengubah sumber.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
