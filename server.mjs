import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = join(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 4173;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = (req.url || '/').split('?')[0];
    if (urlPath === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, domain: 'airbnb710.com' }));
      return;
    }

    const safeRel = normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
    let candidate = join(DIST_DIR, safeRel === '/' || safeRel === '\\' ? 'index.html' : safeRel);

    try {
      const info = await stat(candidate);
      if (info.isDirectory()) {
        candidate = join(candidate, 'index.html');
      }
    } catch {
      candidate = join(DIST_DIR, 'index.html');
    }

    const body = await readFile(candidate);
    const ext = extname(candidate).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ClearOps static bundle missing. Run `npm run build` first.');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ClearOps production server listening on http://0.0.0.0:${PORT}`);
});
