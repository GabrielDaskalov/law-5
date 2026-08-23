/**
 * Малък сървър за проверка: сервира сглобения сайт и препраща /api и
 * /health към backend-а. В production това го прави nginx.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.argv[2] || 'dist';
// 3000 е портът в backend/.env.example. Тук стоеше 4700 — порт от машина,
// на която е писан скриптът; на всяка друга препращането отиваше в нищото и
// сайтът изглеждаше „без сървър“, макар backend-ът да работи.
const API = process.env.API_TARGET || 'http://localhost:3000';
const PORT = Number(process.env.PORT || 8080);

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.map':'application/json', '.png':'image/png',
  '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8', '.ico':'image/x-icon' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api') || url.pathname === '/health') {
    const body = ['GET','HEAD'].includes(req.method) ? undefined
      : await new Promise(r => { const c=[]; req.on('data',d=>c.push(d)); req.on('end',()=>r(Buffer.concat(c))); });
    const headers = { ...req.headers }; delete headers.host; delete headers['content-length'];
    try {
      const up = await fetch(API + req.url, { method: req.method, headers, body });
      res.writeHead(up.status, { 'content-type': up.headers.get('content-type') || 'application/json' });
      res.end(Buffer.from(await up.arrayBuffer()));
    } catch (e) { res.writeHead(502); res.end(JSON.stringify({ message: 'backend недостъпен' })); }
    return;
  }
  let p = join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(PORT, () => console.log('сайтът е на http://localhost:' + PORT + ' → API ' + API));
