// Synthetic database test for invoicing: invoices and bills with payment terms, partial and over-payments, outstanding credits, credit notes, payments reset and the old ledger moved into the books.
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
const dept = (s, record) => rpc('mawatheeq_department_request', [s.token, 'save_record', JSON.stringify({ workspace: 'accounting', record: { revision: 0, caseId: '', subjectId: '', ...record } })]);
const denied = fn => assert.rejects(fn, e => e.code === '42501');
const refused = (fn, text) => assert.rejects(fn, e => e.message.includes(text), text);
const grant = async (u, p) => { const m = (await office(owner, 'context')).members.find(x => x.username === u); await office(owner, 'set_member_access', { id: m.id, revision: m.permissions.revision, permissions: p }); return login(u); };
const amal = await grant('amal', { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false });
const badr = await grant('badr', { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: false, canExport: false });
await local(owner, 'save_case', { case: { id: 'inv-case', client: 'موكل الفواتير', opponent: 'خصم', code: 'IV-1', procedures: [] } });

// The ledger conversion runs first, before anything else is in the books. Fees become invoices, receipts pay them, expenses become paid bills.
const year = new Date().getFullYear(), d = (m, day) => `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
await dept(owner, { id: crypto.randomUUID(), kind: 'entry', caseId: 'inv-case', payload: { type: 'fee', date: d(1, 5), currency: 'KWD', amount: '300', reference: 'OLD-FEE', party: 'موكل قديم', notes: 'أتعاب قديمة' } });
await dept(owner, { id: crypto.randomUUID(), kind: 'entry', payload: { type: 'receipt', date: d(1, 10), currency: 'KWD', amount: '120', reference: 'OLD-RC', party: 'موكل قديم', notes: '' } });
await dept(owner, { id: crypto.randomUUID(), kind: 'entry', payload: { type: 'expense', date: d(1, 12), currency: 'KWD', amount: '45.5', reference: 'OLD-EX', party: 'مكتبة تجريبية', notes: 'قرطاسية' } });
await dept(owner, { id: crypto.randomUUID(), kind: 'entry', payload: { type: 'fee', date: d(1, 13), currency: 'USD', amount: '10', reference: 'OLD-USD', party: 'موكل قديم', notes: '' } });
let setup = await books(amal, 'setup');
const acc = code => setup.accounts.find(a => a.code === code).id, jr = code => setup.journals.find(j => j.code === code).id, product = name => setup.products.find(p => p.name === name).id;
await denied(() => books(amal, 'convert_ledger', { journalId: jr('BNK1'), dryRun: true }));
const preview = await books(owner, 'convert_ledger', { journalId: jr('BNK1'), dryRun: true });
assert.deepEqual([preview.fees, preview.receipts, preview.expenses, preview.skippedCurrency, preview.dryRun], [1, 1, 1, 1, true]);
assert.equal((await books(owner, 'list_documents', { kind: 'out_invoice' })).documents.length, 0, 'The preview writes nothing');
const moved = await books(owner, 'convert_ledger', { journalId: jr('BNK1'), dryRun: false });
assert.deepEqual([moved.fees, moved.receipts, moved.expenses, moved.partners], [1, 1, 1, 2]);
assert.equal((await books(owner, 'convert_ledger', { journalId: jr('BNK1'), dryRun: false })).already, 3, 'Moving again changes nothing');
const oldFee = (await books(owner, 'list_documents', { kind: 'out_invoice' })).documents[0];
assert.deepEqual([oldFee.name, oldFee.amountTotal, oldFee.amountResidual, oldFee.paymentState, oldFee.caseId], [`INV/${year}/0001`, '300.000', '180.000', 'partial', 'inv-case'], 'The old receipt pays the old fee');
const oldBill = (await books(owner, 'list_documents', { kind: 'in_invoice' })).documents[0];
assert.deepEqual([oldBill.amountTotal, oldBill.paymentState], ['45.500', 'paid'], 'Old expenses arrive as paid bills');

// Services, terms and defaults.
setup = await books(amal, 'setup');
assert.equal(setup.paymentTerms.length, 4); assert.ok(setup.products.length >= 6); assert.equal(setup.invoicing.receivableAccount, acc('121000'));
await denied(() => books(amal, 'save_term', { term: { name: 'x', lines: [{ kind: 'balance', days: 0 }] } }));
await refused(() => books(owner, 'save_term', { term: { name: 'خاطئ', lines: [{ kind: 'percent', percent: 60, days: 0 }, { kind: 'percent', percent: 40, days: 10 }, { kind: 'balance', days: 5 }] } }), 'أقل من 100');
await refused(() => books(owner, 'save_term', { term: { name: 'خاطئ', lines: [{ kind: 'balance', days: 5 }, { kind: 'percent', percent: 10, days: 0 }] } }), 'الباقي');
const thirds = await books(owner, 'save_term', { term: { name: 'ثلاث دفعات', lines: [{ kind: 'percent', percent: 33.33, days: 0 }, { kind: 'percent', percent: 33.33, days: 30 }, { kind: 'balance', days: 60 }] } });
assert.equal((await books(amal, 'setup')).paymentTerms.find(t => t.id === thirds.id).lines.length, 3);
const srv = await books(amal, 'save_product', { product: { name: 'صياغة عقد', incomeAccount: acc('403000'), salePrice: '75' } });
await denied(() => books(badr, 'save_product', { product: { name: 'x', incomeAccount: acc('403000') } }));
await refused(() => books(owner, 'save_invoicing', { ...setup.invoicing, receivableAccount: acc('131000') }), 'ذمم مدينة');
await refused(() => books(owner, 'save_invoicing', { ...setup.invoicing, receivableAccount: acc('133000') }), 'ذمم مدينة');
const client = await books(amal, 'save_partner', { partner: { name: 'شركة الفواتير', kind: 'customer' } });
const landlord = await books(amal, 'save_partner', { partner: { name: 'مالك المكتب', kind: 'vendor' } });

// A customer invoice: two lines (quantity, discount), half now and half in 30 days.
const half = setup.paymentTerms.find(t => t.name.startsWith('نصف')).id;
const invoiceLines = [{ productId: product('أتعاب محاماة'), label: 'جلستان', quantity: '2', priceUnit: '150', discount: '10' }, { label: 'مذكرة', accountId: acc('403000'), quantity: '1', priceUnit: '30' }];
let inv = await books(amal, 'save_invoice', { invoice: { moveType: 'out_invoice', journalId: jr('INV'), date: d(3, 1), paymentTermId: half, caseId: 'inv-case', ref: 'SYN-INV', lines: invoiceLines } });
assert.deepEqual([inv.state, inv.amountTotal, inv.lines.filter(l => l.kind === 'term').map(l => [l.debit, l.dateMaturity])], ['draft', '300.000', [['150.000', d(3, 1)], ['150.000', d(3, 31)]]]);
assert.deepEqual(inv.lines.filter(l => l.kind === 'product').map(l => [l.accountId, l.credit, l.caseId]), [[acc('401000'), '270.000', 'inv-case'], [acc('403000'), '30.000', 'inv-case']]);
await refused(() => books(amal, 'post', { id: inv.id, revision: inv.revision }), 'العميل');
await refused(() => books(amal, 'save_invoice', { invoice: { moveType: 'out_invoice', journalId: jr('BILL'), date: d(3, 1), lines: invoiceLines } }), 'المبيعات');
await refused(() => books(amal, 'save_invoice', { invoice: { moveType: 'out_invoice', journalId: jr('INV'), date: d(3, 1), lines: [{ label: 'فارغ', accountId: acc('401000'), priceUnit: '0' }] } }), 'بمبلغ');
inv = await books(amal, 'save_invoice', { invoice: { ...inv, partnerId: client.id, dueDate: '', lines: invoiceLines } });
inv = await books(amal, 'post', { id: inv.id, revision: inv.revision });
assert.deepEqual([inv.name, inv.state, inv.paymentState, inv.amountResidual], [`INV/${year}/0002`, 'posted', 'not_paid', '300.000']);
await refused(() => books(amal, 'save_move', { move: { ...inv, lines: [] } }), 'شاشتها');
await refused(() => books(amal, 'reverse', { id: inv.id, date: d(3, 2) }), 'إشعار دائن');
await denied(() => books(badr, 'register_payment', { moveIds: [inv.id], journalId: jr('BNK1'), date: d(3, 5), amount: '10' }));

// A partial payment, then an over-payment that leaves a credit.
const p1 = await books(amal, 'register_payment', { moveIds: [inv.id], journalId: jr('BNK1'), date: d(3, 5), amount: '100' });
assert.deepEqual([p1.name, p1.paymentType, p1.partnerType, p1.state, p1.paymentState], [`PBNK1/${year}/0003`, 'inbound', 'customer', 'posted', 'paid']);
inv = await books(amal, 'get_move', { id: inv.id });
assert.deepEqual([inv.paymentState, inv.amountResidual, inv.lines.filter(l => l.kind === 'term').map(l => l.residual), inv.matches.map(m => [m.name, m.amount])], ['partial', '200.000', ['50.000', '150.000'], [[p1.name, '100.000']]], 'The first instalment is paid first');
const p2 = await books(amal, 'register_payment', { moveIds: [inv.id], journalId: jr('BNK1'), date: d(3, 20), amount: '250' });
assert.deepEqual([p2.paymentState, p2.amountResidual], ['partial', '50.000'], 'The extra 50 stays open on the payment');
inv = await books(amal, 'get_move', { id: inv.id });
assert.equal(inv.paymentState, 'paid');
// A second invoice uses the credit; removing the match reopens it.
let inv2 = await books(amal, 'save_invoice', { invoice: { moveType: 'out_invoice', journalId: jr('INV'), date: d(4, 1), partnerId: client.id, lines: [{ productId: srv.id, priceUnit: '40' }] } });
assert.equal(inv2.lines[0].label, 'صياغة عقد', 'A service names its line');
inv2 = await books(amal, 'post', { id: inv2.id, revision: inv2.revision });
assert.deepEqual(inv2.outstanding.map(o => [o.name, o.amount]), [[p2.name, '50.000']]);
inv2 = await books(amal, 'add_outstanding', { id: inv2.id, lineId: inv2.outstanding[0].lineId });
assert.deepEqual([inv2.paymentState, inv2.outstanding.length], ['paid', 0]);
assert.equal((await books(amal, 'get_move', { id: p2.id })).amountResidual, '10.000');
inv2 = await books(amal, 'remove_partial', { id: inv2.id, partialId: inv2.matches[0].partialId });
assert.deepEqual([inv2.paymentState, inv2.amountResidual], ['not_paid', '40.000']);
// A credit note for the whole second invoice reverses it.
const credit = await books(amal, 'credit_note', { id: inv2.id, date: d(4, 3), reason: 'إلغاء الخدمة', post: true });
assert.deepEqual([credit.name, credit.moveType, credit.state, credit.amountTotal, credit.reversedFrom], [`RINV/${year}/0001`, 'out_refund', 'posted', '40.000', inv2.id]);
inv2 = await books(amal, 'get_move', { id: inv2.id });
assert.equal(inv2.paymentState, 'reversed');
const draftCredit = await books(amal, 'credit_note', { id: inv.id, date: d(4, 4) });
assert.deepEqual([draftCredit.state, draftCredit.name, draftCredit.amountTotal], ['draft', '/', '300.000'], 'A credit note can be left as a draft to adjust');

// A vendor bill paid from cash; resetting the payment reopens the bill until it is matched again.
let bill = await books(amal, 'save_invoice', { invoice: { moveType: 'in_invoice', journalId: jr('BILL'), date: d(4, 1), partnerId: landlord.id, paymentTermId: setup.paymentTerms.find(t => t.name === '30 يوماً').id, lines: [{ productId: product('إيجار المكتب'), priceUnit: '500' }] } });
assert.deepEqual(bill.lines.map(l => [l.kind, l.accountId, l.debit, l.credit]), [['product', acc('502000'), '500.000', '0.000'], ['term', acc('211000'), '0.000', '500.000']]);
bill = await books(amal, 'post', { id: bill.id, revision: bill.revision });
assert.equal(bill.invoiceDateDue, d(5, 1));
let pay = await books(amal, 'register_payment', { moveIds: [bill.id], journalId: jr('CSH1'), date: d(4, 10) });
assert.deepEqual([pay.name, pay.paymentType, pay.partnerType, pay.amountTotal], [`PCSH1/${year}/0001`, 'outbound', 'vendor', '500.000']);
assert.equal((await books(amal, 'get_move', { id: bill.id })).paymentState, 'paid');
pay = await books(amal, 'reset_draft', { id: pay.id, revision: pay.revision });
assert.equal((await books(amal, 'get_move', { id: bill.id })).paymentState, 'not_paid');
pay = await books(amal, 'post', { id: pay.id, revision: pay.revision });
assert.equal(pay.name, `PCSH1/${year}/0001`, 'The payment keeps its number');
bill = await books(amal, 'get_move', { id: bill.id });
bill = await books(amal, 'add_outstanding', { id: bill.id, lineId: bill.outstanding[0].lineId });
assert.equal(bill.paymentState, 'paid');

// A payment on its own, and partner balances.
let advance = await books(amal, 'save_payment', { payment: { paymentType: 'inbound', partnerType: 'customer', partnerId: client.id, journalId: jr('CSH1'), date: d(5, 1), amount: '25', ref: 'دفعة مقدمة' } });
assert.deepEqual([advance.state, advance.lines.map(l => [l.accountId, l.debit, l.credit])], ['draft', [[acc('101100'), '25.000', '0.000'], [acc('121000'), '0.000', '25.000']]]);
await refused(() => books(amal, 'save_payment', { payment: { paymentType: 'inbound', partnerType: 'customer', journalId: jr('INV'), date: d(5, 1), amount: '1' } }), 'بنك أو صندوق');
advance = await books(amal, 'post', { id: advance.id, revision: advance.revision });
setup = await books(badr, 'setup');
assert.deepEqual(setup.partnerBalances[client.id], { receivable: '-75.000', payable: '0' }, 'Unused payments show as credit');
assert.deepEqual([setup.documentStats.out_invoice.open, setup.documentStats.out_invoice.openAmount], [1, '180.000'], 'Only the old fee is still open');
assert.equal(setup.journalStats[jr('CSH1')].balance, '-475.000');

// Lists and the books still balance.
assert.deepEqual((await books(badr, 'list_documents', { kind: 'customer_payment' })).documents.map(x => x.name).sort(), [`PBNK1/${year}/0001`, `PBNK1/${year}/0003`, `PBNK1/${year}/0004`, `PCSH1/${year}/0002`]);
assert.deepEqual((await books(badr, 'list_documents', { kind: 'out_invoice', paymentState: 'paid' })).documents.map(x => x.name), [`INV/${year}/0002`]);
assert.equal((await books(badr, 'list_documents', { kind: 'out_invoice', q: 'الفواتير' })).documents.length, 2);
const tb = await books(badr, 'trial_balance', {});
assert.equal(tb.reduce((t, r) => t + Math.round(Number(r.balance) * 1000), 0), 0, 'The trial balance balances');
assert.equal(tb.find(r => r.code === '121000').balance, '105.000', 'Receivable = 180 open on the old fee less 75 unused credit');
await refused(() => books(owner, 'save_invoicing', { ...setup.invoicing, payableAccount: acc('214000') }), 'ذمم دائنة');

// Resetting the invoice clears its matches; its payments become open credits.
inv = await books(amal, 'reset_draft', { id: inv.id, revision: inv.revision });
assert.deepEqual([inv.state, inv.matches.length], ['draft', 0]);
assert.equal((await books(amal, 'get_move', { id: p1.id })).amountResidual, '100.000');
console.log('Passed invoicing: ledger moved into the books once (fees, receipts matched, paid expenses, other currencies skipped), payment terms and services, invoices with instalments, quantities and discounts, partner required to confirm, partial and over-payments, outstanding credit applied and removed, credit notes reversing an invoice, vendor bills paid from cash, payment reset and re-matched, standalone payments, partner balances, lists and a balanced trial balance.');
