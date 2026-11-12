// The app's informative pieces (owner, 12 November 2026: «statistics everywhere … the entire app to be informative no
// matter where I go»): a strip of summary tiles at the head of a page, each a number and how it splits as one bar (a
// tile, or a part of its bar, picks out those records), and the small marks a list line uses to tell its story at a
// glance: a bar of done-of-all or time used, and the steps a case has gone through.
import type React from 'react';

export type Tone = 'green' | 'amber' | 'red' | 'grey' | 'brand' | 'blue';
export type PulsePart = { label: string; value: number; tone: Tone; onClick?: () => void; on?: boolean };

/** How a whole splits, as one bar (each part's share of the total). */
export function StackBar({ parts, label }: { parts: PulsePart[]; label?: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  return <span className="pulse-stack" role="img" aria-label={label || parts.map(p => `${p.label}: ${p.value}`).join('، ')}>
    {total > 0 && parts.filter(p => p.value > 0).map(p => <span key={p.label} className={'t-' + p.tone} style={{ width: (p.value / total * 100) + '%' }}/>)}
  </span>;
}

/**
 * A summary tile: its title and number (pressing them picks out what the tile counts, when it can), the split as one
 * bar, and each part with its number underneath (a part that can be picked out is a button).
 */
export function PulseTile({ title, value, sub, parts, on, onClick, icon }: {
  title: string; value?: number | string; sub?: string; parts: PulsePart[]; on?: boolean; onClick?: () => void; icon?: React.ReactNode;
}) {
  const head = <>{icon}<span className="pulse-title">{title}</span>{value !== undefined && <b className="pulse-value">{typeof value === 'number' ? value.toLocaleString('en') : value}</b>}{sub && <small>{sub}</small>}</>;
  // A tile whose parts pick out records is drawn as a small tree (owner, 12 November 2026: a bar with a legend read as
  // information, not as filters): the title, and a branch to each part as a button with its number and share.
  if (parts.some(p => p.onClick)) {
    const total = parts.reduce((n, p) => n + p.value, 0);
    return <div className={'pulse-tile pulse-tree' + (on ? ' on' : '') + (onClick ? ' can' : '')}>
      {onClick ? <button type="button" className="pulse-head pulse-root" aria-pressed={on} onClick={onClick}>{head}</button> : <div className="pulse-head pulse-root">{head}</div>}
      <ul className="pulse-branches" aria-label={'تصفية حسب ' + title}>{parts.map(p => <li key={p.label}>
        <button type="button" className={'pulse-branch' + (p.on ? ' on' : '')} aria-pressed={!!p.on} disabled={!p.onClick} onClick={p.onClick}
          title={p.onClick ? (p.on ? 'إلغاء التصفية' : 'عرض ' + p.label + ' فقط') : undefined}>
          <i className={'t-' + p.tone} aria-hidden/><span>{p.label}</span><b>{p.value.toLocaleString('en')}</b>
          <em aria-hidden><s className={'t-' + p.tone} style={{ width: (total ? p.value / total * 100 : 0) + '%' }}/></em></button></li>)}</ul>
    </div>;
  }
  return <div className={'pulse-tile' + (on ? ' on' : '') + (onClick ? ' can' : '')}>
    {onClick ? <button type="button" className="pulse-head" aria-pressed={on} onClick={onClick}>{head}</button> : <div className="pulse-head">{head}</div>}
    <StackBar parts={parts} label={title + ': ' + parts.map(p => `${p.label} ${p.value}`).join('، ')}/>
    <div className="pulse-legend">{parts.map(p => {
      const inner = <><i className={'t-' + p.tone} aria-hidden/>{p.label} <b>{p.value.toLocaleString('en')}</b></>;
      return p.onClick ? <button type="button" key={p.label} className={p.on ? 'on' : ''} aria-pressed={!!p.on} onClick={p.onClick}>{inner}</button> : <span key={p.label}>{inner}</span>;
    })}</div>
  </div>;
}

export function PulseStrip({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="pulse-strip" role="group" aria-label={label}>{children}</div>;
}

/** A short bar and its words (time used of a deadline, done of all, collected of owed). */
export function Meter({ pct, tone, label, title }: { pct: number; tone: Tone; label: React.ReactNode; title?: string }) {
  return <span className={'line-meter m-' + tone} title={title}><i aria-hidden><s className={'t-' + tone} style={{ width: Math.max(0, Math.min(100, pct)) + '%' }}/></i><b>{label}</b></span>;
}

/** The steps a record goes through, those passed filled and the one it stands at ringed, with the step's name. */
export function Steps({ steps, at, done }: { steps: readonly string[]; at: number; done?: boolean }) {
  return <span className="line-steps" title={steps.map((s, i) => (i < at || (done && i === at) ? '✓ ' : i === at ? '● ' : '') + s).join(' ← ')}>
    <span className="line-steps-dots" aria-hidden>{steps.map((s, i) => <i key={s} className={i < at || (done && i === at) ? 'done' : i === at ? 'now' : ''}/>)}</span>
    <span className="line-steps-label">{steps[at]}</span>
  </span>;
}

/** A small column per day (the first can be what is late, in red), its number on hover and under it its name. */
export function DayBars({ title, sub, days }: { title: string; sub?: string; days: { label: string; value: number; tone?: Tone; on?: boolean; onClick?: () => void }[] }) {
  const max = Math.max(1, ...days.map(d => d.value));
  return <div className="pulse-tile"><div className="pulse-head"><span className="pulse-title">{title}</span>{sub && <small>{sub}</small>}</div>
    <div className="pulse-days">{days.map((d, i) => {
      const inner = <><b>{d.value || ''}</b><i className={'t-' + (d.tone || 'brand')} style={{ height: Math.max(2, d.value / max * 30) + 'px', opacity: d.value ? 1 : .25 }}/><span>{d.label}</span></>;
      return d.onClick ? <button type="button" key={i} className={d.on ? 'on' : ''} aria-label={`${d.label}: ${d.value}`} onClick={d.onClick}>{inner}</button> : <span key={i} aria-label={`${d.label}: ${d.value}`}>{inner}</span>;
    })}</div></div>;
}
