// Synthetic database test for the reports: partner ledger, aged receivables and payables, cash flow, executive summary, profit by case and the journal report.
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
const grant = async (u, p) => { const m = (await office(owner, 'context')).members.find(x => x.username === u); await office(owner, 'set_member_access', { id: m.id, revision: m.permissions.revision, permissions: p }); return login(u); };
const amal = await grant('amal', { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false });
const salem = await grant('salem', { sections: ['cases'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false });
await local(owner, 'save_case', { case: { id: 'rep-case', client: 'موكل التقارير', opponent: 'خصم', code: 'RP-1', procedures: [] } });
const setup = await books(amal, 'setup');
const acc = code => setup.accounts.find(a => a.code === code).id, jr = code => setup.journals.find(j => j.code === code).id, product = name => setup.products.find(p => p.name === name).id;
const iso = days => new Date(Date.now() + days * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
const client = await books(amal, 'save_partner', { partner: { name: 'عميل التقارير', kind: 'customer' } });
const vendor = await books(amal, 'save_partner', { partner: { name: 'مورد التقارير', kind: 'vendor' } });
const doc = async (kind, journal, partnerId, price, date, dueDate, p, caseId = '') => {
 const x = await books(amal, 'save_invoice', { invoice: { moveType: kind, journalId: jr(journal), date, dueDate, partnerId, caseId, lines: [{ productId: product(p), priceUnit: price }] } });
 return books(amal, 'post', { id: x.id, revision: x.revision });
};
// Fees of 500 (due 45 days ago) and 300 (due in 10 days) on the case, 100 of the first collected; rent 200 due 100 days ago; capital 1000 paid into the bank.
const i1 = await doc('out_invoice', 'INV', client.id, '500', iso(-60), iso(-45), 'أتعاب محاماة', 'rep-case');
await doc('out_invoice', 'INV', client.id, '300', iso(-5), iso(10), 'أتعاب استشارة', 'rep-case');
await books(amal, 'register_payment', { moveIds: [i1.id], journalId: jr('BNK1'), date: iso(-30), amount: '100' });
await doc('in_invoice', 'BILL', vendor.id, '200', iso(-120), iso(-100), 'إيجار المكتب');
const cap = await books(amal, 'save_move', { move: { journalId: jr('MISC'), date: iso(-90), lines: [{ accountId: acc('101000'), debit: '1000' }, { accountId: acc('301000'), credit: '1000' }] } });
await books(amal, 'post', { id: cap.id, revision: cap.revision });
const fee = await books(amal, 'transfer', { fromJournalId: jr('BNK1'), toJournalId: jr('CSH1'), amount: '50', date: iso(-2) });
assert.ok(fee.id);

await assert.rejects(() => books(salem, 'aged', { side: 'receivable' }), e => e.code === '42501');
const aged = await books(amal, 'aged', { side: 'receivable' });
assert.deepEqual([aged[0].name, aged[0].total, aged[0].current, aged[0].d60, aged[0].d30], ['عميل التقارير', '700.000', '300.000', '400.000', '0'], 'Open fees by age: 400 is 31–60 days late, 300 not yet due');
const agedPay = await books(amal, 'aged', { side: 'payable' });
assert.deepEqual([agedPay[0].total, agedPay[0].d120], ['200.000', '200.000']);
const ledger = await books(amal, 'partner_ledger', { side: 'receivable', partnerId: client.id });
assert.deepEqual([ledger[0].debit, ledger[0].credit, ledger[0].closing, ledger[0].lines.length], ['800.000', '100.000', '700.000', 3]);
const ledgerAll = await books(amal, 'partner_ledger', { from: iso(-10) });
assert.deepEqual(ledgerAll.map(p => [p.name, p.opening, p.closing]), [['عميل التقارير', '400.000', '700.000'], ['مورد التقارير', '-200.000', '-200.000']]);
const cf = await books(amal, 'cash_flow', { from: iso(-365), to: iso(0) });
assert.deepEqual([cf.opening, cf.closing, cf.inflow, cf.outflow], ['0', '1100.000', '1100.000', '0'], 'A transfer between cash accounts is neither in nor out');
const section = k => cf.sections.filter(x => x.section === k).reduce((t, x) => t + Number(x.amount), 0);
assert.deepEqual([section('operating'), section('financing'), section('investing')], [100, 1000, 0]);
const sum = await books(amal, 'executive_summary', { from: iso(-365), to: iso(0) });
assert.deepEqual([sum.income, sum.expenses, sum.cash, sum.receivable, sum.payable, sum.overdueReceivable, sum.overduePayable, sum.invoiced, sum.invoices, sum.collected],
 ['800.000', '200.000', '1100.000', '700.000', '200.000', '400.000', '200.000', '800.000', 2, '100.000']);
const cases = await books(amal, 'case_report', {});
assert.deepEqual([cases[0].code, cases[0].income, cases[0].open, cases[0].net], ['RP-1', '800.000', '700.000', '800.000']);
const jrep = await books(amal, 'journal_report', { journalId: jr('INV') });
assert.deepEqual([jrep.length, jrep[0].lines.length], [2, 2]);
console.log('Passed reports: aged receivables and payables by days late, partner ledger with opening and running balances, cash flow by section without internal transfers, executive summary, profit by case and the journal report.');
