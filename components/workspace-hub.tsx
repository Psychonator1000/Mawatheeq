import {useContext,useState} from 'react';
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
 const [selected,setSelected]=useState<WorkspaceId|null>(()=>{const saved=sessionStorage.getItem(workspaceStorageKey) as WorkspaceId;return allowed.includes(saved)?saved:null});
 function choose(id:WorkspaceId|null){withViewTransition(()=>flushSync(()=>setSelected(id)));if(id)sessionStorage.setItem(workspaceStorageKey,id);else sessionStorage.removeItem(workspaceStorageKey);}
 const account=useContext(AccountContext);
 if(selected&&allowed.includes(selected))return <AccountContext.Provider value={account&&{...account,onSwitchWorkspace:()=>choose(null)}}>{selected==='legal'?<Workspace access={access} owner={owner}/>:<DepartmentWorkspace key={selected} workspace={selected} access={access}/>}</AccountContext.Provider>;
 return <main className="workspace-chooser" dir="rtl"><div className="chooser-account"><AccountMenu/></div><header><span className="brand-mark">M</span><span className="eyebrow">مواثيق / مكتب واحد</span><h1>اختر مساحة عملك</h1><p>كل فريق يعمل بأدواته، وجميع السجلات مترابطة.</p></header>
 <div className="workspace-options">{allowed.map(id=>{const Icon=icons[id],w=WORKSPACES[id];return <button key={id} data-tilt className={'workspace-option theme-'+id} onClick={()=>choose(id)} aria-label={'فتح '+w.name}><span className="workspace-option-top"><Icon size={30}/><small>{w.mark}</small></span><h2>{w.name}</h2><p>{w.description}</p><span className="workspace-enter">دخول مساحة العمل <ArrowUpLeft size={19}/></span></button>})}</div>
 {!allowed.length&&<section className="panel"><h2>لم تُحدد مساحة عمل لحسابك بعد</h2><p>اطلب من مسؤول المكتب تحديد المساحات والقضايا المسموحة لك.</p></section>}
 <p className="workspace-footnote">تظهر المساحات التي أتاحها مسؤول المكتب لحسابك. صلاحيات القضايا والتعديل والتصدير محفوظة في كل مساحة.</p></main>;
}
