import type { CaseRecord } from './domain';

export type CaseFilters = { search: string; month: string; code: string; client: string; opponent: string };
export const EMPTY_CASE_FILTERS: CaseFilters = { search: '', month: '', code: '', client: '', opponent: '' };
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
export function caseMonth(date: string) {
  const month = String(date || '').slice(0, 7);
  return validMonth(month) ? month : '';
}
export function monthLabel(month: string) {
  return validMonth(month) ? `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}` : '';
}
export function caseMonthHash(month: string) {
  return validMonth(month) ? `#cases?month=${month}` : '#cases';
}
export function monthFromHash(hash: string) {
  const [view, query = ''] = hash.replace(/^#/, '').split('?');
  const month = new URLSearchParams(query).get('month') || '';
  return view === 'cases' && validMonth(month) ? month : '';
}

export function matchesCaseFilters(record: CaseRecord, filters: CaseFilters) {
  const includes = (value: unknown, term: string) => normalizeSearch(value).includes(normalizeSearch(term));
  return (!filters.month || caseMonth(record.date) === filters.month)
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
