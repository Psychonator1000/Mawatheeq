import {Suspense,lazy,useContext,useEffect,useState} from 'react';
import {OPEN_EVENT,pendingOpen} from '@/lib/open-record';
import {OPEN_MAIL_EVENT} from '@/lib/mail';
import {ArrowUpLeft,Scale,CalendarDays,Files,Wallet,UsersRound,Archive,UserCog} from 'lucide-react';
import {flushSync} from 'react-dom';
import AccountMenu,{AccountContext} from './account-menu';
import {ChatSlot} from './chat-slot';
import {withViewTransition} from '@/lib/appearance';
import {LEGAL_SECTIONS,type Permissions,isAdmin,canManageStaff,powersOf} from '@/lib/permissions';
import {WORKSPACES,workspaceStorageKey,type WorkspaceId} from '@/lib/departments';
// Each workspace is downloaded when it is opened, so a person only loads the parts they use.
const Workspace=lazy(()=>import('./workspace'));
const DepartmentWorkspace=lazy(()=>import('./departments/department-shell'));
const TeamWorkspace=lazy(()=>import('./team-workspace'));
// Shared window, table and form styles load up front (before the workspace styles and themes), whichever
// workspace opens first; the workspaces themselves load on demand.
import './office.css';
import './workspaces.css';
import BrandLogo from './brand-logo';
type HubId=WorkspaceId|'team';
const icons={legal:Scale,secretary:CalendarDays,collections:Files,accounting:Wallet,hr:UsersRound,archive:Archive,team:UserCog};
// Staff accounts and permissions are an admin page of their own, not part of any workspace.
const TEAM={name:'فريق المكتب',description:'الموظفون وأعمالهم وصفحاتهم وقضاياهم وصلاحيات الإدارة'};
export default function WorkspaceHub({access,owner}:{access:Permissions;owner:boolean}) {
 const allowed:HubId[]=[...(Object.keys(WORKSPACES) as WorkspaceId[]).filter(id=>owner||(id==='legal'?access.sections.some(s=>LEGAL_SECTIONS.includes(s))||isAdmin(powersOf(access)):access.sections.includes(id))),
  ...(owner||canManageStaff(powersOf(access))?['team' as const]:[])];
 // An account with a single page opens it directly, without the chooser.
 const only=allowed.length===1?allowed[0]:null;
 const [selected,setSelected]=useState<HubId|null>(()=>{const saved=sessionStorage.getItem(workspaceStorageKey) as HubId;return allowed.includes(saved)?saved:only});
 function choose(id:HubId|null){withViewTransition(()=>flushSync(()=>setSelected(id)));if(id)sessionStorage.setItem(workspaceStorageKey,id);else sessionStorage.removeItem(workspaceStorageKey);}
 // A record opened from chat or elsewhere is shown in the case workspace.
 useEffect(()=>{const on=()=>{if(pendingOpen()&&allowed.includes('legal')&&selected!=='legal')choose('legal')};addEventListener(OPEN_EVENT,on);return()=>removeEventListener(OPEN_EVENT,on)});
 // Mail from another workspace (from the mail icon) opens in that workspace.
 useEffect(()=>{const on=(e:Event)=>{const w=(e as CustomEvent<{workspace:HubId}>).detail?.workspace;if(w&&allowed.includes(w)&&selected!==w)choose(w)};addEventListener(OPEN_MAIL_EVENT,on);return()=>removeEventListener(OPEN_MAIL_EVENT,on)});
 const account=useContext(AccountContext);
 const current=selected&&allowed.includes(selected)?selected:only;
 if(current)return <AccountContext.Provider value={account&&{...account,onSwitchWorkspace:only?undefined:()=>choose(null)}}><Suspense fallback={<p className="page-loading" role="status">جارٍ تحميل مساحة العمل…</p>}>{current==='legal'?<Workspace access={access} owner={owner}/>:current==='team'?<TeamWorkspace access={access} owner={owner}/>:<DepartmentWorkspace key={current} workspace={current} access={access}/>}</Suspense></AccountContext.Provider>;
 return <main className="workspace-chooser" dir="rtl"><div className="chooser-account"><ChatSlot/><AccountMenu/></div><header><BrandLogo full/><span className="eyebrow">مواثيق / مكتب واحد</span><h1>اختر مساحة عملك</h1><p>كل فريق يعمل بأدواته، وجميع السجلات مترابطة.</p></header>
 <div className="workspace-options">{allowed.map(id=>{const Icon=icons[id],w=id==='team'?TEAM:WORKSPACES[id];return <button key={id} data-tilt className={'workspace-option theme-'+id} onClick={()=>choose(id)} aria-label={'فتح '+w.name}><span className="workspace-option-top"><Icon size={30}/></span><h2>{w.name}</h2><p>{w.description}</p><span className="workspace-enter">دخول مساحة العمل <ArrowUpLeft size={19}/></span></button>})}</div>
 {!allowed.length&&<section className="panel"><h2>لم تُحدد مساحة عمل لحسابك بعد</h2><p>اطلب من مسؤول المكتب تحديد المساحات والقضايا المسموحة لك.</p></section>}
 <p className="workspace-footnote">تظهر المساحات التي أتاحها مسؤول المكتب لحسابك. صلاحيات القضايا والتعديل والتصدير محفوظة في كل مساحة.</p></main>;
}
