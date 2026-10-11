// End-to-end check of a running office server, using the same HTTP calls as the app (synthetic data only).
// Usage: node office-server/test/smoke.mjs http://localhost:8080 <owner-username> <password>
import assert from 'node:assert/strict';
const [base = 'http://localhost:8080', username, password] = process.argv.slice(2);
const post = async (path, body, headers = {}) => { const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer office-local', apikey: 'office-local', ...headers }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json().catch(() => null) }; };
const rpc = async (fn, args) => { const r = await post('/rest/v1/rpc/' + fn, args); if (r.status !== 200) throw new Error(`${fn}: ${r.status} ${JSON.stringify(r.data)}`); return r.data; };

const page = await fetch(base + '/'); assert.equal(page.status, 200, 'The app is served');
const config = await (await fetch(base + '/app-config.json')).json(); assert.equal(config.office, true, 'The app runs in office mode');
assert.equal((await post('/rest/v1/rpc/office_file_register', {})).status, 404, 'Internal functions are not reachable from outside');
assert.equal((await rpc('mawatheeq_local_login', { p_username: username, p_password: 'wrong-password' })).error ? true : false, true, 'Wrong passwords are refused');
const login = await rpc('mawatheeq_local_login', { p_username: username, p_password: password });
assert.match(login.token, /^[0-9a-f]{64}$/);
const local = (action, data = {}) => rpc('mawatheeq_local_request', { p_token: login.token, p_action: action, p_data: data });

// A case round trip.
const saved = await local('save_case', { case: { id: 'smoke-case-1', code: 'SMOKE-1', autoNumber: '9001', client: 'شركة اختبار', clientGroup: 'شركة اختبار', opponent: 'خصم تجريبي', date: '2026-09-01', type: 'حكم أول درجة', outcome: 'لصالحنا', ruling: 'حكم تجريبي', procedures: [], revision: 0 } });
assert.equal(saved.code, 'SMOKE-1');
assert.ok(JSON.stringify(await local('cases_page', { offset: 0 })).includes('SMOKE-1'));

// Original PDFs: approved upload link, one-time upload, database record, download, refusal of forged links.
const files = action => async data => post('/functions/v1/local-files', { action, sessionToken: login.token, ...data });
const id = crypto.randomUUID(), bytes = '%PDF-1.4\n% office smoke test\n%%EOF\n';
const up = await files('upload')({ id }); assert.equal(up.status, 200); assert.match(up.data.path, /^documents\//);
const put = token => { const form = new FormData(); form.append('cacheControl', '3600'); form.append('', new Blob([bytes], { type: 'application/pdf' })); return fetch(`${base}/storage/v1/object/upload/sign/mawatheeq-documents/${up.data.path}?token=${token}`, { method: 'PUT', body: form, headers: { 'x-upsert': 'false' } }); };
assert.equal((await put(up.data.token)).status, 200, 'Upload works');
assert.equal((await put(up.data.token)).status, 403, 'Upload links work once');
await local('save_document', { id, payload: { data: { smoke: true } }, filename: 'smoke.pdf', fileKey: up.data.path, revision: 0 });
const down = await files('download')({ id }); assert.equal(down.status, 200);
const got = await fetch(new URL(down.data.url, base)); assert.equal(got.status, 200); assert.equal(await got.text(), bytes);
assert.equal((await fetch(new URL(down.data.url.replace(/token=[0-9a-f]+/, 'token=' + '0'.repeat(64)), base))).status, 403, 'Forged links are refused');
assert.equal((await post('/functions/v1/local-files', { action: 'download', sessionToken: 'f'.repeat(64), id })).status, 403, 'Signed-out requests cannot read files');

// Attendance and devices are available.
const ctx = await rpc('mawatheeq_attendance_request', { p_token: login.token, p_action: 'context', p_data: {} });
assert.equal(ctx.settings.timezone, 'Asia/Kuwait');
console.log('Passed office server smoke test: app in office mode, internal functions hidden, login, case round trip, PDF upload/download with one-time and forged-link checks, attendance.');
