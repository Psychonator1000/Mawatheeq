// The bank statement reader: header found by name (Arabic or English), one signed amount column or debit/credit columns,
// dates in several forms, opening and closing balances from the balance column. Synthetic rows only.
import assert from 'node:assert/strict';
import { parseStatementRows, cellAmount, cellDate } from '../lib/bank-import.ts';

assert.deepEqual(['1,250.5', '(3.250)', '12-', '-0.5', '٢٠٠', 'abc', '', '0'].map(cellAmount), ['1250.500', '-3.250', '-12.000', '-0.500', '200.000', '', '', '']);
assert.deepEqual(['05/02/2026', '2026-02-05', '5-2-26', '46058', 'x'].map(cellDate), ['2026-02-05', '2026-02-05', '2026-02-05', '2026-02-05', '']);
// An Arabic statement with withdrawals and deposits, a title above the header and a blank line.
const ar = parseStatementRows([
 ['كشف حساب تجريبي'], [],
 ['التاريخ', 'البيان', 'رقم المرجع', 'سحب', 'إيداع', 'الرصيد'],
 ['01/02/2026', 'تحويل من موكل', 'R1', '', '300', '1,300'],
 ['03/02/2026', 'عمولة', '', '2.5', '', '1,297.5'],
 ['', '', '', '', '', ''],
 ['04/02/2026', 'رصيد منقول', '', '', '', '1,297.5'],
]);
assert.deepEqual(ar.lines.map(l => [l.date, l.label, l.ref, l.amount]), [['2026-02-01', 'تحويل من موكل', 'R1', '300.000'], ['2026-02-03', 'عمولة', '', '-2.500']]);
assert.deepEqual([ar.opening, ar.closing, ar.skipped], ['1000.000', '1297.500', 1]);
// An English export with one signed amount column.
const en = parseStatementRows([['Transaction Date', 'Description', 'Amount', 'Beneficiary'], ['2026-03-01', 'Rent', '-150', 'Synthetic Landlord'], ['2026-03-02', 'Fee', '75.25', '']]);
assert.deepEqual(en.lines.map(l => [l.amount, l.partnerName]), [['-150.000', 'Synthetic Landlord'], ['75.250', '']]);
assert.throws(() => parseStatementRows([['اسم', 'هاتف'], ['أ', '1']]), /عمودي التاريخ/);
console.log('Passed bank statement reader: amounts in brackets, trailing minus and Arabic digits, dates in several forms, Arabic and English headers, withdrawal and deposit columns, balances, skipped rows and unknown files refused.');
