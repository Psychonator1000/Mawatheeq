// The file helper (public/helper/mawatheeq-files.mjs) with synthetic folders: it lists, reads and copies inside the
// folders it was given only, never deletes or overwrites, answers Mawatheeq's pages only, and refuses paths that leave
// its folders (a «..», a link pointing out, another host name).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createFilesServer, safePart } from '../public/helper/mawatheeq-files.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mawatheeq-files-'));
const dirs = Object.fromEntries(['inbox', 'daily', 'cases', 'orders', 'outside'].map(k => [k, fs.mkdirSync(path.join(tmp, k), { recursive: true }) || path.join(tmp, k)]));
fs.writeFileSync(path.join(dirs.inbox, 'scan-0001.pdf'), '%PDF-1.4 one');
fs.writeFileSync(path.join(dirs.inbox, 'scan-0002.pdf'), '%PDF-1.4 two two');
fs.writeFileSync(path.join(dirs.outside, 'secret.pdf'), 'not for the app');
fs.symlinkSync(dirs.outside, path.join(dirs.inbox, 'escape'));
const configPath = path.join(tmp, 'mawatheeq-files.json');
const APP = 'https://psychonator1000.github.io';
const { server, listen } = createFilesServer({ configPath, port: 0 });
const port = await listen();

function call(method, url, { body, origin = APP, host = `127.0.0.1:${port}`, raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: url, headers: { Host: host, ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, text, data: !raw && text && res.headers['content-type']?.includes('json') ? JSON.parse(text) : null });
      });
    });
    req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
  });
}

try {
  // Names: nothing that leaves a folder or that Windows refuses.
  for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'C:', 'x?', 'a\u0000']) assert.throws(() => safePart(bad), `«${bad}» is refused`);
  assert.equal(safePart('حكم أول درجة TEST-2.pdf'), 'حكم أول درجة TEST-2.pdf');

  // Who may ask: Mawatheeq's pages; the status alone from the address bar; nothing for another site or another host name.
  let r = await call('GET', '/status', { origin: null });
  assert.equal(r.status, 200); assert.equal(r.data.app, 'mawatheeq-files'); assert.equal(r.data.roots.inbox.ok, false);
  assert.equal((await call('GET', '/list?root=inbox', { origin: null })).status, 403, 'No origin: only the status');
  assert.equal((await call('GET', '/status', { origin: 'https://evil.example' })).status, 403, 'Another site is refused');
  assert.equal((await call('GET', '/status', { host: 'evil.example:' + port })).status, 421, 'Another host name (DNS rebinding) is refused');
  r = await call('OPTIONS', '/copy');
  assert.equal(r.status, 204); assert.equal(r.headers['access-control-allow-origin'], APP); assert.equal(r.headers['access-control-allow-private-network'], 'true');
  assert.equal((await call('OPTIONS', '/copy', { origin: 'https://evil.example' })).status, 403);

  // The folders, set from the app: full paths of existing folders only.
  assert.equal((await call('GET', '/list?root=inbox')).status, 409, 'Not set yet');
  assert.equal((await call('PUT', '/roots', { body: { inbox: 'relative/path' } })).status, 400);
  assert.equal((await call('PUT', '/roots', { body: { inbox: path.join(tmp, 'missing') } })).status, 400);
  assert.equal((await call('PUT', '/roots', { origin: 'https://evil.example', body: { inbox: dirs.outside } })).status, 403);
  r = await call('PUT', '/roots', { body: { inbox: dirs.inbox, daily: dirs.daily, cases: dirs.cases, orders: dirs.orders } });
  assert.equal(r.status, 200); assert.ok(['inbox', 'daily', 'cases', 'orders'].every(k => r.data.roots[k].ok));
  assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf8')).roots.cases, dirs.cases, 'Kept for the next start');

  // Listing and reading.
  r = await call('GET', '/list?root=inbox');
  assert.deepEqual(r.data.filter(e => e.kind === 'file').map(e => [e.name, e.size]).sort(), [['scan-0001.pdf', 12], ['scan-0002.pdf', 16]]);
  r = await call('GET', '/read?root=inbox&path=scan-0001.pdf', { raw: true });
  assert.equal(r.status, 200); assert.equal(r.headers['content-type'], 'application/pdf'); assert.equal(r.text, '%PDF-1.4 one');
  assert.equal((await call('GET', '/read?root=inbox&path=../outside/secret.pdf')).status, 400, '«..» is refused');
  assert.equal((await call('GET', '/read?root=inbox&path=escape/secret.pdf')).status, 403, 'A link pointing out of the folder is refused');
  assert.equal((await call('GET', '/list?root=inbox&path=escape')).status, 403);
  assert.equal((await call('GET', '/read?root=inbox&path=nothing.pdf')).status, 404);

  // Copying: the original stays, the scan's date is kept, the same file twice is not copied twice, a different file of the same name gets «(2)».
  const when = new Date('2026-11-10T09:30:00Z'); fs.utimesSync(path.join(dirs.inbox, 'scan-0001.pdf'), when, when);
  r = await call('POST', '/copy', { body: { from: { root: 'inbox', path: 'scan-0001.pdf' }, to: { root: 'daily', path: '2026/11/10' }, name: 'scan-0001.pdf' } });
  assert.deepEqual(r.data, { name: 'scan-0001.pdf', copied: true });
  assert.ok(fs.existsSync(path.join(dirs.inbox, 'scan-0001.pdf')), 'The original stays in the inbox');
  assert.equal(fs.readFileSync(path.join(dirs.daily, '2026', '11', '10', 'scan-0001.pdf'), 'utf8'), '%PDF-1.4 one');
  assert.equal(Math.round(fs.statSync(path.join(dirs.daily, '2026', '11', '10', 'scan-0001.pdf')).mtimeMs / 1000), when.getTime() / 1000, 'The copy keeps the scan date');
  r = await call('POST', '/copy', { body: { from: { root: 'inbox', path: 'scan-0001.pdf' }, to: { root: 'daily', path: '2026/11/10' }, name: 'scan-0001.pdf' } });
  assert.deepEqual(r.data, { name: 'scan-0001.pdf', copied: false }, 'Already there: not copied again');
  r = await call('POST', '/copy', { body: { from: { root: 'inbox', path: 'scan-0002.pdf' }, to: { root: 'daily', path: '2026/11/10' }, name: 'scan-0001.pdf' } });
  assert.deepEqual(r.data, { name: 'scan-0001 (2).pdf', copied: true }, 'Never over another file');
  assert.equal(fs.readFileSync(path.join(dirs.daily, '2026', '11', '10', 'scan-0001.pdf'), 'utf8'), '%PDF-1.4 one', 'The first copy is untouched');
  r = await call('POST', '/copy', { body: { from: { root: 'inbox', path: 'scan-0002.pdf' }, to: { root: 'cases', path: 'TEST-2' }, name: 'حكم أول درجة TEST-2.pdf' } });
  assert.deepEqual(r.data, { name: 'حكم أول درجة TEST-2.pdf', copied: true });
  assert.equal((await call('POST', '/copy', { body: { from: { root: 'inbox', path: 'scan-0002.pdf' }, to: { root: 'cases', path: '../outside' }, name: 'x.pdf' } })).status, 400);
  assert.equal((await call('POST', '/copy', { body: { from: { root: 'inbox', path: 'scan-0002.pdf' }, to: { root: 'cases', path: 'A' }, name: '../x.pdf' } })).status, 400);
  assert.deepEqual(fs.readdirSync(dirs.inbox).sort(), ['escape', 'scan-0001.pdf', 'scan-0002.pdf'], 'Nothing ever leaves the inbox');
  assert.deepEqual(fs.readdirSync(dirs.outside), ['secret.pdf'], 'Nothing written outside');

  // The app's note of what went where: only its hidden JSON file, at the top of a folder.
  r = await call('POST', '/note', { body: { root: 'inbox', name: '.mawatheeq-placed.json', text: '{"scan-0002.pdf":[]}' } });
  assert.equal(r.status, 200); assert.equal(fs.readFileSync(path.join(dirs.inbox, '.mawatheeq-placed.json'), 'utf8'), '{"scan-0002.pdf":[]}');
  assert.equal((await call('POST', '/note', { body: { root: 'inbox', name: 'scan-0001.pdf', text: '{}' } })).status, 403, 'Never over a scan');
  assert.equal((await call('POST', '/note', { body: { root: 'inbox', name: '.mawatheeq-placed.json', text: 'not json' } })).status, 400);
  assert.equal(fs.readFileSync(path.join(dirs.inbox, 'scan-0001.pdf'), 'utf8'), '%PDF-1.4 one');
  console.log('Passed file helper: Mawatheeq pages only (other sites, other host names and pathless calls refused), full existing folders only, listing and reading inside them (no «..», no links out), copies that keep the original and its date, never copy twice or over another file, and its own hidden note only.');
} finally {
  server.close(); fs.rmSync(tmp, { recursive: true, force: true });
}
