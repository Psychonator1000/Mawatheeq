// Synthetic database test for staff chat: membership, owner review, references, edits, files and session checks.
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
const chat = (s, action, data = {}) => rpc('mawatheeq_chat_request', [s.token, action, JSON.stringify(data)]);
const local = (s, action, data = {}) => rpc('mawatheeq_local_request', [s.token, action, JSON.stringify(data)]);
const office = (s, action, data = {}) => rpc('mawatheeq_office_request', [s.token, action, JSON.stringify(data)]);
const denied = fn => assert.rejects(fn, e => e.code === '42501');
const uuid = () => crypto.randomUUID();

// Cases: amal sees only her case; badr sees every case.
await local(owner, 'save_case', { case: { id: 'chat-case-a', client: 'موكل أ', opponent: 'خصم أ', code: 'CH-A', lawyer: 'أمل', procedures: [] } });
await local(owner, 'save_case', { case: { id: 'chat-case-b', client: 'موكل ب', opponent: 'خصم ب', code: 'CH-B', lawyer: 'بدر', procedures: [] } });
const ctx = await office(owner, 'context');
const id = u => ctx.members.find(m => m.username === u).id;
const grant = async (u, p) => { const m = (await office(owner, 'context')).members.find(x => x.username === u); await office(owner, 'set_member_access', { id: m.id, revision: m.permissions.revision, permissions: p }); return login(u); };
const amal2 = await grant('amal', { sections: ['cases', 'work'], caseScope: 'selected', caseIds: [], lawyerNames: ['أمل'], canEdit: true, canExport: false });
const badr2 = await grant('badr', { sections: ['cases', 'clients', 'work'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false });
const salem2 = await grant('salem', { sections: ['secretary'], caseScope: 'selected', caseIds: [], canEdit: true, canExport: false });

await assert.rejects(() => chat({ token: 'a'.repeat(64) }, 'summary'), /الجلسة/, 'A valid session is required');
const people = await chat(amal2, 'people'); assert.deepEqual(people.map(p => p.name).sort(), ['المسؤول', 'بدر', 'سالم'].sort(), 'Everyone else is listed by name, not oneself');

// One-to-one: the same pair always reuses one conversation.
const d1 = await chat(amal2, 'start_direct', { userId: id('badr') }), d2 = await chat(badr2, 'start_direct', { userId: id('amal') });
assert.equal(d1.id, d2.id, 'A pair has one direct conversation');
await assert.rejects(() => chat(amal2, 'start_direct', { userId: id('amal') }), /زميلاً/);

// References: only records the sender may open are kept; each reader sees whether it opens for them.
await chat(badr2, 'send', { conversationId: d1.id, clientId: uuid(), body: 'راجعي القضية', refs: [{ type: 'case', id: 'chat-case-b', label: 'CH-B' }, { type: 'case', id: 'chat-case-a', label: 'CH-A' }, { type: 'user', id: id('amal'), label: 'أمل' }, { type: 'bogus', id: 'x', label: 'x' }] });
let msgs = await chat(amal2, 'messages', { conversationId: d1.id });
const m = msgs.at(-1); assert.equal(m.body, 'راجعي القضية'); assert.equal(m.refs.length, 3, 'Unknown reference types are dropped');
assert.deepEqual(m.refs.map(r => [r.label, r.ok]), [['CH-B', false], ['CH-A', true], ['أمل', true]], 'A case the reader may not see does not open for her');
const fromAmal = await chat(amal2, 'send', { conversationId: d1.id, clientId: uuid(), body: 'حاضر', refs: [{ type: 'case', id: 'chat-case-b', label: 'CH-B' }] });
msgs = await chat(badr2, 'messages', { conversationId: d1.id });
assert.deepEqual(msgs.at(-1).refs, [], 'A sender cannot reference a case she may not see');

// Idempotent sends: a retried message is stored once.
const cid = uuid(); const s1 = await chat(amal2, 'send', { conversationId: d1.id, clientId: cid, body: 'مرة واحدة' }), s2 = await chat(amal2, 'send', { conversationId: d1.id, clientId: cid, body: 'مرة واحدة' });
assert.equal(s1.id, s2.id);

// Unread counts and read marks.
let sum = await chat(badr2, 'summary'); assert.equal(sum.conversations.find(c => c.id === d1.id).unread, 2, 'Two unread messages from the other person');
await chat(badr2, 'read', { conversationId: d1.id, lastId: s1.id }); sum = await chat(badr2, 'summary'); assert.equal(sum.conversations.find(c => c.id === d1.id).unread, 0);

// Privacy: non-members cannot read or write; the owner can review read-only.
await denied(() => chat(salem2, 'messages', { conversationId: d1.id }));
await denied(() => chat(salem2, 'send', { conversationId: d1.id, clientId: uuid(), body: 'تطفل' }));
assert.equal((await chat(salem2, 'summary')).conversations.some(c => c.id === d1.id), false, 'Others do not see the conversation');
const review = await chat(owner, 'summary'); assert.equal(review.owner, true); assert.equal(review.conversations.find(c => c.id === d1.id).isMember, false, 'The owner sees it as a reviewer');
assert.ok((await chat(owner, 'messages', { conversationId: d1.id })).length >= 3, 'The owner can review the conversation');
await denied(() => chat(owner, 'send', { conversationId: d1.id, clientId: uuid(), body: 'من المسؤول' }));

// Groups: anyone creates; members add, rename and leave; leaving ends access.
const g = await chat(salem2, 'create_group', { title: 'قضايا زين', memberIds: [id('amal')] });
await chat(amal2, 'add_members', { conversationId: g.id, memberIds: [id('badr')] });
await chat(badr2, 'rename', { conversationId: g.id, title: 'فريق زين' });
let gm = await chat(badr2, 'messages', { conversationId: g.id });
assert.deepEqual(gm.filter(x => x.kind === 'event').map(x => x.body), ['أنشأ سالم المجموعة مع أمل', 'أضاف أمل: بدر', 'غيّر بدر اسم المجموعة إلى «فريق زين»']);
await chat(badr2, 'leave', { conversationId: g.id }); await denied(() => chat(badr2, 'messages', { conversationId: g.id })); await denied(() => chat(badr2, 'send', { conversationId: g.id, clientId: uuid(), body: 'x' }));
await denied(() => chat(amal2, 'add_members', { conversationId: d1.id, memberIds: [id('salem')] }));
await assert.rejects(() => chat(amal2, 'create_group', { title: ' ', memberIds: [] }), /اسماً/);

// Edit and delete: own messages within 15 minutes only.
await chat(amal2, 'edit', { id: fromAmal.id, body: 'حاضر، تم' });
msgs = await chat(badr2, 'messages', { conversationId: d1.id }); const edited = msgs.find(x => x.id === fromAmal.id);
assert.equal(edited.body, 'حاضر، تم'); assert.ok(edited.editedAt);
await denied(() => chat(badr2, 'delete', { id: fromAmal.id }));
await chat(amal2, 'delete', { id: fromAmal.id }); msgs = await chat(badr2, 'messages', { conversationId: d1.id });
assert.equal(msgs.find(x => x.id === fromAmal.id).deleted, true); assert.equal(msgs.find(x => x.id === fromAmal.id).body, '');
await db.exec('reset role'); await db.query("update mawatheeq_private.chat_messages set created_at=created_at-interval '16 minutes' where id=$1", [s1.id]); await db.exec('set role anon');
await assert.rejects(() => chat(amal2, 'edit', { id: s1.id, body: 'متأخر' }), /15 دقيقة/);

// Files: members reserve a path, attach it once, and only readers of the conversation may download it.
await assert.rejects(() => chat(amal2, 'file_upload', { conversationId: d1.id, name: 'كبير.pdf', size: 6 * 1024 * 1024, mime: 'application/pdf' }), /5 ميغابايت/);
await assert.rejects(() => chat(amal2, 'file_upload', { conversationId: d1.id, name: 'x.exe', size: 10, mime: 'application/x-msdownload' }), /غير مدعوم/);
await denied(() => chat(salem2, 'file_upload', { conversationId: d1.id, name: 'a.pdf', size: 10, mime: 'application/pdf' }));
const up = await chat(amal2, 'file_upload', { conversationId: d1.id, name: 'مذكرة.pdf', size: 2048, mime: 'application/pdf' });
await denied(() => chat(amal2, 'file_download', { path: up.path }));
await assert.rejects(() => chat(badr2, 'send', { conversationId: d1.id, clientId: uuid(), body: '', filePath: up.path }), /إرفاق/, 'Only the uploader attaches the file');
await chat(amal2, 'send', { conversationId: d1.id, clientId: uuid(), body: '', filePath: up.path });
assert.equal((await chat(badr2, 'file_download', { path: up.path })).path, up.path);
assert.equal((await chat(owner, 'file_download', { path: up.path })).path, up.path, 'The owner can review files too');
await denied(() => chat(salem2, 'file_download', { path: up.path }));
assert.equal((await chat(badr2, 'summary')).conversations.find(c => c.id === d1.id).last.body, '📎 مذكرة.pdf');

// Search finds people and the cases the searcher may open, nothing else.
const found = await chat(amal2, 'search', { q: 'CH-' }); assert.deepEqual(found.filter(r => r.type === 'case').map(r => r.label), ['CH-A']);
assert.ok((await chat(badr2, 'search', { q: 'CH-' })).filter(r => r.type === 'case').length === 2);
assert.ok((await chat(amal2, 'search', { q: 'بدر' })).some(r => r.type === 'user'));

// An admin given the chat power reviews conversations they are not in, read-only, like the owner.
{const s=(await office(owner,'context')).members.find(x=>x.username==='salem');
 await denied(()=>chat(salem2,'messages',{conversationId:d1.id}));
 await office(owner,'set_member_access',{id:s.id,revision:s.permissions.revision,permissions:{...s.permissions,adminPowers:['chat']}});
 const reviewer=await login('salem');assert.equal((await chat(reviewer,'summary')).owner,true,'The chat power opens owner review');
 assert.ok((await chat(reviewer,'messages',{conversationId:d1.id})).length>0,'and reads any conversation');
 await denied(()=>chat(reviewer,'send',{conversationId:d1.id,clientId:uuid(),body:'x',refs:[]}));}
await db.exec('reset role');
assert.equal((await db.query("select has_function_privilege('anon','mawatheeq_private.chat_ref_ok(uuid,jsonb)','execute') ok")).rows[0].ok, false, 'Helpers are not callable directly');
await db.exec('set role anon'); await assert.rejects(() => db.query('select * from mawatheeq_private.chat_messages'), /permission denied/, 'Tables are not readable directly'); await db.exec('reset role');
await db.close();
console.log('Passed chat database: session checks, people list, one direct conversation per pair, reference filtering per reader and sender, idempotent sends, unread counts, member-only access with owner read-only review, groups (create/add/rename/leave), 15-minute edit/delete, file size/type limits and member-only downloads, permission-aware search.');
