// Synthetic database test for paper-file handover: requests from the case, the handover sheet, the recipient's receipt and the archive's return approval.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects to anon,authenticated;
`);
for (const file of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql')).sort()) await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
await db.query(`insert into mawatheeq_private.accounts(username,password_hash,must_change_password,display_name) values
 ('owner',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'المسؤول'),('keeper',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'أمين الأرشيف'),
 ('lawyer',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'المحامي'),('other',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'زميل'),
 ('clerk',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'')`, ['Fixture-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,case when username='owner' then 'owner' else 'editor' end from mawatheeq_private.accounts");
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)).rows[0].result;
const login = u => rpc('mawatheeq_local_login', [u, 'Fixture-password-123']);
await db.exec('set role anon');
const owner = await login('owner');
const local = (s, action, data = {}) => rpc('mawatheeq_local_request', [s.token, action, JSON.stringify(data)]);
const office = (s, action, data = {}) => rpc('mawatheeq_office_request', [s.token, action, JSON.stringify(data)]);
const arc = (s, action, data = {}) => rpc('mawatheeq_department_request', [s.token, action, JSON.stringify({ ...data, workspace: 'archive' })]);
const denied = fn => assert.rejects(fn, e => e.code === '42501');
const refused = (fn, text) => assert.rejects(fn, e => e.message.includes(text), text);
const grant = async (u, p) => { const m = (await office(owner, 'context')).members.find(x => x.username === u); await office(owner, 'set_member_access', { id: m.id, revision: m.permissions.revision, permissions: p }); return login(u); };

// Two judgments of one case share its office code and its one paper file; another case is out of the lawyer's reach.
const c1 = await local(owner, 'save_case', { case: { id: 'handover-1', code: 'H-1', autoNumber: '1', client: 'موكل تجريبي', clientGroup: 'موكل تجريبي', opponent: 'خصم تجريبي', date: '2026-10-01', procedures: [], revision: 0 } });
const c1b = await local(owner, 'save_case', { case: { ...c1, id: 'handover-1b', autoNumber: '2', revision: 0 } });
const c2 = await local(owner, 'save_case', { case: { ...c1, id: 'handover-2', code: 'H-2', autoNumber: '3', revision: 0 } });
const keeper = await grant('keeper', { sections: ['archive'], caseScope: 'all', caseIds: [], canEdit: true, canExport: true, jobRole: 'archivist' });
const lawyer = await grant('lawyer', { sections: ['cases'], caseScope: 'selected', caseIds: [c1b.id], canEdit: true, canExport: false });
const other = await grant('other', { sections: ['cases'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false });
const clerk = await grant('clerk', { sections: ['collections'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false });
const ids = Object.fromEntries((await arc(keeper, 'people')).map(p => [p.username, p.id]));

let n = 0;
const uuid = () => '53000000-0000-4000-8000-' + String(++n).padStart(12, '0');
const file = (number, caseId) => arc(keeper, 'save_record', { record: { id: uuid(), kind: 'file', caseId, subjectId: '', revision: 0,
  payload: { number, title: 'ملف ' + number, type: 'ملف قضية', volume: '', pages: '', locationId: '', originals: 'no', confidential: 'no', intakeDate: '2026-10-01', retentionUntil: '', notes: '' } } });
const f1 = await file('ARC-H-1', c1.id), f2 = await file('ARC-H-2', c2.id), f3 = await file('ARC-H-3', c2.id);
const records = async () => arc(keeper, 'records_page');
const stateOf = async f => { const mv = (await records()).filter(r => r.kind === 'movement' && r.subjectId === f.id && r.payload.status === 'posted').at(-1); return mv ? mv.payload.toState : 'in'; };

// Asking from the case: anyone who opens the case (or another judgment of it) sees its paper file and asks for it.
const seen = await arc(lawyer, 'desk_case', { caseId: c1b.id });
assert.deepEqual(seen.map(f => f.number), ['ARC-H-1'], 'The paper file of a judgment sharing the office code');
assert.equal(seen[0].state, 'in'); assert.equal(seen[0].request, null);
await denied(() => arc(lawyer, 'desk_case', { caseId: c2.id }));
await denied(() => arc(clerk, 'desk_case', { caseId: c1.id }));
await denied(() => arc(lawyer, 'desk_request', { fileId: f2.id }));
const req = await arc(lawyer, 'desk_request', { fileId: f1.id, neededBy: '2026-10-10', purpose: 'حضور جلسة' });
assert.equal(req.kind, 'request'); assert.equal(req.payload.requester, 'المحامي'); assert.equal(req.payload.requesterId, ids.lawyer); assert.equal(req.payload.status, 'pending');
await refused(() => arc(lawyer, 'desk_request', { fileId: f1.id }), 'ما زال طلبك مفتوحاً');
assert.equal((await arc(lawyer, 'desk_case', { caseId: c1.id }))[0].request.status, 'pending');
assert.ok((await records()).some(r => r.id === req.id), 'The archive sees the request');
const extra = await arc(other, 'desk_request', { fileId: f3.id, purpose: 'مراجعة' });
await denied(() => arc(lawyer, 'desk_cancel', { id: extra.id }));
const cancelled = await arc(other, 'desk_cancel', { id: extra.id });
assert.equal(cancelled.payload.status, 'declined'); assert.equal(cancelled.payload.decisionNote, 'ألغاه مقدّم الطلب');
await refused(() => arc(other, 'desk_cancel', { id: extra.id }), 'مغلق');

// The handover sheet: all or nothing, each file to an account, receipts awaited, requests closed.
await denied(() => arc(lawyer, 'dispatch', { date: '2026-10-05', items: [{ fileId: f1.id, holderId: ids.lawyer }] }));
await refused(() => arc(keeper, 'dispatch', { date: '2026-10-05', items: [] }), 'ملفاً واحداً');
await refused(() => arc(keeper, 'dispatch', { date: '2026-10-05', items: [{ fileId: f1.id, holderId: ids.lawyer }, { fileId: f1.id, holderId: ids.other }] }), 'مكرر');
await refused(() => arc(keeper, 'dispatch', { date: '2026-10-05', items: [{ fileId: f1.id, holderId: '' }] }), 'المستلم');
await refused(() => arc(keeper, 'dispatch', { date: '2026-10-05', items: [{ fileId: f1.id, holderId: ids.lawyer, dueDate: '2026-10-01' }] }), 'ARC-H-1');
assert.equal(await stateOf(f1), 'in', 'A refused sheet hands nothing out');
const sheet = await arc(keeper, 'dispatch', { date: '2026-10-05', notes: 'كشف الصباح', items: [
  { fileId: f1.id, holderId: ids.lawyer, purpose: 'حضور جلسة', dueDate: '2026-10-07' }, { fileId: f2.id, holderId: ids.clerk, purpose: 'تصوير مستندات' }] });
assert.equal(sheet.movements.length, 2); assert.match(sheet.batchId, /^[0-9a-f-]{36}$/);
for (const m of sheet.movements) { assert.equal(m.payload.receipt, 'pending'); assert.equal(m.payload.batchId, sheet.batchId); assert.equal(m.payload.toState, 'staff'); }
assert.equal(sheet.movements[1].payload.holder, 'clerk', 'An account without a display name goes by its username');
assert.equal(await stateOf(f1), 'staff', 'Outside the archive, with the recipient, from the moment it is sent');
assert.equal((await records()).find(r => r.id === req.id).payload.status, 'done', 'Sending the file closes the request');
await refused(() => arc(keeper, 'dispatch', { date: '2026-10-05', items: [{ fileId: f1.id, holderId: ids.other }] }), 'ARC-H-1');

// The recipient confirms receipt, then reports the return; only the holder may, in that order.
let mine = await arc(lawyer, 'desk_mine');
assert.equal(mine.holding.length, 1); const held = mine.holding[0];
assert.equal(held.number, 'ARC-H-1'); assert.equal(held.receipt, 'pending'); assert.equal(held.sentBy, 'أمين الأرشيف'); assert.equal(held.caseCode, 'H-1'); assert.equal(held.client, 'موكل تجريبي');
assert.equal(mine.requests[0].status, 'done');
assert.equal((await arc(clerk, 'desk_mine')).holding[0].number, 'ARC-H-2', 'Files reach people without the cases section too');
await denied(() => arc(other, 'desk_receive', { movementId: held.movementId }));
await refused(() => arc(lawyer, 'desk_return', { movementId: held.movementId }), 'أكّد استلام');
const got = await arc(lawyer, 'desk_receive', { movementId: held.movementId });
assert.equal(got.payload.receipt, 'received'); assert.match(got.payload.receivedAt, /^\d{4}-\d\d-\d\dT/); assert.equal(got.payload.type, 'checkout', 'Movement fields stay as they were');
await refused(() => arc(lawyer, 'desk_receive', { movementId: held.movementId }), 'مؤكد');
const back = await arc(lawyer, 'desk_return', { movementId: held.movementId });
assert.match(back.payload.returnClaimedAt, /^\d{4}-/);
await refused(() => arc(lawyer, 'desk_return', { movementId: held.movementId }), 'ينتظر تأكيد الأرشيف');
assert.equal(await stateOf(f1), 'staff', 'Reported, not yet back: the file is still with the holder');
assert.equal((await arc(lawyer, 'desk_case', { caseId: c1.id }))[0].returnClaimedAt !== '', true);

// The archive approves the return; the holder's list empties and a new request is possible again.
await denied(() => arc(lawyer, 'approve_return', { fileId: f1.id }));
const ret = await arc(keeper, 'approve_return', { fileId: f1.id, date: '2026-10-06' });
assert.equal(ret.payload.type, 'return'); assert.equal(ret.payload.toState, 'in');
assert.equal((await arc(lawyer, 'desk_mine')).holding.length, 0);
await refused(() => arc(lawyer, 'desk_receive', { movementId: held.movementId }), 'لم يعد الملف');
await refused(() => arc(keeper, 'approve_return', { fileId: f1.id }), 'حالة الملف');
assert.equal((await arc(lawyer, 'desk_request', { fileId: f1.id })).payload.status, 'pending');

// A single hand-out from the file window waits for receipt too; a name typed by hand has nothing to confirm.
const one = await arc(keeper, 'save_record', { record: { id: uuid(), kind: 'movement', caseId: c2.id, subjectId: f3.id, revision: 0,
  payload: { type: 'checkout', date: '2026-10-06', holder: 'زميل', holderId: ids.other, purpose: '', dueDate: '', locationId: '', notes: '' } } });
assert.equal(one.payload.receipt, 'pending');
await arc(keeper, 'approve_return', { fileId: f3.id });
const typed = await arc(keeper, 'save_record', { record: { id: uuid(), kind: 'movement', caseId: c2.id, subjectId: f3.id, revision: 0,
  payload: { type: 'checkout', date: '2026-10-06', holder: 'مندوب', holderId: '', purpose: '', dueDate: '', locationId: '', notes: '' } } });
assert.equal(typed.payload.receipt, undefined);
const history = await arc(keeper, 'history', { id: held.movementId });
assert.equal(history[0].after.payload.returnClaimedAt, back.payload.returnClaimedAt, 'Receipts and returns are in the record history');
// «ملفاتي الورقية» page: every hand-out to this person, newest first, with what became of it.
const past = await arc(lawyer, 'desk_history');
assert.equal(past.length, 1); assert.equal(past[0].number, 'ARC-H-1'); assert.equal(past[0].current, false);
assert.equal(past[0].next.type, 'return'); assert.equal(past[0].next.date, '2026-10-06'); assert.match(past[0].receivedAt, /^\d{4}-/);
assert.equal((await arc(other, 'desk_history'))[0].current, false, 'A hand-out returned at the desk is history too');
assert.equal((await arc(clerk, 'desk_history'))[0].current, true, 'A file still held is current');
console.log('Archive handover database checks passed.');
