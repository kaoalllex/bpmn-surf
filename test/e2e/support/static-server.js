'use strict';

// Minimal static file server rooted at the repo root, for the e2e harness.
// Serves src/, libs/, test/ over http so the differ scripts load with correct
// MIME types (a file:// origin trips Chromium's subresource rules). Started and
// stopped by Playwright's webServer config; the port is argv[2] (default 4173).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const PORT = Number(process.argv[2]) || 4173;

const MIME = {
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.png': 'image/png'
};

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(ROOT, path.normalize(urlPath));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404).end('not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
    });
}).listen(PORT, () => console.log(`static server on http://localhost:${PORT}`));
