// Synthetic end-to-end test for the mail function's code: a fake IMAP server and a fake SMTP server on local sockets,
// the real MIME parser, and the real database functions (PGlite). Fetches a first batch, then new mail, sends a reply with an
// attachment, files it in Sent, and matches the server's copy instead of duplicating it.
// Needs postal-mime: installed, or MAIL_TEST_MODULES=/path/to/node_modules. Run with --experimental-strip-types.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { buildMessage, encodeWord, Smtp } from '../supabase/functions/mail/protocol.ts';
import { sendMail, syncAccount, testAccount, friendlyError } from '../supabase/functions/mail/core.ts';
import { startFakeMail } from './mail-fakes.mjs';

const PostalMime = (await import(process.env.MAIL_TEST_MODULES ? pathToFileURL(path.join(process.env.MAIL_TEST_MODULES, 'postal-mime/src/postal-mime.js')).href : 'postal-mime')).default;

const { folders, add, imapLog, smtpSent, IMAP_PORT, SMTP_PORT, connect, close } = await startFakeMail();

// ---- database ----
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
grant usage on schema storage to anon,authenticated,service_role;
`);
for (const file of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql')).sort()) await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password,display_name) values ('owner',extensions.crypt($1,extensions.gen_salt('bf',4)),false,'المسؤول')", ['Fixture-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,'owner' from mawatheeq_private.accounts");
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)).rows[0].result;
const owner = await rpc('mawatheeq_local_login', ['owner', 'Fixture-password-123']);
const mail = (action, data = {}) => rpc('mawatheeq_mail_request', [owner.token, action, JSON.stringify(data)]);
const store = new Map();
const deps = {
  connect, parse: raw => PostalMime.parse(raw),
  rpc: async (action, data = {}) => { await db.exec('reset role; set role service_role'); try { return await rpc('mawatheeq_mail_service', [owner.token, action, JSON.stringify(data)]); } finally { await db.exec('reset role'); } },
  upload: async (p, data) => { store.set(p, data); }, download: async p => store.get(p),
};

// ---- messages already in the mailbox ----
const raw1 = buildMessage({ from: { name: 'محكمة الاستئناف', address: 'court@example.test' }, to: [{ address: 'amal@example.test' }], subject: 'إعلان بموعد جلسة', text: 'الجلسة يوم الأحد.', messageId: '<old-1@example.test>', date: new Date('2026-10-10T08:00:00Z') });
add('INBOX', raw1, new Date(Date.now() - 86400000));
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const raw2 = [
  'From: =?UTF-8?B?' + Buffer.from('شركة الموكل').toString('base64') + '?= <client@example.test>', 'To: amal@example.test', 'Subject: ' + encodeWord('عقد مرفق للمراجعة'),
  'Message-ID: <old-2@example.test>', 'Date: Sun, 18 Oct 2026 09:00:00 +0300', 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="b1"', '',
  '--b1', 'Content-Type: multipart/related; boundary="b2"', '', '--b2', 'Content-Type: text/html; charset=UTF-8', '',
  '<p dir="rtl">مرفق العقد <img src="cid:logo@x"></p><script>alert(1)</script>', '--b2', 'Content-Type: image/png', 'Content-ID: <logo@x>', 'Content-Transfer-Encoding: base64', '',
  pixel.toString('base64'), '--b2--', '--b1', 'Content-Type: application/pdf; name="contract.pdf"', 'Content-Disposition: attachment; filename="contract.pdf"', 'Content-Transfer-Encoding: base64', '',
  Buffer.from('%PDF-1.4 synthetic').toString('base64'), '--b1--', ''].join('\r\n');
add('INBOX', raw2);
add('Sent Items', buildMessage({ from: { address: 'amal@example.test' }, to: [{ address: 'client@example.test' }], subject: 'Re: older', text: 'ok', messageId: '<sent-old@example.test>' }));

const settings = { imapHost: '127.0.0.1', imapPort: IMAP_PORT, imapSecurity: 'ssl', smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, username: 'amal@example.test', password: 'app-pass "x"' };
// Testing the connection: wrong password refused with advice, right one finds the Sent folder by its flag.
await assert.rejects(() => testAccount(deps, { ...settings, password: 'wrong' }), e => friendlyError(e).includes('كلمة مرور التطبيقات'));
assert.equal((await testAccount(deps, settings)).sentFolder, 'Sent Items');
await assert.rejects(() => Smtp.open(connect, { host: '127.0.0.1', port: 587, username: 'a', password: 'b' }), /465/);

const saved = await deps.rpc('save_account', { account: { workspace: 'secretary', ownerId: '', address: 'amal@example.test', displayName: 'السكرتارية', provider: 'custom', imapHost: '127.0.0.1', imapPort: IMAP_PORT, imapSecurity: 'ssl', smtpHost: '127.0.0.1', smtpPort: SMTP_PORT, username: 'amal@example.test', sentFolder: 'Sent Items' }, password: settings.password });

// First fetch: the existing mail arrives, counted as already read.
const due = async () => (await deps.rpc('due', { force: true }))[0];
let r = await syncAccount(deps, await due()); await deps.rpc('done', { accountId: saved.id, more: r.more });
assert.equal(r.more, false); assert.equal(r.added, 3);
let inbox = await mail('list', { workspace: 'secretary' });
assert.deepEqual(inbox.map(m => m.subject), ['عقد مرفق للمراجعة', 'إعلان بموعد جلسة']);
assert.equal(inbox[0].fromName, 'شركة الموكل'); assert.equal(inbox[0].attachments, 1); assert.equal(inbox[0].read, true);
const full = await mail('get', { id: inbox[0].id });
assert.match(full.html, /data:image\/png;base64,/, 'Inline pictures are kept inside the message'); assert.equal(full.attachmentList[0].name, 'contract.pdf');
assert.equal(Buffer.from(store.get(full.attachmentList[0].path)).toString(), '%PDF-1.4 synthetic');
assert.equal((await mail('counts')).total, 0);
assert.ok(!imapLog.some(c => /^(SELECT|STORE)/.test(c)), 'Mail is read without marking it read on the server');

// New mail: fetched from the last number on, and notified.
add('INBOX', buildMessage({ from: { name: 'الموكل', address: 'client@example.test' }, to: [{ address: 'amal@example.test' }], subject: 'استفسار عن القضية', text: 'متى الجلسة القادمة؟', messageId: '<new-1@example.test>' }));
r = await syncAccount(deps, await due()); await deps.rpc('done', { accountId: saved.id });
assert.equal(r.added, 1);
const counts = await mail('counts');
assert.equal(counts.total, 1); assert.equal(counts.latest[0].subject, 'استفسار عن القضية');
assert.ok(imapLog.includes('UID SEARCH UID 3:*'));

// Read in the app → read on the server at the next fetch; unread again → unread there; nothing when the switch is off.
const serverSeen = uid => folders.INBOX.msgs.find(x => x.uid === uid).seen;
const sync = async () => { const r = await syncAccount(deps, await due()); await deps.rpc('done', { accountId: saved.id }); return r; };
await mail('get', { id: counts.latest[0].id });
assert.equal(serverSeen(3), false, 'Nothing changes on the server until the next fetch');
await sync();
assert.equal(serverSeen(3), true); assert.ok(imapLog.includes('SELECT "INBOX"') && imapLog.includes('UID STORE 3 +FLAGS.SILENT (\\Seen)'));
await mail('mark', { ids: [counts.latest[0].id], read: false }); await sync();
assert.equal(serverSeen(3), false);
await mail('mark', { ids: [counts.latest[0].id], read: true }); await sync();
assert.equal(serverSeen(3), true);
const stores = imapLog.filter(c => c.startsWith('UID STORE')).length;
await sync(); assert.equal(imapLog.filter(c => c.startsWith('UID STORE')).length, stores, 'Each change is sent once');
const off = await deps.rpc('save_account', { account: { ...(await mail('context')).accounts[0], ...settings, address: 'amal@example.test', username: 'amal@example.test', sentFolder: 'Sent Items', markSeen: false }, password: '' });
assert.equal(off.markSeen, false);
await mail('mark', { ids: [counts.latest[0].id], read: false }); await sync();
assert.equal(serverSeen(3), true, 'With the switch off the server is left alone');
await deps.rpc('save_account', { account: { ...off, ...settings, address: 'amal@example.test', username: 'amal@example.test', sentFolder: 'Sent Items', markSeen: true }, password: '' });
await mail('mark', { ids: [counts.latest[0].id], read: true });

// Reply with an attachment: sent over SMTP, filed in Sent on the server, recorded, original marked answered.
const question = counts.latest[0];
store.set(`outgoing/${saved.id}/x/notes.txt`, new TextEncoder().encode('ملاحظات'));
const sent = await sendMail(deps, { accountId: saved.id, to: [{ address: 'client@example.test' }], cc: [{ address: 'bad address' }], subject: 'رد: استفسار عن القضية', text: 'الجلسة الأحد القادم.\n.سطر يبدأ بنقطة', replyToId: question.id, inReplyTo: '<new-1@example.test>',
  attachments: [{ path: `outgoing/${saved.id}/x/notes.txt`, name: 'ملاحظات.txt', mime: 'text/plain', size: 14 }] });
assert.equal(smtpSent.length, 1); assert.deepEqual(smtpSent[0].to, ['<client@example.test>'], 'Invalid addresses are dropped');
const parsed = await PostalMime.parse(smtpSent[0].raw);
assert.equal(parsed.subject, 'رد: استفسار عن القضية'); assert.equal(parsed.inReplyTo, '<new-1@example.test>'); assert.equal(parsed.from.name, 'السكرتارية');
assert.equal(parsed.text.trim(), 'الجلسة الأحد القادم.\n.سطر يبدأ بنقطة'); assert.equal(parsed.attachments[0].filename, 'ملاحظات.txt');
assert.equal(folders['Sent Items'].msgs.length, 2, 'A copy is filed in the server\'s Sent folder');
assert.equal(sent.folder, 'sent');
assert.equal((await mail('get', { id: question.id })).repliedBy, 'المسؤول');
await assert.rejects(() => sendMail(deps, { accountId: saved.id, to: [], subject: 'x', text: 'y' }), /المستلم/);
await assert.rejects(() => sendMail(deps, { accountId: saved.id, to: [{ address: 'a@b.test' }], subject: 'x', text: 'y', attachments: [{ path: 'outgoing/other/x/y', name: 'y', mime: '', size: 1 }] }), /مرفق غير صالح/);

// The server's copy of the reply is matched to the recorded one.
r = await syncAccount(deps, await due()); await deps.rpc('done', { accountId: saved.id });
const sentList = await mail('list', { workspace: 'secretary', folder: 'sent' });
assert.deepEqual(sentList.map(m => m.subject).sort(), ['Re: older', 'رد: استفسار عن القضية']);

// Large batches continue in the next call.
for (let i = 0; i < 25; i++) add('INBOX', buildMessage({ from: { address: 'bulk@example.test' }, to: [{ address: 'amal@example.test' }], subject: 'Bulk ' + i, text: 'x', messageId: `<bulk-${i}@example.test>` }));
r = await syncAccount(deps, await due()); await deps.rpc('done', { accountId: saved.id, more: r.more });
assert.equal(r.more, true); assert.equal(r.added, 20);
r = await syncAccount(deps, await due()); await deps.rpc('done', { accountId: saved.id, more: r.more });
assert.equal(r.more, false); assert.equal(r.added, 5);
assert.equal((await mail('counts')).total, 25, 'The 25 new ones; the answered question was opened');

// Forwarding carries the original's attachment; files from elsewhere are refused by the database.
await sendMail(deps, { accountId: saved.id, to: [{ address: 'lawyer@example.test' }], subject: 'إعادة توجيه: عقد', text: 'للاطلاع', attachments: [{ path: full.attachmentList[0].path, name: 'contract.pdf', mime: 'application/pdf', size: 18 }] });
assert.equal((await PostalMime.parse(smtpSent.at(-1).raw)).attachments[0].filename, 'contract.pdf');

close();
console.log('Passed mail protocol: connection test, first and later fetches without marking read, read/unread in the app carried to the server (and not when switched off), inline pictures and attachments, reply with attachment over SMTP filed in Sent, de-duplication and batching.');
