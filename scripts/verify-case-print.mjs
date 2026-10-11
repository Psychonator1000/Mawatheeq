import assert from 'node:assert/strict';
import { caseSheetHtml } from '../lib/case-print.ts';

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
console.log('Passed case sheet: escaped case text, date-only formatting, omitted blanks, ordered procedures, open work for this case only and print footer.');
