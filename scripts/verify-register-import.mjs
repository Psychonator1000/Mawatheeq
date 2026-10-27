// Synthetic test of the one-time register import: reading a register report, the naming rules and correct spelling,
// the history as session entries, and the database step (owner only, dry run, register wins, history added once).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { parseRegister, detectRegister, cleanName, nameKey, historyOf, caseFromRegister } from '../lib/legacy-register.ts';

// A made-up report in the old system's layout, with a page break inside a session line.
const report = `مكتب مواثيق
للمحاماه والاستشارات القانونيةصفحة ـ1
1الجهة / شركه اختبار التجاره العامه ) ش م ك مقفله (الصفة / مدعيه
الخصم / * محمد اختبار الشطى280010100001
كود2434الموضوع : مطالبه بمبلغ100د.كمحكمة / الكليه ت.م.ج/7
وضع الملف - متداول دعوى رقم2026/11ملف رقم900200100
جلسة محكمة01-02-2026اول جلسه
.....يتبع
مكتب مواثيق
للمحاماه والاستشارات القانونيةصفحة ـ2
جلسة محكمة
15-02-2026للاعلان
جلسة خبراء01-03-2026خبراء الرقعى الساعه10مناقشه
حكم ابتدائي10-03-2026حكم بالطلبات
جلسة محكمة20-09-2099اول جلسه استئناف
2الجهة / * فاطمه اختبار احمد280020200002الصفة / مدعى عليها
الخصم / شركه اخرى (Test Co)
كود2435الموضوع : تعويضمحكمة / الكليه مدني/2
وضع الملف - منتهي دعوى رقم2026/12ملف رقم900200200
جلسة محكمة05-01-2026اول جلسه
جلسة محكمة05-01-2026شطب
`;
const { cases, problems } = parseRegister(report);
assert.deepEqual(problems, []);
assert.equal(cases.length, 2);
const [a, b] = cases;
assert.deepEqual([a.code, a.autoNumber, a.caseNumber, a.status, a.role, a.opponentId], ['2434', '900200100', '2026/11', 'متداول', 'مدعيه', '280010100001']);
assert.deepEqual(a.events.map(e => [e.kind, e.date]), [['session', '2026-02-01'], ['session', '2026-02-15'], ['expert', '2026-03-01'], ['judgment', '2026-03-10'], ['session', '2099-09-20']], 'A session split by a page break is one line');
assert.equal(b.clientId, '280020200002', 'The civil ID is taken out of the name');
assert.deepEqual(detectRegister(cases), { kind: 'main', company: '' });
// The naming rules and correct spelling.
assert.equal(cleanName(a.client), 'شركة اختبار التجارة العامة ش.م.ك', '«Closed» goes, ة and the company form are written correctly');
assert.equal(cleanName(a.opponent), 'محمد اختبار الشطي', 'No star, family names end in ي');
assert.equal(cleanName(b.client), 'فاطمة اختبار أحمد');
assert.equal(cleanName(b.opponent), 'شركة اخرى Test Co', 'English names lose their brackets');
assert.equal(nameKey('شركه الاتصالات المتنقله زين'), nameKey('شركة الاتصالات المتنقلة زين'));
assert.equal(cleanName('شركه الاتصالات الكويتيهSTC'), 'شركة الاتصالات الكويتية STC');
assert.equal(cleanName('عبدالله فيصل بصفته وليه'), 'عبدالله فيصل بصفته وليه', 'Words that are not feminine nouns are left alone');
// The history as the app's entries: each session points to the next; a coming session is the follow-up, not an entry.
const h = historyOf(a, '2026-10-27');
assert.deepEqual(h.map(p => [p.kind, p.date, p.decision || '', p.followup || '']), [
  ['جلسة', '2026-02-01', 'للاعلان', '2026-02-15'], ['جلسة', '2026-02-15', 'خبراء الرقعى الساعه10مناقشه', '2026-03-01'],
  ['جلسة خبراء', '2026-03-01', 'اول جلسه استئناف', '2099-09-20'], ['حكم / إجراء', '2026-03-10', '', ''],
]);
assert.deepEqual(historyOf(b, '2026-10-27').map(p => [p.date, p.decision]), [['2026-01-05', 'شطب']], 'Two lines on one day are a session and its outcome');
const itemA = caseFromRegister(a, { kind: 'main', company: '' }, 'شركة اختبار للتجارة', cleanName(a.opponent), '2026-10-27');
assert.equal(itemA.newCase.stage, 'استئناف', 'Sessions after a first-instance judgment put the case on appeal');
const itemB = caseFromRegister(b, { kind: 'insurance', company: 'بوبيان' }, 'فاطمة اختبار أحمد', 'شركة اخرى', '2026-10-27');
assert.equal(itemB.header.insurance, true, 'An insurance register marks its cases as insurance cases');

// The database step.
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
await db.query(`insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values ('owner',extensions.crypt($1,extensions.gen_salt('bf',4)),false),('clerk',extensions.crypt($1,extensions.gen_salt('bf',4)),false)`, ['Fixture-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,case when username='owner' then 'owner' else 'editor' end from mawatheeq_private.accounts");
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)).rows[0].result;
await db.exec('set role anon');
const owner = await rpc('mawatheeq_local_login', ['owner', 'Fixture-password-123']), clerk = await rpc('mawatheeq_local_login', ['clerk', 'Fixture-password-123']);
const local = (s, action, data = {}) => rpc('mawatheeq_local_request', [s.token, action, JSON.stringify(data)]);
// The app had this case with a wrong code and the client written another way.
await local(owner, 'save_case', { case: { id: 'reg-known', code: '42', autoNumber: '900200100', client: 'شركة اختبار للتجارة', opponent: 'قديم', type: 'حكم أول درجة',
  procedures: [{ id: 'old-1', kind: 'جلسة', date: '2026-02-01', text: 'مرحّلة سابقاً', decision: 'تأجيل', followup: '2026-02-15' }] } });
const items = [itemA, itemB];
await assert.rejects(() => local(clerk, 'import_register', { items, dryRun: true }), 'Only the office owner imports the registers');
const dry = await local(owner, 'import_register', { items, dryRun: true });
assert.deepEqual([dry.matched, dry.created, dry.updated], [1, 1, 1]);
assert.deepEqual(dry.codeChanges.map(x => [x.from, x.to]), [['42', '2434']]);
assert.equal((await local(owner, 'cases_page')).length, 1, 'A dry run writes nothing');
const done = await local(owner, 'import_register', { items, dryRun: false });
assert.deepEqual([done.matched, done.created], [1, 1]);
const rows = Object.fromEntries((await local(owner, 'cases_page')).map(r => [r.payload.autoNumber, r.payload]));
const known = rows['900200100'];
assert.deepEqual([known.code, known.opponent, known.caseNumber, known.legacyStatus], ['2434', 'محمد اختبار الشطي', '2026/11', 'متداول'], 'The register wins');
assert.equal(known.procedures.filter(p => p.date === '2026-02-01').length, 1, 'A session the case already has is not added again');
assert.equal(known.procedures.length, 4, 'The sessions and judgment it lacked are added');
assert.equal(rows['900200200'].insurance, true);
assert.ok(rows['900200200'].clientEntityId, 'A new case is linked to a client file');
const again = await local(owner, 'import_register', { items, dryRun: false });
assert.deepEqual([again.created, again.entriesAdded, again.updated], [0, 0, 0], 'Sending a batch again changes nothing');
await db.exec('reset role');
assert.equal((await db.query("select has_function_privilege('anon','mawatheeq_private.import_register(jsonb,boolean,uuid)','execute') ok")).rows[0].ok, false);
await db.close();
console.log('Passed register import: report reading across page breaks, naming rules and correct spelling, history as session entries, owner only, dry run without writes, register wins on codes and details, history added once, insurance cases marked, repeat batches change nothing.');
