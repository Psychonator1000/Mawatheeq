import assert from 'node:assert/strict';
import { emptyCase } from '../lib/domain.ts';
import { EMPTY_CASE_FILTERS, matchesCaseFilters, monthlyCaseCounts, caseMonthHash, monthFromHash, monthLabel, caseFiltersHash, caseLinkFilters, caseMonthFilters, needsAutoNumber } from '../lib/case-browse.ts';
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
assert.deepEqual(caseLinkFilters('#cases?month=2026-09'), { year: '2026', month: '09', numberStatus: '' });
assert.deepEqual(find(caseLinkFilters('#cases?month=2026-09')), ['current', 'different-opponent']);
assert.deepEqual(find(caseLinkFilters('#cases?month=2026-09&autoNumber=missing')), ['different-opponent']);
assert.deepEqual(caseLinkFilters('#cases?year=invalid&month=13'), { year: '', month: '', numberStatus: '' });
assert.deepEqual(caseLinkFilters('#overview?year=2026&month=09'), { year: '', month: '', numberStatus: '' });


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
