// Synthetic database test for case documents: who may list, upload, change and delete a case's files, and the paths handed out.
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
 ('owner',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'المسؤول'),('amal',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'أمل'),
 ('badr',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'بدر'),('salem',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'سالم')`, ['Fixture-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,case when username='owner' then 'owner' else 'editor' end from mawatheeq_private.accounts");
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)).rows[0].result;
const login = u => rpc('mawatheeq_local_login', [u, 'Fixture-password-123']);
await db.exec('set role anon');
const owner = await login('owner');
for (const name of ['amal', 'badr', 'salem']) await login(name);
const files = (s, action, data = {}) => rpc('mawatheeq_case_file_request', [s.token, action, JSON.stringify(data)]);
const local = (s, action, data = {}) => rpc('mawatheeq_local_request', [s.token, action, JSON.stringify(data)]);
const office = (s, action, data = {}) => rpc('mawatheeq_office_request', [s.token, action, JSON.stringify(data)]);
const denied = fn => assert.rejects(fn, e => e.code === '42501');

// Cases: amal edits only her case; badr reads every case but cannot edit; salem has no cases.
await local(owner, 'save_case', { case: { id: 'file-case-a', client: 'موكل أ', opponent: 'خصم أ', code: 'FL-A', lawyer: 'أمل', procedures: [] } });
await local(owner, 'save_case', { case: { id: 'file-case-b', client: 'موكل ب', opponent: 'خصم ب', code: 'FL-B', lawyer: 'بدر', procedures: [] } });
const grant = async (u, p) => { const m = (await office(owner, 'context')).members.find(x => x.username === u); await office(owner, 'set_member_access', { id: m.id, revision: m.permissions.revision, permissions: p }); return login(u); };
const amal = await grant('amal', { sections: ['cases'], caseScope: 'selected', caseIds: [], lawyerNames: ['أمل'], canEdit: true, canExport: false });
const badr = await grant('badr', { sections: ['cases'], caseScope: 'all', caseIds: [], canEdit: false, canExport: false });
const salem = await grant('salem', { sections: ['secretary'], caseScope: 'selected', caseIds: [], canEdit: true, canExport: false });
const pdf = { name: 'مذكرة دفاع.pdf', size: 2048, mime: 'application/pdf' };
// Stands in for the storage upload the files function signs.
const stored = async path => { await db.exec('reset role'); await db.query("insert into storage.objects(bucket_id,name) values('mawatheeq-case-files',$1)", [path]); await db.exec('set role anon'); };

await assert.rejects(() => files({ token: 'a'.repeat(64) }, 'list', { caseId: 'file-case-a' }), /الجلسة/, 'A valid session is required');
assert.deepEqual(await files(amal, 'list', { caseId: 'file-case-a' }), { canEdit: true, files: [] });
assert.deepEqual(await files(badr, 'list', { caseId: 'file-case-a' }), { canEdit: false, files: [] }, 'Readers see the list without edit rights');
await denied(() => files(amal, 'list', { caseId: 'file-case-b' }));
await denied(() => files(salem, 'list', { caseId: 'file-case-a' }));
await assert.rejects(() => files(amal, 'list', { caseId: 'no-such-case' }), /القضية غير موجودة/);

// Uploading: a path in the case's own folder, only for editors, only accepted types and sizes.
const up = await files(amal, 'upload', { caseId: 'file-case-a', ...pdf });
assert.match(up.path, /^cases\/[0-9a-f]{32}\/[0-9a-f-]{36}$/);
await denied(() => files(badr, 'upload', { caseId: 'file-case-a', ...pdf }));
await assert.rejects(() => files(amal, 'upload', { caseId: 'file-case-a', ...pdf, mime: 'application/x-msdownload' }), /نوع الملف/);
await assert.rejects(() => files(amal, 'upload', { caseId: 'file-case-a', ...pdf, size: 26214401 }), /25 ميغابايت/);
await assert.rejects(() => files(amal, 'add', { caseId: 'file-case-a', path: up.path, ...pdf, category: 'مذكرات' }), /لم يكتمل رفع/, 'A file is saved only after it reached storage');
await stored(up.path);
await assert.rejects(() => files(amal, 'add', { caseId: 'file-case-a', path: up.path, ...pdf, category: 'تصنيف آخر' }), /تصنيف/);
const other = await files(owner, 'upload', { caseId: 'file-case-b', ...pdf }); await stored(other.path);
await assert.rejects(() => files(owner, 'add', { caseId: 'file-case-a', path: other.path, ...pdf, category: 'مذكرات' }), /أعد رفعه/, 'A path from another case is refused');
const memo = await files(amal, 'add', { caseId: 'file-case-a', path: up.path, ...pdf, title: '', category: 'مذكرات', docDate: '2026-08-10' });
assert.deepEqual([memo.title, memo.category, memo.docDate, memo.uploadedBy, memo.revision], ['مذكرة دفاع.pdf', 'مذكرات', '2026-08-10', 'أمل', 1], 'An empty title falls back to the file name');
await assert.rejects(() => files(amal, 'add', { caseId: 'file-case-a', path: up.path, ...pdf, category: 'مذكرات' }), /محفوظ بالفعل/);
// Several files at once.
for (const [title, category, docDate] of [['حافظة مستندات خبرة', 'حوافظ مستندات', '2026-08-12'], ['صورة العقد', 'أخرى', '']]) {
 const p = await files(amal, 'upload', { caseId: 'file-case-a', ...pdf }); await stored(p.path);
 await files(amal, 'add', { caseId: 'file-case-a', path: p.path, ...pdf, title, category, docDate });
}
let list = await files(badr, 'list', { caseId: 'file-case-a' });
assert.deepEqual(list.files.map(f => f.title), ['حافظة مستندات خبرة', 'مذكرة دفاع', 'صورة العقد'].map(t => t === 'مذكرة دفاع' ? 'مذكرة دفاع.pdf' : t), 'Newest document date first, undated last');

// Changing and deleting need edit rights; downloads need only access to the case.
await denied(() => files(badr, 'update', { id: memo.id, revision: 1, title: 'x', category: 'مذكرات' }));
const renamed = await files(amal, 'update', { id: memo.id, revision: 1, title: 'مذكرة دفاع منا', category: 'مذكرات', docDate: '2026-08-31' });
assert.deepEqual([renamed.title, renamed.docDate, renamed.revision], ['مذكرة دفاع منا', '2026-08-31', 2]);
await assert.rejects(() => files(amal, 'update', { id: memo.id, revision: 1, title: 'قديم', category: 'مذكرات' }), e => e.code === '40001', 'A stale edit is refused');
await assert.rejects(() => files(amal, 'update', { id: memo.id, revision: 2, title: ' ', category: 'مذكرات' }), /عنوان/);
assert.deepEqual(await files(badr, 'download', { id: memo.id }), { path: up.path, name: 'مذكرة دفاع.pdf', mime: 'application/pdf' });
await denied(() => files(salem, 'download', { id: memo.id }));
await denied(() => files(badr, 'delete', { id: memo.id }));
assert.deepEqual(await files(amal, 'delete', { id: memo.id }), { path: up.path }, 'Deleting returns the stored path for removal');
await assert.rejects(() => files(amal, 'download', { id: memo.id }), /لم يعد هذا الملف موجوداً/);
list = await files(amal, 'list', { caseId: 'file-case-a' }); assert.equal(list.files.length, 2);

await db.exec('reset role');
assert.equal((await db.query("select has_function_privilege('anon','mawatheeq_private.case_file_can_edit(uuid,text)','execute') ok")).rows[0].ok, false, 'Helpers are not callable directly');
assert.ok((await db.query("select count(*)::int n from public.mawatheeq_audit where action like 'case_file_%'")).rows[0].n >= 4, 'Adding and deleting are audited');
await db.exec('set role anon'); await assert.rejects(() => db.query('select * from mawatheeq_private.case_files'), /permission denied/, 'The table is not readable directly'); await db.exec('reset role');
await db.close();
console.log('Passed case files database: session and case checks, readers without edit rights, upload paths per case, accepted types and sizes, saving only stored files, several files, ordering by document date, edits with revisions, downloads and deletions with audit entries.');
