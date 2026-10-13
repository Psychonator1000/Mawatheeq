import assert from 'node:assert/strict';
import { emptyCase } from '../lib/domain.ts';
import { EMPTY_CASE_FILTERS, matchesCaseFilters, monthlyCaseCounts, caseMonthHash, monthFromHash, monthLabel, caseFiltersHash, caseLinkFilters, caseMonthFilters, needsAutoNumber, sortCases, DEFAULT_CASE_SORT } from '../lib/case-browse.ts';
import { suggestions, weekdayOf, CLIENT_ROLES } from '../lib/choices.ts';
import { fils, kwd, position, dueStatements, FILE_STATUSES, mapLegacy, ALL_FILE_STATUSES } from '../lib/collections.ts';
import { custodyOf, isOverdue, nextNumber, code39, code39Ready, code39Svg, daysBetween, MOVEMENTS } from '../lib/archive.ts';
import { clampPage, pageNumbers, parsePage } from '../lib/pagination.ts';

const fixture = (id, fields) => ({ ...emptyCase(), id, ...fields });
const records = [
  fixture('current', { code: '1050', autoNumber: '009900', date: '2026-09-05', client: 'أحمد', clientGroup: 'شركة الأمان', opponent: 'مُحَمَّد' }),
  fixture('previous-year', { code: '1050', date: '2025-09-05', client: 'أحمد', opponent: 'محمد' }),
  fixture('different-opponent', { code: '1051', date: '2026-09-18', client: 'شركة الأمان', opponent: 'خالد' }),
  fixture('december', { code: '2000', date: '2026-12-01', client: 'Example Company', opponent: 'شخص تجريبي' }),
  fixture('no-date', { code: '0001', autoNumber: '1050' }),
  fixture('archived', { date: '2026-09-05', archived: true }),
];
const find = filters => records.filter(c => !c.archived && matchesCaseFilters(c, { ...EMPTY_CASE_FILTERS, ...filters })).map(c => c.id);
assert.deepEqual(find({ year: '2026', month: '09' }), ['current', 'different-opponent']);
assert.deepEqual(find({ year: '2025', month: '09' }), ['previous-year']);
assert.deepEqual(find({ year: '2026', month: '09', code: '١٠٥٠', client: 'الامان', opponent: 'محمد' }), ['current']);
assert.deepEqual(find({ code: '۱۰۵۰' }), ['current', 'previous-year']);
assert.deepEqual(find({ code: '105' }), ['current', 'previous-year', 'different-opponent']);
assert.deepEqual(find({ search: '٠٠٩٩٠٠' }), ['current']);
assert.deepEqual(find({ code: '009900' }), []); // The dedicated code filter must not search the automatic number.
assert.deepEqual(find({ client: 'EXAMPLE' }), ['december']);
assert.deepEqual(find({ client: 'محمد' }), []); // Opponents must not match the client field.
assert.deepEqual(find({ opponent: 'أحمد' }), []);
assert.deepEqual(find({ year: '2026', month: '01' }), []);
assert.equal(find({}).length, 5);
assert.deepEqual(find({ year: '2026' }), ['current', 'different-opponent', 'december']);
assert.deepEqual(find({ year: '2025' }), ['previous-year']);
assert.deepEqual(find({ month: '09' }), ['current', 'previous-year', 'different-opponent']);
assert.deepEqual(find({ month: '12' }), ['december']);
assert.deepEqual(find({ year: '2025', month: '12' }), []);
assert.deepEqual(find({ year: '2026', month: '09', numberStatus: 'missing' }), ['different-opponent']);
assert.deepEqual(caseMonthFilters('2026-09'), { year: '2026', month: '09' });
for (const filters of [{ year: '2026' }, { month: '09' }, { year: '2026', month: '09' }, { year: '2026', month: '09', numberStatus: 'missing' }]) {
  assert.deepEqual(find(caseLinkFilters(caseFiltersHash(filters))), find(filters), 'Date filters must survive refresh, separately or together');
}
assert.equal(caseFiltersHash({ year: '2026' }), '#cases?year=2026');
assert.equal(caseFiltersHash({ month: '09' }), '#cases?month=09');
assert.equal(caseFiltersHash({ year: '2026', month: '09' }), '#cases?year=2026&month=09');
assert.deepEqual(caseLinkFilters('#cases?month=2026-09'), { year: '2026', month: '09', numberStatus: '', category: '', clientEntityId: '' });
assert.deepEqual(find(caseLinkFilters('#cases?month=2026-09')), ['current', 'different-opponent']);
assert.deepEqual(find(caseLinkFilters('#cases?month=2026-09&autoNumber=missing')), ['different-opponent']);
assert.deepEqual(caseLinkFilters('#cases?year=invalid&month=13'), { year: '', month: '', numberStatus: '', category: '', clientEntityId: '' });
assert.deepEqual(caseLinkFilters('#overview?year=2026&month=09'), { year: '', month: '', numberStatus: '', category: '', clientEntityId: '' });


for (const year of ['2025', '2026']) {
  const months = monthlyCaseCounts(records, year);
  assert.equal(months.length, 12);
  for (const month of months) {
    const linkedMonth = monthFromHash(caseMonthHash(month.key));
    assert.equal(linkedMonth, month.key);
    assert.equal(find(caseMonthFilters(linkedMonth)).length, month.count, 'Every chart count must match its linked case list');
  }
}
assert.equal(monthLabel('2026-09'), 'سبتمبر 2026');
assert.equal(monthFromHash('#cases?month=2026-13'), '');
assert.equal(monthFromHash('#overview?month=2026-09'), '');
assert.equal(monthFromHash('#cases'), '');
assert.equal(caseMonthHash('invalid'), '#cases');

// A statistics drill-down must agree with the card count, survive refresh,
// combine with month filters, and disappear when filters are cleared.
const missingLink = caseFiltersHash({ numberStatus: 'missing' });
assert.equal(missingLink, '#cases?autoNumber=missing');
assert.deepEqual(find(caseLinkFilters(missingLink)), ['previous-year', 'different-opponent', 'december']);
assert.equal(find(caseLinkFilters(missingLink)).length, records.filter(c => !c.archived && needsAutoNumber(c)).length);
const combinedLink = caseFiltersHash({ year: '2026', month: '09', numberStatus: 'missing' });
assert.deepEqual(find(caseLinkFilters(combinedLink)), ['different-opponent']);
assert.equal(caseFiltersHash(EMPTY_CASE_FILTERS), '#cases');
assert.equal(find(caseLinkFilters('#cases')).length, 5);
assert.equal(caseLinkFilters('#insurance?autoNumber=missing').numberStatus, '');
assert.equal(caseLinkFilters('#cases?autoNumber=anything').numberStatus, '');
assert.equal(needsAutoNumber(fixture('whitespace', { autoNumber: '  ' })), true);
assert.equal(needsAutoNumber(fixture('leading-zero', { autoNumber: '000123' })), false);
assert.equal(needsAutoNumber(fixture('zero', { autoNumber: '0' })), false);

assert.deepEqual(pageNumbers(1, 1), [1]);
assert.deepEqual(pageNumbers(1, 40), [1, 2, 3, 4, 5, 'gap', 40]);
assert.deepEqual(pageNumbers(20, 40), [1, 'gap', 18, 19, 20, 21, 22, 'gap', 40]);
assert.deepEqual(pageNumbers(40, 40), [1, 'gap', 36, 37, 38, 39, 40]);
assert.equal(parsePage(' ٢٧ ', 40), 27);
assert.equal(parsePage('۳۹', 40), 39);
for (const invalid of ['', '0', '41', '-2', '2.5', '1e1', 'abc', '٤١']) assert.equal(parsePage(invalid, 40), null);
assert.equal(clampPage(40, 2), 2); // A filter or a refresh shrinks the list.
assert.equal(clampPage(1, 0), 1); // Empty results keep a valid first page.
const many = Array.from({ length: 800 }, (_, n) => n + 1);
assert.deepEqual(many.slice((parsePage('٢٧', 40) - 1) * 20, parsePage('٢٧', 40) * 20), Array.from({ length: 20 }, (_, n) => 521 + n));
console.log('Passed: independent year/month filters, legacy date links, combined Arabic filters, chart-to-list counts, missing-number links, numbered pages and Arabic jumps.');

// A representative does not determine entity identity; matching IDs do.
records[0].clientEntityId='entity-a'; records[1].clientEntityId='entity-b';
records[0].clientEntityName='شركة جديدة'; records[0].clientContactName='موظف اختبار';
assert.deepEqual(find({clientEntityId:'entity-a'}),['current']);
assert.deepEqual(find({clientEntityId:'entity-b'}),['previous-year']);
assert.deepEqual(find({client:'جديدة'}),['current']);
assert.deepEqual(find({search:'موظف اختبار'}),['current']);
assert.equal(caseLinkFilters('#execution').category,'execution');
assert.equal(caseLinkFilters('#insurance').category,'insurance');
assert.equal(caseLinkFilters('#cases?category=invalid').category,'');
const entityLink=caseLinkFilters(caseFiltersHash({category:'telecom',clientEntityId:'entity-a',month:'09'}));
assert.equal(entityLink.category,'telecom'); assert.equal(entityLink.clientEntityId,'entity-a'); assert.equal(entityLink.month,'09');

// Column sorting: empty values last in both directions, numbers numerically, ties newest first.
{const mk=(id,extra)=>({...emptyCase(),id,...extra});
 const rows=[mk('a',{autoNumber:'900',client:'بنك',lawyer:'سالم',date:'2026-01-01'}),mk('b',{autoNumber:'1000',client:'أمانة',lawyer:'',date:'2026-03-01'}),mk('c',{autoNumber:'',client:'',lawyer:'أحمد',date:'2026-02-01'})];
 const ids=(sort,rem)=>sortCases(rows,sort,rem).map(c=>c.id).join('');
 assert.equal(ids(DEFAULT_CASE_SORT),'bca','Default: newest judgment first');
 assert.equal(ids({key:'number',dir:1}),'abc','Auto numbers sort numerically; empty last');
 assert.equal(ids({key:'number',dir:-1}),'bac','Empty stays last when descending');
 assert.equal(ids({key:'lawyer',dir:1}),'cab');
 const rem={a:-40,b:3,c:null};assert.equal(ids({key:'remaining',dir:1},c=>rem[c.id]),'abc','Unknown remaining days go last');
 assert.equal(rows.map(c=>c.id).join(''),'abc','The input list is not reordered');}

// Typing suggestions and fixed choices.
assert.deepEqual(suggestions([{v:' بنك  الكويت '},{v:'شركة'},{v:'بنك الكويت'},{v:''}],r=>r.v,['شركة']),['شركة','بنك الكويت'],'Base list first, then used values by frequency, spaces squashed, no blanks or duplicates');
assert.equal(weekdayOf('2026-10-13'),'الثلاثاء','Weekday from a date-only value without timezone shifts');assert.equal(weekdayOf(''),'');
assert.ok(CLIENT_ROLES.includes('مدعي')&&CLIENT_ROLES.includes('مدعى عليه'));
console.log('Passed choices: suggestions and weekdays.');

// Collections money in exact fils and the file's financial position.
assert.equal(fils('153.75'),153750);assert.equal(fils('0.001'),1);assert.equal(fils('1.2345'),0,'More than three decimals is rejected');assert.equal(kwd(153750),'153.750');assert.equal(kwd(-5),'-0.005');
{const pos=position({amount:'150',orderFee:'3.75'},[{type:'payment',amount:'50.5',status:'posted'},{type:'external',amount:'10',status:'posted'},{type:'expense',amount:'2.25',status:'posted'},{type:'payment',amount:'99',status:'void'}]);
 assert.deepEqual(pos,{claim:150000,fee:3750,total:153750,paid:60500,external:10000,expenses:2250,remaining:93250,net:58250},'Cancelled payments do not count');}
assert.deepEqual(dueStatements([{payload:{status:'notDone',reviewDate:'2026-10-13'}},{payload:{status:'done',reviewDate:'2026-10-01'}},{payload:{status:'postponed',reviewDate:'2026-10-20'}},{payload:{status:'postponed',reviewDate:'2026-10-01'},archived:true}],'2026-10-13').length,1);
assert.ok(FILE_STATUSES.includes('تحصيل ودي'));

// Archive custody: the latest posted movement decides; cancelled ones are skipped; locations carry forward.
{
  const file = { id: 'f1', payload: { locationId: 'L1', intakeDate: '2026-10-01', number: 'ARC-00007' } };
  const mv = (id, at, p) => ({ id, subjectId: 'f1', createdAt: at, revision: 1, payload: { holder: '', holderId: '', purpose: '', dueDate: '', locationId: '', notes: '', status: 'posted', voidReason: '', ...p } });
  assert.deepEqual([custodyOf(file, []).state, custodyOf(file, []).locationId], ['in', 'L1']);
  const log = [mv('a', '2026-10-02T08:00:00Z', { type: 'checkout', date: '2026-10-02', holder: 'محامٍ', dueDate: '2026-10-04', fromState: 'in', toState: 'staff' }),
    mv('b', '2026-10-03T08:00:00Z', { type: 'return', date: '2026-10-03', locationId: 'L2', fromState: 'staff', toState: 'in' }),
    mv('c', '2026-10-05T08:00:00Z', { type: 'court', date: '2026-10-05', holder: 'إدارة الخبراء', dueDate: '2026-10-06', fromState: 'in', toState: 'court', status: 'void' }),
    mv('d', '2026-10-06T08:00:00Z', { type: 'audit', date: '2026-10-06', locationId: 'L2', fromState: 'in', toState: 'in' })];
  const c = custodyOf(file, [...log].reverse());
  assert.equal(c.state, 'in'); assert.equal(c.locationId, 'L2'); assert.equal(c.lastAudit, '2026-10-06'); assert.equal(c.holder, ''); assert.equal(c.last.id, 'd', 'Order follows the server record time, not the list order');
  const out = custodyOf(file, log.slice(0, 1));
  assert.equal(out.state, 'staff'); assert.equal(out.holder, 'محامٍ'); assert.equal(isOverdue(out, '2026-10-05'), true); assert.equal(isOverdue(out, '2026-10-04'), false);
  assert.equal(daysBetween('2026-10-04', '2026-10-05'), 1); assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2, 'No timezone drift'); assert.equal(daysBetween('', '2026-10-05'), 0);
  assert.deepEqual(MOVEMENTS.return.from, ['staff', 'court', 'client']); assert.deepEqual(MOVEMENTS.checkout.from, ['in']);
  assert.equal(nextNumber([file, { payload: { number: 'arc-00012' } }, { payload: { number: 'X-99' } }]), 'ARC-00013'); assert.equal(nextNumber([]), 'ARC-00001');
  // Code 39 «A» is 100001001: wide bar, then narrow elements, framed by «*» start/stop and narrow gaps.
  assert.deepEqual(code39('A').slice(10, 19), [3, 1, 1, 1, 1, 3, 1, 1, 3]); assert.equal(code39('ARC-1').length, 7 * 10 - 1);
  assert.equal(code39Ready('ARC-00001'), true); assert.equal(code39Ready('ملف'), false); assert.equal(code39Ready('A*B'), false);
  assert.throws(() => code39('ب')); assert.match(code39Svg('ARC-1'), /^<svg[^>]+viewBox="0 0 [\d.]+ 34"/);
}

{
  // export mapping, on synthetic rows: customer number, statuses kept, empty markers dropped, court number only when numeric.
  const header = ['إسم الموكل', 'رقم الملف', 'إسم الخصم', 'حالة الملف', 'سبب المديونية', 'قيمة المطالبة', 'رقم العقد', 'الرقم الآلى - ملف', 'ترقيم 1', 'ترقيم 4', 'تاريخ الورود', 'رقم الهوية - الخصم', 'عنوان المنزل - الخصم', 'ملاحظات 1', 'ملاحظات 2', 'الجنسية - الخصم', 'الوظيفة - الخصم', 'المنطقة', 'القطعة', 'إجمالى المدفوعات', 'إجمالى المصروفات'];
  const files = mapLegacy(header, [
    ['شركة تجريبية', 1001, 'SYNTHETIC PERSON', 'سوفت', '50000001', 177.8, 'C-1', 'هولد', 'بدون', '0', '2026-10-03', '200000000001', 'منطقة تجريبية', 'فارغ', 'null', 'TESTLAND', 'خارج البلاد', '', '', 68.9, 0],
    ['شركة تجريبية', 1002, 'SECOND PERSON', 'حالة أخرى', '50000002', '1,004.61', 'C-2', '261234560', 'SA', '60000000', '', '', '', 'م', '', '', '', 'الأولى', '3', 0, 12],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ], v => String(v));
  assert.equal(files.length, 2, 'Rows without a file number are skipped');
  const [a, b] = files;
  assert.equal(a.payload.code, '1001'); assert.equal(a.payload.customerId, '50000001', 'سبب المديونية is the customer number at the client');
  assert.equal(a.payload.fileStatus, 'سوفت'); assert.ok(ALL_FILE_STATUSES.includes('تحت الرفع'));
  assert.equal(a.payload.amount, '177.8'); assert.equal(a.paid, '68.9'); assert.equal(a.expenses, '');
  assert.equal(a.payload.tag1, '', 'بدون is empty'); assert.equal(a.payload.tag4, ''); assert.equal(a.payload.notes, '', 'فارغ and null are empty');
  assert.equal(a.payload.fileAutoNumber, 'هولد'); assert.equal(a.autoNumber, '', 'Only a numeric court number links a case');
  assert.equal(b.autoNumber, '261234560'); assert.equal(b.payload.amount, '1004.61'); assert.equal(b.payload.fileStatus, '');
  assert.match(b.payload.notes, /حالة سابقة: حالة أخرى/, 'Unknown statuses are kept in the notes'); assert.equal(b.payload.address2, 'المنطقة الأولى، قطعة 3');
  assert.throws(() => mapLegacy(['x'], [], String), /رقم الملف/);
}
console.log('Passed archive custody (latest posted movement, cancelled skipped, overdue, Code 39); collections money, import mapping and follow-up helpers.');
