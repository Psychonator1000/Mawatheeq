import assert from 'node:assert/strict';
import { caseSheetHtml, voucherHtml, statementHtml, judgmentRollHtml, groupRoll } from '../lib/print.ts';

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

const { payrollHtml, warningLetterHtml } = await import('../lib/print.ts');
const big = BigInt;
const payRow = (name, currency, extra = {}) => ({ employee: { name, employeeNumber: 'E-' + name.length, currency }, scheduledDays: 20, presentDays: 18, absentDays: 2, leaveDays: 0, lateDays: 3, lateMinutes: 75, earlyMinutes: 10, excessMinutes: 25, overtimeMinutes: 0,
  salaryMinor: big(600000), lateDeductionMinor: big(0), absenceDeductionMinor: big(0), overtimePayMinor: big(0), netMinor: big(600000), potentialDeductionMinor: big(41250), warnings: ['غياب 2 يوم <b>'], days: [{ date: '2026-10-11', kind: 'absent', first: null, last: null, lateMinutes: 0, earlyMinutes: 0 }, { date: '2026-10-12', kind: 'present', first: '08:00', last: '16:00', lateMinutes: 0, earlyMinutes: 0 }], ...extra });
const payroll = payrollHtml([payRow('موظف <script>', 'KWD'), payRow('ثاني', 'KWD'), payRow('ثالث', 'USD', { salaryMinor: big(100000), netMinor: big(100000), potentialDeductionMinor: big(0) })], 'أكتوبر 2026', 'warn', money, '11/10/2026', 'ui_owner');
assert.ok(!payroll.includes('<script>') && payroll.includes('موظف &lt;script&gt;'), 'Payroll names are escaped');
assert.ok(payroll.includes('العملة KWD') && payroll.includes('العملة USD') && payroll.includes('1200000 KWD') && payroll.includes('82500 KWD') && payroll.includes('100000 USD'), 'Totals stay separate per currency');
assert.ok(payroll.includes('خصم محتمل (تنبيه فقط)') && payroll.includes('لا تُخصم'), 'Warning mode never presents deductions as applied');
assert.ok(payrollHtml([payRow('a', 'KWD')], 'x', 'deduct', money, '', '').includes('<th>الخصومات</th>'));
const letter = warningLetterHtml(payRow('موظف', 'KWD'), 'أكتوبر 2026', { absent: 'غائب', present: 'حاضر' }, '11/10/2026', '');
assert.ok(letter.includes('11/10/2026') && letter.includes('<td>غائب</td>') && !letter.includes('12/10/2026'), 'Only problem days are listed, dated DD/MM/YYYY');
assert.ok(letter.includes('غياب 2 يوم &lt;b&gt;'), 'Warnings are escaped');
console.log('Passed payroll sheet and warning letter: escaping, per-currency totals, warn vs deduct wording and problem-day listing.');

// «رول الأحكام»: grouped, escaped, numbered across groups, landscape, and no browser header/footer (no page address).
{const row=(n,extra)=>({autoNumber:String(n),code:'C-'+n,client:'موكل',opponent:'خصم',caseNumber:'',level:'',date:'2026-09-0'+n,type:'حكم أول درجة',outcome:'لصالحنا',remaining:'5 يوم',status:'قيد المتابعة',lawyer:'',...extra});
 const rows=[row(1,{lawyer:'سالم'}),row(2,{lawyer:''}),row(3,{lawyer:'سالم',client:'<b>شركة</b>'})];
 const groups=groupRoll(rows,'lawyer');assert.deepEqual(groups.map(([g,l])=>[g,l.length]),[['سالم',2],['غير محدد',1]],'Groups keep order; blanks go last');
 assert.deepEqual(groupRoll(rows,'month').map(([g])=>g),['09/2026']);assert.equal(groupRoll(rows,'')[0][1].length,3);
 const roll=judgmentRollHtml('رول الأحكام','القضايا المحددة',groups,'13/10/2026','ui_owner');
 assert.ok(!roll.includes('<b>شركة') && roll.includes('&lt;b&gt;شركة'),'Roll text is escaped');
 assert.ok(roll.includes('size:A4 landscape;margin:0'),'Landscape with no browser margin, so no page address is printed');
 assert.ok(roll.includes('<td class="nowrap">3</td>') && roll.includes('3 حكم') && roll.includes('<h2>سالم (2)</h2>'),'Numbered across groups with counts');
 assert.ok(!/github/i.test(roll) && !/github/i.test(html),'Printed pages never carry the site address');}
console.log('Passed judgment roll printing.');
