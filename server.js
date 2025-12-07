const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

function resolvePath(urlPath) {
  const safePath = urlPath.split('?')[0].split('#')[0];
  const targetPath = safePath === '/' ? '/index.html' : safePath;
  return path.join(PUBLIC_DIR, targetPath);
}

const server = http.createServer((req, res) => {
  const filePath = resolvePath(req.url);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    if (stats.isDirectory()) {
      sendFile(path.join(filePath, 'index.html'), res);
      return;
    }

    sendFile(filePath, res);
  });
});

server.listen(PORT, () => {
  console.log(`Static server listening on http://localhost:${PORT}`);
});
