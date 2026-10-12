import {useContext,useEffect,useState} from 'react';
import {OPEN_EVENT,pendingOpen} from '@/lib/open-record';
import {ArrowUpLeft,Scale,CalendarDays,Files,Wallet,UsersRound} from 'lucide-react';
import {flushSync} from 'react-dom';
import AccountMenu,{AccountContext} from './account-menu';
import {withViewTransition} from '@/lib/appearance';
import {LEGAL_SECTIONS,type Permissions} from '@/lib/permissions';
import {WORKSPACES,workspaceStorageKey,type WorkspaceId} from '@/lib/departments';
import Workspace from './workspace';
import DepartmentWorkspace from './departments/department-shell';
import './workspaces.css';
const icons={legal:Scale,secretary:CalendarDays,collections:Files,accounting:Wallet,hr:UsersRound};
export default function WorkspaceHub({access,owner}:{access:Permissions;owner:boolean}) {
 const allowed=(Object.keys(WORKSPACES) as WorkspaceId[]).filter(id=>owner||(id==='legal'?access.sections.some(s=>LEGAL_SECTIONS.includes(s)):access.sections.includes(id)));
 // An account with a single page opens it directly, without the chooser.
 const only=allowed.length===1?allowed[0]:null;
 const [selected,setSelected]=useState<WorkspaceId|null>(()=>{const saved=sessionStorage.getItem(workspaceStorageKey) as WorkspaceId;return allowed.includes(saved)?saved:only});
 function choose(id:WorkspaceId|null){withViewTransition(()=>flushSync(()=>setSelected(id)));if(id)sessionStorage.setItem(workspaceStorageKey,id);else sessionStorage.removeItem(workspaceStorageKey);}
 // A record opened from chat or elsewhere is shown in the case workspace.
 useEffect(()=>{const on=()=>{if(pendingOpen()&&allowed.includes('legal')&&selected!=='legal')choose('legal')};addEventListener(OPEN_EVENT,on);return()=>removeEventListener(OPEN_EVENT,on)});
 const account=useContext(AccountContext);
 const current=selected&&allowed.includes(selected)?selected:only;
 if(current)return <AccountContext.Provider value={account&&{...account,onSwitchWorkspace:only?undefined:()=>choose(null)}}>{current==='legal'?<Workspace access={access} owner={owner}/>:<DepartmentWorkspace key={current} workspace={current} access={access}/>}</AccountContext.Provider>;
 return <main className="workspace-chooser" dir="rtl"><div className="chooser-account"><AccountMenu/></div><header><span className="brand-mark">M</span><span className="eyebrow">مواثيق / مكتب واحد</span><h1>اختر مساحة عملك</h1><p>كل فريق يعمل بأدواته، وجميع السجلات مترابطة.</p></header>
 <div className="workspace-options">{allowed.map(id=>{const Icon=icons[id],w=WORKSPACES[id];return <button key={id} data-tilt className={'workspace-option theme-'+id} onClick={()=>choose(id)} aria-label={'فتح '+w.name}><span className="workspace-option-top"><Icon size={30}/><small>{w.mark}</small></span><h2>{w.name}</h2><p>{w.description}</p><span className="workspace-enter">دخول مساحة العمل <ArrowUpLeft size={19}/></span></button>})}</div>
 {!allowed.length&&<section className="panel"><h2>لم تُحدد مساحة عمل لحسابك بعد</h2><p>اطلب من مسؤول المكتب تحديد المساحات والقضايا المسموحة لك.</p></section>}
 <p className="workspace-footnote">تظهر المساحات التي أتاحها مسؤول المكتب لحسابك. صلاحيات القضايا والتعديل والتصدير محفوظة في كل مساحة.</p></main>;
}
