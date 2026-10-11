import assert from 'node:assert/strict';
import { caseSheetHtml, voucherHtml, statementHtml } from '../lib/print.ts';

const record = {
  id: 'print-case', code: 'TEST-1', autoNumber: '1001', client: 'شركة اختبار', clientGroup: '', clientEntityName: 'شركة اختبار <b>', opponent: 'خصم "تجريبي"',
  type: 'حكم أول درجة', date: '2026-09-01', outcome: 'لصالحنا', ruling: '<script>alert(1)</script>', notes: '', court: '', lawyer: 'محامٍ تجريبي',
  procedures: [{ id: 'p2', date: '2026-09-20', text: 'إعلان الحكم', followup: '2026-10-15' }, { id: 'p1', date: '2026-09-05', text: "استلام <img src=x onerror=alert('x')>" }],
};
const work = [
  { id: 'w1', caseId: 'print-case', title: 'جلسة نظر', kind: 'hearing', dueDate: '2026-10-20', dueTime: '09:00', status: 'open', location: 'المحكمة الكلية' },
  { id: 'w2', caseId: 'print-case', title: 'منتهية', kind: 'task', dueDate: '2026-10-01', dueTime: '', status: 'done', location: '' },
  { id: 'w3', caseId: 'other-case', title: 'قضية أخرى', kind: 'task', dueDate: '2026-10-01', dueTime: '', status: 'open', location: '' },
];
const html = caseSheetHtml(record, [{ label: 'منذ الحكم', value: '40 يوم' }], work, '11/10/2026', 'ui_owner');

assert.ok(!/<script|<img|<b>/i.test(html), 'Case text is escaped, never injected as markup');
assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && html.includes('شركة اختبار &lt;b&gt;') && html.includes('&quot;تجريبي&quot;'));
assert.ok(html.includes('<th>تاريخ الحكم</th><td>01/09/2026</td>'), 'Date-only values print as DD/MM/YYYY without timezone shifts');
assert.ok(!html.includes('<th>المحكمة</th>'), 'Empty fields are omitted');
assert.ok(html.indexOf('05/09/2026') < html.indexOf('20/09/2026'), 'Procedures print in date order');
assert.ok(html.includes('جلسة نظر') && !html.includes('منتهية') && !html.includes('قضية أخرى'), 'Only this case\'s open work is listed');
assert.ok(html.includes('<th>منذ الحكم</th><td>40 يوم</td>') && html.includes('بواسطة ui_owner'));
const money = (minor, currency) => String(minor) + ' ' + currency;
const entry = (id, type, amountMinor, extra = {}) => ({ id, caseId: 'print-case', payload: { type, date: '2026-10-0' + id.slice(-1), currency: 'KWD', amountMinor, reference: 'R-' + id, party: 'موكل <i>تجريبي</i>', notes: '', status: 'posted', voidReason: '', ...extra } });
const receipt = voucherHtml(entry('e1', 'receipt', '1500'), 'TEST-1', money, 'دينار كويتي واحد وخمسمائة فلس', '11/10/2026', '');
assert.ok(receipt.includes('<h1>سند قبض</h1>') && receipt.includes('<th>استلمنا من</th>') && receipt.includes('1500 KWD') && receipt.includes('دينار كويتي واحد'));
assert.ok(!receipt.includes('<i>') && receipt.includes('&lt;i&gt;'), 'Voucher party is escaped');
assert.ok(!receipt.includes('قيد ملغى'));
const voided = voucherHtml(entry('e2', 'expense', '200', { status: 'void', voidReason: 'خطأ <script>' }), '', money, '', '11/10/2026', '');
assert.ok(voided.includes('<h1>سند صرف</h1>') && voided.includes('قيد ملغى — خطأ &lt;script&gt;') && !voided.includes('<th>القضية</th>'), 'Void vouchers are marked; blank case omitted');

const ledger = [entry('e3', 'fee', '10000'), entry('e1', 'receipt', '2500'), entry('e2', 'expense', '750'), entry('e4', 'receipt', '99999', { status: 'void', voidReason: 'مكرر' }), entry('e5', 'fee', '500', { currency: 'USD' })];
const statement = statementHtml(ledger, 'KWD', 'جميع القضايا', id => id === 'print-case' ? 'TEST-1' : 'مكتبي', money, '11/10/2026', 'ui_owner');
assert.ok(statement.includes('3 قيد مرحّل'), 'Void and other-currency entries are excluded');
assert.ok(!statement.includes('99999') && !statement.includes('USD'));
assert.ok(statement.indexOf('R-e1') < statement.indexOf('R-e2') && statement.indexOf('R-e2') < statement.indexOf('R-e3'), 'Statement rows are in date order');
assert.ok(statement.includes('<th colspan="5">الإجمالي</th><td class="amount">10000 KWD</td><td class="amount">2500 KWD</td><td class="amount">750 KWD</td>'), 'Exact totals per column');
assert.ok(statement.includes('(الأتعاب − المقبوضات)</th><td class="amount">7500 KWD</td>') && statement.includes('بعد المصروفات</th><td class="amount">1750 KWD</td>'));
assert.ok(statementHtml([], 'KWD', '', () => '', money, '', '').includes('لا توجد قيود مرحلة'));
console.log('Passed printing: escaped case sheets, ordered procedures and case-only work; escaped vouchers with void marking; currency-specific statements with exact totals excluding void entries.');
