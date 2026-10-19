// Synthetic database test for section mail: shared and personal mailboxes, who sees whose mail, unread counts for the bell,
// claiming mailboxes for fetching, de-duplicating sent mail, replies, assignment and the service-only functions.
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
const office = (s, action, data = {}) => rpc('mawatheeq_office_request', [s.token, action, JSON.stringify(data)]);
const mail = (s, action, data = {}) => rpc('mawatheeq_mail_request', [s.token, action, JSON.stringify(data)]);
// The edge function calls the service functions with the service key; the browser (anon) cannot.
const svc = async (s, action, data = {}) => { await db.exec('reset role; set role service_role'); try { return await rpc('mawatheeq_mail_service', [s.token, action, JSON.stringify(data)]); } finally { await db.exec('reset role; set role anon'); } };
const denied = fn => assert.rejects(fn, e => e.code === '42501');
const refused = (fn, text) => assert.rejects(fn, e => e.message.includes(text), text);
const grant = async (u, p) => { const m = (await office(owner, 'context')).members.find(x => x.username === u); await office(owner, 'set_member_access', { id: m.id, revision: m.permissions.revision, permissions: p }); return login(u); };
const amal = await grant('amal', { sections: ['secretary'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false });
const badr = await grant('badr', { sections: ['secretary'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false });
const salem = await grant('salem', { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false });

await assert.rejects(() => rpc('mawatheeq_mail_service', [amal.token, 'due', '{}']), /permission denied/, 'The browser cannot reach the service functions');
const box = (ws, ownerId, address) => ({ workspace: ws, ownerId, label: '', address, displayName: 'مكتب', provider: 'custom', imapHost: 'mail.example.test', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'mail.example.test', smtpPort: 465, username: address });

// Mailboxes: anyone in a section connects their own; shared ones only the administrator.
const shared = await svc(owner, 'save_account', { account: box('secretary', '', 'office@example.test'), password: 'shared-secret' });
assert.equal(shared.ownerId, ''); assert.equal(shared.imapHost, 'mail.example.test'); assert.equal(shared.password, undefined, 'Passwords never come back');
const ctxA = await mail(amal, 'context');
const amalId = ctxA.me;
const own = await svc(amal, 'save_account', { account: box('secretary', amalId, 'amal@example.test'), password: 'amal-secret' });
await denied(() => svc(badr, 'save_account', { account: box('secretary', '', 'other@example.test'), password: 'x' }));
const salemId = (await mail(salem, 'context')).me;
await denied(() => svc(salem, 'save_account', { account: box('secretary', salemId, 'salem@example.test'), password: 'x' }));
await refused(() => svc(amal, 'save_account', { account: box('secretary', amalId, 'amal2@example.test') }), 'كلمة مرور');
await refused(() => svc(amal, 'save_account', { account: { ...own, revision: 0 }, password: '' }), 'عدّل شخص آخر');
assert.equal((await svc(amal, 'save_account', { account: { ...own, label: 'بريدي' } })).label, 'بريدي');

// Who sees what in the section.
const ids = s => mail(s, 'context').then(c => c.accounts.map(a => a.address).sort());
assert.deepEqual(await ids(amal), ['amal@example.test', 'office@example.test']);
assert.deepEqual(await ids(badr), ['office@example.test'], 'A colleague\'s mailbox is hidden by default');
assert.deepEqual(await ids(salem), []);
assert.deepEqual((await mail(salem, 'context')).workspaces, ['accounting']);
await denied(() => mail(salem, 'list', { workspace: 'secretary' }));
assert.equal((await mail(badr, 'context')).admin, false); assert.equal((await mail(owner, 'context')).admin, true);
assert.ok((await mail(owner, 'context')).members.length >= 4);

// Fetching: the person's mailboxes are claimed with their passwords, then left alone for a minute.
const due = await svc(amal, 'due');
assert.deepEqual(due.map(d => d.address).sort(), ['amal@example.test', 'office@example.test']);
assert.equal(due.find(d => d.address === 'amal@example.test').password, 'amal-secret'); assert.equal(due[0].first, true);
assert.deepEqual(await svc(amal, 'due'), [], 'Claimed mailboxes are not fetched twice at once');
assert.deepEqual((await svc(badr, 'due')), [], 'The shared mailbox is already being fetched');
const msg = (uid, extra = {}) => ({ uid, messageId: `<m${uid}@example.test>`, fromName: 'موكل', fromAddr: 'client@example.test', to: [{ address: 'amal@example.test' }], subject: 'رسالة ' + uid, date: '2026-10-19T08:00:00Z', snippet: 'نص', text: 'نص الرسالة', html: '<p>نص</p>', attachments: [], size: 100, ...extra });
await svc(amal, 'ingest', { accountId: own.id, folder: 'inbox', validity: 7, lastUid: 2, messages: [msg(1), msg(2)] });
await svc(amal, 'done', { accountId: own.id });
await svc(amal, 'done', { accountId: shared.id, error: 'رفض الخادم كلمة المرور' });
let counts = await mail(amal, 'counts');
assert.equal(counts.total, 0, 'Mail fetched the first time counts as already read');
assert.equal(counts.errors.length, 0, 'Only the mailbox owner or administrator sees a shared mailbox error');
assert.equal((await mail(owner, 'counts')).errors[0].address, 'office@example.test');
assert.equal((await mail(amal, 'list', { workspace: 'secretary' })).length, 2);
await svc(amal, 'ingest', { accountId: own.id, folder: 'inbox', validity: 7, lastUid: 3, messages: [msg(3, { subject: 'جلسة الغد' }), msg(2)] });
counts = await mail(amal, 'counts');
assert.equal(counts.total, 1); assert.equal(counts.byWorkspace.secretary, 1); assert.equal(counts.latest[0].subject, 'جلسة الغد');
assert.equal((await mail(amal, 'list', { workspace: 'secretary', filter: 'unread' })).length, 1);
assert.equal((await mail(amal, 'list', { workspace: 'secretary', q: 'الغد' })).length, 1);
const newest = (await mail(amal, 'list', { workspace: 'secretary', filter: 'unread' }))[0];
const opened = await mail(amal, 'get', { id: newest.id });
assert.equal(opened.text, 'نص الرسالة'); assert.equal(opened.readBy[0].name, 'أمل'); assert.equal(opened.canSend, true);
assert.equal((await mail(amal, 'counts')).total, 0);
await mail(amal, 'mark', { ids: [newest.id], read: false });
assert.equal((await mail(amal, 'counts')).total, 1);

// The stand-in sees the secretary's mail only when allowed, incoming and outgoing separately, and sends from it only when allowed.
assert.equal((await mail(badr, 'counts')).total, 0);
await denied(() => mail(badr, 'get', { id: newest.id }));
const badrId = (await mail(badr, 'context')).me;
await denied(() => mail(badr, 'set_visibility', { userId: badrId, workspace: 'secretary', inbox: true }));
await mail(owner, 'set_visibility', { userId: badrId, workspace: 'secretary', inbox: true, sent: false, send: false });
assert.deepEqual(await ids(badr), ['amal@example.test', 'office@example.test']);
assert.equal((await mail(badr, 'counts')).total, 1, 'The stand-in is notified of the secretary\'s new mail');
assert.equal((await mail(badr, 'get', { id: newest.id })).canSend, false);
await denied(() => svc(badr, 'credentials', { accountId: own.id }));
await denied(() => svc(badr, 'upload_path', { accountId: own.id, name: 'a.pdf', size: 10 }));
await mail(owner, 'set_visibility', { userId: badrId, workspace: 'secretary', inbox: true, sent: false, send: true });
const creds = await svc(badr, 'credentials', { accountId: own.id });
assert.equal(creds.password, 'amal-secret'); assert.equal(creds.sender, 'بدر');
assert.match((await svc(badr, 'upload_path', { accountId: own.id, name: 'عقد الإيجار.pdf', size: 10 })).path, /^outgoing\/[0-9a-f-]+\/[0-9a-f-]+\/_\.pdf$/);
await refused(() => svc(badr, 'upload_path', { accountId: own.id, name: 'big.zip', size: 20000000 }), '15');

// A reply from the stand-in: recorded as sent, the original marked answered by them; the server's copy is matched, not duplicated.
const sent = await svc(badr, 'record_sent', { accountId: own.id, replyToId: newest.id, message: { messageId: '<reply-1@example.test>', inReplyTo: '<m3@example.test>', to: [{ address: 'client@example.test' }], subject: 'رد: جلسة الغد', text: 'تم', snippet: 'تم' } });
assert.equal(sent.folder, 'sent'); assert.equal(sent.sentBy, 'بدر');
const answered = await mail(amal, 'get', { id: newest.id });
assert.equal(answered.repliedBy, 'بدر'); assert.equal(answered.state, 'done');
assert.equal((await mail(badr, 'list', { workspace: 'secretary', folder: 'sent' })).length, 0, 'Outgoing mail stays hidden without the outgoing permission');
assert.equal((await mail(amal, 'list', { workspace: 'secretary', folder: 'sent' })).length, 1);
await svc(amal, 'ingest', { accountId: own.id, folder: 'sent', validity: 3, lastUid: 9, sentFolder: 'Sent', messages: [msg(9, { messageId: '<reply-1@example.test>', subject: 'رد: جلسة الغد' }), msg(10, { messageId: '<web-1@example.test>', subject: 'من بريد الويب' })] });
const sentList = await mail(amal, 'list', { workspace: 'secretary', folder: 'sent' });
assert.deepEqual(sentList.map(m => m.subject).sort(), ['رد: جلسة الغد', 'من بريد الويب']);
await mail(owner, 'set_visibility', { userId: badrId, workspace: 'secretary', inbox: true, sent: true, send: true });
assert.equal((await mail(badr, 'list', { workspace: 'secretary', folder: 'all', accountId: own.id })).length, 5);

// Renumbered folder: matched again by Message-ID.
await svc(amal, 'ingest', { accountId: own.id, folder: 'inbox', validity: 8, lastUid: 1, messages: [msg(1)] });
assert.equal((await mail(amal, 'list', { workspace: 'secretary', folder: 'inbox' })).length, 3);

// Follow-up: assign and note; a read-only person cannot.
const st = await mail(badr, 'set_state', { id: newest.id, state: 'open', assignedTo: badrId, note: 'أتصل بالموكل' });
assert.equal(st.assignedName, 'بدر'); assert.equal(st.note, 'أتصل بالموكل');
assert.equal((await mail(badr, 'list', { workspace: 'secretary', filter: 'mine' })).length, 1);
await grant('badr', { sections: ['secretary'], caseScope: 'all', caseIds: [], canEdit: false, canExport: false });
const badr2 = await login('badr');
await denied(() => mail(badr2, 'set_state', { id: newest.id, state: 'done' }));

// Pausing and removing: the owner of a personal mailbox or the administrator; removal deletes its mail and password.
await denied(() => mail(badr2, 'delete_account', { id: own.id }));
assert.equal((await mail(amal, 'set_active', { id: own.id, active: false })).active, false);
assert.deepEqual((await svc(amal, 'due', { force: true })).map(d => d.address), ['office@example.test'], 'Paused mailboxes are not fetched');
await mail(amal, 'delete_account', { id: own.id });
assert.deepEqual(await ids(amal), ['office@example.test']);
await db.exec('reset role');
assert.equal((await db.query('select count(*)::int n from mawatheeq_private.mail_messages')).rows[0].n, 0);
assert.equal((await db.query('select count(*)::int n from mawatheeq_private.mail_secrets')).rows[0].n, 1, 'Only the shared mailbox password remains');
console.log('Passed mail DB: shared and personal mailboxes, per-section visibility of incoming and outgoing mail and sending, unread counts, claiming, de-duplication, replies, assignment, removal.');
