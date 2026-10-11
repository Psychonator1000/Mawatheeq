import {useState} from 'react';
import {Bell,AlertCircle,Clock3,CalendarDays} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './ui/popover';
import type {Notice} from '@/lib/notifications';

const icons={danger:AlertCircle,warning:Clock3,info:CalendarDays};
export default function NotificationBell({notices,onOpen}:{notices:Notice[];onOpen:(notice:Notice)=>void}) {
 const [open,setOpen]=useState(false);
 const urgent=notices.filter(n=>n.tone!=='info').length;
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button className="icon-btn notice-trigger" aria-label={notices.length?`التنبيهات: ${notices.length}`:'التنبيهات'}><Bell/>{notices.length>0&&<span className={'notice-count '+(urgent?'urgent':'')} aria-hidden="true">{notices.length>99?'99+':notices.length}</span>}</button></PopoverTrigger>
 <PopoverContent align="end" dir="rtl" className="notice-panel"><div className="notice-head"><b>التنبيهات</b><small>{notices.length?`${notices.length} تنبيه، الأهم أولاً`:'لا توجد تنبيهات الآن'}</small></div>
 {notices.length?<ul className="notice-list">{notices.map(n=>{const Icon=icons[n.tone];return <li key={n.id}><button className={'notice-item '+n.tone} onClick={()=>{setOpen(false);onOpen(n)}}><Icon size={16}/><span><b>{n.title}</b><small>{n.detail}</small></span></button></li>})}</ul>:<p className="muted notice-empty">لا توجد مهام متأخرة أو مواعيد قريبة مسندة إليك.</p>}</PopoverContent></Popover>;
}
