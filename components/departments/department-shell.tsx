import {Suspense,lazy,useEffect,useState} from 'react';
import AccountMenu from '../account-menu';
import {ChatSlot,PaperSlot} from '../chat-slot';
import {RefreshCw,Mail} from 'lucide-react';
import MailBell from '../mail/mail-bell';
import {OPEN_MAIL_EVENT,takePendingMail,useMailAvailable,useMailCounts} from '@/lib/mail';
import {departmentCases,WORKSPACES,type Department,type CaseSummary} from '@/lib/departments';
import type {Permissions} from '@/lib/permissions';
import {officeRequest} from '@/lib/local-auth';
import {officePages} from '@/lib/office-api';
import type {OfficeContext,WorkItem} from '@/lib/office';
import {Toaster} from '../ui/sonner';
import {peekSnapshot,readSnapshot,writeSnapshot} from '@/lib/boot-cache';
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
 // What this workspace showed earlier in the visit draws at once; the secretary desk also needs its office and work lists.
 const kept=()=>{const c=peekSnapshot<CaseSummary[]>('dept-cases:'+workspace);if(!c)return null;if(workspace!=='secretary')return {c,ctx:null,w:[] as WorkItem[]};
  const ctx=peekSnapshot<OfficeContext>('dept-context:secretary'),w=peekSnapshot<WorkItem[]>('dept-work:secretary');return ctx&&w?{c,ctx,w}:null};
 const [cases,setCases]=useState<CaseSummary[]>(()=>kept()?.c||[]),[context,setContext]=useState<OfficeContext|null>(()=>kept()?.ctx||null),[work,setWork]=useState<WorkItem[]>(()=>kept()?.w||[]);
 const [version,setVersion]=useState(0),[loading,setLoading]=useState(()=>!kept()),[error,setError]=useState(''),[selected,setSelected]=useState<CaseSummary|null>(null);
 useEffect(()=>{let active=true;setLoading(!kept()&&workspace!=='hr');setError('');
  // The last copy shows at once while the server's copy loads (for the secretary desk with its office and work lists).
  let fresh=false;
  if(workspace!=='hr')void Promise.all([readSnapshot<CaseSummary[]>('dept-cases:'+workspace),workspace==='secretary'?readSnapshot<OfficeContext>('dept-context:secretary'):null,workspace==='secretary'?readSnapshot<WorkItem[]>('dept-work:secretary'):[]])
   .then(([c,ctx,w])=>{if(active&&c&&!fresh&&(workspace!=='secretary'||(ctx&&w))){setCases(c);if(workspace==='secretary'){setContext(ctx);setWork(w||[])}setLoading(false)}});
  Promise.all([workspace==='hr'?[]:departmentCases(workspace),workspace==='secretary'?officeRequest<OfficeContext>('context'):null,workspace==='secretary'?officePages<WorkItem>('work_page'):[]]).then(([c,ctx,w])=>{fresh=true;if(active){setCases(c);setContext(ctx);setWork(w);if(workspace!=='hr')void writeSnapshot('dept-cases:'+workspace,c);if(workspace==='secretary'){void writeSnapshot('dept-context:secretary',ctx);void writeSnapshot('dept-work:secretary',w)}}}).catch(e=>{if(active&&!kept()){setCases([]);setWork([]);setError(e.message)}else if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 // eslint-disable-next-line react-hooks/exhaustive-deps -- `kept` reads the copies of this workspace, which is listed
 },[workspace,version]);
 const refresh=()=>setVersion(v=>v+1),meta=WORKSPACES[workspace];
 // «البريد» is a page of every workspace, opened from its tab or from the mail icon.
 const mailOk=useMailAvailable(),counts=useMailCounts(mailOk),[mail,setMail]=useState<{id:string}|null>(()=>takePendingMail(workspace));
 useEffect(()=>{const on=()=>{const p=takePendingMail(workspace);if(p)setMail(p)};addEventListener(OPEN_MAIL_EVENT,on);return()=>removeEventListener(OPEN_MAIL_EVENT,on)},[workspace]);
 const unread=counts?.byWorkspace[workspace]||0,[print,setPrint]=useState(false);
 return <main className={'department-shell theme-'+workspace} dir="rtl"><header className="department-topbar"><div className="department-brand"><BrandLogo/><span>مواثيق <small>{meta.name}</small></span></div><div className="actions"><button className="btn" onClick={refresh} disabled={loading}><RefreshCw size={16}/> تحديث</button><MailBell workspace={workspace}/><PaperSlot/><ChatSlot/><AccountMenu/></div></header>
 <div className={'department-content'+(DESKS.includes(workspace)&&!mail?' desk-page':'')}>{(mailOk||workspace==='secretary')&&<div className="department-tabs view-switch mail-switch" role="group" aria-label="صفحات المساحة"><button className={'btn '+(!mail&&!print?'primary':'')} aria-pressed={!mail&&!print} onClick={()=>{setMail(null);setPrint(false)}}>{meta.name}</button>
 {workspace==='secretary'&&<button className={'btn '+(print&&!mail?'primary':'')} aria-pressed={print&&!mail} onClick={()=>{setMail(null);setPrint(true)}}>طباعة الحافظة والدعوى</button>}{mailOk&&<button className={'btn '+(mail?'primary':'')} aria-pressed={!!mail} onClick={()=>{setPrint(false);setMail({id:''})}}><Mail size={15}/> البريد{unread>0&&<span className="nav-count">{unread}</span>}</button>}</div>}
 {mail?<Suspense fallback={<StatusMessage loading error=""/>}><MailPage key={mail.id} workspace={workspace} focusId={mail.id}/></Suspense>:<><StatusMessage loading={loading} error={error}/>{!loading&&!error&&<Suspense fallback={<StatusMessage loading error=""/>}>
 {!access.canEdit&&<p className="notice">حسابك للقراءة فقط في هذه المساحة.</p>}
 {workspace==='secretary'&&context&&!print&&<Secretary items={work} context={context} records={cases} onChanged={refresh} onOpenCase={setSelected}/>}
 {workspace==='secretary'&&print&&(access.sections.includes('collections')?<BatchPrint canExport={access.canExport}/>:<section className="panel"><h2>طباعة الحافظة والدعوى</h2><p className="subtitle">لطباعة الحوافظ والصحف لعدة ملفات دفعة واحدة، يمنح مسؤول المكتب هذا الحساب قسم «التحصيل» وصلاحية التصدير.</p></section>)}
 {workspace==='collections'&&<Collections key={version} cases={cases} access={access}/>}
 {workspace==='accounting'&&<Accounting key={version} cases={cases} access={access}/>}
 {workspace==='hr'&&<HR key={version} access={access}/>}
 {workspace==='archive'&&<ArchiveRoom key={version} cases={cases} access={access}/>}
 </Suspense>}</>}</div><footer className="department-footer">مواثيق · {meta.name}{workspace!=='hr'&&' · '+(access.caseScope==='all'?'جميع القضايا':'القضايا المحددة لحسابك')}</footer>
 {selected&&<EditorDialog title="ملخص القضية" description="بيانات تعريف القضية المرتبطة بهذا العمل." busy={false} onClose={()=>setSelected(null)}><dl className="summary-grid"><dt>الكود</dt><dd>{selected.code||'—'}</dd><dt>الرقم الآلي</dt><dd>{selected.autoNumber||'—'}</dd><dt>الموكل</dt><dd>{clientName(selected)}</dd><dt>الخصم</dt><dd>{selected.opponent}</dd><dt>الحالة</dt><dd>{selected.archived?'مؤرشفة':'نشطة'}</dd></dl><button className="btn" onClick={()=>setSelected(null)}>إغلاق</button></EditorDialog>}
 <Toaster position="bottom-left" dir="rtl" theme="light"/></main>;
}
