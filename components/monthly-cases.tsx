'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { AreaChart, Area, XAxis, CartesianGrid, Tooltip } from 'recharts';
import { todayISO, type CaseRecord } from '@/lib/domain';
import { caseMonth, monthlyCaseCounts, monthLabel } from '@/lib/case-browse';
import {SelectList} from './filter-select';

export default function MonthlyCases({ records, onSelectMonth }: { records: CaseRecord[]; onSelectMonth: (month: string) => void }) {
  const currentYear = todayISO().slice(0, 4);
  const [year, setYear] = useState(currentYear);
  const gradientId = useId();
  const years = [...new Set([currentYear, year, ...records.filter(c => !c.archived).map(c => caseMonth(c.date).slice(0, 4)).filter(Boolean)])].sort().reverse();
  const monthly = monthlyCaseCounts(records, year);
  // The chart follows its box's size, read by the browser after layout rather than measured on demand: measuring on
  // demand made the whole overview recalculate several times each time the page was shown again.
  const box = useRef<HTMLDivElement>(null), [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => { const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height); setSize(s => s.w === w && s.h === h ? s : { w, h }); });
    ro.observe(el); return () => ro.disconnect(); }, []);
  return <section className="panel">
    <div className="panel-head"><div><h2>حركة الأحكام</h2><p className="panel-note">اضغط على الشهر لعرض أحكامه</p></div>
      <label className="chart-year"><span>السنة</span><SelectList aria-label="السنة" value={year} onChange={e => setYear(e.target.value)}>{years.map(y => <option key={y} value={y}>{y}</option>)}</SelectList></label>
    </div>
    <div className="panel-body">
      <div className="chart-box monthly-chart" ref={box}><div className="chart-fill">{size.w > 0 && size.h > 0 &&
        <AreaChart width={size.w} height={size.h} data={monthly} margin={{ top: 16, right: 10, bottom: 0, left: 0 }} onClick={event => {
          const index = event.activeTooltipIndex;
          if (index == null || !/^\d+$/.test(String(index))) return;
          const month = monthly[Number(index)];
          if (month) onSelectMonth(month.key);
        }}>
          <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand)" stopOpacity={.22}/><stop offset="100%" stopColor="var(--brand)" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#e8dfd3"/>
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8a7563' }}/>
          <Tooltip contentStyle={{ border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, textAlign: 'right', background: 'var(--popover)', color: 'var(--popover-foreground)' }} formatter={value => [value, 'سجل حكم']}/>
          <Area dataKey="count" type="monotone" stroke="var(--brand)" strokeWidth={2.5} fill={`url(#${gradientId})`} dot={{ r: 3 }} activeDot={{ r: 6 }} animationDuration={500}/>
        </AreaChart>}
      </div></div>
      <div className="month-links" aria-label={`أحكام أشهر سنة ${year}`}>
        {monthly.map(month => <button type="button" key={month.key} className="month-link" onClick={() => onSelectMonth(month.key)}
          aria-label={`عرض أحكام ${monthLabel(month.key)}، ${month.count} سجل`}><span>{month.month}</span><b className="mono">{month.count}</b></button>)}
      </div>
    </div>
  </section>;
}
