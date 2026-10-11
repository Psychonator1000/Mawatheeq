// Mawatheeq office file service: stores original PDFs on the server's disk.
// It replaces the hosted `local-files` function and the storage endpoints the app uses, with the same rules:
// every action is approved by the database for the signed-in session before a file is touched.
// No dependencies: Node 22 built-ins only.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REST_URL = (process.env.REST_URL || 'http://rest:3000').replace(/\/$/, '');
const ROOT = path.resolve(process.env.FILES_DIR || '/data/files');
const PORT = Number(process.env.PORT || 8000);
const SECRET = process.env.FILES_SECRET || '';
const BUCKET = 'mawatheeq-documents';
const MAX_BYTES = 25 * 1024 * 1024 + 1024 * 1024;
const UPLOAD_TTL = 2 * 60 * 60 * 1000, DOWNLOAD_TTL = 60 * 1000;
const grants = new Map(); // token -> { path, kind: 'upload' | 'download', expires }

const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const issue = (kind, filePath, ttl) => { const token = crypto.randomBytes(32).toString('hex'); grants.set(token, { path: filePath, kind, expires: Date.now() + ttl }); return token; };
const take = (token, kind, filePath, once) => {
  const g = grants.get(String(token || ''));
  if (!g || g.kind !== kind || g.path !== filePath || g.expires < Date.now()) return false;
  if (once) grants.delete(token);
  return true;
};
setInterval(() => { const now = Date.now(); for (const [t, g] of grants) if (g.expires < now) grants.delete(t); }, 60000).unref();

/** Paths come from the database (documents/<uuid>/<name>.pdf); refuse anything that could leave the files folder. */
export function safePath(filePath) {
  if (typeof filePath !== 'string' || !/^documents\/[0-9a-f-]{36}\/[^/\\\0]{1,200}\.pdf$/i.test(filePath) || filePath.includes('..')) return null;
  const full = path.resolve(ROOT, filePath);
  return full.startsWith(ROOT + path.sep) ? full : null;
}
async function readBody(req, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw Object.assign(new Error('too large'), { status: 413 }); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
/** Ask the database (as the app would) whether this session may act on the file. */
async function approve(action, body) {
  const response = await fetch(`${REST_URL}/rpc/mawatheeq_local_request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: body.sessionToken, p_action: 'file_' + action, p_data: action === 'cleanup' ? { path: body.path } : { id: body.id } }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.path) throw Object.assign(new Error(data?.message || 'لا تملك صلاحية الوصول إلى الملف.'), { status: 403 });
  return String(data.path);
}

/** Record (or forget) a stored PDF in the database so documents can reference it. */
async function register(filePath, remove) {
  const response = await fetch(`${REST_URL}/rpc/office_file_register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_secret: SECRET, p_path: filePath, p_remove: remove }) });
  if (!response.ok) throw new Error('تعذر تسجيل الملف في قاعدة البيانات.');
}

async function filesFunction(req, res) {
  const text = (await readBody(req, 4096)).toString('utf8');
  const body = JSON.parse(text || '{}');
  if (!['upload', 'download', 'cleanup'].includes(body.action) || !/^[a-f0-9]{64}$/.test(body.sessionToken || '')) return json(res, 401, { error: 'سجل الدخول أولاً.' });
  const filePath = await approve(body.action, body);
  if (!safePath(filePath)) return json(res, 400, { error: 'مسار الملف غير صالح.' });
  if (body.action === 'upload') return json(res, 200, { path: filePath, token: issue('upload', filePath, UPLOAD_TTL) });
  if (body.action === 'download') return json(res, 200, { path: filePath, url: `/storage/v1/object/sign/${BUCKET}/${filePath.split('/').map(encodeURIComponent).join('/')}?token=${issue('download', filePath, DOWNLOAD_TTL)}` });
  await register(filePath, true);
  await fs.rm(safePath(filePath), { force: true });
  return json(res, 200, { path: filePath });
}

async function storage(req, res, url) {
  const upload = url.pathname.startsWith(`/storage/v1/object/upload/sign/${BUCKET}/`), download = url.pathname.startsWith(`/storage/v1/object/sign/${BUCKET}/`);
  if (!upload && !download) return json(res, 404, { message: 'Not found' });
  const prefix = upload ? `/storage/v1/object/upload/sign/${BUCKET}/` : `/storage/v1/object/sign/${BUCKET}/`;
  const filePath = decodeURIComponent(url.pathname.slice(prefix.length)), full = safePath(filePath), token = url.searchParams.get('token');
  if (!full) return json(res, 400, { message: 'Invalid path' });
  if (download) {
    if (req.method !== 'GET' || !take(token, 'download', filePath, false)) return json(res, 403, { message: 'انتهت صلاحية رابط الملف.' });
    const data = await fs.readFile(full).catch(() => null);
    if (!data) return json(res, 404, { message: 'الملف غير موجود.' });
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': data.length, 'Cache-Control': 'no-store' });
    return res.end(data);
  }
  if (!['PUT', 'POST'].includes(req.method) || !take(token, 'upload', filePath, true)) return json(res, 403, { message: 'انتهت صلاحية رابط الرفع.' });
  const raw = await readBody(req, MAX_BYTES), type = String(req.headers['content-type'] || '');
  let data = raw;
  if (type.startsWith('multipart/form-data')) {
    const form = await new Request('http://local/', { method: 'POST', headers: { 'content-type': type }, body: raw }).formData();
    const file = [...form.values()].find(v => typeof v === 'object' && v && 'arrayBuffer' in v);
    if (!file) return json(res, 400, { message: 'No file' });
    data = Buffer.from(await file.arrayBuffer());
  }
  if (data.subarray(0, 5).toString('latin1') !== '%PDF-' || data.length > 25 * 1024 * 1024) return json(res, 400, { message: 'ملف PDF غير صالح.' });
  await fs.mkdir(path.dirname(full), { recursive: true });
  try { await fs.writeFile(full, data, { flag: 'wx' }); }
  catch (e) { if (e.code === 'EEXIST') return json(res, 409, { message: 'الملف موجود مسبقاً.' }); throw e; }
  try { await register(filePath, false); } catch (e) { await fs.rm(full, { force: true }); throw e; }
  return json(res, 200, { Key: `${BUCKET}/${filePath}` });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://local');
      if (url.pathname === '/health') return json(res, 200, { ok: true });
      if (url.pathname === '/functions/v1/local-files') {
        if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
        return await filesFunction(req, res);
      }
      if (url.pathname.startsWith('/storage/v1/')) return await storage(req, res, url);
      json(res, 404, { message: 'Not found' });
    } catch (e) {
      json(res, e.status || 400, { error: e.status === 403 ? e.message : e.status === 413 ? 'الملف كبير جداً.' : 'تعذر معالجة ملف PDF.' });
    }
  });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (SECRET.length < 32) { console.error('FILES_SECRET is missing. Run the setup step in office-server/README.md.'); process.exit(1); }
  await fs.mkdir(ROOT, { recursive: true });
  createServer().listen(PORT, () => console.log(`Mawatheeq files on :${PORT}, storing in ${ROOT}`));
}
