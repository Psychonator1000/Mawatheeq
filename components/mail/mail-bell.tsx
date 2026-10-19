import {useEffect,useRef,useState} from 'react';
import {Mail,AlertTriangle} from 'lucide-react';
import {toast} from 'sonner';
import {Popover,PopoverContent,PopoverTrigger} from '../ui/popover';
import {MAIL_WORKSPACES,openMail,personOf,useMailAvailable,useMailCounts,type MailWorkspace} from '@/lib/mail';

const when=(iso:string)=>{const d=new Date(iso),today=new Date();return d.toDateString()===today.toDateString()?d.toLocaleTimeString('ar-KW',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('ar-KW',{day:'numeric',month:'short'})};

/** The mail icon in every workspace's top bar, separate from the work notifications: new mail across the sections this person may read. */
export default function MailBell({workspace}:{workspace:MailWorkspace}){
 const ok=useMailAvailable(),counts=useMailCounts(ok),[open,setOpen]=useState(false);
 // A toast for mail that arrives while the app is open (not for what was already waiting).
 const seen=useRef<Set<string>|null>(null);
 useEffect(()=>{if(!counts)return;const ids=new Set(counts.latest.map(l=>l.id));
  if(seen.current){const fresh=counts.latest.filter(l=>!seen.current!.has(l.id));if(fresh.length===1)toast(`بريد جديد · ${MAIL_WORKSPACES[fresh[0].workspace]}`,{description:`${personOf(fresh[0])}: ${fresh[0].subject||'(بلا عنوان)'}`,action:{label:'فتح',onClick:()=>openMail(fresh[0].workspace,fresh[0].id)}});
   else if(fresh.length>1)toast(`${fresh.length} رسائل جديدة`,{action:{label:'فتح',onClick:()=>openMail(fresh[0].workspace)}});}
  seen.current=ids},[counts]);
 if(!ok)return null;
 const total=counts?.total||0,errors=counts?.errors||[];
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button className="icon-btn notice-trigger mail-trigger" aria-label={total?`البريد: ${total} غير مقروءة`:'البريد'}><Mail/>{total>0&&<span key={'mail-'+total} className="notice-count mail-count" aria-hidden="true">{total>99?'99+':total}</span>}{!total&&errors.length>0&&<span className="mail-warn" aria-hidden="true">!</span>}</button></PopoverTrigger>
  <PopoverContent align="end" dir="rtl" className="notice-panel mail-panel"><div className="notice-head"><b>البريد</b><small>{total?`${total} رسالة غير مقروءة`:'لا يوجد بريد جديد'}</small></div>
   {errors.map(e=><p key={e.id} className="mail-panel-error"><AlertTriangle size={14}/> تعذر جلب {e.address}: {e.error}</p>)}
   {counts&&counts.latest.length>0&&<ul className="notice-list">{counts.latest.map(l=><li key={l.id}><button className="notice-item info mail-item" onClick={()=>{setOpen(false);openMail(l.workspace,l.id)}}><Mail size={16}/><span><b>{l.subject||'(بلا عنوان)'}</b><small>{personOf(l)} · {MAIL_WORKSPACES[l.workspace]} · {when(l.sentAt)}</small></span></button></li>)}</ul>}
   <div className="mail-panel-foot">{Object.entries(counts?.byWorkspace||{}).filter(([w])=>w!==workspace).map(([w,n])=><button key={w} className="btn" onClick={()=>{setOpen(false);openMail(w as MailWorkspace)}}>{MAIL_WORKSPACES[w as MailWorkspace]} ({n})</button>)}
    <button className="btn primary" onClick={()=>{setOpen(false);openMail(workspace)}}>فتح بريد {MAIL_WORKSPACES[workspace]}</button></div>
  </PopoverContent></Popover>;
}
