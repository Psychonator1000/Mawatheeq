'use client';
import { useEffect, useId, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clampPage, pageCount, pageNumbers, parsePage } from '@/lib/pagination';

export default function PageNavigation({ page, pages, total, onChange }: {
  page: number; pages: number; total: number; onChange: (page: number) => void;
}) {
  const count = pageCount(pages), current = clampPage(page, count);
  const [jump, setJump] = useState(String(current));
  const [error, setError] = useState('');
  const inputId = useId(), errorId = useId();
  useEffect(() => { setJump(String(current)); setError(''); }, [current, count]);
  return <nav className="pagination" aria-label="صفحات السجلات">
    <span className="page-summary" aria-live="polite">{total} سجل • الصفحة <span className="mono">{current} / {count}</span></span>
    <div className="page-controls">
      <div className="page-buttons">
        <button type="button" className="btn" disabled={current === 1} onClick={() => onChange(current - 1)} aria-label="الصفحة السابقة"><ChevronRight size={16}/><span>السابق</span></button>
        {pageNumbers(current, count).map((number, index) => number === 'gap'
          ? <span className="page-gap" key={`gap-${index}`} aria-hidden="true">…</span>
          : <button type="button" className={`btn page-number ${number === current ? 'primary' : ''}`} key={number}
              aria-label={`الصفحة ${number}`} aria-current={number === current ? 'page' : undefined}
              onClick={() => onChange(number)}><span className="mono">{number}</span></button>)}
        <button type="button" className="btn" disabled={current === count} onClick={() => onChange(current + 1)} aria-label="الصفحة التالية"><span>التالي</span><ChevronLeft size={16}/></button>
      </div>
      <form className="page-jump" onSubmit={event => {
        event.preventDefault();
        const next = parsePage(jump, count);
        if (next === null) { setError(`اختر صفحة من 1 إلى ${count}`); return; }
        setError(''); setJump(String(next)); onChange(next);
      }}>
        <label htmlFor={inputId}>انتقل إلى صفحة</label>
        <input id={inputId} type="text" inputMode="numeric" dir="ltr" value={jump} autoComplete="off"
          aria-label="رقم الصفحة" aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
          onChange={event => { setJump(event.target.value); setError(''); }}/>
        <button className="btn" type="submit">انتقل</button>
        {error && <span id={errorId} className="page-error" role="alert">{error}</span>}
      </form>
    </div>
  </nav>;
}
