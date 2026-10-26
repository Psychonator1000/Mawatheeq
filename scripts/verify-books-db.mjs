// Synthetic database test for the books: chart of accounts, journals, partners, entries from draft to posted, numbering, lock dates, reversal and the reports.
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
const denied = fn => assert.rejects(fn, e => e.code === '42501');
const refused = (fn, text) => assert.rejects(fn, e => e.message.includes(text), text);
const grant = async (u, p) => { const m = (await office(owner, 'context')).members.find(x => x.username === u); await office(owner, 'set_member_access', { id: m.id, revision: m.permissions.revision, permissions: p }); return login(u); };
// amal keeps the books; badr reads them; salem works only on cases.
const amal = await grant('amal', { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false });
const badr = await grant('badr', { sections: ['accounting'], caseScope: 'all', caseIds: [], canEdit: false, canExport: false });
const salem = await grant('salem', { sections: ['cases'], caseScope: 'all', caseIds: [], canEdit: true, canExport: false });
await local(owner, 'save_case', { case: { id: 'books-case', client: 'موكل الدفاتر', opponent: 'خصم', code: 'BK-1', procedures: [] } });

// Setup: the seeded chart and journals.
const setup = await books(amal, 'setup');
assert.equal(setup.canEdit, true); assert.equal(setup.canConfigure, false, 'Only the owner (or the settings power) configures the books');
assert.ok(setup.accounts.length >= 30); assert.deepEqual(setup.journals.map(j => j.code).sort(), ['BILL', 'BNK1', 'CSH1', 'CSH2', 'INV', 'MISC']);
assert.equal((await books(owner, 'setup')).canConfigure, true);
await denied(() => books(salem, 'setup'));
const acc = code => setup.accounts.find(a => a.code === code).id, jr = code => setup.journals.find(j => j.code === code).id;

// Configuration needs the owner.
await denied(() => books(amal, 'save_account', { account: { code: '601000', name: 'حساب', type: 'expense' } }));
const extra = await books(owner, 'save_account', { account: { code: '511000', name: 'تدريب', type: 'expense' } });
assert.equal(extra.code, '511000');
await refused(() => books(owner, 'save_account', { account: { code: '511000', name: 'مكرر', type: 'expense' } }), 'مستخدم');
await refused(() => books(owner, 'save_journal', { journal: { code: 'BNK2', name: 'بنك ثانٍ', type: 'bank' } }), 'حساب البنك');
const bnk2 = await books(owner, 'save_journal', { journal: { code: 'BNK2', name: 'بنك ثانٍ', type: 'bank', defaultAccount: acc('101000') } });
assert.equal(bnk2.active, true);

// Partners.
const client = await books(amal, 'save_partner', { partner: { name: 'شركة الدفاتر', kind: 'customer' } });
await denied(() => books(badr, 'save_partner', { partner: { name: 'x' } }));

// A fee invoice by hand: receivable against fees, saved as a draft, then posted.
const lines = [{ accountId: acc('121000'), label: 'أتعاب', debit: '150.500', credit: '' }, { accountId: acc('401000'), label: 'أتعاب', debit: '', credit: '150.500' }];
let d1 = await books(amal, 'save_move', { move: { journalId: jr('MISC'), date: '2026-03-10', ref: 'أتعاب مارس', partnerId: client.id, caseId: 'books-case', lines } });
assert.deepEqual([d1.state, d1.name, d1.debit, d1.credit, d1.lines.length, d1.lines[0].partnerId, d1.lines[0].caseId], ['draft', '/', '150.500', '150.500', 2, client.id, 'books-case'], 'Lines take the entry partner and case');
await denied(() => books(badr, 'save_move', { move: { journalId: jr('MISC'), date: '2026-03-10', lines } }));
await refused(() => books(amal, 'save_move', { move: { journalId: jr('MISC'), date: '2026-03-10', lines: [{ accountId: acc('121000'), debit: '1.2345' }] } }), 'المبلغ');
await refused(() => books(amal, 'save_move', { move: { journalId: jr('MISC'), date: '2026-03-10', lines: [{ accountId: acc('121000'), debit: '1', credit: '1' }] } }), 'إما مدين أو دائن');
d1 = await books(amal, 'post', { id: d1.id, revision: d1.revision });
assert.deepEqual([d1.state, d1.name, d1.postedBy], ['posted', 'MISC/2026/0001', 'أمل']);
await refused(() => books(amal, 'save_move', { move: { ...d1, lines } }), 'المرحّل');
await assert.rejects(() => books(amal, 'post', { id: d1.id, revision: d1.revision - 1 }), e => e.code === 'PT409', 'Stale revisions are refused');

// An unbalanced draft is refused at posting; once fixed it takes the next number.
let d2 = await books(amal, 'save_move', { move: { journalId: jr('MISC'), date: '2026-04-01', lines: [{ accountId: acc('502000'), debit: '300' }, { accountId: acc('101000'), credit: '250' }] } });
await refused(() => books(amal, 'post', { id: d2.id, revision: d2.revision }), 'غير متوازن');
d2 = await books(amal, 'save_move', { move: { ...d2, lines: [{ accountId: acc('502000'), debit: '300' }, { accountId: acc('101000'), credit: '300' }] } });
d2 = await books(amal, 'post', { id: d2.id, revision: d2.revision });
assert.equal(d2.name, 'MISC/2026/0002');
let one = await books(amal, 'save_move', { move: { journalId: jr('MISC'), date: '2026-04-02', lines: [{ accountId: acc('502000'), debit: '5' }] } });
await refused(() => books(amal, 'post', { id: one.id, revision: one.revision }), 'سطرين');

// Drafts: an unnumbered draft is deleted; a posted entry reset to draft keeps its number and cannot be deleted.
await books(amal, 'delete_move', { id: one.id, revision: one.revision });
await refused(() => books(amal, 'get_move', { id: one.id }), 'لم يعد');
let reset = await books(amal, 'reset_draft', { id: d2.id, revision: d2.revision });
assert.deepEqual([reset.state, reset.name], ['draft', 'MISC/2026/0002']);
await refused(() => books(amal, 'delete_move', { id: reset.id, revision: reset.revision }), 'لا يُحذف');
reset = await books(amal, 'post', { id: reset.id, revision: reset.revision });
assert.equal(reset.name, 'MISC/2026/0002', 'Posting again keeps the number');
const c = await books(amal, 'save_move', { move: { journalId: jr('CSH1'), date: '2026-04-03', lines: [{ accountId: acc('507000'), debit: '7' }, { accountId: acc('101100'), credit: '7' }] } });
const cancelled = await books(amal, 'cancel', { id: c.id, revision: c.revision });
assert.equal(cancelled.state, 'cancel');

// Reversal: a mirror entry, posted at once, which blocks resetting the original.
const rev = await books(amal, 'reverse', { id: reset.id, date: '2026-04-30', reason: 'خطأ في الإيجار' });
assert.deepEqual([rev.state, rev.name, rev.reversedFrom, rev.lines[0].credit, rev.lines[1].debit], ['posted', 'MISC/2026/0003', reset.id, '300.000', '300.000']);
assert.ok(rev.ref.includes('MISC/2026/0002') && rev.ref.includes('خطأ في الإيجار'));
await refused(() => books(amal, 'reverse', { id: reset.id, date: '2026-04-30' }), 'من قبل');
const orig = await books(amal, 'get_move', { id: reset.id });
assert.equal(orig.reversedBy, rev.id);
await refused(() => books(amal, 'reset_draft', { id: orig.id, revision: orig.revision }), 'عكسي');

// Another year starts its own numbering.
let y = await books(amal, 'save_move', { move: { journalId: jr('MISC'), date: '2027-01-05', lines: [{ accountId: acc('101000'), debit: '50' }, { accountId: acc('409000'), credit: '50' }] } });
y = await books(amal, 'post', { id: y.id, revision: y.revision });
assert.equal(y.name, 'MISC/2027/0001');

// Reports read posted entries only.
const tb = await books(badr, 'trial_balance', { from: '2026-04-01', to: '2026-12-31' });
const row = code => tb.find(r => r.code === code);
assert.deepEqual([row('121000').opening, row('121000').debit, row('121000').balance], ['150.500', '0', '150.500'], 'Earlier entries open the period');
assert.deepEqual([row('502000').debit, row('502000').credit, row('502000').balance], ['300.000', '300.000', '0.000']);
assert.equal(row('507000'), undefined, 'Cancelled entries are left out'); assert.equal(row('409000'), undefined, 'Entries after the period are left out');
const sum = k => tb.reduce((t, r) => t + Number(r[k]), 0);
assert.equal(sum('balance'), 0, 'The trial balance balances');
const gl = await books(badr, 'general_ledger', { accountId: acc('502000') });
assert.deepEqual(gl.map(l => [l.name, l.debit, l.credit]), [['MISC/2026/0002', '300.000', '0.000'], ['MISC/2026/0003', '0.000', '300.000']]);
const list = await books(badr, 'list_moves', { journalId: jr('MISC'), state: 'posted' });
assert.deepEqual(list.moves.map(m => m.name), ['MISC/2027/0001', 'MISC/2026/0003', 'MISC/2026/0002', 'MISC/2026/0001']);
assert.equal((await books(badr, 'list_moves', { q: 'شركة الدفاتر' })).moves.length, 1, 'Search reaches the partner');
assert.ok((await books(badr, 'history', { id: reset.id })).map(h => h.action).includes('reset_draft'));
const stats = (await books(badr, 'setup')).journalStats[jr('BNK1')];
assert.equal(stats.balance, '50.000', 'The bank journal shows its account balance');

// Lock dates: the period lock stops editors; the fiscal lock stops everyone and never moves back.
const pending = await books(amal, 'save_move', { move: { journalId: jr('MISC'), date: '2026-03-20', lines } });
await refused(async () => { const s = (await books(owner, 'setup')).settings; await books(owner, 'save_settings', { ...s, lockDate: '2026-12-31' }); }, 'مسودة');
assert.deepEqual((await books(amal, 'list_moves', { state: 'draft' })).moves.map(m => m.id), [pending.id]);
await books(amal, 'delete_move', { id: pending.id, revision: pending.revision });
let s = (await books(owner, 'setup')).settings;
await denied(() => books(amal, 'save_settings', { ...s, lockDate: '2026-03-31' }));
await books(owner, 'save_settings', { ...s, lockDate: '2026-03-31' });
await refused(() => books(amal, 'save_move', { move: { journalId: jr('MISC'), date: '2026-03-15', lines } }), 'مقفلة');
const ownerDraft = await books(owner, 'save_move', { move: { journalId: jr('MISC'), date: '2026-03-15', lines } });
assert.equal(ownerDraft.state, 'draft', 'The settings power still enters a period locked for others');
await books(owner, 'delete_move', { id: ownerDraft.id, revision: ownerDraft.revision });
await refused(() => books(amal, 'reverse', { id: d1.id, date: '2026-03-20' }), 'الإقفال');
s = (await books(owner, 'setup')).settings;
await books(owner, 'save_settings', { ...s, fiscalLockDate: '2026-02-28' });
s = (await books(owner, 'setup')).settings;
await refused(() => books(owner, 'save_settings', { ...s, fiscalLockDate: '2026-01-31' }), 'الوراء');
await refused(() => books(owner, 'save_settings', { ...s, fiscalLockDate: '' }), 'الوراء');
await refused(() => books(owner, 'save_move', { move: { journalId: jr('MISC'), date: '2026-02-01', lines } }), 'مقفلة');
await assert.rejects(() => books(amal, 'save_partner', { partner: { id: client.id, revision: 0, name: 'x' } }), e => e.code === 'PT409');

// The tables stay private.
await assert.rejects(() => db.query('select * from mawatheeq_private.acc_moves'), e => e.code === '42501');
console.log('Passed books: seeded chart and journals, configuration for the owner only, partners, drafts, amounts, posting balanced entries with numbers per journal and year, reset and cancel, deleting only unnumbered drafts, reversal, trial balance with opening balances, general ledger, search, history, period and fiscal lock dates, and private tables.');
