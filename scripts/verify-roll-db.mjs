// Synthetic database test for the court roll import: matching, new cases, sessions, hearings and repeat imports.
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
 ('owner',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'المسؤول'),('amal',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'أمل الرول')`, ['Fixture-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,case when username='owner' then 'owner' else 'editor' end from mawatheeq_private.accounts");
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)).rows[0].result;
const login = u => rpc('mawatheeq_local_login', [u, 'Fixture-password-123']);
await db.exec('set role anon');
const owner = await login('owner'), amal = await login('amal');
const local = (s, action, data = {}) => rpc('mawatheeq_local_request', [s.token, action, JSON.stringify(data)]);
const office = (s, action, data = {}) => rpc('mawatheeq_office_request', [s.token, action, JSON.stringify(data)]);
const roll = (s, cases, dryRun) => local(s, 'import_roll', { file: 'synthetic-roll.xls', dryRun, cases });
const iso = d => new Date(Date.now() + d * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
const past = iso(-5), soon = iso(4), later = iso(30);
const ownerId = (await office(owner, 'context')).user.id, amalId = (await office(owner, 'context')).members.find(m => m.username === 'amal').id;

// Existing cases: one plain, and one number recorded at two court levels.
await local(owner, 'save_case', { case: { id: 'roll-known', code: 'K-1', autoNumber: '900100100', client: 'موكل الرول المعروف', opponent: '', caseNumber: '', subject: 'قائم', lawyer: '', type: 'حكم أول درجة', procedures: [] } });
await local(owner, 'save_case', { case: { id: 'roll-first', code: 'K-2', autoNumber: '900100200', client: 'موكل الدرجتين', opponent: 'خصم', type: 'حكم أول درجة', procedures: [] } });
await local(owner, 'save_case', { case: { id: 'roll-appeal', code: 'K-3', autoNumber: '900100200', client: 'موكل الدرجتين', opponent: 'خصم', type: 'حكم استئناف', procedures: [] } });
await local(owner, 'save_case', { case: { id: 'roll-twin-a', code: 'K-4', autoNumber: '900100300', client: 'موكل مكرر', opponent: 'خصم', type: 'حكم أول درجة', procedures: [] } });
await local(owner, 'save_case', { case: { id: 'roll-twin-b', code: 'K-5', autoNumber: '900100300', client: 'موكل مكرر', opponent: 'خصم آخر', type: 'حكم أول درجة', procedures: [] } });
await local(owner, 'save_case', { case: { id: 'roll-code-holder', code: '7005', autoNumber: '900100999', client: 'صاحب الكود', type: 'حكم أول درجة', procedures: [] } });
// An open hearing on the day the roll shows as held.
await office(owner, 'save_work', { item: { id: crypto.randomUUID(), revision: 0, caseId: 'roll-known', title: 'جلسة', kind: 'hearing', dueDate: past, dueTime: '', assigneeId: ownerId, priority: 'normal', status: 'open', location: '', notes: '', completionNote: '' } });

const session = (date, next) => ({ id: 'roll-x-' + date, date, kind: 'جلسة', venue: 'المحكمة', court: 'ت كلى / 26', decision: 'تأجيل للإعلان', text: 'تأجيل للإعلان — للاعلان', followup: next, nextTime: '', recordedBy: 'رول الجلسات', source: 'رول الجلسات' });
const newCase = (client, extra = {}) => ({ client, clientGroup: client, opponent: 'خصم جديد', role: 'مدعي', type: 'حكم أول درجة', outcome: 'غير محدد', stage: 'ابتدائي', caseNumber: '2026/5', court: 'الرقعى', subject: 'مطالبة', lawyer: 'أمل الرول', source: 'رول الجلسات', notes: 'من رول الجلسات', procedures: [], ...extra });
const item = (autoNumber, extra = {}) => ({ autoNumber, special: '', client: 'موكل الرول المعروف', opponent: 'خصم من الرول', caseNumber: '2026/77', court: 'الرقعى', stage: 'ابتدائي', subject: 'من الرول', lawyer: 'أمل الرول',
 sessions: [session(past, soon)], held: [{ date: past, note: 'تأجيل للإعلان — للاعلان' }], upcoming: [{ dueDate: soon, dueTime: '10:00', title: 'جلسة · أول درجة · ' + autoNumber, location: 'الرقعى', notes: 'من رول الجلسات' }],
 newCase: newCase('موكل جديد من الرول'), ...extra });
const cases = [
 item('900100100'),
 item('900100200', { client: 'موكل الدرجتين', stage: 'استئناف', upcoming: [] }),
 item('900100300', { client: 'موكل مكرر' }),
 item('900100400', { special: '7004', client: 'موكل جديد من الرول', upcoming: [{ dueDate: later, dueTime: '', title: 'النطق بالحكم · أول درجة · 900100400', location: '', notes: '' }, { dueDate: iso(-1), dueTime: '', title: 'قديم', location: '', notes: '' }] }),
 item('900100500', { special: '7005', client: 'موكل آخر من الرول', lawyer: 'محامٍ غير مسجل', newCase: newCase('موكل آخر من الرول', { lawyer: 'محامٍ غير مسجل' }) }),
 { autoNumber: 'ليس رقماً', client: 'خطأ' },
];

await assert.rejects(() => roll(amal, cases, true), e => e.code === '42501', 'Only the owner (or the settings power) imports a roll');
const dry = await roll(owner, cases, true);
assert.deepEqual([dry.dryRun, dry.matched, dry.created, dry.ambiguous, dry.invalid], [true, 2, 2, 1, 1]);
assert.equal((await local(owner, 'cases_page', { offset: 0 })).length, 6, 'A dry run writes nothing');
assert.deepEqual(dry.ambiguousRows.map(r => [r.autoNumber, r.ids]), [['900100300', ['roll-twin-a', 'roll-twin-b']]], 'One number at one level twice is left alone');
assert.deepEqual(dry.takenCodes.map(r => r.code), ['7005'], 'A code another case holds is not reused');
assert.deepEqual(dry.unknownLawyers, ['محامٍ غير مسجل']);
assert.deepEqual(dry.newClients.sort(), ['موكل آخر من الرول', 'موكل جديد من الرول'].sort());

const done = await roll(owner, cases, false);
assert.deepEqual([done.matched, done.created, done.sessionsAdded, done.hearingsAdded, done.hearingsClosed], [2, 2, 4, 3, 1]);
const all = await local(owner, 'cases_page', { offset: 0 }), byNumber = n => all.filter(c => c.payload.autoNumber === n).map(c => c.payload);
const known = byNumber('900100100')[0];
assert.deepEqual([known.opponent, known.caseNumber, known.court, known.subject, known.lawyer], ['خصم من الرول', '2026/77', 'الرقعى', 'قائم', 'أمل الرول'], 'Only empty fields are filled');
assert.deepEqual(known.procedures.map(p => [p.date, p.decision, p.followup]), [[past, 'تأجيل للإعلان', soon]]);
assert.equal(all.find(c => c.id === 'roll-appeal').payload.procedures.length, 1, 'One number at two levels: the session goes to the level the roll names');
assert.equal(all.find(c => c.id === 'roll-first').payload.procedures.length, 0);
const fresh = byNumber('900100400')[0], other = byNumber('900100500')[0];
assert.deepEqual([fresh.code, fresh.client, fresh.stage, fresh.procedures.length, !!fresh.clientEntityId], ['7004', 'موكل جديد من الرول', 'ابتدائي', 1, true], 'A new case is coded by the roll and linked to a client file');
assert.equal(other.code, '', 'A taken code is left empty');
const hearings = await (async () => { await db.exec('reset role'); const r = await db.query("select payload from mawatheeq_private.work_items where payload->>'kind'='hearing'"); await db.exec('set role anon'); return r.rows.map(x => x.payload); })();
const of = id => hearings.filter(h => h.caseId === id);
assert.deepEqual(of('roll-known').map(h => [h.dueDate, h.status, h.dueTime, h.assigneeId]).sort(), [[past, 'done', '', ownerId], [soon, 'open', '10:00', amalId]].sort(), 'The held hearing is closed and the next is assigned to the lawyer on the roll');
assert.equal(of('roll-known').find(h => h.dueDate === past).completionNote, 'تأجيل للإعلان — للاعلان');
const freshId = all.find(c => c.payload.autoNumber === '900100400').id;
assert.deepEqual(of(freshId).map(h => [h.dueDate, h.priority]), [[later, 'urgent']], 'Past dates are skipped; judgment days are urgent');
assert.equal(of(all.find(c => c.payload.autoNumber === '900100500').id)[0].assigneeId, ownerId, 'An unknown lawyer leaves the hearing with the importer');

// Importing the same roll again adds nothing.
const again = await roll(owner, cases, false);
assert.deepEqual([again.matched, again.created, again.sessionsAdded, again.sessionsKnown, again.hearingsAdded, again.hearingsKnown, again.hearingsClosed], [4, 0, 0, 4, 0, 3, 0]);
await assert.rejects(() => local(owner, 'import_roll', { cases: Array.from({ length: 151 }, () => ({})) }), /150/);
await db.exec('reset role');
assert.equal((await db.query("select has_function_privilege('anon','mawatheeq_private.import_roll(jsonb,text,boolean,uuid)','execute') ok")).rows[0].ok, false, 'The import is reached only through the request');
await db.close();
console.log('Passed roll database import: owner only, dry run without writes, matching by automatic number and court level, ambiguous numbers left alone, empty fields filled, sessions added once, new ongoing cases coded by the roll unless the code is taken, client files linked, coming hearings assigned to the named lawyer, held hearings closed, past dates skipped, and a repeated import adds nothing.');
