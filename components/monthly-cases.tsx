'use client';
import { useId, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, CartesianGrid, Tooltip } from 'recharts';
import { todayISO, type CaseRecord } from '@/lib/domain';
import { caseMonth, monthlyCaseCounts, monthLabel } from '@/lib/case-browse';

export default function MonthlyCases({ records, onSelectMonth }: { records: CaseRecord[]; onSelectMonth: (month: string) => void }) {
  const currentYear = todayISO().slice(0, 4);
  const [year, setYear] = useState(currentYear);
  const gradientId = useId();
  const years = [...new Set([currentYear, year, ...records.filter(c => !c.archived).map(c => caseMonth(c.date).slice(0, 4)).filter(Boolean)])].sort().reverse();
  const monthly = monthlyCaseCounts(records, year);
  return <section className="panel">
    <div className="panel-head"><div><h2>حركة الأحكام</h2><p className="panel-note">اضغط على الشهر لعرض أحكامه</p></div>
      <label className="chart-year"><span>السنة</span><select value={year} onChange={e => setYear(e.target.value)}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
    </div>
    <div className="panel-body">
      <div className="chart-box monthly-chart"><ResponsiveContainer width="100%" height="100%">
        <AreaChart data={monthly} margin={{ top: 16, right: 10, bottom: 0, left: 0 }} onClick={event => {
          const index = event.activeTooltipIndex;
          if (index == null || !/^\d+$/.test(String(index))) return;
          const month = monthly[Number(index)];
          if (month) onSelectMonth(month.key);
        }}>
          <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#843446" stopOpacity={.22}/><stop offset="100%" stopColor="#843446" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#e8dfd3"/>
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8a7563' }}/>
          <Tooltip contentStyle={{ border: '1px solid #e3d6c5', borderRadius: 10, fontSize: 13, textAlign: 'right' }} formatter={value => [value, 'سجل حكم']}/>
          <Area dataKey="count" type="monotone" stroke="#843446" strokeWidth={2.5} fill={`url(#${gradientId})`} dot={{ r: 3 }} activeDot={{ r: 6 }} animationDuration={500}/>
        </AreaChart>
      </ResponsiveContainer></div>
      <div className="month-links" aria-label={`أحكام أشهر سنة ${year}`}>
        {monthly.map(month => <button type="button" key={month.key} className="month-link" onClick={() => onSelectMonth(month.key)}
          aria-label={`عرض أحكام ${monthLabel(month.key)}، ${month.count} سجل`}><span>{month.month}</span><b className="mono">{month.count}</b></button>)}
      </div>
    </div>
  </section>;
}
