// Synthetic database test for the advanced books: taxes, currencies and exchange differences, cost centres, budgets, assets and deferrals, recurring entries, follow-ups and year-end.
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
let setup = await books(amal, 'setup');
const acc = code => setup.accounts.find(a => a.code === code).id, jr = code => setup.journals.find(j => j.code === code).id, product = name => setup.products.find(p => p.name === name).id;
const year = new Date().getFullYear(), d = (m, day) => `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const client = await books(amal, 'save_partner', { partner: { name: 'عميل متقدم', kind: 'customer' } });
assert.deepEqual([setup.advanced, setup.taxesEnabled, setup.taxes.length, setup.currencies[0].code], [true, false, 2, 'KWD']);
const sale5 = setup.taxes.find(t => t.typeUse === 'sale').id;
const post = async x => books(amal, 'post', { id: x.id, revision: x.revision });
const invoice = (extra, lines) => books(amal, 'save_invoice', { invoice: { moveType: 'out_invoice', journalId: jr('INV'), date: d(2, 1), partnerId: client.id, ...extra, lines } });

// Taxes are ignored until switched on.
let inv = await invoice({}, [{ productId: product('أتعاب محاماة'), priceUnit: '100', taxIds: [sale5] }]);
assert.equal(inv.amountTotal, '100.000', 'Taxes off: no tax line');
await denied(() => books(amal, 'set_taxes', { enabled: true }));
await books(owner, 'set_taxes', { enabled: true });
inv = await invoice({ id: inv.id, revision: inv.revision }, [{ productId: product('أتعاب محاماة'), priceUnit: '100', taxIds: [sale5] }, { productId: product('أتعاب استشارة'), priceUnit: '40', taxIds: [sale5] }]);
assert.equal(inv.amountTotal, '147.000');
assert.deepEqual(inv.lines.filter(l => l.kind === 'tax').map(l => [l.accountId, l.credit]), [[acc('216000'), '7.000']]);
inv = await post(inv);
await refused(() => books(amal, 'save_invoice', { invoice: { moveType: 'out_invoice', journalId: jr('INV'), date: d(2, 1), partnerId: client.id, lines: [{ productId: product('أتعاب محاماة'), priceUnit: '1', taxIds: [setup.taxes.find(t => t.typeUse === 'purchase').id] }] } }), 'ليست لهذا النوع');
// A tax included in the price.
const incl = await books(owner, 'save_tax', { tax: { name: 'ضريبة شاملة 10٪', typeUse: 'sale', amount: '10', priceInclude: true, accountId: acc('216000') } });
const inv2 = await invoice({}, [{ label: 'شامل', accountId: acc('401000'), priceUnit: '110', taxIds: [incl.id] }]);
assert.deepEqual([inv2.amountTotal, inv2.lines.find(l => l.kind === 'product').credit, inv2.lines.find(l => l.kind === 'tax').credit], ['110.000', '100.000', '10.000']);
await refused(() => books(owner, 'save_tax', { tax: { id: sale5, revision: 1, name: 'ضريبة مبيعات 5٪', typeUse: 'sale', amount: '6', accountId: acc('216000') } }), 'استُخدمت');
const taxes = await books(amal, 'tax_report', { from: d(1, 1), to: d(12, 31) });
assert.deepEqual(taxes.filter(t => t.name === 'ضريبة مبيعات 5٪').map(t => [t.base, t.tax]), [['140.000', '7.000']], 'Draft invoices are not in the tax report');

// Another currency: 1,000 USD at 0.305 then paid when the dollar is worth 0.300; the difference is settled as a loss.
await refused(() => invoice({ currency: 'USD', date: d(3, 1) }, [{ label: 'أتعاب دولية', accountId: acc('401000'), priceUnit: '1000' }]), 'سعر صرف');
const badr = await grant('badr', { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: false, canExport: false });
await denied(() => books(badr, 'save_rate', { currency: 'USD', date: d(1, 1), rate: '0.305' }));
await books(amal, 'save_rate', { currency: 'USD', date: d(1, 1), rate: '0.305' });
let usd = await invoice({ currency: 'USD', date: d(3, 1), taxes: [] }, [{ label: 'أتعاب دولية', accountId: acc('401000'), priceUnit: '1000' }]);
assert.deepEqual([usd.currency, usd.currencyRate, usd.amountTotalCurrency, usd.amountTotal, usd.lines[0].amountCurrency], ['USD', '0.30500000', '1000.000', '305.000', '1000.000']);
usd = await post(usd);
await books(amal, 'register_payment', { moveIds: [usd.id], journalId: jr('BNK1'), date: d(3, 20), amount: '300' });
usd = await books(amal, 'get_move', { id: usd.id });
assert.deepEqual([usd.paymentState, usd.amountResidual], ['partial', '5.000']);
const ex = await books(amal, 'exchange_difference', { id: usd.id, date: d(3, 20) });
assert.deepEqual([ex.paymentState, ex.amountResidual], ['paid', '0.000']);
await refused(() => books(amal, 'exchange_difference', { id: inv.id, date: d(3, 20) }), 'بعملة أجنبية');

// Cost centres on journal entries and invoice lines, and their report.
const cc = await books(amal, 'save_analytic', { analytic: { name: 'قسم التحصيل', code: 'C1' } });
const e1 = await books(amal, 'save_move', { move: { journalId: jr('MISC'), date: d(4, 1), lines: [{ accountId: acc('502000'), debit: '80', analyticId: cc.id }, { accountId: acc('101000'), credit: '80' }] } });
await post(e1);
const inv3 = await post(await invoice({ date: d(4, 2) }, [{ label: 'تحصيل', accountId: acc('402000'), priceUnit: '200', analyticId: cc.id }]));
assert.ok(inv3.lines.some(l => l.analyticId === cc.id));
const ar = await books(amal, 'analytic_report', {});
assert.deepEqual(ar.map(x => [x.name, x.income, x.expenses, x.net]), [['قسم التحصيل', '200.000', '80.000', '120.000']]);

// A budget against what was booked.
const bud = await books(amal, 'save_budget', { budget: { name: 'موازنة السنة', from: d(1, 1), to: d(12, 31), lines: [{ accountId: acc('401000'), amount: '2000' }, { accountId: acc('502000'), amount: '1000', analyticId: cc.id }] } });
const br = (await books(amal, 'budget_report', { id: bud.id }))[0];
assert.deepEqual(br.lines.map(l => [l.code, l.planned, l.actual]), [['401000', '2000.000', '405.000'], ['502000', '1000.000', '80.000']]);

// A fixed asset over 12 months, depreciation posted when due, then sold.
const asset = await books(amal, 'save_schedule', { schedule: { kind: 'asset', name: 'حاسوب المكتب', journalId: jr('MISC'), assetAccount: acc('151000'), debitAccount: acc('508000'), creditAccount: acc('151900'),
 value: '1200', salvage: '0', months: '12', firstDate: d(1, 31) } });
assert.deepEqual([asset.state, asset.lines.length, asset.lines[0].amount, asset.lines[11].date], ['draft', 12, '100.000', d(12, 31)]);
await books(amal, 'confirm_schedule', { id: asset.id });
assert.equal((await books(amal, 'post_schedules', { date: d(3, 31) })).posted, 3);
assert.equal((await books(amal, 'post_schedules', { date: d(3, 31) })).posted, 0, 'Posting again adds nothing');
const sold = await books(amal, 'dispose_schedule', { id: asset.id, date: d(4, 15), saleAmount: '1000', saleAccount: acc('101000') });
assert.deepEqual([sold.state, sold.posted], ['closed', '300.000']);
let tb = await books(amal, 'trial_balance', {});
assert.deepEqual([tb.find(r => r.code === '409200').balance, tb.find(r => r.code === '151900').balance], ['-100.000', '0.000'], 'Sold for 1000 with 900 left: a gain of 100');
// Income received in advance, recognised over 4 months, the rest recognised at once.
const def = await books(amal, 'save_schedule', { schedule: { kind: 'deferred_revenue', name: 'أتعاب سنوية مقدمة', journalId: jr('MISC'), debitAccount: acc('212100'), creditAccount: acc('401000'), value: '400', months: '4', firstDate: d(5, 31) } });
await books(amal, 'confirm_schedule', { id: def.id });
await books(amal, 'post_schedules', { id: def.id, date: d(6, 30) });
const def2 = await books(amal, 'dispose_schedule', { id: def.id, date: d(7, 1) });
assert.deepEqual([def2.posted, def2.state], ['400.000', 'closed']);

// Recurring rent, auto-posted monthly for three months.
const rec = await books(amal, 'save_recurring', { recurring: { name: 'إيجار شهري', kind: 'entry', interval: 1, nextDate: d(8, 1), endDate: d(10, 1), autoPost: true,
 template: { journalId: jr('MISC'), ref: 'إيجار', lines: [{ accountId: acc('502000'), debit: '300' }, { accountId: acc('101000'), credit: '300' }] } } });
assert.ok(rec.id);
const run = await books(amal, 'run_recurring', { date: d(12, 31) });
assert.deepEqual(run.created.map(c => c.date), [d(8, 1), d(9, 1), d(10, 1)]);
assert.equal((await books(amal, 'run_recurring', { date: d(12, 31) })).created.length, 0);
assert.equal((await books(amal, 'list_recurring'))[0].active, false, 'Past its end date it stops');

// Follow-up: the client owes the taxed invoice since February.
const fu = await books(amal, 'followups');
const mine = fu.partners.find(p => p.partnerId === client.id);
assert.ok(mine && mine.level.name === 'إنذار أخير' && mine.last === null);
await books(amal, 'followup_done', { partnerId: client.id, levelId: mine.level.id, note: 'أُرسل بالبريد' });
assert.equal((await books(amal, 'followups')).partners.find(p => p.partnerId === client.id).last.level, 'إنذار أخير');

// Year-end: the checklist, refused with drafts, then closed and locked.
const check = await books(amal, 'year_end', { yearEnd: d(12, 31) });
assert.ok(check.drafts >= 1);
await denied(() => books(amal, 'close_year', { yearEnd: d(12, 31) }));
await refused(() => books(owner, 'close_year', { yearEnd: d(12, 31) }), 'مسودة');
for (const m of (await books(owner, 'list_moves', { state: 'draft' })).moves) await books(owner, 'cancel', { id: m.id, revision: m.revision });
const closed = await books(owner, 'close_year', { yearEnd: d(12, 31) });
assert.equal(closed.closed, true);
assert.equal((await books(owner, 'setup')).settings.fiscalLockDate, d(12, 31));
await refused(() => books(owner, 'save_move', { move: { journalId: jr('MISC'), date: d(12, 1), lines: [] } }), 'مقفلة');
tb = await books(amal, 'trial_balance', {});
assert.equal(tb.reduce((t, r) => t + Math.round(Number(r.balance) * 1000), 0), 0, 'The trial balance balances');
console.log('Passed advanced books: taxes off until switched on, added and included taxes with tax lines and report, currency invoices booked at the dated rate with an exchange difference settled, cost centres and their report, budgets against actuals, an asset depreciated and sold with a gain, a deferral recognised, recurring entries auto-posted until their end, follow-up levels and records, and year-end checklist and closing.');
