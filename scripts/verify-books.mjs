// The books library: amounts in fils, entry totals, fiscal years, the profit and loss and the balance sheet. Synthetic figures only.
import assert from 'node:assert/strict';
import { toFils, filsText, money, isAmount, moveTotals, fiscalYearStart, profitAndLoss, balanceSheet, runningLedger, balancingLine, nextAccountCode } from '../lib/books.ts';

assert.deepEqual(['', '1', '1.5', '150.500', '1,250.25', '-3.001'].map(toFils), [0, 1000, 1500, 150500, 1250250, -3001]);
assert.throws(() => toFils('1.2345'), /ثلاث خانات/); assert.throws(() => toFils('١٠'), /المبلغ/);
assert.deepEqual([isAmount('2.5'), isAmount('-1'), isAmount('x')], [true, false, false]);
assert.deepEqual([filsText(150500), filsText(5), filsText(-1250)], ['150.500', '0.005', '-1.250']);
assert.deepEqual([money(1234567890), money(-2500), money(0)], ['1,234,567.890', '(2.500)', '0.000']);

const t = moveTotals([{ debit: '100', credit: '' }, { debit: '', credit: '60.5' }, { debit: '', credit: '39.5' }]);
assert.deepEqual([t.debit, t.credit, t.difference, t.balanced], [100000, 100000, 0, true]);
assert.equal(moveTotals([{ debit: '5', credit: '' }]).balanced, false, 'One line never posts');
assert.equal(moveTotals([{ debit: '5', credit: '5' }, { debit: '', credit: '' }]).both, true);
assert.equal(moveTotals([{ debit: 'abc', credit: '' }, { debit: '', credit: '1' }]).valid, false);
assert.deepEqual(balancingLine([{ debit: '100', credit: '' }, { debit: '', credit: '60' }], 'acc'), { accountId: 'acc', partnerId: '', caseId: '', label: '', debit: '', credit: '40.000', dateMaturity: null });
assert.equal(balancingLine([{ debit: '1', credit: '' }, { debit: '', credit: '1' }], 'acc'), null);

assert.deepEqual([fiscalYearStart('2026-03-10'), fiscalYearStart('2026-12-31'), fiscalYearStart('2026-05-01', '03-31'), fiscalYearStart('2026-02-01', '03-31')], ['2026-01-01', '2026-01-01', '2026-04-01', '2025-04-01']);

// A trial balance from 1 January: 1,000 fees billed (300 last year), 200 rent, 50 court fees, 20 other income; 500 capital.
const row = (code, name, type, opening, debit, credit) => ({ accountId: code, code, name, type, opening, debit, credit, balance: filsText(toFils(opening) + toFils(debit) - toFils(credit)) });
const tb = [
 row('101000', 'البنك', 'asset_cash', '200', '1020', '250'),
 row('121000', 'العملاء', 'asset_receivable', '100', '1000', '1000'),
 row('211000', 'الموردون', 'liability_payable', '0', '0', '0'),
 row('301000', 'رأس المال', 'equity', '0', '0', '0'),
 row('301000b', 'رأس المال المدفوع', 'equity', '-500', '0', '0'),
 row('401000', 'أتعاب', 'income', '-300', '0', '1000'),
 row('409000', 'أخرى', 'income_other', '0', '0', '20'),
 row('502000', 'إيجار', 'expense', '0', '200', '0'),
 row('504000', 'رسوم', 'expense_direct_cost', '0', '50', '0'),
];
const pl = profitAndLoss(tb);
assert.deepEqual([pl.sections[0].total, pl.gross, pl.operating, pl.net], [1000000, 950000, 750000, 770000]);
assert.equal(pl.sections.find(s => s.key === 'other_income').lines[0].amount, 20000);
const bs = balanceSheet(tb);
assert.deepEqual([bs.assets.total, bs.liabilities.total, bs.equity.total], [1070000, 0, 1570000]);
assert.deepEqual(bs.equity.lines.map(l => [l.name, l.amount]), [['رأس المال المدفوع', 500000], ['نتيجة السنة الحالية', 770000], ['نتائج سنوات سابقة غير مقفلة', 300000]]);
assert.equal(bs.balanced, false, 'Opening balances here are partial, so the check notices');
const full = balanceSheet([row('101000', 'البنك', 'asset_cash', '0', '1000', '0'), row('401000', 'أتعاب', 'income', '0', '0', '700'), row('301000', 'رأس المال', 'equity', '0', '0', '300')]);
assert.deepEqual([full.assets.total, full.equity.total, full.balanced], [1000000, 1000000, true]);

assert.deepEqual(runningLedger([{ debit: '10', credit: '0' }, { debit: '0', credit: '4' }], 1000).map(r => r.running), [11000, 7000]);
assert.equal(nextAccountCode([{ code: '501000' }, { code: '599000' }], 'expense'), '502000', 'After the last code in range, or the first gap');
assert.equal(nextAccountCode([{ code: '501000' }, { code: '502000' }], 'expense'), '503000');
assert.equal(nextAccountCode([], 'income'), '401000');
console.log('Passed books library: amounts in fils, money display, entry totals and balancing line, fiscal year start, profit and loss, balance sheet with this and earlier years, running ledger, next account code.');
const { lineSubtotal, termSchedule, daysLate, docKindOf } = await import('../lib/books.ts');
assert.deepEqual([lineSubtotal('2', '150', '10'), lineSubtotal('', '30', ''), lineSubtotal('1.5', '33.333', '0')], [270000, 30000, 50000]);
assert.throws(() => lineSubtotal('1', '1', '120'), /الخصم/);
assert.deepEqual(termSchedule(300000, [{ kind: 'percent', percent: 50, days: 0 }, { kind: 'balance', days: 30 }], '2026-03-01'), [{ date: '2026-03-01', amount: 150000 }, { date: '2026-03-31', amount: 150000 }]);
assert.deepEqual(termSchedule(100000, [{ kind: 'percent', percent: 33.33, days: 0 }, { kind: 'percent', percent: 33.33, days: 30 }, { kind: 'balance', days: 60 }], '2026-01-01').map(x => x.amount), [33330, 33330, 33340]);
assert.deepEqual(termSchedule(5000, null, '2026-01-01', '2026-02-01'), [{ date: '2026-02-01', amount: 5000 }]);
assert.deepEqual([daysLate('2026-03-01', '2026-03-11', '5'), daysLate('2026-03-01', '2026-03-11', '0'), daysLate('2026-04-01', '2026-03-11', '5')], [10, 0, 0]);
assert.deepEqual([docKindOf({ moveType: 'entry', paymentType: 'inbound', partnerType: 'customer' }), docKindOf({ moveType: 'in_refund', paymentType: '', partnerType: '' }), docKindOf({ moveType: 'entry', paymentType: '', partnerType: '' })], ['customer_payment', 'in_refund', null]);
console.log('Passed invoicing library: service line amounts with discounts, payment term schedules, days overdue and document kinds.');
