'use client';
import { useId, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { arSA } from 'react-day-picker/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { dateFromISO, dateToISO } from '@/lib/date-picker';
import { formatDate, todayISO } from '@/lib/domain';
export default function DatePicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false), id = useId();
  const selected = dateFromISO(value), current = dateFromISO(todayISO())!;
  const choose = (date?: Date) => { if (date) { onChange(dateToISO(date)); setOpen(false); } };
  return <div className="field"><span id={id}>{label}</span><div className="date-picker-control">
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
      <button type="button" className="date-picker-button" aria-labelledby={id} aria-label={`${label}: ${formatDate(value)}`}>
        <CalendarDays size={17}/><span dir={selected ? 'ltr' : undefined}>{selected ? formatDate(value) : value || 'اختر التاريخ'}</span>
      </button>
    </PopoverTrigger><PopoverContent className="w-auto p-0 date-popover" align="start" dir="rtl">
      <Calendar mode="single" locale={arSA} dir="rtl" selected={selected} defaultMonth={selected || current}
        onSelect={choose} captionLayout="dropdown" autoFocus
        startMonth={new Date(Math.min(1900, selected?.getFullYear() ?? 1900), 0)}
        endMonth={new Date(Math.max(current.getFullYear() + 20, selected?.getFullYear() ?? 0), 11)}
        formatters={{ formatMonthDropdown: date => date.toLocaleString('ar-KW', { month: 'long' }) }}/>
      <div className="date-picker-footer"><button type="button" className="text-link" onClick={() => choose(current)}>اليوم</button>
        <span>اختر السنة والشهر ثم اليوم</span></div>
    </PopoverContent></Popover>
    {value && <button type="button" className="icon-btn" aria-label={`مسح ${label}`} onClick={() => onChange('')}><X size={15}/></button>}
  </div>{value && !selected && <small className="date-invalid">التاريخ السابق يحتاج مراجعة؛ اختر التاريخ الصحيح من التقويم.</small>}</div>;
}
