// Executes every migration in PGlite with synthetic accounts and records only.
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
await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values('owner',extensions.crypt($1,extensions.gen_salt('bf',4)),false)", ['Synthetic-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,'owner' from mawatheeq_private.accounts;set role anon");
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)).rows[0].result;
const local = (token, action, data = {}) => rpc('mawatheeq_local_request', [token, action, JSON.stringify(data)]);
const office = (token, action, data = {}) => rpc('mawatheeq_office_request', [token, action, JSON.stringify(data)]);
const comments = (token, action, data = {}) => rpc('mawatheeq_comment_request', [token, action, JSON.stringify(data)]);
const login = (username, password = 'Synthetic-password-123') => rpc('mawatheeq_local_login', [username, password]);
const denied = fn => assert.rejects(fn, e => e.code === '42501');

const owner = await login('owner');
const saveCase = id => local(owner.token, 'save_case', { case: { id, code: id.toUpperCase(), autoNumber: '1', client: 'Synthetic Client', clientGroup: 'Synthetic Client', opponent: 'Synthetic Opponent', date: '2026-10-01', procedures: [], revision: 0 } });
await saveCase('comment-visible'); await saveCase('comment-hidden');
async function staff(username, permissions) {
  const member = await office(owner.token, 'create_member', { username, password: 'Temporary-password-123', permissions });
  const session = await login(username, 'Temporary-password-123');
  await local(session.token, 'password', { currentPassword: 'Temporary-password-123', newPassword: 'Fixture-password-123' });
  return { ...session, member };
}
const scope = (sections, caseIds, canEdit = true) => ({ sections, caseScope: 'selected', caseIds, canEdit, canExport: false });
const clerk = await staff('clerk', scope(['cases', 'work'], ['comment-visible']));
const reader = await staff('reader', scope(['cases'], ['comment-visible'], false));
const outsider = await staff('outsider', scope(['cases', 'work'], ['comment-hidden']));
const visible = { targetType: 'case', targetId: 'comment-visible' }, hidden = { targetType: 'case', targetId: 'comment-hidden' };

// Anonymous, invalid and expired sessions never reach comments.
await assert.rejects(() => comments('0'.repeat(64), 'list', visible), e => e.code === '28000');
await assert.rejects(() => db.query('select * from mawatheeq_private.comments'), /permission denied/);
await assert.rejects(() => db.query('select mawatheeq_private.comment_request($1,$2,$3)', ['f'.repeat(64), 'list', JSON.stringify(visible)]), e => e.code === '28000', 'Entry point stays session-gated');
await assert.rejects(() => db.query('select mawatheeq_private.can_see_comment_target($1,$2,$3)', [owner.user.id, 'case', 'comment-hidden']), /permission denied/, 'Helpers are not callable');

// Posting, mentions and visibility.
const first = await comments(owner.token, 'post', { ...visible, body: '  راجع الإعلان  ', mentions: [clerk.member.id, reader.member.id] });
assert.equal(first.body, 'راجع الإعلان', 'Body is trimmed');
assert.deepEqual(first.mentions.map(m => m.username), ['clerk', 'reader']);
assert.equal(first.author, 'owner');
await denied(() => comments(owner.token, 'post', { ...visible, body: 'Leaks the case', mentions: [outsider.member.id] }));
await denied(() => comments(owner.token, 'post', { ...visible, body: 'Self mention', mentions: [owner.user.id] }));
await assert.rejects(() => comments(owner.token, 'post', { ...visible, body: '   ' }), /4000/);
await assert.rejects(() => comments(owner.token, 'post', { ...visible, body: 'x'.repeat(4001) }), /4000/);
await denied(() => comments(owner.token, 'post', { targetType: 'case', targetId: 'missing-case', body: 'x' }));
await denied(() => comments(owner.token, 'post', { targetType: 'client', targetId: 'comment-visible', body: 'x' }));
const mentionable = await comments(owner.token, 'mentionable', visible);
assert.deepEqual(mentionable.map(m => m.username), ['clerk', 'reader'], 'Only staff who can see the case are offered');

assert.equal((await comments(clerk.token, 'list', visible)).length, 1);
assert.equal((await comments(reader.token, 'list', visible)).length, 1, 'Read-only staff can read');
await denied(() => comments(reader.token, 'post', { ...visible, body: 'Read-only cannot post' }));
await denied(() => comments(outsider.token, 'list', visible));
await denied(() => comments(clerk.token, 'list', hidden));
await denied(() => comments(clerk.token, 'mentionable', hidden));

// Mentions feed and read marker.
const reply = await comments(clerk.token, 'post', { ...visible, body: 'تم، سأتابع', mentions: [] });
let feed = await comments(reader.token, 'mentions');
assert.deepEqual(feed.items.map(c => c.id), [first.id]); assert.equal(feed.lastRead, 0);
assert.equal((await comments(reader.token, 'mark_mentions_read', { lastId: first.id })).lastRead, first.id);
assert.equal((await comments(reader.token, 'mark_mentions_read', { lastId: 1 })).lastRead, first.id, 'Read marker never moves back');
assert.equal((await comments(reader.token, 'mark_mentions_read', { lastId: 999999 })).lastRead, reply.id, 'Read marker is capped at existing comments');
assert.equal((await comments(clerk.token, 'mentions')).items.length, 1);

// Replies build a thread; the answered author is notified; references are kept only when the writer may open them.
const answer = await comments(clerk.token, 'post', { ...visible, body: 'تم، راجع كود COMMENT-VISIBLE', parentId: first.id,
  refs: [{ type: 'case', id: 'comment-visible', label: 'كود COMMENT-VISIBLE' }, { type: 'case', id: 'comment-hidden', label: 'كود COMMENT-HIDDEN' }, { type: 'user', id: owner.user.id, label: 'owner' }] });
assert.equal(answer.parentId, first.id); assert.equal(answer.authorName, 'clerk');
assert.deepEqual(answer.refs.map(r => [r.id, r.ok]), [['comment-visible', true]], 'Only references the writer may open are kept');
assert.deepEqual(answer.mentions.map(m => m.username), ['owner'], 'The answered author is notified');
assert.equal((await comments(owner.token, 'mentions')).items[0].id, answer.id);
assert.equal((await comments(reader.token, 'list', visible)).find(c => c.id === answer.id).refs[0].ok, true);
assert.equal(mentionable[0].name, 'clerk', 'Mentionable staff carry their display name');
await assert.rejects(() => comments(owner.token, 'post', { ...visible, body: 'x', parentId: 999999 }), /غير موجود/);
await assert.rejects(() => comments(owner.token, 'post', { ...visible, body: 'x', parentId: 'abc' }), /غير صالح/);
await comments(clerk.token, 'delete', { id: answer.id });
await assert.rejects(() => comments(owner.token, 'post', { ...visible, body: 'x', parentId: answer.id }), /محذوف/);

// Deleting: author or owner only; text is hidden but the row stays.
await denied(() => comments(clerk.token, 'delete', { id: first.id }));
await denied(() => comments(outsider.token, 'delete', { id: reply.id }));
const removed = await comments(clerk.token, 'delete', { id: reply.id });
assert.equal(removed.deleted, true); assert.equal(removed.body, '');
await comments(owner.token, 'delete', { id: first.id });
const thread = await comments(owner.token, 'list', visible);
assert.deepEqual(thread.map(c => [c.deleted, c.body]), [[true, ''], [true, ''], [true, '']]);
assert.equal((await comments(reader.token, 'mentions')).items.length, 0, 'Deleted comments leave the mentions feed');

// Task comments follow the task visibility rules.
const work = await office(clerk.token, 'save_work', { item: { id: '88888888-8888-4888-8888-888888888888', revision: 0, caseId: 'comment-visible', title: 'Synthetic task', kind: 'task', dueDate: '2026-10-20', dueTime: '', assigneeId: clerk.user.id, priority: 'normal', status: 'open', location: '', notes: '', completionNote: '' } });
const task = { targetType: 'work', targetId: work.id };
await comments(clerk.token, 'post', { ...task, body: 'Task note' });
assert.equal((await comments(owner.token, 'list', task)).length, 1);
await denied(() => comments(outsider.token, 'list', task));
await denied(() => comments(reader.token, 'list', task), 'Case-only staff without work access cannot read task comments');

// Private comments: only the author, the colleagues mentioned and the office owner see them; replies stay private.
const bystander = await staff('bystander', scope(['cases', 'work'], ['comment-visible']));
const secret = await comments(clerk.token, 'post', { ...visible, body: 'Private note', mentions: [reader.member.id], private: true });
assert.equal(secret.private, true);
const ids = async token => (await comments(token, 'list', visible)).map(c => c.id);
assert.ok((await ids(reader.token)).includes(secret.id), 'The mentioned colleague sees a private comment');
assert.ok((await ids(owner.token)).includes(secret.id), 'The office owner sees a private comment');
assert.ok(!(await ids(bystander.token)).includes(secret.id), 'Others with access to the case do not');
await assert.rejects(() => comments(bystander.token, 'post', { ...visible, body: 'Peek', parentId: secret.id }), /غير موجود/, 'Nor can they reply to it');
await assert.rejects(() => comments(clerk.token, 'post', { ...visible, body: 'Nobody', private: true }), /زميل واحد/);
const secretReply = await comments(owner.token, 'post', { ...visible, body: 'Private answer', parentId: secret.id });
assert.equal(secretReply.private, true, 'A reply to a private comment stays private');
assert.deepEqual(secretReply.mentions.map(m => m.username).sort(), ['clerk', 'reader'], 'Everyone in the private exchange is included');
assert.ok(!(await ids(bystander.token)).includes(secretReply.id));
const open = await comments(bystander.token, 'post', { ...visible, body: 'Open note', mentions: [clerk.member.id] });
assert.equal(open.private, false); assert.ok((await ids(reader.token)).includes(open.id), 'Comments stay visible to everyone by default');

// Revoking access hides existing comments and mentions.
await comments(owner.token, 'post', { ...visible, body: 'After revocation', mentions: [clerk.member.id] });
await office(owner.token, 'set_member_access', { id: clerk.member.id, revision: clerk.member.permissions.revision, permissions: scope(['cases', 'work'], ['comment-hidden']) });
const again = await login('clerk', 'Fixture-password-123');
await denied(() => comments(again.token, 'list', visible));
assert.equal((await comments(again.token, 'mentions')).items.length, 0, 'Mentions on cases no longer visible are withheld');

// Existing APIs keep working after the migration.
assert.ok((await local(owner.token, 'cases_page', { offset: 0 })).length >= 2);
console.log('Passed comments: private comments for the mentioned only (owner included, replies stay private), replies with author notification and per-reader references, session-gated RPC only, trimmed bodies and limits, mentions limited to staff who can see the record, read-only and outsider denial, task visibility rules, mentions feed and monotonic read marker, author/owner soft delete, revocation hiding and existing API compatibility.');
