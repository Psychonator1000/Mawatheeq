'use client';
import { useId, useMemo } from 'react';
import { X } from 'lucide-react';
import type { CaseRecord } from '@/lib/domain';
import { caseMonth, MONTH_NAMES, type CaseFilters } from '@/lib/case-browse';

export default function CaseFilterFields({ records, filters, onChange, onClear, hasFilters, total }: {
  records: CaseRecord[]; filters: CaseFilters; onChange: (key: keyof CaseFilters, value: string) => void;
  onClear: () => void; hasFilters: boolean; total: number;
}) {
  const clientList = useId(), opponentList = useId(), codeList = useId();
  const options = useMemo(() => {
    const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }));
    return {
      years: unique([...records.map(c => caseMonth(c.date).slice(0, 4)), filters.year]).reverse(),
      codes: unique(records.map(c => c.code)),
      clients: unique(records.flatMap(c => [c.client, c.clientGroup])),
      opponents: unique(records.map(c => c.opponent)),
    };
  }, [records, filters.year]);
  return <div className="case-filters">
    <div className="case-filter-grid">
      <label className="field"><span>سنة الحكم</span><select value={filters.year} onChange={e => onChange('year', e.target.value)}>
        <option value="">كل السنوات</option>{options.years.map(year => <option key={year} value={year}>{year}</option>)}
      </select></label>
      <label className="field"><span>شهر الحكم</span><select value={filters.month} onChange={e => onChange('month', e.target.value)}>
        <option value="">كل الأشهر</option>{MONTH_NAMES.map((month, index) => <option key={month} value={String(index + 1).padStart(2, '0')}>{month}</option>)}
      </select></label>
      <label className="field"><span>الكود</span><input value={filters.code} list={codeList} placeholder="الكود أو جزء منه" onChange={e => onChange('code', e.target.value)}/></label>
      <label className="field"><span>الموكل</span><input value={filters.client} list={clientList} placeholder="اسم الموكل أو مجموعته" onChange={e => onChange('client', e.target.value)}/></label>
      <label className="field"><span>الخصم</span><input value={filters.opponent} list={opponentList} placeholder="اسم الخصم أو جزء منه" onChange={e => onChange('opponent', e.target.value)}/></label>
    </div>
    <datalist id={codeList}>{options.codes.map(value => <option key={value} value={value}/>)}</datalist>
    <datalist id={clientList}>{options.clients.map(value => <option key={value} value={value}/>)}</datalist>
    <datalist id={opponentList}>{options.opponents.map(value => <option key={value} value={value}/>)}</datalist>
    <div className="case-filter-summary"><div className="actions">
      {filters.numberStatus === 'missing' && <button type="button" className="tag amber" onClick={() => onChange('numberStatus', '')}
        aria-label="إلغاء تصفية الأرقام الآلية الناقصة">أرقام آلية تحتاج استكمال <X size={14}/></button>}
      <span aria-live="polite">{hasFilters ? `${total} سجل مطابق للتصفية` : 'يمكن الجمع بين عوامل التصفية'}</span></div>
      {hasFilters && <button type="button" className="text-link" onClick={onClear}>مسح عوامل التصفية</button>}
    </div>
  </div>;
}
