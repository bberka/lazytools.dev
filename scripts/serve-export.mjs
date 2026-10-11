// Serves the static export in out/ the way a static host does with
// trailingSlash: /tools/x redirects to /tools/x/, which serves
// out/tools/x/index.html, and unknown paths get the exported 404 page.
// Used by the e2e suite in export mode: node scripts/serve-export.mjs [port]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../out', import.meta.url)));
const port = Number(process.argv[2] ?? 3000);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
};

if (!existsSync(join(root, 'index.html'))) {
  console.error('No export found in out/. Run "npm run build" first.');
  process.exit(1);
}

function send(response, status, file) {
  const type = CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(response);
}

function statOrNull(file) {
  try {
    return statSync(file);
  } catch {
    return null;
  }
}

createServer((request, response) => {
  let url;
  let pathname;
  try {
    url = new URL(request.url ?? '/', 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }

  const target = join(root, pathname);
  if (!target.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }

  const stats = statOrNull(target);
  if (stats?.isFile()) {
    send(response, 200, target);
    return;
  }

  if (stats?.isDirectory()) {
    const index = join(target, 'index.html');
    if (existsSync(index)) {
      if (!pathname.endsWith('/')) {
        response.writeHead(308, { Location: `${pathname}/${url.search}` }).end();
        return;
      }
      send(response, 200, index);
      return;
    }
  }

  const notFound = [join(root, '404.html'), join(root, '404', 'index.html')].find((file) => existsSync(file));
  if (notFound) {
    send(response, 404, notFound);
    return;
  }
  response.writeHead(404).end('Not found');
}).listen(port, () => {
  console.log(`Serving out/ at http://localhost:${port}`);
});
