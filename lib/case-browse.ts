import type { CaseRecord } from './domain';
import type { ClientEntity } from './clients';

export type CaseFilters = { search: string; year: string; month: string; code: string; client: string; opponent: string; numberStatus: string; category: string; clientEntityId: string; analysisField:string;analysisValue:string };
export const EMPTY_CASE_FILTERS: CaseFilters = { search: '', year: '', month: '', code: '', client: '', opponent: '', numberStatus: '', category: '', clientEntityId: '', analysisField:'',analysisValue:'' };
const analysisFields=['type','outcome','status','appeal','appealRecorded'];
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
  if (['execution','insurance','telecom'].includes(filters.category || '')) query.set('category', filters.category!);
  if (filters.clientEntityId) query.set('clientId', filters.clientEntityId);
  if (filters.numberStatus === 'missing') query.set('autoNumber', 'missing');
  if(analysisFields.includes(filters.analysisField||'')&&filters.analysisValue){query.set('analysisField',filters.analysisField!);query.set('analysisValue',filters.analysisValue);}
  return query.size ? `#cases?${query}` : '#cases';
}
export function caseLinkFilters(hash: string): Pick<CaseFilters, 'year' | 'month' | 'numberStatus' | 'category' | 'clientEntityId'> & Partial<Pick<CaseFilters,'analysisField'|'analysisValue'>> {
  const [view, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const year = params.get('year') || '';
  const month = params.get('month') || '';
  // Preserve links created before year and month had separate controls.
  const legacy = caseMonthFilters(month);
  const category = ['execution','insurance','telecom'].includes(view) ? view : params.get('category') || '';
  return {
    ...(view==='cases'&&analysisFields.includes(params.get('analysisField')||'')?{analysisField:params.get('analysisField')!,analysisValue:params.get('analysisValue')||''}:{}),
    category: (view === 'cases' || ['execution','insurance','telecom'].includes(view)) && ['execution','insurance','telecom'].includes(category) ? category : '',
    clientEntityId: view === 'cases' ? params.get('clientId') || '' : '',
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
    && (!filters.clientEntityId || record.clientEntityId === filters.clientEntityId)
    && includes(record.code, filters.code)
    && includes(`${record.clientEntityName || ''} ${record.client || ''} ${record.clientGroup || ''}`, filters.client)
    && includes(record.opponent, filters.opponent)
    && includes([record.code, record.autoNumber, record.client, record.clientGroup, record.opponent,
      record.caseNumber, record.lawyer, record.ruling, record.clientEntityName, record.clientContactName, record.casePerson].join(' '), filters.search);
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

// Names only suggest possible overlaps. They never merge entities or clear a legal conflict.
export function partyMatches(records:CaseRecord[],clients:ClientEntity[],query:string) {
 const term=normalizeSearch(query); if(term.length<2)return [];
 const entities=new Map(clients.map(c=>[c.id,c]));
 return records.flatMap(record=>{
  const entity=entities.get(record.clientEntityId||'');
  const candidates:[string,string][]=[['خصم',record.opponent],['موكل',entity?.name||record.clientGroup||record.client],['صيغة أصلية للموكل',record.client],['صيغة أصلية للموكل',record.clientGroup],['شخص معني بالقضية',String(record.casePerson||'')],...(entity?.aliases||[]).map(x=>['صيغة أخرى للموكل',x] as [string,string]),...(entity?.contacts||[]).map(x=>['شخص مرتبط بالموكل',x.name] as [string,string])];
  const seen=new Set<string>(); const matches=candidates.filter(([,name])=>{const key=normalizeSearch(name);if(!key||!key.includes(term)||seen.has(key))return false;seen.add(key);return true}).map(([role,name])=>({role,name}));
  return matches.length?[{record,matches}]:[];
 });
}
