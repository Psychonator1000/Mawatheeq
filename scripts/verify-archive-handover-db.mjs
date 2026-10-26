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
// «ملفاتي الورقية» page: each file's journey with this person, from the request to the file back in the archive.
const again = await arc(keeper, 'dispatch', { date: '2026-10-08', items: [{ fileId: f1.id, holderId: ids.lawyer, purpose: 'تقديم للخبير' }] });
await arc(lawyer, 'desk_receive', { movementId: again.movements[0].id });
await arc(keeper, 'save_record', { record: { id: uuid(), kind: 'movement', caseId: c1.id, subjectId: f1.id, revision: 0,
  payload: { type: 'court', date: '2026-10-09', holder: 'إدارة الخبراء', holderId: '', purpose: '', dueDate: '', locationId: '', notes: '' } } });
let j = await arc(lawyer, 'desk_journeys');
assert.equal(j.handouts.length, 2); assert.equal(j.handouts[0].movementId, again.movements[0].id, 'Newest first');
assert.deepEqual(j.handouts[0].steps.map(x => x.type), ['court'], 'Sent on to the expert: the journey goes on');
assert.equal(j.handouts[0].steps[0].holder, 'إدارة الخبراء'); assert.equal(j.handouts[0].steps[0].by, 'أمين الأرشيف');
await arc(keeper, 'approve_return', { fileId: f1.id, date: '2026-10-12' });
j = await arc(lawyer, 'desk_journeys');
assert.deepEqual(j.handouts[0].steps.map(x => [x.type, x.date, x.toState]), [['court', '2026-10-09', 'court'], ['return', '2026-10-12', 'in']], 'Back in the archive ends the journey');
assert.deepEqual(j.handouts[1].steps.map(x => x.type), ['return'], 'The earlier journey stops at its own return');
assert.match(j.handouts[1].receivedAt, /^\d{4}-/); assert.match(j.handouts[1].returnClaimedAt, /^\d{4}-/);
assert.equal(j.requests.length, 2); assert.equal(j.requests.every(r => r.status === 'done'), true);
assert.equal(j.requests[0].movementId, again.movements[0].id, 'A request links to the hand-out that answered it');
assert.equal(j.requests[1].movementId, held.movementId);
assert.equal((await arc(other, 'desk_journeys')).requests[0].status, 'declined', 'Cancelled requests stay in the story');
assert.equal((await arc(clerk, 'desk_journeys')).handouts[0].current, true, 'A file still held is current');
// «سُلّم» set by hand sends the file for real; a request marked that way before can be confirmed by its requester.
const f4 = await file('ARC-H-4', c1.id), f5 = await file('ARC-H-5', c1.id);
const r4 = await arc(lawyer, 'desk_request', { fileId: f4.id, purpose: 'مراجعة' });
await arc(keeper, 'save_record', { record: { ...r4, payload: { ...r4.payload, status: 'done' } } });
const auto = (await arc(lawyer, 'desk_mine')).holding.find(h => h.number === 'ARC-H-4');
assert.equal(auto?.receipt, 'pending', 'Marking «سُلّم» hands the file over and waits for «استلمت»');
const r5 = await arc(lawyer, 'desk_request', { fileId: f5.id });
await db.exec('reset role');
await db.query("update mawatheeq_private.department_records set payload=payload||'{\"status\":\"done\"}',updated_by=$2 where id=$1", [r5.id, ids.keeper]);
await db.exec('set role anon');
await denied(() => arc(other, 'desk_accept_marked', { requestId: r5.id }));
const accepted = await arc(lawyer, 'desk_accept_marked', { requestId: r5.id });
assert.equal(accepted.payload.receipt, 'received'); assert.equal(accepted.payload.holderId, ids.lawyer); assert.equal(accepted.payload.toState, 'staff');
await refused(() => arc(lawyer, 'desk_accept_marked', { requestId: r5.id }), 'بالفعل');
const marked = (await arc(lawyer, 'desk_journeys')).handouts.find(h => h.number === 'ARC-H-5');
assert.equal(marked.sentBy, 'أمين الأرشيف', 'The hand-out is credited to whoever marked it'); assert.equal(marked.current, true);
assert.equal((await arc(lawyer, 'desk_journeys')).requests.find(r => r.id === r5.id).movementId, accepted.id);
await refused(() => arc(lawyer, 'desk_accept_marked', { requestId: r4.id }), 'بالفعل');
// Return checks: contents go out with the file and come back checked; a reported return can be rejected; lost and found.
const f6 = await arc(keeper, 'save_record', { record: { id: uuid(), kind: 'file', caseId: c1.id, subjectId: '', revision: 0,
  payload: { number: 'ARC-H-6', title: 'ملف بأصول', type: 'ملف قضية', volume: '', pages: '10', locationId: '', originals: 'yes', confidential: 'no', intakeDate: '2026-10-01', retentionUntil: '', notes: '', contents: 'أصل الوكالة\nأصل السند' } } });
assert.equal(f6.payload.contents, 'أصل الوكالة\nأصل السند', 'A file keeps its contents list');
const out6 = (await arc(keeper, 'dispatch', { date: '2026-10-13', items: [{ fileId: f6.id, holderId: ids.lawyer }] })).movements[0];
assert.equal(out6.payload.contents, 'أصل الوكالة\nأصل السند', 'The hand-out carries the contents it was sent with'); assert.equal(out6.payload.pages, '10');
const got6 = await arc(lawyer, 'desk_receive', { movementId: out6.id, missing: 'الصفحة 7' });
assert.equal(got6.payload.receivedMissing, 'الصفحة 7', 'What was missing at hand-out is on record');
await arc(lawyer, 'desk_return', { movementId: out6.id });
await denied(() => arc(lawyer, 'reject_return', { fileId: f6.id, reason: 'x' }));
await refused(() => arc(keeper, 'reject_return', { fileId: f6.id, reason: '' }), 'سبب');
const rejected = await arc(keeper, 'reject_return', { fileId: f6.id, reason: 'لم يُسلَّم في المكتب' });
assert.equal(rejected.payload.returnClaimedAt, ''); assert.equal(rejected.payload.rejections.length, 1); assert.equal(rejected.payload.rejections[0].reason, 'لم يُسلَّم في المكتب');
await refused(() => arc(keeper, 'reject_return', { fileId: f6.id, reason: 'مرة أخرى' }), 'لا يوجد إبلاغ');
let trip = (await arc(lawyer, 'desk_journeys')).handouts.find(h => h.number === 'ARC-H-6');
assert.equal(trip.rejections[0].reason, 'لم يُسلَّم في المكتب', 'The holder sees why the return was rejected'); assert.equal(trip.receivedMissing, 'الصفحة 7'); assert.equal(trip.contents, 'أصل الوكالة\nأصل السند');
await arc(lawyer, 'desk_return', { movementId: out6.id });
await refused(() => arc(keeper, 'approve_return', { fileId: f6.id, check: 'missing', missing: '' }), 'ينقص');
const back6 = await arc(keeper, 'approve_return', { fileId: f6.id, check: 'missing', missing: 'أصل السند', pages: '9' });
assert.equal(back6.payload.returnCheck, 'missing'); assert.equal(back6.payload.missing, 'أصل السند'); assert.equal(back6.payload.fromHolderId, ids.lawyer); assert.equal(back6.payload.pagesBack, '9');
trip = (await arc(lawyer, 'desk_journeys')).handouts.find(h => h.number === 'ARC-H-6');
assert.equal(trip.steps.at(-1).returnCheck, 'missing'); assert.equal(trip.steps.at(-1).missing, 'أصل السند', 'The holder sees what came back missing');
await denied(() => arc(lawyer, 'resolve_missing', { movementId: back6.id, note: 'x' }));
const settled = await arc(keeper, 'resolve_missing', { movementId: back6.id, note: 'أعاده المحامي في اليوم التالي' });
assert.match(settled.payload.missingResolvedAt, /^\d{4}-/); await refused(() => arc(keeper, 'resolve_missing', { movementId: back6.id, note: 'x' }), 'من قبل');
const whole = await arc(keeper, 'dispatch', { date: '2026-10-14', items: [{ fileId: f6.id, holderId: ids.lawyer }] });
await arc(lawyer, 'desk_receive', { movementId: whole.movements[0].id });
assert.equal((await arc(keeper, 'approve_return', { fileId: f6.id })).payload.returnCheck, 'complete', 'A plain confirmation means it came back whole');
await denied(() => arc(lawyer, 'mark_lost', { fileId: f6.id, note: 'x' }));
await refused(() => arc(keeper, 'mark_lost', { fileId: f6.id, note: '' }), 'فقد');
const lost = await arc(keeper, 'mark_lost', { fileId: f6.id, note: 'لم يُعثر عليه في الجرد' });
assert.equal(lost.payload.lost, 'yes'); assert.equal(lost.payload.lostHolder, 'المحامي', 'The search starts with the last confirmed holder');
const edited = await arc(keeper, 'save_record', { record: { ...lost, payload: { ...lost.payload, title: 'ملف بأصول (معدل)', lost: '' } } });
assert.equal(edited.payload.lost, 'yes', 'An ordinary save cannot clear the lost mark'); assert.equal(edited.payload.title, 'ملف بأصول (معدل)');
const foundAgain = await arc(keeper, 'mark_found', { fileId: f6.id, note: 'وُجد في درج آخر' });
assert.equal(foundAgain.payload.lost, ''); assert.match(foundAgain.payload.foundAt, /^\d{4}-/);
// A file taken off its drawer has no place until it is put somewhere again.
const shelf = await arc(keeper, 'save_record', { record: { id: uuid(), kind: 'location', caseId: '', subjectId: '', revision: 0, payload: { code: 'HX-1', name: 'غرفة الأرشيف', cabinet: 'X', shelf: 'درج 1', box: '', capacity: '', notes: '' } } });
await arc(keeper, 'save_record', { record: { id: uuid(), kind: 'movement', caseId: c1.id, subjectId: f6.id, revision: 0, payload: { type: 'move', date: '2026-10-15', holder: '', holderId: '', purpose: '', dueDate: '', locationId: shelf.id, notes: '' } } });
const placeOf = async () => { await db.exec('reset role'); const r = (await db.query('select mawatheeq_private.archive_state($1) s', [f6.id])).rows[0].s; await db.exec('set role anon'); return r.locationId; };
assert.equal(await placeOf(), shelf.id);
await denied(() => arc(lawyer, 'unplace_file', { fileId: f6.id }));
const off = await arc(keeper, 'unplace_file', { fileId: f6.id });
assert.equal(off.payload.unplaced, 'yes'); assert.equal(await placeOf(), '', 'Taken off its drawer, the file has no place');
await refused(() => arc(keeper, 'unplace_file', { fileId: f6.id }), 'بلا مكان');
await arc(keeper, 'save_record', { record: { id: uuid(), kind: 'movement', caseId: c1.id, subjectId: f6.id, revision: 0, payload: { type: 'move', date: '2026-10-16', holder: '', holderId: '', purpose: '', dueDate: '', locationId: shelf.id, notes: '' } } });
assert.equal(await placeOf(), shelf.id, 'Put back, it has its place again');
// Clearing the log: owner only, by date range, and never at the cost of where any file is or who holds it.
const states = async () => { await db.exec('reset role'); const r = (await db.query("select f.id, mawatheeq_private.archive_state(f.id) - 'lastId' s from mawatheeq_private.department_records f where f.workspace='archive' and f.kind='file' order by f.id")).rows; const n = (await db.query("select count(*)::int n from mawatheeq_private.department_records where workspace='archive' and kind='movement'")).rows[0].n; await db.exec('set role anon'); return { r: JSON.stringify(r), n }; };
const beforeClear = await states();
await denied(() => arc(keeper, 'clear_log', { from: '2026-10-01', to: '2026-10-31' }));
await refused(() => arc(owner, 'clear_log', { from: '2026-10-31', to: '2026-10-01' }), 'بعد نهايتها');
await refused(() => arc(owner, 'clear_log', { from: '', to: '2026-10-01' }), 'حدد');
const cleared = await arc(owner, 'clear_log', { from: '2026-10-01', to: '2026-10-31' });
const afterClear = await states();
assert.ok(cleared.removed > 0 && cleared.kept > 0, 'Old movements go, the ones custody stands on stay');
assert.equal(afterClear.n, beforeClear.n - cleared.removed);
assert.equal(afterClear.r, beforeClear.r, 'Every file keeps its state and its place');
assert.equal(await placeOf(), shelf.id);
const { clears, canClear } = await arc(keeper, 'log_clears');
assert.equal(canClear, false); assert.equal((await arc(owner, 'log_clears')).canClear, true, 'Only the owner is offered the clearing');
assert.equal(clears.length, 1); assert.equal(clears[0].from, '2026-10-01'); assert.equal(clears[0].by, 'المسؤول'); assert.equal(clears[0].removed, cleared.removed);
assert.equal((await arc(owner, 'clear_log', { from: '2026-10-01', to: '2026-10-31' })).removed, 0, 'Clearing the same range again removes nothing more');
console.log('Archive handover database checks passed.');
