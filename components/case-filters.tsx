'use client';
import { normalizeSearch } from '@/lib/case-browse';
import { useId, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { ClientEntity } from '@/lib/clients';
import type { CaseRecord } from '@/lib/domain';
import { caseMonth, fileStatusOf, MONTH_NAMES, type CaseFilters } from '@/lib/case-browse';
import {SelectList} from './filter-select';
import {arCompare,arNumericCompare} from '@/lib/domain';

const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => arNumericCompare(a, b));
// The lists behind the filter fields, worked out once per list of cases: the bar is rebuilt on every page switch,
// and sorting thousands of codes and names each time held the switch up.
const optionCache = new WeakMap<CaseRecord[], { years: string[]; codes: string[]; opponents: string[] }>();
export function baseOptions(records: CaseRecord[]) {
  let o = optionCache.get(records);
  if (!o) { o = { years: unique(records.map(c => caseMonth(c.date).slice(0, 4))).reverse(), codes: unique(records.map(c => c.code)), opponents: unique(records.map(c => c.opponent)) }; optionCache.set(records, o); }
  return o;
}
export default function CaseFilterFields({ records, clients, filters, onChange, onClear, hasFilters, total }: {
  records: CaseRecord[]; clients: ClientEntity[]; filters: CaseFilters; onChange: (key: keyof CaseFilters, value: string) => void;
  onClear: () => void; hasFilters: boolean; total: number;
}) {
  const opponentList = useId(), codeList = useId();
  // The detailed fields fold away until asked for, and stay open while one of them is set.
  const [open, setOpen] = useState(false), set = [filters.year, filters.month, filters.code, filters.clientEntityId, filters.opponent, filters.lawyerSet, filters.fileStatus].filter(Boolean).length;
  const options = useMemo(() => { const base = baseOptions(records);
    return filters.year && !base.years.includes(filters.year) ? { ...base, years: unique([...base.years, filters.year]).reverse() } : base; }, [records, filters.year]);
  // Typing suggestions: only the entries matching what is typed (at most 30). Listing every code and opponent put
  // some 14,000 hidden elements on the page, which the browser restyled on every click.
  const hints = (values: string[], typed: string) => { const t = normalizeSearch(typed); if (!t) return []; const out: string[] = [];
    for (const v of values) { if (normalizeSearch(v).includes(t)) { out.push(v); if (out.length >= 30) break; } } return out; };
  // The lawyer and file-status choices with how many cases each holds, busiest status first (owner, 12 November 2026:
  // «a section here for missing lawyer, and another for all these statuses»).
  const counts = useMemo(() => { const st = new Map<string, number>(); let none = 0;
    for (const c of records) { if (!String(c.lawyer ?? '').trim()) none++; const k = fileStatusOf(c) || '-'; st.set(k, (st.get(k) || 0) + 1); }
    return { none, set: records.length - none, statuses: [...st.entries()].sort((a, b) => b[1] - a[1]) }; }, [records]);
  const codeHints = useMemo(() => hints(options.codes, filters.code), [options.codes, filters.code]);
  const opponentHints = useMemo(() => hints(options.opponents, filters.opponent), [options.opponents, filters.opponent]);
  // The client choices, sorted and with same-named files told apart, once per change of the client list.
  const clientOptions = useMemo(() => { const named = new Map<string, number>(); for (const c of clients) named.set(c.name, (named.get(c.name) || 0) + 1);
    return [...clients].sort((a, b) => arCompare(a.name, b.name)).map(c => ({ id: c.id, label: c.name + ((named.get(c.name) || 0) > 1 ? ' · ' + c.id.slice(0, 8) : '') })); }, [clients]);
  return <div className="case-filters">
    {(open || set > 0) && <div className="case-filter-grid">
      <label className="field"><span>سنة الحكم</span><SelectList aria-label="سنة الحكم" value={filters.year} onChange={e => onChange('year', e.target.value)}>
        <option value="">كل السنوات</option>{options.years.map(year => <option key={year} value={year}>{year}</option>)}
      </SelectList></label>
      <label className="field"><span>شهر الحكم</span><SelectList aria-label="شهر الحكم" value={filters.month} onChange={e => onChange('month', e.target.value)}>
        <option value="">كل الأشهر</option>{MONTH_NAMES.map((month, index) => <option key={month} value={String(index + 1).padStart(2, '0')}>{month}</option>)}
      </SelectList></label>
      <label className="field"><span>الكود</span><input value={filters.code} list={codeList} placeholder="الكود أو جزء منه" onChange={e => onChange('code', e.target.value)}/></label>
      <label className="field"><span>الموكل / الجهة</span><SelectList aria-label="الموكل / الجهة" value={filters.clientEntityId} onChange={e => onChange('clientEntityId',e.target.value)}><option value="">كل الموكلين</option>{clientOptions.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</SelectList></label>
      <label className="field"><span>الخصم</span><input value={filters.opponent} list={opponentList} placeholder="اسم الخصم أو جزء منه" onChange={e => onChange('opponent', e.target.value)}/></label>
      <label className="field"><span>المحامي</span><SelectList aria-label="المحامي المسجل" value={filters.lawyerSet || ''} onChange={e => onChange('lawyerSet', e.target.value)}>
        <option value="">الكل</option><option value="none">بلا محامٍ ({counts.none})</option><option value="set">مسجل لها محامٍ ({counts.set})</option></SelectList></label>
      <label className="field"><span>حالة الملف</span><SelectList aria-label="حالة الملف" value={filters.fileStatus || ''} onChange={e => onChange('fileStatus', e.target.value)}>
        <option value="">كل الحالات</option>{counts.statuses.map(([k, n]) => <option key={k} value={k}>{k === '-' ? 'بلا حالة' : k} ({n})</option>)}</SelectList></label>
    </div>}
    <datalist id={codeList}>{codeHints.map(value => <option key={value} value={value}/>)}</datalist>
    <datalist id={opponentList}>{opponentHints.map(value => <option key={value} value={value}/>)}</datalist>
    <div className="case-filter-summary"><div className="actions">
      <button type="button" className={'btn more-filters' + (set ? ' on' : '')} aria-expanded={open || set > 0} onClick={() => setOpen(o => !o)}>تصفية متقدمة{set ? ` (${set})` : ''}</button>
      {filters.numberStatus === 'missing' && <button type="button" className="tag amber" onClick={() => onChange('numberStatus', '')}
        aria-label="إلغاء تصفية الأرقام الآلية الناقصة">أرقام آلية تحتاج استكمال <X size={14}/></button>}
      <span aria-live="polite">{hasFilters ? `${total} سجل مطابق للتصفية` : 'يمكن الجمع بين عوامل التصفية'}</span></div>
      {hasFilters && <button type="button" className="text-link" onClick={onClear}>مسح عوامل التصفية</button>}
    </div>
  </div>;
}
