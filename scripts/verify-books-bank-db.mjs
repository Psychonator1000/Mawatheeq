// Synthetic database test for bank and cash: statements entered and imported, lines matched to invoices, payments and accounts, unmatching, cheques held to bounced, transfers and batch payments.
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
const amal = await grant('amal', { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false });
const badr = await grant('badr', { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: false, canExport: false });
let setup = await books(amal, 'setup');
const acc = code => setup.accounts.find(a => a.code === code).id, jr = code => setup.journals.find(j => j.code === code).id, product = name => setup.products.find(p => p.name === name).id;
const year = new Date().getFullYear(), d = (m, day) => `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const client = await books(amal, 'save_partner', { partner: { name: 'شركة البنك التجريبية', kind: 'customer' } });
const other = await books(amal, 'save_partner', { partner: { name: 'موكل آخر', kind: 'customer' } });
const vendor = await books(amal, 'save_partner', { partner: { name: 'مورد البنك', kind: 'vendor' } });
const invoice = async (partnerId, price, kind = 'out_invoice', journal = 'INV', p = 'أتعاب محاماة', date = d(2, 1)) => {
 const x = await books(amal, 'save_invoice', { invoice: { moveType: kind, journalId: jr(journal), date, partnerId, lines: [{ productId: product(p), priceUnit: price }] } });
 return books(amal, 'post', { id: x.id, revision: x.revision });
};
const inv1 = await invoice(client.id, '300'), inv2 = await invoice(client.id, '200', 'out_invoice', 'INV', 'أتعاب محاماة', d(2, 5)), inv3 = await invoice(other.id, '80');
const bill = await invoice(vendor.id, '150', 'in_invoice', 'BILL', 'إيجار المكتب');

// A cheque received for the third invoice, a payment recorded before the statement arrives.
await refused(() => books(amal, 'register_payment', { moveIds: [inv3.id], journalId: jr('BNK1'), date: d(2, 10), method: 'cheque' }), 'رقم الشيك');
const chq = await books(amal, 'register_payment', { moveIds: [inv3.id], journalId: jr('BNK1'), date: d(2, 10), method: 'cheque', chequeNumber: '000123', chequeDate: d(2, 20), chequeBank: 'بنك تجريبي' });
assert.deepEqual([chq.method, chq.chequeNumber, chq.chequeState, chq.amountTotal], ['cheque', '000123', 'held', '80.000']);

// A statement imported from the bank's file: five movements, one of them twice.
await denied(() => books(badr, 'save_statement', { statement: { journalId: jr('BNK1'), date: d(2, 28), lines: [] } }));
const lines = [
 { date: d(2, 12), label: `تحويل ${inv1.name}`, amount: '300' },
 { date: d(2, 14), label: 'إيداع نقدي من موكل', partnerName: 'شركة البنك التجريبية', amount: '250' },
 { date: d(2, 20), label: 'شيك 000123', amount: '80' },
 { date: d(2, 21), label: 'عمولة بنكية', amount: '-2.5' },
 { date: d(2, 22), label: 'دفع إيجار', partnerName: 'مورد البنك', amount: '-150' },
];
let st = await books(amal, 'save_statement', { statement: { journalId: jr('BNK1'), name: 'كشف فبراير', date: d(2, 28), balanceStart: '1000', balanceEnd: '1477.5', sourceFile: 'synthetic.csv', lines } });
assert.deepEqual([st.lines.length, st.computedEnd, st.balanceEnd, st.added], [5, '1477.500', '1477.500', 5]);
assert.equal(st.lines[1].partnerId, client.id, 'A partner named on the line is found');
const again = await books(amal, 'save_statement', { statement: { journalId: jr('BNK1'), date: d(3, 1), lines: [lines[0], { date: d(3, 1), label: 'جديد', amount: '5' }] }, skipDuplicates: true });
assert.deepEqual([again.added, again.skipped], [1, 1], 'A movement already on a statement is skipped');
await books(amal, 'delete_statement', { id: again.id });

// Suggestions: the invoice named on the line comes first.
const sug = await books(amal, 'reconcile_suggestions', { lineId: st.lines[0].id });
assert.equal(sug.items[0].moveId, inv1.id);
// 1) The transfer pays the first invoice in full.
st = await books(amal, 'reconcile_line', { lineId: st.lines[0].id, mode: 'items', itemLineIds: [sug.items[0].lineId] });
assert.equal((await books(amal, 'get_move', { id: inv1.id })).paymentState, 'paid');
assert.ok(st.lines[0].reconciled && st.lines[0].moveName.startsWith('BNK1/'));
// 2) 250 against the 200 invoice: the 50 left is kept as the client's credit.
const s2 = await books(amal, 'reconcile_suggestions', { lineId: st.lines[1].id });
st = await books(amal, 'reconcile_line', { lineId: st.lines[1].id, mode: 'items', itemLineIds: s2.items.filter(x => x.moveId === inv2.id).map(x => x.lineId) });
assert.equal((await books(amal, 'get_move', { id: inv2.id })).paymentState, 'paid');
assert.equal((await books(amal, 'setup')).partnerBalances[client.id].receivable, '-50.000');
// 3) The cheque on the statement is the payment already recorded; it is then cleared.
const s3 = await books(amal, 'reconcile_suggestions', { lineId: st.lines[2].id });
assert.deepEqual(s3.payments.map(p => p.moveId), [chq.id]);
await refused(() => books(amal, 'reconcile_line', { lineId: st.lines[3].id, mode: 'payment', paymentId: chq.id }), 'مبلغ الدفعة');
st = await books(amal, 'reconcile_line', { lineId: st.lines[2].id, mode: 'payment', paymentId: chq.id });
assert.equal((await books(amal, 'get_move', { id: chq.id })).chequeState, 'cleared');
// 4) Bank charges straight to their account. 5) The rent paid against the bill, with a difference written off.
st = await books(amal, 'reconcile_line', { lineId: st.lines[3].id, mode: 'account', accountId: acc('509000'), label: 'عمولة' });
await refused(() => books(amal, 'reconcile_line', { lineId: st.lines[3].id, mode: 'account', accountId: acc('509000') }), 'من قبل');
const s5 = await books(amal, 'reconcile_suggestions', { lineId: st.lines[4].id });
assert.equal(s5.items[0].moveId, bill.id, 'Money out suggests bills');
st = await books(amal, 'reconcile_line', { lineId: st.lines[4].id, mode: 'items', itemLineIds: [s5.items[0].lineId] });
assert.equal((await books(amal, 'get_move', { id: bill.id })).paymentState, 'paid');
assert.ok(st.lines.every(l => l.reconciled));
// The bank account in the books now equals the statement's movements (the opening 1000 was never entered).
setup = await books(badr, 'setup');
assert.deepEqual([setup.bank[jr('BNK1')].booksBalance, setup.bank[jr('BNK1')].statementBalance, setup.bank[jr('BNK1')].toReconcile], ['477.500', '1477.500', 0]);
// Unmatching the second line cancels its entry and reopens the invoice; the credit disappears.
st = await books(amal, 'unreconcile_line', { lineId: st.lines[1].id });
assert.equal(st.lines[1].reconciled, false);
assert.equal((await books(amal, 'get_move', { id: inv2.id })).paymentState, 'not_paid');
assert.equal((await books(amal, 'setup')).partnerBalances[client.id].receivable, '200.000');
await refused(() => books(amal, 'delete_statement', { id: st.id }), 'مطابقة');
// Matching it straight to an account instead, then back again to the invoice with a write-off.
const s2b = await books(amal, 'reconcile_suggestions', { lineId: st.lines[1].id });
await refused(() => books(amal, 'reconcile_line', { lineId: st.lines[1].id, mode: 'items', itemLineIds: s2b.items.filter(x => x.moveId === inv2.id).map(x => x.lineId), writeoffAccountId: 'not-a-uuid' }), '');
st = await books(amal, 'reconcile_line', { lineId: st.lines[1].id, mode: 'items', itemLineIds: s2b.items.filter(x => x.moveId === inv2.id).map(x => x.lineId), writeoffAccountId: acc('409000'), writeoffLabel: 'زيادة' });
assert.equal((await books(amal, 'setup')).partnerBalances[client.id], undefined, 'Nothing is left open for the client');

// Transfers between bank and cash.
await refused(() => books(amal, 'transfer', { fromJournalId: jr('BNK1'), toJournalId: jr('BNK1'), amount: '10', date: d(3, 2) }), 'مختلفين');
const tr = await books(amal, 'transfer', { fromJournalId: jr('BNK1'), toJournalId: jr('CSH1'), amount: '100', date: d(3, 2) });
assert.deepEqual(tr.lines.map(l => [l.accountId, l.debit, l.credit]), [[acc('101000'), '0.000', '100.000'], [acc('101100'), '100.000', '0.000']]);

// A batch: two clients' invoices paid at once, one payment each.
const b1 = await invoice(client.id, '40', 'out_invoice', 'INV', 'أتعاب محاماة', d(3, 3)), b2 = await invoice(other.id, '60', 'out_invoice', 'INV', 'أتعاب محاماة', d(3, 3)), b3 = await invoice(other.id, '15', 'out_invoice', 'INV', 'أتعاب محاماة', d(3, 4));
await refused(() => books(amal, 'batch_pay', { moveIds: [b1.id, bill.id], journalId: jr('BNK1'), date: d(3, 5) }), 'منفصلتين');
const batch = await books(amal, 'batch_pay', { moveIds: [b1.id, b2.id, b3.id], journalId: jr('BNK1'), date: d(3, 5) });
assert.equal(batch.name, `BIN/BNK1/${year}/0001`);
assert.deepEqual(batch.payments.map(p => p.amount).sort(), ['40.000', '75.000']);
const batches = await books(badr, 'list_batches');
assert.deepEqual([batches[0].name, batches[0].total, batches[0].payments.length], [batch.name, '115.000', 2]);
assert.equal((await books(amal, 'get_move', { id: b3.id })).paymentState, 'paid');

// A cheque that bounces: its payment is reversed and the invoice owes again.
const b4 = await invoice(other.id, '33', 'out_invoice', 'INV', 'أتعاب محاماة', d(3, 6));
const chq2 = await books(amal, 'register_payment', { moveIds: [b4.id], journalId: jr('BNK1'), date: d(3, 7), method: 'cheque', chequeNumber: '777' });
assert.equal((await books(amal, 'get_move', { id: b4.id })).paymentState, 'paid');
assert.deepEqual((await books(badr, 'list_cheques', { state: 'held' })).map(c => c.chequeNumber), ['777']);
await books(amal, 'set_cheque', { id: chq2.id, state: 'deposited' });
await books(amal, 'set_cheque', { id: chq2.id, state: 'bounced', date: d(3, 9) });
assert.equal((await books(amal, 'get_move', { id: b4.id })).paymentState, 'not_paid');
await refused(() => books(amal, 'set_cheque', { id: chq2.id, state: 'cleared' }), 'المرتجع');
assert.equal((await books(badr, 'list_cheques', {})).find(c => c.id === chq2.id).chequeState, 'bounced');

// A standalone payment keeps its method, and everything still balances.
const sp = await books(amal, 'save_payment', { payment: { paymentType: 'outbound', partnerType: 'vendor', partnerId: vendor.id, journalId: jr('CSH1'), date: d(3, 10), amount: '5', method: 'cash' } });
assert.equal(sp.method, 'cash');
const tb = await books(badr, 'trial_balance', {});
assert.equal(tb.reduce((t, r) => t + Math.round(Number(r.balance) * 1000), 0), 0, 'The trial balance balances');
console.log('Passed bank and cash: statements entered and imported with duplicates skipped, suggestions by reference and partner, lines matched to invoices (in full, with credit left, with a write-off), to recorded payments and to accounts, unmatching, transfers, batch payments per partner, cheques held, deposited, cleared and bounced, payment methods and a balanced trial balance.');
