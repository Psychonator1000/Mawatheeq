// Synthetic database test for the books joined to the office: outside (court) transactions and where their originals are, billing them to the client, case money, payroll, collections and monthly figures.
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
const local = (s, action, data = {}) => rpc('mawatheeq_local_request', [s.token, action, JSON.stringify(data)]);
const office = (s, action, data = {}) => rpc('mawatheeq_office_request', [s.token, action, JSON.stringify(data)]);
const dept = (s, workspace, record) => rpc('mawatheeq_department_request', [s.token, 'save_record', JSON.stringify({ workspace, record: { revision: 0, caseId: '', subjectId: '', ...record } })]);
const denied = fn => assert.rejects(fn, e => e.code === '42501');
const refused = (fn, text) => assert.rejects(fn, e => e.message.includes(text), text);
const grant = async (u, p) => { const m = (await office(owner, 'context')).members.find(x => x.username === u); await office(owner, 'set_member_access', { id: m.id, revision: m.permissions.revision, permissions: p }); return login(u); };
const amal = await grant('amal', { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false });
const badr = await grant('badr', { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: false, canExport: false });
await local(owner, 'save_case', { case: { id: 'out-case', client: 'شركة المعاملات', opponent: 'خصم', code: 'OUT-1', procedures: [] } });
const setup = await books(amal, 'setup');
assert.equal(setup.links, true);
const acc = code => setup.accounts.find(a => a.code === code).id, jr = code => setup.journals.find(j => j.code === code).id;
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });

// A court fee paid by the office's runner for the client, its receipt kept by the runner.
await denied(() => books(badr, 'save_outside', { outside: {} }));
await refused(() => books(amal, 'save_outside', { outside: { kind: 'رسوم قيد دعوى', direction: 'out', date: today, amount: '25', method: 'cheque', caseId: 'out-case' } }), 'رقم الشيك');
let fee = await books(amal, 'save_outside', { outside: { kind: 'رسوم قيد دعوى', direction: 'out', date: today, amount: '25.500', method: 'petty', entity: 'المحكمة الكلية', reference: 'R-778', docType: 'إيصال رسوم',
 handledBy: 'مندوب تجريبي', caseId: 'out-case', originalState: 'staff', originalHolder: 'مندوب تجريبي' } });
assert.deepEqual([fee.state, fee.originalState, fee.custody.length], ['draft', 'staff', 1]);
fee = await books(amal, 'post_outside', { id: fee.id, journalId: jr('CSH2') });
assert.ok(fee.state === 'posted' && fee.moveName.startsWith('CSH2/') && fee.partnerId, 'Posted from the runner\'s float, the client found or created as a partner');
const move = await books(amal, 'get_move', { id: fee.moveId });
assert.deepEqual(move.lines.map(l => [l.accountId, l.debit, l.credit, l.caseId]), [[acc('133000'), '25.500', '0.000', 'out-case'], [acc('101300'), '0.000', '25.500', 'out-case']]);
// The original moves: from the runner to the office safe, then into the case's archive file.
await refused(() => books(amal, 'move_original', { id: fee.id, toState: 'court' }), 'اسم');
fee = await books(amal, 'move_original', { id: fee.id, toState: 'safe', note: 'سلّمه المندوب' });
fee = await books(amal, 'move_original', { id: fee.id, toState: 'archive', archiveRef: 'ARC-0007' });
assert.deepEqual([fee.originalState, fee.archiveRef, fee.custody.map(c => c.toState)], ['archive', 'ARC-0007', ['archive', 'safe', 'staff']]);
// Money received at the execution department for the client is held for them.
let wd = await books(amal, 'save_outside', { outside: { kind: 'صرف من إدارة التنفيذ', direction: 'in', date: today, amount: '500', method: 'cheque', chequeNumber: '55501', caseId: 'out-case', originalState: 'safe', billable: false } });
wd = await books(amal, 'post_outside', { id: wd.id, journalId: jr('BNK1') });
assert.deepEqual((await books(amal, 'get_move', { id: wd.moveId })).lines.map(l => [l.accountId, l.debit, l.credit]), [[acc('217000'), '0.000', '500.000'], [acc('101000'), '500.000', '0.000']]);
// A second fee, then both billed to the client in one invoice.
let fee2 = await books(amal, 'save_outside', { outside: { kind: 'أمانة خبير', direction: 'out', date: today, amount: '100', method: 'cash', caseId: 'out-case', originalState: 'safe' } });
fee2 = await books(amal, 'post_outside', { id: fee2.id, journalId: jr('CSH1') });
await refused(() => books(amal, 'bill_outside', { ids: [fee.id, wd.id] }), 'المدفوعة عن الموكل');
let inv = await books(amal, 'bill_outside', { ids: [fee.id, fee2.id] });
assert.deepEqual([inv.moveType, inv.amountTotal, inv.lines.filter(l => l.kind === 'product').every(l => l.accountId === acc('133000')), inv.caseId], ['out_invoice', '125.500', true, 'out-case']);
inv = await books(amal, 'post', { id: inv.id, revision: inv.revision });
const tb = await books(amal, 'trial_balance', {});
assert.equal(tb.find(r => r.code === '133000').balance, '0.000', 'Billing clears the fees to recover');
// The case's money in one call.
const cb = await books(amal, 'case_books', { caseId: 'out-case' });
assert.deepEqual([cb.totals.invoiced, cb.totals.open, cb.totals.outsidePaid, cb.totals.outsideReceived, cb.totals.unbilled, cb.outside.length, cb.documents.length], [125.5, 125.5, 125.5, 500, 0, 3, 1]);
assert.deepEqual((await books(amal, 'list_outside', { original: 'archive' })).map(o => o.id), [fee.id]);
// Cancelling a posted transaction reverses its entry.
let wrong = await books(amal, 'save_outside', { outside: { kind: 'رسوم إعلان', direction: 'out', date: today, amount: '3', method: 'cash', caseId: 'out-case' } });
wrong = await books(amal, 'post_outside', { id: wrong.id, journalId: jr('CSH1') });
wrong = await books(amal, 'cancel_outside', { id: wrong.id, date: today });
assert.equal(wrong.state, 'cancelled');
await refused(() => books(amal, 'cancel_outside', { id: fee.id, date: today }), 'مفوترة');

// A partner for a client name, found again rather than duplicated.
const p1 = await books(amal, 'partner_for_client', { name: 'شركة المعاملات' }), p2 = await books(amal, 'partner_for_client', { name: 'شركة  المعاملات' });
assert.equal(p1.id, p2.id);

// Payroll for a month, then paid from the bank; twice is refused.
const month = today.slice(0, 7);
let pr = await books(amal, 'post_payroll', { month, lines: [{ name: 'موظف أ', amount: '600' }, { name: 'موظف ب', amount: '450.5' }] });
assert.equal(pr.posted.amount, '1050.500');
await refused(() => books(amal, 'post_payroll', { month, lines: [{ name: 'x', amount: '1' }] }), 'من قبل');
pr = await books(amal, 'pay_payroll', { month, journalId: jr('BNK1'), date: today });
assert.ok(pr.paid.name.startsWith('BNK1/'));
assert.equal((await books(amal, 'trial_balance', {})).find(r => r.code === '213000').balance, '0.000');

// Collection payments into the books.
const file = await dept(owner, 'collections', { id: crypto.randomUUID(), kind: 'file', caseId: 'out-case', payload: { number: 'COL-1', client: 'شركة المعاملات', amount: '1000' } }).catch(e => ({ error: e.message }));
if (file.error) throw new Error('collection file: '+file.error);
{
 const fileId = file.id;
 await dept(owner, 'collections', { id: crypto.randomUUID(), kind: 'payment', caseId: 'out-case', subjectId: fileId, payload: { type: 'payment', date: today, amount: '200', method: 'كي نت', reference: 'C1', notes: '' } });
 await dept(owner, 'collections', { id: crypto.randomUUID(), kind: 'payment', caseId: 'out-case', subjectId: fileId, payload: { type: 'external', date: today, amount: '50', method: '', reference: '', notes: '' } });
 const dry = await books(amal, 'sync_collections', { journalId: jr('BNK1'), dryRun: true });
 assert.deepEqual([dry.payments, dry.external, dry.amount], [1, 1, '200.000']);
 await books(amal, 'sync_collections', { journalId: jr('BNK1'), dryRun: false });
 assert.equal((await books(amal, 'sync_collections', { journalId: jr('BNK1'), dryRun: true })).already, 1);
}
// Monthly figures.
const mon = await books(amal, 'monthly', { months: 3 });
assert.equal(mon.length, 3); assert.equal(mon[2].month, month);
assert.equal(mon[2].expenses, '1050.500');
console.log('Passed books links: outside transactions with receipts and cheques, original custody log (runner, safe, archive), posting from the runner\'s float, money received held for the client, billing fees to the client, case money, cancelling, client partners, payroll posted and paid, collection payments moved once and monthly figures.');
