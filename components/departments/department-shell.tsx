import {Suspense,lazy,useEffect,useState} from 'react';
import AccountMenu from '../account-menu';
import {ChatSlot} from '../chat-slot';
import {RefreshCw,Mail} from 'lucide-react';
import MailBell from '../mail/mail-bell';
import {OPEN_MAIL_EVENT,takePendingMail,useMailAvailable,useMailCounts} from '@/lib/mail';
import {departmentPages,WORKSPACES,type Department,type CaseSummary} from '@/lib/departments';
import type {Permissions} from '@/lib/permissions';
import {officeRequest} from '@/lib/local-auth';
import {officePages} from '@/lib/office-api';
import type {OfficeContext,WorkItem} from '@/lib/office';
import {Toaster} from '../ui/sonner';
import {EditorDialog,StatusMessage} from './shared';
import {clientName} from '@/lib/clients';
// Departments load on demand.
const Secretary=lazy(()=>import('../secretair'));
const Collections=lazy(()=>import('./collections'));
const Accounting=lazy(()=>import('./accounting'));
const HR=lazy(()=>import('./hr'));
const ArchiveRoom=lazy(()=>import('./archive'));
const BatchPrint=lazy(()=>import('./batch-print'));
const MailPage=lazy(()=>import('../mail/mail-page'));
import BrandLogo from '../brand-logo';
// Sections laid out to fit one screen, their lists scrolling inside their panels.
const DESKS:Department[]=['secretary','collections','hr','archive','accounting'];
export default function DepartmentWorkspace({workspace,access}:{workspace:Department;access:Permissions}) {
 const [cases,setCases]=useState<CaseSummary[]>([]),[context,setContext]=useState<OfficeContext|null>(null),[work,setWork]=useState<WorkItem[]>([]);
 const [version,setVersion]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState<CaseSummary|null>(null);
 useEffect(()=>{let active=true;setLoading(true);setError('');
  Promise.all([workspace==='hr'?[]:departmentPages<CaseSummary>(workspace,'cases_page'),workspace==='secretary'?officeRequest<OfficeContext>('context'):null,workspace==='secretary'?officePages<WorkItem>('work_page'):[]]).then(([c,ctx,w])=>{if(active){setCases(c);setContext(ctx);setWork(w)}}).catch(e=>{if(active){setCases([]);setWork([]);setError(e.message)}}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[workspace,version]);
 const refresh=()=>setVersion(v=>v+1),meta=WORKSPACES[workspace];
 // «البريد» is a page of every workspace, opened from its tab or from the mail icon.
 const mailOk=useMailAvailable(),counts=useMailCounts(mailOk),[mail,setMail]=useState<{id:string}|null>(()=>takePendingMail(workspace));
 useEffect(()=>{const on=()=>{const p=takePendingMail(workspace);if(p)setMail(p)};addEventListener(OPEN_MAIL_EVENT,on);return()=>removeEventListener(OPEN_MAIL_EVENT,on)},[workspace]);
 const unread=counts?.byWorkspace[workspace]||0,[print,setPrint]=useState(false);
 return <main className={'department-shell theme-'+workspace} dir="rtl"><header className="department-topbar"><div className="department-brand"><BrandLogo/><span>مواثيق <small>{meta.name}</small></span></div><div className="actions"><button className="btn" onClick={refresh} disabled={loading}><RefreshCw size={16}/> تحديث</button><MailBell workspace={workspace}/><ChatSlot/><AccountMenu/></div></header>
 <div className={'department-content'+(DESKS.includes(workspace)&&!mail?' desk-page':'')}>{(mailOk||workspace==='secretary')&&<div className="department-tabs view-switch mail-switch" role="group" aria-label="صفحات المساحة"><button className={'btn '+(!mail&&!print?'primary':'')} aria-pressed={!mail&&!print} onClick={()=>{setMail(null);setPrint(false)}}>{meta.name}</button>
 {workspace==='secretary'&&<button className={'btn '+(print&&!mail?'primary':'')} aria-pressed={print&&!mail} onClick={()=>{setMail(null);setPrint(true)}}>طباعة مستندات التحصيل</button>}{mailOk&&<button className={'btn '+(mail?'primary':'')} aria-pressed={!!mail} onClick={()=>{setPrint(false);setMail({id:''})}}><Mail size={15}/> البريد{unread>0&&<span className="nav-count">{unread}</span>}</button>}</div>}
 {mail?<Suspense fallback={<StatusMessage loading error=""/>}><MailPage key={mail.id} workspace={workspace} focusId={mail.id}/></Suspense>:<><StatusMessage loading={loading} error={error}/>{!loading&&!error&&<Suspense fallback={<StatusMessage loading error=""/>}>
 {!access.canEdit&&<p className="notice">حسابك للقراءة فقط في هذه المساحة.</p>}
 {workspace==='secretary'&&context&&!print&&<Secretary items={work} context={context} records={cases} onChanged={refresh} onOpenCase={setSelected}/>}
 {workspace==='secretary'&&print&&(access.sections.includes('collections')?<BatchPrint canExport={access.canExport}/>:<section className="panel"><h2>طباعة مستندات التحصيل</h2><p className="subtitle">لطباعة الحوافظ والصحف لعدة ملفات دفعة واحدة، يمنح مسؤول المكتب هذا الحساب قسم «التحصيل» وصلاحية التصدير.</p></section>)}
 {workspace==='collections'&&<Collections key={version} cases={cases} access={access}/>}
 {workspace==='accounting'&&<Accounting key={version} cases={cases} access={access}/>}
 {workspace==='hr'&&<HR key={version} access={access}/>}
 {workspace==='archive'&&<ArchiveRoom key={version} cases={cases} access={access}/>}
 </Suspense>}</>}</div><footer className="department-footer">مواثيق · {meta.name}{workspace!=='hr'&&' · '+(access.caseScope==='all'?'جميع القضايا':'القضايا المحددة لحسابك')}</footer>
 {selected&&<EditorDialog title="ملخص القضية" description="بيانات تعريف القضية المرتبطة بهذا العمل." busy={false} onClose={()=>setSelected(null)}><dl className="summary-grid"><dt>الكود</dt><dd>{selected.code||'—'}</dd><dt>الرقم الآلي</dt><dd>{selected.autoNumber||'—'}</dd><dt>الموكل</dt><dd>{clientName(selected)}</dd><dt>الخصم</dt><dd>{selected.opponent}</dd><dt>الحالة</dt><dd>{selected.archived?'مؤرشفة':'نشطة'}</dd></dl><button className="btn" onClick={()=>setSelected(null)}>إغلاق</button></EditorDialog>}
 <Toaster position="bottom-left" dir="rtl" theme="light"/></main>;
}
