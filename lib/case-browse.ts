import type { CaseRecord } from './domain';

export type CaseFilters = { search: string; year: string; month: string; code: string; client: string; opponent: string; numberStatus: string };
export const EMPTY_CASE_FILTERS: CaseFilters = { search: '', year: '', month: '', code: '', client: '', opponent: '', numberStatus: '' };
export const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

// Search normalization is independent of the legal-rule normalization in domain.ts.
export function normalizeSearch(value: unknown) {
  return String(value ?? '').normalize('NFKC')
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0))
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065Fـ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const validYear = (value: string) => /^\d{4}$/.test(value);
const validMonthNumber = (value: string) => /^(0[1-9]|1[0-2])$/.test(value);
export function caseMonth(date: string) {
  const month = String(date || '').slice(0, 7);
  return validMonth(month) ? month : '';
}
export function monthLabel(month: string) {
  return validMonth(month) ? `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}` : '';
}
export function caseMonthHash(month: string) {
  return caseFiltersHash(caseMonthFilters(month));
}
export function monthFromHash(hash: string) {
  const { year, month } = caseLinkFilters(hash);
  return year && month ? `${year}-${month}` : '';
}
export function caseMonthFilters(month: string): Pick<CaseFilters, 'year' | 'month'> {
  return validMonth(month) ? { year: month.slice(0, 4), month: month.slice(5) } : { year: '', month: '' };
}
export function caseFiltersHash(filters: Partial<CaseFilters>) {
  const query = new URLSearchParams();
  if (filters.year && validYear(filters.year)) query.set('year', filters.year);
  if (filters.month && validMonthNumber(filters.month)) query.set('month', filters.month);
  if (filters.numberStatus === 'missing') query.set('autoNumber', 'missing');
  return query.size ? `#cases?${query}` : '#cases';
}
export function caseLinkFilters(hash: string): Pick<CaseFilters, 'year' | 'month' | 'numberStatus'> {
  const [view, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const year = params.get('year') || '';
  const month = params.get('month') || '';
  // Preserve links created before year and month had separate controls.
  const legacy = caseMonthFilters(month);
  return {
    year: view === 'cases' ? (validYear(year) ? year : legacy.year) : '',
    month: view === 'cases' ? (validMonthNumber(month) ? month : legacy.month) : '',
    numberStatus: view === 'cases' && params.get('autoNumber') === 'missing' ? 'missing' : '',
  };
}
export function needsAutoNumber(record: CaseRecord) {
  return !String(record.autoNumber ?? '').trim();
}

export function matchesCaseFilters(record: CaseRecord, filters: CaseFilters) {
  const includes = (value: unknown, term: string) => normalizeSearch(value).includes(normalizeSearch(term));
  const month = caseMonth(record.date);
  return (!filters.year || month.slice(0, 4) === filters.year)
    && (!filters.month || month.slice(5) === filters.month)
    && (filters.numberStatus !== 'missing' || needsAutoNumber(record))
    && includes(record.code, filters.code)
    && includes(`${record.client || ''} ${record.clientGroup || ''}`, filters.client)
    && includes(record.opponent, filters.opponent)
    && includes([record.code, record.autoNumber, record.client, record.clientGroup, record.opponent,
      record.caseNumber, record.lawyer, record.ruling].join(' '), filters.search);
}

export function monthlyCaseCounts(records: CaseRecord[], year: string) {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.archived) continue;
    const month = caseMonth(record.date);
    if (month) counts.set(month, (counts.get(month) || 0) + 1);
  }
  return MONTH_NAMES.map((month, index) => {
    const key = `${year}-${String(index + 1).padStart(2, '0')}`;
    return { key, month, count: counts.get(key) || 0 };
  });
}
