// Synthetic database test for the controls over the books: approvals with limits, the payment run, closed months, the change log and client credit limits.
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
const books = (s, action, data = {}) => rpc('mawatheeq_books_request', [s.token, action, JSON.stringify(data)]);
const office = (s, action, data = {}) => rpc('mawatheeq_office_request', [s.token, action, JSON.stringify(data)]);
const denied = fn => assert.rejects(fn, e => e.code === '42501');
const refused = (fn, text) => assert.rejects(fn, e => e.message.includes(text), text);
const grant = async (u, p) => { const m = (await office(owner, 'context')).members.find(x => x.username === u); await office(owner, 'set_member_access', { id: m.id, revision: m.permissions.revision, permissions: p }); return login(u); };
const books_ = { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false };
const amal = await grant('amal', books_), salem = await grant('salem', books_);
const badr = await grant('badr', { ...books_, canEdit: false });

let setup = await books(amal, 'setup');
const acc = code => setup.accounts.find(a => a.code === code).id, jr = code => setup.journals.find(j => j.code === code).id;
const year = new Date().getFullYear(), d = (m, day) => `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
assert.deepEqual([setup.controls.approvalsEnabled, setup.controls.myLimit, setup.controls.pending], [false, null, 0], 'Approvals start switched off');
const entry = async (s, amount, date = d(3, 10)) => books(s, 'save_move', { move: { journalId: jr('MISC'), date, ref: 'قيد ' + amount, lines: [
  { accountId: acc('121000'), label: 'أتعاب', debit: amount, credit: '' }, { accountId: acc('401000'), label: 'أتعاب', debit: '', credit: amount }] } });

// Approvals: only the owner sets them; amal may post up to 100 and salem approves up to 1000.
await denied(() => books(amal, 'approval_settings'));
let settings = await books(owner, 'approval_settings');
const person = name => settings.people.find(p => p.name === name).userId;
assert.deepEqual(settings.people.map(p => p.name).sort(), ['أمل', 'بدر', 'سالم'].sort(), 'Everyone with the accounting pages is listed');
await denied(() => books(amal, 'save_approval_settings', { revision: settings.revision, enabled: true }));
await books(owner, 'save_approval_settings', { revision: settings.revision, enabled: true, defaultLimit: '0', people: [
  { userId: person('أمل'), postLimit: '100', canApprove: false, approveLimit: '' }, { userId: person('سالم'), postLimit: '50', canApprove: true, approveLimit: '1000' }] });
setup = await books(amal, 'setup');
assert.deepEqual([setup.controls.approvalsEnabled, setup.controls.myLimit, setup.controls.canApprove], [true, '100.000', false]);

const small = await entry(amal, '80');
const posted = await books(amal, 'post', { id: small.id, revision: small.revision });
assert.equal(posted.state, 'posted', 'Within the limit it posts at once');
let big = await entry(amal, '400');
const asked = await books(amal, 'post', { id: big.id, revision: big.revision });
assert.equal(asked.pendingApproval, true, 'Over the limit it waits for approval');
assert.deepEqual([asked.approval.amount, asked.approval.status, asked.approval.requester], ['400.000', 'pending', 'أمل']);
assert.equal((await books(amal, 'get_move', { id: big.id })).state, 'draft', 'Nothing was posted');
await refused(() => books(amal, 'save_move', { move: { ...big, ref: 'تغيير' } }), 'بانتظار الاعتماد');
await refused(() => books(amal, 'delete_move', { id: big.id, revision: big.revision }), 'بانتظار الاعتماد');
await refused(() => books(amal, 'post', { id: big.id, revision: big.revision }), 'بانتظار الاعتماد');
assert.equal((await books(amal, 'setup')).controls.pending, 1);

await denied(() => books(amal, 'approve', { id: asked.approval.id }));
await denied(() => books(badr, 'approve', { id: asked.approval.id }));
await refused(() => books(salem, 'reject', { id: asked.approval.id, note: '' }), 'سبب الرفض');
const approved = await books(salem, 'approve', { id: asked.approval.id });
assert.deepEqual([approved.status, approved.decider], ['approved', 'سالم']);
big = await books(amal, 'get_move', { id: big.id });
assert.equal(big.state, 'posted', 'Approval posts it');
await refused(() => books(salem, 'approve', { id: asked.approval.id }), 'بُتّ');

// Nobody approves their own request, and an approver stays within their own approval limit.
const salemBig = await entry(salem, '60');
const salemAsk = await books(salem, 'post', { id: salemBig.id, revision: salemBig.revision });
assert.equal(salemAsk.pendingApproval, true);
await refused(() => books(salem, 'approve', { id: salemAsk.approval.id }), 'بنفسه');
await books(owner, 'approve', { id: salemAsk.approval.id });
const huge = await entry(amal, '5000');
const hugeAsk = await books(amal, 'post', { id: huge.id, revision: huge.revision });
await refused(() => books(salem, 'approve', { id: hugeAsk.approval.id }), 'حد اعتمادك');
const rejected = await books(salem, 'reject', { id: hugeAsk.approval.id, note: 'المبلغ غير صحيح' });
assert.deepEqual([rejected.status, rejected.note], ['rejected', 'المبلغ غير صحيح']);
assert.equal((await books(amal, 'get_move', { id: huge.id })).state, 'draft', 'A rejected entry stays a draft to correct');
const again = await books(amal, 'post', { id: huge.id, revision: huge.revision });
const withdrawn = await books(amal, 'cancel_approval', { id: again.approval.id });
assert.equal(withdrawn.status, 'cancelled');
await books(amal, 'delete_move', { id: huge.id, revision: (await books(amal, 'get_move', { id: huge.id })).revision });
assert.deepEqual((await books(owner, 'list_approvals', { status: 'pending' })).length, 0);

// The owner is not limited.
const ownerBig = await entry(owner, '9000');
assert.equal((await books(owner, 'post', { id: ownerBig.id, revision: ownerBig.revision })).state, 'posted');

// Payments wait for approval too, and are made when approved.
const vendor = await books(owner, 'save_partner', { partner: { name: 'مورد الدفعات', kind: 'vendor' } });
const bill = async (amount, due) => { let b = await books(owner, 'save_invoice', { invoice: { moveType: 'in_invoice', journalId: jr('BILL'), date: d(3, 1), dueDate: due, partnerId: vendor.id, ref: 'BILL-' + amount, lines: [{ label: 'إيجار', accountId: acc('502000'), quantity: '1', priceUnit: amount }] } }); return books(owner, 'post', { id: b.id, revision: b.revision }); };
const rent = await bill('300', d(3, 15)), later = await bill('200', d(12, 28));
const payAsk = await books(amal, 'register_payment', { moveIds: [rent.id], journalId: jr('BNK1'), date: d(3, 20) });
assert.equal(payAsk.pendingApproval, true, 'A payment over the limit waits');
assert.equal((await books(owner, 'get_move', { id: rent.id })).paymentState, 'not_paid', 'Nothing was paid yet');
await books(salem, 'approve', { id: payAsk.approval.id });
assert.equal((await books(owner, 'get_move', { id: rent.id })).paymentState, 'paid', 'Approval makes the payment');

// Payment run: what is due by the date is proposed, and the chosen ones are paid in one batch.
await books(owner, 'save_approval_settings', { revision: (await books(owner, 'approval_settings')).revision, enabled: false, defaultLimit: '0', people: [] });
const rent2 = await bill('120', d(4, 1));
let proposal = await books(amal, 'payment_proposal', { date: d(4, 30) });
assert.deepEqual(proposal.map(p => p.residual), ['120.000'], 'Only what is due by the date and still open');
proposal = await books(amal, 'payment_proposal', { date: d(12, 31) });
assert.deepEqual(proposal.map(p => p.name).sort(), [rent2.name, later.name].sort());
await denied(() => books(badr, 'payment_run', { moveIds: [rent2.id], journalId: jr('BNK1'), date: d(4, 30) }));
const run = await books(amal, 'payment_run', { moveIds: [rent2.id, later.id], journalId: jr('BNK1'), date: d(4, 30), method: 'transfer' });
assert.equal(run.payments.length, 1, 'One payment per partner');
assert.equal(run.payments[0].amount, '320.000');
assert.equal((await books(amal, 'payment_proposal', { date: d(12, 31) })).length, 0, 'Paid bills leave the proposal');
const client = await books(owner, 'save_partner', { partner: { name: 'موكل الحد', kind: 'customer' } });
let fee = await books(owner, 'save_invoice', { invoice: { moveType: 'out_invoice', journalId: jr('INV'), date: d(4, 2), partnerId: client.id, ref: 'FEE', lines: [{ label: 'أتعاب', accountId: acc('401000'), quantity: '1', priceUnit: '50' }] } });
fee = await books(owner, 'post', { id: fee.id, revision: fee.revision });
await refused(() => books(amal, 'payment_run', { moveIds: [fee.id], journalId: jr('BNK1'), date: d(4, 30) }), 'فواتير الموردين');

// Credit limits: a warning over the limit, a refusal for a client set to block (the owner may still post).
await books(amal, 'save_credit', { partnerId: client.id, limit: '100', block: false });
let fee2 = await books(amal, 'save_invoice', { invoice: { moveType: 'out_invoice', journalId: jr('INV'), date: d(4, 3), partnerId: client.id, ref: 'FEE2', lines: [{ label: 'أتعاب', accountId: acc('401000'), quantity: '1', priceUnit: '80' }] } });
fee2 = await books(amal, 'post', { id: fee2.id, revision: fee2.revision });
assert.equal(fee2.state, 'posted');
assert.match(fee2.creditWarning, /موكل الحد/, 'Posting over the limit warns');
await books(amal, 'save_credit', { partnerId: client.id, limit: '100', block: true });
let fee3 = await books(amal, 'save_invoice', { invoice: { moveType: 'out_invoice', journalId: jr('INV'), date: d(4, 4), partnerId: client.id, ref: 'FEE3', lines: [{ label: 'أتعاب', accountId: acc('401000'), quantity: '1', priceUnit: '10' }] } });
await refused(() => books(amal, 'post', { id: fee3.id, revision: fee3.revision }), 'حد الائتمان');
assert.equal((await books(amal, 'get_move', { id: fee3.id })).state, 'draft', 'The refused invoice stays a draft');
fee3 = await books(owner, 'post', { id: fee3.id, revision: fee3.revision });
assert.equal(fee3.state, 'posted', 'The owner may post past a block');
const report = await books(amal, 'credit_report');
assert.deepEqual([report[0].name, report[0].limit, report[0].open, report[0].available, report[0].block], ['موكل الحد', '100.000', '140.000', '-40.000', true]);
assert.equal((await books(amal, 'setup')).controls.credit[client.id].open, '140.000');
await books(amal, 'save_credit', { partnerId: client.id, limit: '', block: true });
assert.equal((await books(amal, 'credit_report')).length, 0, 'Clearing the limit removes it');

// Closed months: nothing dated in them may be added, posted, changed or removed; drafts must be dealt with first.
const draftMarch = await entry(amal, '10', d(3, 25));
await denied(() => books(amal, 'close_period', { month: `${year}-03` }));
await refused(() => books(owner, 'close_period', { month: `${year}-03` }), 'مسودة');
await books(amal, 'delete_move', { id: draftMarch.id, revision: draftMarch.revision });
await books(owner, 'close_period', { month: `${year}-03` });
const months = await books(amal, 'list_periods', { year });
assert.deepEqual([months[2].closed, months[2].closedBy, months[3].closed], [true, 'المسؤول', false]);
await refused(() => entry(amal, '5', d(3, 26)), 'مقفل');
await refused(() => books(amal, 'reverse', { id: posted.id, date: d(3, 28) }), 'مقفل');
const postedNow = await books(amal, 'get_move', { id: posted.id });
await refused(() => books(amal, 'reset_draft', { id: posted.id, revision: postedNow.revision }), 'مقفل');
const april = await entry(amal, '7', d(4, 5));
assert.equal((await books(amal, 'post', { id: april.id, revision: april.revision })).state, 'posted', 'Other months stay open');
await books(amal, 'reverse', { id: posted.id, date: d(4, 6) });
assert.deepEqual((await books(amal, 'setup')).controls.closedMonths, [`${year}-03`]);
await books(owner, 'reopen_period', { month: `${year}-03` });
await entry(amal, '5', d(3, 26));

// The change log: every recorded change, filtered, with the before and after.
const log = await books(amal, 'list_changes', {});
assert.ok(log.some(c => c.recordType === 'approval' && c.action === 'approve' && c.by === 'سالم'), 'Approvals are logged');
assert.ok(log.some(c => c.recordType === 'period' && c.action === 'close_period' && c.label === `${year}-03`), 'Closing a month is logged');
assert.ok(log.some(c => c.recordType === 'partner' && c.action === 'credit'), 'Credit limit changes are logged');
const amalOnly = await books(amal, 'list_changes', { actorId: person('أمل'), recordType: 'move', action: 'post' });
assert.ok(amalOnly.length > 0 && amalOnly.every(c => c.by === 'أمل' && c.action === 'post'));
const detail = await books(amal, 'get_change', { id: amalOnly[0].id });
assert.equal(detail.before.state, 'draft'); assert.equal(detail.after.state, 'posted');
await denied(() => books(badr, 'save_credit', { partnerId: client.id, limit: '1' }));

console.log('Passed books controls: approvals with personal and approval limits (no self-approval, locked while waiting, rejection and withdrawal, payments approved then made), payment run by due date in one batch per partner, credit limits warning and blocking with owner override, closed months guarding every change, and the change log with filters and before/after.');
