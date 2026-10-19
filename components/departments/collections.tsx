import {Fragment,lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState,type ReactElement} from 'react';
import {COURTS,NATIONALITIES,WEEKDAYS,weekdayOf,suggestions} from '@/lib/choices';
import {Files,Plus,FileCheck2,Scale,Link2,Trash2,UserPlus,ListChecks,FileText,Users,ScrollText,Wallet,History,ClipboardList,Printer,UserCheck,type LucideIcon} from 'lucide-react';
import BatchPrint from './batch-print';
import CollectionImport from './collection-import';
import {suggestedEvidence} from '@/lib/document-tools';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {type CaseSummary,type CollectionData,type CollectionRecord,newDepartmentRecord} from '@/lib/departments';
import type {Permissions} from '@/lib/permissions';
import {blankDocument,amountInWords,joinNames,partyLabel,partyNames,type CollectionParty} from '@/lib/document-fields';
import {COLLECTION_FIELDS,missingDocumentFields,missingFieldKeys} from '@/lib/collection-documents';
import {ALL_FILE_STATUSES as FILE_STATUSES,CLOSED_STATUSES,STATEMENT_CATEGORIES,STATEMENT_STATUSES,PAYMENT_TYPES,dueStatements,fils,kwd,kwdPlain,position,civilIdValid,debtorKey,roundRobin} from '@/lib/collections';
import {clientName} from '@/lib/clients';
import {normalizeSearch} from '@/lib/case-browse';
import {emptyCase,formatDate,todayISO,type CaseRecord} from '@/lib/domain';
import Needs,{type NeedList} from '../needs';
import {listHtml,printHtml} from '@/lib/print';
import {Field,DateField,Empty,saveBlob,Choice,api} from '../shared';
import {OfficeSelect,officeTime} from '../office-shared';
import PageNavigation from '../page-navigation';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '../ui/tabs';
import {CasePicker,DepartmentHistory,EditorDialog,StatusMessage,useRecords,exportCsv} from './shared';
import {FollowFields,FileStatements,FilePosition,type StatementRecord,type PaymentRecord} from './collection-followup';
import RecordWindow,{useListNav,type WindowNav,type Enter} from '../record-window';
import CopyChip from '../copy-chip';
import CircuitField from '../circuit-field';
import {useBooksAvailable} from '@/lib/books-api';

const QuickInvoice=lazy(()=>import('./books-outside').then(m=>({default:m.QuickInvoice})));

type View='files'|'due'|'payments'|'print';
/** Files per page: twenty-five, five rows of five on wide screens. */
const PER_PAGE=25;
type ClientOption={id:string;name:string};
const statusTone=(s='')=>CLOSED_STATUSES.includes(s)?'green':s==='موقوف'?'red':s?'wine':'';
export default function Collections({cases,access}:{cases:CaseSummary[];access:Permissions}) {
 const {rows,loading,error,reload}=useRecords<CollectionData>('collections');
 // One list holds files, their statements and their payments; statements and payments point at their file.
 const {files,statementsOf,paymentsOf,allStatements,allPayments}=useMemo(()=>{
  const files=rows.filter(r=>r.kind==='file') as CollectionRecord[];
  const allStatements=rows.filter(r=>r.kind==='statement') as unknown as StatementRecord[],allPayments=rows.filter(r=>r.kind==='payment') as unknown as PaymentRecord[];
  const group=<T extends {subjectId:string}>(list:T[])=>{const m=new Map<string,T[]>();for(const r of list)m.set(r.subjectId,[...(m.get(r.subjectId)||[]),r]);return m};
  return {files,allStatements,allPayments,statementsOf:group(allStatements),paymentsOf:group(allPayments)};
 },[rows]);
 const [search,setSearch]=useState(''),[status,setStatus]=useState('active'),[fileStatus,setFileStatus]=useState(''),[batch,setBatch]=useState(''),[linked,setLinked]=useState(''),[assignee,setAssignee]=useState(''),[page,setPage]=useState(1),[editing,setEditingRaw]=useState<CollectionRecord|null>(null);
 const [picked,setPicked]=useState<Set<string>>(()=>new Set()),[assignTo,setAssignTo]=useState(''),[bulkStatus,setBulkStatus]=useState(''),[bulkClient,setBulkClient]=useState(''),[bulkBusy,setBulkBusy]=useState(false);
 const [check,setCheck]=useState(''),[company,setCompany]=useState(''),[clients,setClients]=useState<ClientOption[]>([]);
 // Client profiles to link files to; offered to staff with all-case scope.
 useEffect(()=>{if(access.caseScope!=='all')return;let active=true;departmentRequest<ClientOption[]>('client_options',{workspace:'collections'}).then(r=>{if(active)setClients(r)}).catch(()=>{});return()=>{active=false}},[access.caseScope]);
 // Files of the same debtor (civil ID, or name when there is none).
 const debtorFiles=useMemo(()=>{const m=new Map<string,CollectionRecord[]>();for(const f of files){if(f.archived)continue;const k=debtorKey(f.payload);if(k)m.set(k,[...(m.get(k)||[]),f])}return m},[files]);
 const sameDebtor=(r:CollectionRecord)=>(debtorFiles.get(debtorKey(r.payload))||[]).filter(f=>f.id!==r.id);
 const badCivil=(r:CollectionRecord)=>!!r.payload.civilId&&!civilIdValid(r.payload.civilId);
 const reviewed=(r:CollectionRecord)=>!!r.review&&(r.review.caseRevision??null)===(cases.find(c=>c.id===r.caseId)?.revision??null)&&r.review.recordRevision===r.revision;
 const pos=(r:CollectionRecord)=>position(r.payload,(paymentsOf.get(r.id)||[]).map(p=>p.payload));
 const filtered=files.filter(r=>(status==='all'||status==='archived'?status==='all'||r.archived:!r.archived&&(status!=='review'||!reviewed(r)))
  &&(!fileStatus||(fileStatus==='none'?!r.payload.fileStatus:r.payload.fileStatus===fileStatus))&&(!batch||r.payload.batchNumber===batch)&&(!linked||(linked==='yes')===!!r.caseId)&&(!assignee||(assignee==='none'?!r.payload.assignedTo:r.payload.assignedTo===assignee))
  &&(!company||r.payload.company===company)&&(!check||(check==='nophone'?!r.payload.phone:check==='badcivil'?badCivil(r):check==='shared'?sameDebtor(r).length>0:check==='noclient'?!r.payload.clientEntityId:true))
  &&normalizeSearch([r.payload.code,r.payload.company,r.payload.defendant,...[...(r.payload.plaintiffs||[]),...(r.payload.defendants||[])].flatMap(x=>[x.name,x.civilId,x.phone]),r.payload.fileAutoNumber,r.payload.orderAuto,r.payload.orderNumber,r.payload.lawsuitNumber,r.payload.civilId,r.payload.account,r.payload.customerId,r.payload.phone,r.payload.batchNumber,r.payload.tag1,r.payload.tag2,r.payload.tag3,r.payload.tag4].join(' ')).includes(normalizeSearch(search)));
 const pages=Math.max(1,Math.ceil(filtered.length/PER_PAGE)),current=Math.min(page,pages);
 const {nav,step,enter,openItem:setEditing}=useListNav(filtered,editing,setEditingRaw);
 const [view,setView]=useState<View>('files');
 const active=files.filter(r=>!r.archived),today=todayISO();
 const totals=active.reduce((t,r)=>{const p=pos(r);return {total:t.total+p.total,paid:t.paid+p.paid,remaining:t.remaining+Math.max(0,p.remaining)}},{total:0,paid:0,remaining:0});
 const due=dueStatements(allStatements,today).filter(s=>active.some(f=>f.id===s.subjectId));
 const opponents=useMemo(()=>[...new Set([...files.flatMap(r=>partyNames(r.payload.defendant,r.payload.defendants)),...cases.map(c=>(c.opponent||'').trim()).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'ar')),[files,cases]);
 const companies=suggestions(files,r=>r.payload.company),assignees=suggestions(files,r=>r.payload.assignedTo),batches=suggestions(files,r=>r.payload.batchNumber),tags=suggestions(files.flatMap(r=>[r.payload.tag1,r.payload.tag2,r.payload.tag3,r.payload.tag4]),v=>v);
 const fileOf=(id:string)=>files.find(f=>f.id===id);
 const views=<div className="department-tabs view-switch" role="group" aria-label="أقسام التحصيل">{([['files','ملفات التحصيل'],['due',`المتابعات المستحقة${due.length?` (${due.length})`:''}`],['payments','التحصيلات'],['print','طباعة جماعية']] as [View,string][]).map(([id,l])=><button key={id} className={'btn '+(view===id?'primary':'')} aria-pressed={view===id} onClick={()=>setView(id)}>{l}</button>)}</div>;
 const hero=<section className="department-hero"><div><div className="eyebrow">ملفات المطالبات</div><h1>التحصيل</h1><p>ملف لكل قضية: البيانات، الإفادات، الوضع المالي والمستندات.</p></div><Files size={64}/></section>;
 if(view==='print')return <>{hero}{views}<BatchPrint canExport={access.canExport}/></>;
 // One name assigns every picked file to that person; several names (separated by «،») share them in turn.
 const staffList=assignTo.split(/[،,]/).map(x=>x.trim()).filter(Boolean);
 async function distribute(){
  // In the order shown, then any picked files a later filter hid.
  const list=[...filtered,...files.filter(f=>!filtered.includes(f))].filter(f=>picked.has(f.id)&&!f.archived);if(!list.length||(!staffList.length&&!bulkStatus&&!bulkClient))return;
  const plan:[CollectionRecord,string][]=staffList.length?roundRobin(list,staffList):list.map(f=>[f,'']);
  setBulkBusy(true);let done=0;const failed:string[]=[];
  for(const [f,who] of plan){try{await departmentRequest('save_record',{workspace:'collections',record:{...f,payload:{...f.payload,...(who?{assignedTo:who}:{}),...(bulkStatus?{fileStatus:bulkStatus}:{}),...(bulkClient?{clientEntityId:bulkClient==='none'?'':bulkClient}:{})}}});done++}catch(e){failed.push((f.payload.code||f.payload.defendant)+': '+(e as Error).message)}}
  setBulkBusy(false);reload();setPicked(new Set());setAssignTo('');setBulkClient('');setBulkStatus('');if(done)toast.success(`حُدّث ${done} ملف`);if(failed.length)toast.error(failed.join('\n'));
 }
 const open=(id:string)=>{const f=fileOf(id);if(f){setView('files');setEditing(f)}};
 return <>{hero}{views}
 <div className="department-metrics collection-metrics">
  <div><span>ملفات نشطة</span><b>{active.length}</b></div>
  <div><span>إجمالي المطالبات</span><b>{kwd(totals.total)} <small>د.ك</small></b></div>
  <div><span>المحصل</span><b>{kwd(totals.paid)} <small>د.ك</small></b></div>
  <div><span>الباقي</span><b>{kwd(totals.remaining)} <small>د.ك</small></b></div>
  <button type="button" onClick={()=>setView('due')}><span>متابعات مستحقة اليوم</span><b>{due.length}</b></button>
  <button type="button" onClick={()=>{setView('files');setStatus('review');setPage(1)}}><span>تحتاج مراجعة المصدر</span><b>{active.filter(r=>!reviewed(r)).length}</b></button>
 </div>
 {view==='due'&&<DueList due={due} fileOf={fileOf} onOpen={open} canPrint={access.canExport}/>}
 {view==='payments'&&<PaymentsList payments={allPayments} fileOf={fileOf} onOpen={open} canPrint={access.canExport}/>}
 {view==='files'&&<section className="panel">
  <div className="status-chips" role="group" aria-label="حالة الملف">{['',...FILE_STATUSES].map(s=>{const n=active.filter(r=>!s||r.payload.fileStatus===s).length;return (n||!s||fileStatus===s)&&<button type="button" key={s||'all'} className={'chip'+(fileStatus===s?' on':'')} onClick={()=>{setFileStatus(s);setPage(1)}}>{s||'كل الحالات'} <b>{n}</b></button>})}</div>
  <div className="department-toolbar collection-toolbar"><Field label="بحث ملفات التحصيل" value={search} onChange={v=>{setSearch(v);setPage(1)}} placeholder="الكود، الأطراف، الرقم المدني، العقد، الهاتف أو الترقيم"/><OfficeSelect label="عرض" value={status} onChange={v=>{setStatus(v);setPage(1)}} options={[['active','الملفات النشطة'],['review','تحتاج مراجعة'],['archived','المؤرشفة'],['all','كل الملفات']]}/>
   <OfficeSelect label="الارتباط بقضية" value={linked} onChange={v=>{setLinked(v);setPage(1)}} options={[['','الكل'],['yes','مرتبطة بقضية'],['no','بلا قضية بعد']]}/>
   <OfficeSelect label="الباتش (القائمة)" value={batch} onChange={v=>{setBatch(v);setPage(1)}} options={[['','كل الباتشات'],...batches.map(b=>[b,b] as [string,string])]}/>
   <OfficeSelect label="الموظف المسؤول" value={assignee} onChange={v=>{setAssignee(v);setPage(1)}} options={[['','كل الموظفين'],['none','غير موزّع'],...assignees.map(a=>[a,a] as [string,string])]}/>
   {companies.length>1&&<OfficeSelect label="الموكل" value={company} onChange={v=>{setCompany(v);setPage(1)}} options={[['','كل الموكلين'],...companies.map(c=>[c,c] as [string,string])]}/>}
   <OfficeSelect label="تدقيق البيانات" value={check} onChange={v=>{setCheck(v);setPage(1)}} options={[['','بدون'],['nophone','بلا رقم هاتف'],['badcivil','رقم مدني يحتاج تدقيق'],['shared','خصم له أكثر من ملف'],['noclient','غير مربوط بملف الموكل']]}/>
   <div className="actions">{access.canExport&&<button className="btn" onClick={()=>void exportCsv('collections','Mawatheeq-collections',[['الكود','الموكل','الخصم','حالة الملف','الباتش','المسؤول','المطالبة','المسدد','الباقي','المراجعة'],...filtered.map(r=>{const p=pos(r);return [r.payload.code,r.payload.company,r.payload.defendant,r.payload.fileStatus||'',r.payload.batchNumber||'',r.payload.assignedTo||'',kwdPlain(p.total),kwdPlain(p.paid),kwdPlain(p.remaining),reviewed(r)?'راجعت البيانات الحالية':'تحتاج مراجعة']})]).catch(e=>toast.error(e.message))}>تصدير القائمة</button>}{access.canEdit&&access.caseScope==='all'&&<CollectionImport files={files} onDone={reload}/>}{access.canEdit&&<button className="btn primary" onClick={()=>setEditing(newDepartmentRecord('collections','file',{...blankDocument(),sourceReference:'',notes:''}))}><Plus size={17}/> ملف تحصيل جديد</button>}</div></div>
  {access.canEdit&&!!filtered.length&&<div className="pick-tools"><button type="button" className="btn" onClick={()=>setPicked(new Set(filtered.filter(f=>!f.archived).map(f=>f.id)))}>تحديد كل النتائج ({filtered.filter(f=>!f.archived).length})</button>{picked.size>0&&<button type="button" className="btn" onClick={()=>setPicked(new Set())}>إلغاء التحديد</button>}</div>}
  {access.canEdit&&picked.size>0&&<div className="pick-bar" role="status"><b>تم تحديد {picked.size} ملف</b><Field label="توزيع على موظف أو أكثر (افصل بـ ،)" value={assignTo} onChange={setAssignTo} suggestions={assignees} placeholder="سارة، أحمد"/><label className="field"><span>تغيير الحالة</span><Choice label="تغيير الحالة" empty="بدون تغيير" value={bulkStatus} onChange={setBulkStatus} options={FILE_STATUSES}/></label>{!!clients.length&&<OfficeSelect label="ربط بملف الموكل" value={bulkClient} onChange={setBulkClient} options={[['','بدون تغيير'],['none','إزالة الربط'],...clients.map(c=>[c.id,c.name] as [string,string])]}/>}
   {staffList.length>1&&<small className="muted">يُوزَّع {picked.size} ملف بالتناوب على {staffList.length} موظفين (حوالي {Math.ceil(picked.size/staffList.length)} لكل موظف).</small>}
   <button className="btn primary" title={!staffList.length&&!bulkStatus&&!bulkClient?'اختر موظفاً للتوزيع أو حالة جديدة أو ملف موكل أولاً':undefined} disabled={bulkBusy||(!staffList.length&&!bulkStatus&&!bulkClient)} onClick={()=>void distribute()}><UserCheck size={15}/> تطبيق على المحدد</button><button className="btn" onClick={()=>setPicked(new Set())}>إلغاء التحديد</button></div>}
  <StatusMessage loading={loading} error={error}/>{!loading&&!error&&<><div className="collection-grid">{filtered.slice((current-1)*PER_PAGE,current*PER_PAGE).map(r=>{const p=pos(r),open=(statementsOf.get(r.id)||[]).filter(s=>!s.archived&&s.payload.status!=='done').length;return <article className={'collection-card'+(picked.has(r.id)?' picked':'')} key={r.id}><header>{access.canEdit&&!r.archived&&<input type="checkbox" aria-label={'تحديد الملف '+(r.payload.code||r.payload.defendant)} checked={picked.has(r.id)} onChange={e=>setPicked(old=>{const n=new Set(old);if(e.target.checked)n.add(r.id);else n.delete(r.id);return n})}/>}<span className="collection-code">{r.payload.code||cases.find(c=>c.id===r.caseId)?.code||'بلا كود'}</span>{!r.caseId&&<span className="tag">بلا قضية</span>}{r.payload.fileStatus&&<span className={'tag '+statusTone(r.payload.fileStatus)}>{r.payload.fileStatus}</span>}<span className={'tag '+(reviewed(r)?'green':'amber')}>{r.archived?'مؤرشف':reviewed(r)?'تمت المراجعة':'يحتاج مراجعة'}</span>{badCivil(r)&&<span className="tag red" title="الرقم المدني لا يطابق رقم التحقق أو تاريخ الميلاد">رقم مدني؟</span>}</header>
   <h2>{partyLabel(r.payload.company,r.payload.plaintiffs)||'موكل غير مكتمل'}</h2><p>ضد {partyLabel(r.payload.defendant,r.payload.defendants)||'طرف غير مكتمل'}</p>
   <div className="collection-amount">{kwd(Math.max(0,p.remaining))} <small>د.ك باقٍ من {kwd(p.total)}</small></div>
   <div className="collection-meta">{r.payload.assignedTo?<span><Users size={13}/> {r.payload.assignedTo}</span>:<span className="muted">غير موزّع</span>}{r.payload.batchNumber&&<span>باتش {r.payload.batchNumber}</span>}{open>0&&<span className="tag amber">{open} إفادة مفتوحة</span>}{sameDebtor(r).length>0&&<span className="tag">{sameDebtor(r).length+1} ملفات للخصم</span>}</div>
   <footer><small>نسخة {r.revision}</small><button className="btn" onClick={()=>setEditing(r)}>فتح الملف</button></footer></article>})}</div>{!filtered.length&&<Empty text="أضف ملفاً مرتبطاً بقضية وابدأ بإدخال البيانات من مصدرها."/>}<PageNavigation page={current} pages={pages} total={filtered.length} onChange={setPage}/></>}</section>}
 {editing&&<CollectionEditor key={editing.id} clients={clients} opponents={opponents} related={sameDebtor(editing)} onOpenFile={setEditing} nav={nav} onNavigate={step} enter={enter} initial={editing} cases={cases} access={access} statements={statementsOf.get(editing.id)||[]} payments={paymentsOf.get(editing.id)||[]} assignees={assignees} batches={batches} tags={tags} onClose={()=>setEditing(null)} onChanged={reload}/>}</>;
}

/** Statements whose review date has come and that are not done yet, oldest first. */
function DueList({due,fileOf,onOpen,canPrint}:{due:StatementRecord[];fileOf:(id:string)=>CollectionRecord|undefined;onOpen:(id:string)=>void;canPrint:boolean}) {
 const list=[...due].sort((a,b)=>a.payload.reviewDate.localeCompare(b.payload.reviewDate));
 const cat=(id:string)=>STATEMENT_CATEGORIES.find(c=>c[0]===id)?.[1]||id,st=(id:string)=>STATEMENT_STATUSES.find(c=>c[0]===id)?.[1]||id;
 return <section className="panel"><div className="panel-head"><div><h2>المتابعات المستحقة</h2><p className="panel-note">إفادات غير منجزة أو مؤجلة حان تاريخ مراجعتها.</p></div>{canPrint&&!!list.length&&<button className="btn" onClick={()=>printHtml(listHtml('المتابعات المستحقة',formatDate(todayISO()),['تاريخ المراجعة','الملف','الخصم','النوع','الإجراء','الحالة','الموظف'],list.map(s=>{const f=fileOf(s.subjectId);return [formatDate(s.payload.reviewDate),f?.payload.code||'',f?.payload.defendant||'',cat(s.payload.category),s.payload.action+' — '+s.payload.text,st(s.payload.status),s.createdBy]}),formatDate(todayISO()),''))}><Printer size={15}/> طباعة</button>}</div>
  <div className="panel-body">{!list.length?<Empty title="لا توجد متابعات مستحقة" text="كل الإفادات المستحقة منجزة."/>:<div className="table-wrap"><table className="office-table"><thead><tr><th>تاريخ المراجعة</th><th>الملف</th><th>النوع</th><th>الإجراء</th><th>الحالة</th><th>الموظف</th><th/></tr></thead><tbody>{list.map(s=>{const f=fileOf(s.subjectId);return <tr key={s.id}><td className="nowrap">{formatDate(s.payload.reviewDate)}</td><td><b>{f?.payload.code||'—'}</b><small>{f?.payload.company} / {f?.payload.defendant}</small></td><td>{cat(s.payload.category)}</td><td><b>{s.payload.action}</b><small>{s.payload.text}</small></td><td><span className={'tag '+(s.payload.status==='postponed'?'':'amber')}>{st(s.payload.status)}</span></td><td>{s.createdBy}</td><td><button className="btn" onClick={()=>onOpen(s.subjectId)}>فتح الملف</button></td></tr>})}</tbody></table></div>}</div></section>;
}

/** All payments across visible files, filtered by type and dates, with totals. */
function PaymentsList({payments,fileOf,onOpen,canPrint}:{payments:PaymentRecord[];fileOf:(id:string)=>CollectionRecord|undefined;onOpen:(id:string)=>void;canPrint:boolean}) {
 const [type,setType]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[showVoid,setShowVoid]=useState(false);
 const list=payments.filter(p=>(!type||p.payload.type===type)&&(!from||p.payload.date>=from)&&(!to||p.payload.date<=to)&&(showVoid||p.payload.status!=='void')).sort((a,b)=>b.payload.date.localeCompare(a.payload.date));
 const amount=(p:PaymentRecord)=>Number(p.payload.amountMinor||fils(p.payload.amount));
 const sum=(t:string)=>list.filter(p=>p.payload.status!=='void'&&p.payload.type===t).reduce((n,p)=>n+amount(p),0);
 const typeLabel=(t:string)=>PAYMENT_TYPES.find(x=>x[0]===t)?.[1]||t;
 return <section className="panel"><div className="panel-head"><div><h2>التحصيلات</h2><p className="panel-note">الدفعات والسداد الخارجي والمصروفات في كل الملفات المتاحة لك.</p></div>{canPrint&&!!list.length&&<button className="btn" onClick={()=>printHtml(listHtml('التحصيلات',(from||to)?`من ${formatDate(from)||'البداية'} إلى ${formatDate(to)||'اليوم'}`:'كل الفترات',['التاريخ','الملف','الخصم','النوع','المبلغ (د.ك)','الطريقة','المرجع'],list.filter(p=>p.payload.status!=='void').map(p=>{const f=fileOf(p.subjectId);return [formatDate(p.payload.date),f?.payload.code||'',f?.payload.defendant||'',typeLabel(p.payload.type),kwd(amount(p)),p.payload.method,p.payload.reference]}),formatDate(todayISO()),'',[['الدفعات',kwd(sum('payment'))],['السداد الخارجي',kwd(sum('external'))],['المصروفات',kwd(sum('expense'))]]))}><Printer size={15}/> طباعة</button>}</div>
  <div className="department-toolbar"><OfficeSelect label="النوع" value={type} onChange={setType} options={[['','كل الأنواع'],...PAYMENT_TYPES]}/><DateField label="من تاريخ" value={from} onChange={setFrom}/><DateField label="إلى تاريخ" value={to} onChange={setTo}/><label className="checkbox-line"><input type="checkbox" checked={showVoid} onChange={e=>setShowVoid(e.target.checked)}/> إظهار الملغاة</label></div>
  <div className="department-metrics"><div><span>الدفعات</span><b>{kwd(sum('payment'))} <small>د.ك</small></b></div><div><span>السداد الخارجي</span><b>{kwd(sum('external'))} <small>د.ك</small></b></div><div><span>المصروفات</span><b>{kwd(sum('expense'))} <small>د.ك</small></b></div></div>
  <div className="panel-body">{!list.length?<Empty title="لا توجد حركات" text="تُضاف الدفعات من تبويب «الوضع المالي» في ملف التحصيل."/>:<div className="table-wrap"><table className="office-table"><thead><tr><th>التاريخ</th><th>الملف</th><th>النوع</th><th>المبلغ</th><th>الطريقة / المرجع</th><th>سجّلها</th><th/></tr></thead><tbody>{list.map(p=>{const f=fileOf(p.subjectId);return <tr key={p.id} className={p.payload.status==='void'?'void-row':''}><td className="nowrap">{formatDate(p.payload.date)}</td><td><b>{f?.payload.code||'—'}</b><small>{f?.payload.defendant}</small></td><td>{typeLabel(p.payload.type)}{p.payload.status==='void'&&<small className="office-alert">ملغاة: {p.payload.voidReason}</small>}</td><td className="nowrap amount">{kwd(amount(p))} د.ك</td><td>{p.payload.method||'—'}<small>{p.payload.reference}</small></td><td>{p.createdBy}</td><td><button className="btn" onClick={()=>onOpen(p.subjectId)}>فتح الملف</button></td></tr>})}</tbody></table></div>}</div></section>;
}

function CollectionEditor({opponents,initial,cases:loadedCases,access,statements,payments,assignees,batches,tags,clients,related,onOpenFile,onClose,onChanged,nav,onNavigate,enter}:{opponents:string[];clients:ClientOption[];related:CollectionRecord[];onOpenFile:(f:CollectionRecord)=>void;initial:CollectionRecord;cases:CaseSummary[];access:Permissions;statements:StatementRecord[];payments:PaymentRecord[];assignees:string[];batches:string[];tags:string[];onClose:()=>void;onChanged:()=>void;nav?:WindowNav;onNavigate?:(dir:'prev'|'next')=>void;enter?:Enter}) {
 const [saved,setSaved]=useState(initial),[draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attested,setAttested]=useState(false),[outputs,setOutputs]=useState<{id:string;kind:string;recordRevision:number;templateVersion:string;createdAt:string;actor:string}[]>([]),[outputVersion,setOutputVersion]=useState(0);
 const [tab,setTab]=useState(initial.revision?'file':'parties'),[invoicing,setInvoicing]=useState(false),books=useBooksAvailable();
 // Cases made from this window join the list at once, so the link shows without reloading the page.
 const [made,setMade]=useState<CaseSummary[]>([]),[making,setMaking]=useState(false),[linkAsk,setLinkAsk]=useState(0);
 const cases=useMemo(()=>[...loadedCases,...made.filter(m=>!loadedCases.some(c=>c.id===m.id))],[loadedCases,made]);
 const intent=useRef<Record<string,string>>({});
 const dirty=JSON.stringify(draft)!==JSON.stringify(saved),c=cases.find(c=>c.id===draft.caseId);
 const reviewed=!!saved.review&&saved.review.recordRevision===saved.revision&&(saved.review.caseRevision??null)===(c?.revision??null);
 const allScope=access.caseScope==='all';
 const editable=access.canEdit&&!draft.archived;
 useEffect(()=>{let active=true;if(saved.revision)departmentRequest<typeof outputs>('outputs',{workspace:'collections',id:saved.id}).then(r=>{if(active)setOutputs(r)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[saved.id,saved.revision,outputVersion]);
// Typing or picking a name that matches a client file links that file too.
 const linkClient=(name:string)=>{const m=clients.find(c=>normalizeSearch(c.name)===normalizeSearch(name));if(m)setDraft(r=>r.payload.clientEntityId===m.id?r:{...r,payload:{...r.payload,clientEntityId:m.id}})};
 const set=(key:string,value:unknown)=>setDraft(r=>({...r,payload:{...r.payload,[key]:value,
  // The automatic number above the order request and the one on its receipt are the same number.
  ...(key==='fileAutoNumber'&&(!r.payload.orderAuto||r.payload.orderAuto===r.payload.fileAutoNumber)?{orderAuto:String(value)}:key==='orderAuto'&&(!r.payload.fileAutoNumber||r.payload.fileAutoNumber===r.payload.orderAuto)?{fileAutoNumber:String(value)}:{}),...(key==='amount'?{amountWords:amountInWords(String(value))}:{})}}));
 async function mutate(action:string,data:Record<string,unknown>){setBusy(true);setError('');try{const r=await departmentRequest<CollectionRecord>(action,{workspace:'collections',id:saved.id,revision:saved.revision,...data});setSaved(r);setDraft(r);setAttested(false);onChanged();toast.success('حُفظ ملف التحصيل')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function generate(kind:'claim'|'bundle'){setBusy(true);setError('');try{const key=saved.revision+kind;const outputId=intent.current[key]??=crypto.randomUUID();const output=await departmentRequest<{id:string;data:CollectionData;templateVersion:string}>('generate',{workspace:'collections',id:saved.id,revision:saved.revision,kind,outputId});if(output.templateVersion!=='office-word-v1')throw new Error('نسخة القالب غير مدعومة. حدّث الصفحة.');const {generateWord}=await import('@/lib/document-tools');saveBlob(await generateWord(kind,output.data),`Mawatheeq-${kind}-${output.id}.docx`);setOutputVersion(v=>v+1);toast.success('تم إعداد Word وحفظ نسخة بيانات الإنشاء')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const p=draft.payload,money=position(saved.payload,payments.map(x=>x.payload));
 const canSave=editable&&!busy&&(!!draft.caseId||allScope)&&(dirty||!saved.revision);
 const save=()=>{if(canSave)void mutate('save_record',{record:draft})};
 // Making a case from the file: the button stays visible, and says what is missing and where, until it can work.
 const caseNeeds:NeedList=[!(access.canEdit&&access.caseScope==='all'&&access.sections.includes('cases'))&&'إنشاء القضايا يحتاج قسم «القضايا» وصلاحية كل القضايا؛ يمنحها مسؤول المكتب',
  !saved.revision&&'احفظ ملف التحصيل أولاً',dirty&&'احفظ تعديلات الملف أولاً',
  !saved.payload.clientEntityId&&'اربط الملف بملف الموكل في «الأطراف والمطالبة»',!saved.payload.defendant?.trim()&&'أدخل اسم المدعى عليه في «الأطراف والمطالبة»'];
 const caseBlocked=caseNeeds.some(Boolean);
 const clearAsk=useCallback(()=>setLinkAsk(0),[]);
 const linkNeeds:NeedList=[!saved.revision&&'احفظ ملف التحصيل أولاً',dirty&&'احفظ تعديلات الملف أولاً'];
 const openStatements=statements.filter(s=>!s.archived&&s.payload.status!=='done').length;
 // Fields the claim or the bundle still need are marked where they are entered, and counted on their tab.
 const need=missingFieldKeys(draft.payload);
 const needWrap=(key:string,el:ReactElement)=>{const kinds=need.get(key);return kinds?<div key={key} className="field-need">{el}<small>مطلوب لإنشاء {kinds.map(k=>k==='claim'?'صحيفة الدعوى':'الحافظة').join(' و')}</small></div>:el};
 const tabs:[string,string,LucideIcon,number?,boolean?][]=[['file','بيانات الملف',FileText],['parties','الأطراف والمطالبة',Users,[...need.keys()].filter(k=>k!=='amountWords').length],['papers','الحافظة والمستندات',ScrollText],['statements','إفادات الملف',ClipboardList,statements.filter(s=>!s.archived).length,!saved.revision],['money','الوضع المالي',Wallet,payments.filter(x=>x.payload.status!=='void').length,!saved.revision],['history','السجل',History,undefined,!saved.revision]];
 return <RecordWindow eyebrow={saved.revision?'ملف التحصيل':'ملف تحصيل جديد'} title={partyLabel(p.company,p.plaintiffs)||'موكل غير مكتمل'} subtitle={<><span className="vs">ضد</span> {partyLabel(p.defendant,p.defendants)||'طرف غير مكتمل'}</>}
  badges={<>{p.code&&<CopyChip label="رقم الملف" value={p.code}/>}{(p.fileAutoNumber||p.orderAuto)&&<CopyChip label="الرقم الآلي لأمر الأداء" value={p.fileAutoNumber||p.orderAuto||''}/>}{saved.payload.fileStatus&&<span className={'tag '+statusTone(saved.payload.fileStatus)}>{saved.payload.fileStatus}</span>}<span className={'tag '+(reviewed?'green':'amber')}>{saved.archived?'مؤرشف':reviewed?'تمت المراجعة':'يحتاج مراجعة'}</span></>}
  facts={[['إجمالي المطالبة',money.total?kwd(money.total)+' د.ك':''],['المسدد',saved.revision?kwd(money.paid)+' د.ك':''],['الباقي',saved.revision?kwd(money.remaining)+' د.ك':''],['المسؤول',saved.payload.assignedTo||''],['القضية',c?[c.code&&'كود '+c.code,c.autoNumber&&'آلي '+c.autoNumber].filter(Boolean).join(' · ')||'بلا كود':''],['إفادات مفتوحة',openStatements||'']]}
  pin={p.amountWords?<p className="amount-words">{p.amountWords}</p>:undefined}
  quick={<>{saved.revision&&<><button type="button" className="btn" onClick={()=>setTab('statements')}><ClipboardList size={16}/> إفادات الملف</button><button type="button" className="btn" onClick={()=>setTab('money')}><Wallet size={16}/> الوضع المالي</button><button type="button" className="btn" onClick={()=>setTab('papers')}><FileCheck2 size={16}/> المراجعة والمستندات</button></>}{editable&&<div className="case-actions"><button type="button" className="btn" disabled={linkNeeds.some(Boolean)||busy} title={linkNeeds.filter(Boolean).join(' · ')||undefined} onClick={()=>{setTab('parties');setLinkAsk(n=>n+1)}}><Link2 size={16}/> {saved.caseId?'تغيير القضية':'ربط بقضية'}</button>{!saved.caseId&&<button type="button" className="btn primary make-case" disabled={caseBlocked||busy} onClick={()=>setMaking(true)}><Scale size={16}/> إنشاء قضية من الملف</button>}</div>}{editable&&<Needs items={saved.caseId?linkNeeds:caseNeeds} className="make-case-needs"/>}</>}
  nav={nav} onNavigate={onNavigate} unit="الملف" enter={enter} dirty={dirty&&editable} busy={busy} onSave={editable?save:undefined} onClose={onClose}
  needs={editable?[!draft.caseId&&!allScope&&'اربط الملف بقضية في «الأطراف والمطالبة»؛ حسابك يرى قضايا محددة فقط']:[]}
  footer={<>{editable&&<button className="btn primary" type="button" onClick={save} disabled={busy||(!draft.caseId&&!allScope)||(!dirty&&!!saved.revision)}>حفظ ملف التحصيل</button>}{!!saved.revision&&access.canEdit&&<button className="btn" title={dirty?'احفظ تعديلات الملف أولاً':undefined} disabled={busy||dirty} onClick={()=>void mutate('archive_record',{archived:!saved.archived})}>{saved.archived?'إعادة فتح الملف':'أرشفة الملف'}</button>}{books&&!!saved.revision&&<button type="button" className="btn" disabled={busy||dirty||!saved.payload.company} title={!saved.payload.company?'أدخل اسم الموكل في «الأطراف والمطالبة»':dirty?'احفظ تعديلات الملف أولاً':undefined} onClick={()=>setInvoicing(true)}><FileText size={15}/> فاتورة أتعاب</button>}<button type="button" className="btn" disabled={busy} onClick={onClose}>إغلاق الملف</button></>}>
  {invoicing&&<Suspense fallback={null}><QuickInvoice caseId={saved.caseId||''} client={String(saved.payload.company||'')} clientEntityId={saved.payload.clientEntityId} reference={'ملف تحصيل '+(saved.payload.code||'')} onClose={()=>setInvoicing(false)} onDone={()=>setInvoicing(false)}/></Suspense>}
 {making&&<MakeCase file={saved} cases={cases} onClose={()=>setMaking(false)} onMade={(r,c)=>{setMade(m=>[...m,c]);setSaved(r);setDraft(r);setMaking(false);onChanged()}}/>}
 {error&&<p role="alert" className="notice">{error}</p>}
 <Tabs value={tab} onValueChange={setTab} dir="rtl"><TabsList className="detail-tabs case-tabs">{tabs.map(([v,l,Icon,n,off])=><TabsTrigger key={v} value={v} disabled={off}><Icon aria-hidden/>{l}{n?<span className="tab-count">{n}</span>:null}</TabsTrigger>)}</TabsList>
 {!saved.revision&&<p className="subtitle">تُفتح «إفادات الملف» و«الوضع المالي» و«السجل» بعد حفظ الملف أول مرة.</p>}
 <TabsContent value="file"><fieldset className="readonly-fields" disabled={busy||!editable}>
  <p className="subtitle">حالة الملف وتوزيعه وأقساطه. تغيير هذه البيانات وحدها لا يلغي مراجعة المصدر.</p>
  <FollowFields p={draft.payload} set={(k,v)=>set(k,v)} assignees={assignees} batches={batches} tags={tags}/>
 </fieldset></TabsContent>
 <TabsContent value="parties"><fieldset className="readonly-fields" disabled={busy||!editable}>
  <p className="subtitle">دوّن البيانات كما وردت في المصدر. الحقول غير المعروفة تبقى فارغة، وتُراجع البيانات قبل إنشاء المستندات.</p>
  {saved.revision?<CaseLink ask={linkAsk} onAsked={clearAsk} file={saved} cases={cases} unsaved={editable&&dirty} editable={editable&&!dirty} allScope={allScope} onLinked={r=>{setSaved(r);setDraft(r);onChanged()}}/>
   :<CasePicker cases={cases} value={draft.caseId} optional={allScope} onChange={id=>{const c=cases.find(c=>c.id===id);setDraft(r=>({...r,caseId:id,payload:{...r.payload,company:r.payload.company||(c?clientName(c):''),defendant:r.payload.defendant||c?.opponent||''}}))}}/>}
  <ClientLink value={draft.payload.clientEntityId||''} clients={clients} company={p.company} onChange={v=>set('clientEntityId',v)}/>
  {COLLECTION_FIELDS.map(([title,fields],i)=><Fragment key={title}><section className="department-form-section"><h3>{title}</h3><div className="form-grid">{fields.map(([key,label])=>needWrap(key,key==='hearingCircuit'?<CircuitField key={key} label={label} value={String(draft.payload[key]||'')} onChange={v=>set(key,v)}/>:key.toLowerCase().includes('date')?<DateField key={key} label={label} value={String(draft.payload[key]||'')} onChange={v=>{set(key,v);if(key==='hearingDate'&&weekdayOf(v))set('hearingDay',weekdayOf(v))}}/>:key==='hearingDay'?<label key={key} className="field"><span>{label}</span><Choice label={label} value={String(draft.payload[key]||'')} onChange={v=>set(key,v)} options={[...new Set([...WEEKDAYS,String(draft.payload[key]||'')])]}/></label>:<Field key={key} label={label} value={String(draft.payload[key]||'')} onChange={v=>{set(key,v);if(key==='company')linkClient(v)}} suggestions={key==='nationality'?NATIONALITIES:key==='court'||key==='hearingCourt'?COURTS:key==='company'?clients.map(c=>c.name):key==='defendant'?opponents:undefined} type={key==='phone'?'tel':'text'}/>))}</div></section>
   {i===0&&<ExtraParties plaintiffs={p.plaintiffs||[]} defendants={p.defendants||[]} clients={clients} opponents={opponents} onChange={(k,v)=>set(k,v)}/>}</Fragment>)}
  {!!p.civilId&&!civilIdValid(p.civilId)&&<p className="notice" role="alert">الرقم المدني {p.civilId} لا يطابق رقم التحقق أو تاريخ الميلاد فيه. راجعه مع المصدر قبل إعداد المستندات.</p>}
  {!!related.length&&<section className="department-form-section"><h3>ملفات أخرى لنفس الخصم ({related.length})</h3><p className="subtitle">بنفس الرقم المدني{p.civilId?'':' أو الاسم'}. يمكن متابعتها معاً أو ضمها في دعوى واحدة.</p><ul className="linked-files">{related.map(f=><li key={f.id}><b>ملف {f.payload.code||'بلا رقم'}</b><span>{f.payload.company}</span><small>{[f.payload.fileStatus,f.payload.amount&&kwd(fils(f.payload.amount))+' د.ك',f.caseId?'مرتبط بقضية':'بلا قضية'].filter(Boolean).join(' · ')}</small><button type="button" className="btn" disabled={dirty} title={dirty?'احفظ التعديلات أولاً':undefined} onClick={()=>onOpenFile(f)}>فتح</button></li>)}</ul></section>}
  <Field label="مرجع المصدر الذي تمت مطابقته" value={draft.payload.sourceReference} onChange={v=>set('sourceReference',v)} placeholder="رقم الملف أو العقد، الجهة، وتاريخ الاطلاع"/><Field label="ملاحظات التحصيل" value={draft.payload.notes} onChange={v=>set('notes',v)} multiline/>
 </fieldset></TabsContent>
 <TabsContent value="papers"><fieldset className="readonly-fields" disabled={busy||!editable}>
  <section className="department-form-section"><h3>مستندات الحافظة</h3><p className="subtitle">أضف وصف المستندات المتوفرة فعلاً وحدد ما يدخل الحافظة. لا يلزم رفع PDF.</p><div className="actions evidence-actions">{editable&&<button type="button" className="btn" onClick={()=>{const standard=suggestedEvidence(draft.payload).map(e=>({...e,included:true}));const extra=draft.payload.evidence.filter(e=>!standard.some(x=>x.id===e.id));set('evidence',[...standard,...extra])}}><ListChecks size={15}/> إدراج المستندات المعتادة من بيانات الملف</button>}{draft.payload.evidence.length<100&&<button type="button" className="btn" onClick={()=>set('evidence',[...draft.payload.evidence,{id:crypto.randomUUID(),included:true,date:'',description:'',pages:1}])}>إضافة مستند للحافظة</button>}</div>{draft.payload.evidence.map((e,i)=><div className="evidence-row" key={e.id}><label className="checkbox-line"><input type="checkbox" checked={e.included} onChange={ev=>set('evidence',draft.payload.evidence.map((x,j)=>j===i?{...x,included:ev.target.checked}:x))}/> تضمين المستند {i+1}</label><Field label={'وصف المستند '+(i+1)} value={e.description} onChange={v=>set('evidence',draft.payload.evidence.map((x,j)=>j===i?{...x,description:v}:x))}/><DateField label={'تاريخ المستند '+(i+1)} value={e.date} onChange={v=>set('evidence',draft.payload.evidence.map((x,j)=>j===i?{...x,date:v}:x))}/><Field label={'عدد صفحات المستند '+(i+1)} type="number" value={String(e.pages)} onChange={v=>set('evidence',draft.payload.evidence.map((x,j)=>j===i?{...x,pages:Number(v)}:x))}/><button type="button" className="text-link" onClick={()=>set('evidence',draft.payload.evidence.filter((_,j)=>j!==i))}>إزالة المستند {i+1}</button></div>)}</section>
 </fieldset>
 {!!saved.revision&&<><section className="collection-review"><h3><FileCheck2 size={20}/> مراجعة المصدر</h3><p>{reviewed?`راجع ${saved.review!.reviewer} هذه النسخة بتاريخ ${officeTime(saved.review!.createdAt)}`:'يحتاج الملف إلى مراجعة المصدر. تعديل بيانات المصدر أو القضية يجعل المراجعة السابقة غير سارية.'}</p>{dirty&&<p className="notice">احفظ التعديلات قبل المراجعة أو الإنشاء.</p>}{editable&&<><label className="checkbox-line"><input type="checkbox" checked={attested} disabled={busy||dirty} onChange={e=>setAttested(e.target.checked)}/> راجعت البيانات الحالية وطابقتها مع المصدر المسجل.</label>{(()=>{const why=dirty?'احفظ تعديلات الملف أولاً.':!saved.payload.sourceReference?'أدخل «مرجع المصدر الذي تمت مطابقته» في «بيانات الملف» واحفظ.':saved.caseId&&!c?'القضية المرتبطة غير متاحة لك.':!attested?'ضع علامة على «راجعت البيانات…» أعلاه.':'';return why&&<small className="output-why">{why}</small>})()}<button className="btn" disabled={busy||dirty||!attested||!saved.payload.sourceReference||(!!saved.caseId&&!c)} onClick={()=>void mutate('review_file',{caseRevision:c?.revision??null,attested:true})}>تسجيل مراجعة المصدر</button></>}</section>
 <section className="collection-outputs"><h3>إعداد المستندات</h3><p className="subtitle">القوالب الحالية لصحيفة المطالبة بعد رفض أمر الأداء وحافظة المستندات. الحقول المطلوبة أدناه خاصة بالقالب المختار.</p>{(['claim','bundle'] as const).map(kind=>{const missing=missingDocumentFields(saved.payload,kind);return <div className="output-option" key={kind}><strong>{kind==='claim'?'صحيفة الدعوى':'حافظة المستندات'}</strong><small>{missing.length?'الحقول المطلوبة: '+missing.join('، '):'حقول القالب مكتملة'}</small>{access.canExport&&(()=>{const why=saved.archived?'الملف مغلق.':dirty?'احفظ تعديلات الملف أولاً.':!reviewed?'سجّل «مراجعة المصدر» أعلاه أولاً.':missing.length?'أكمل الحقول المطلوبة في «الأطراف والمطالبة».':'';return <>{why&&<small className="output-why">لا يمكن الإنشاء بعد: {why}{missing.some(m=>m!=='مستند واحد على الأقل بالحافظة')&&!dirty&&reviewed&&<> <button type="button" className="text-link" onClick={()=>setTab('parties')}>عرض الحقول الناقصة</button></>}</small>}<button className="btn primary" title={why||undefined} disabled={busy||!!why} onClick={()=>void generate(kind)}>{kind==='claim'?'إنشاء صحيفة Word':'إنشاء حافظة Word'}</button></>})()}</div>})}
 {!!outputs.length&&<details><summary>سجل نسخ الإنشاء ({outputs.length}{outputs.length===50?'+':''})</summary>{outputs.map(o=><p key={o.id}>{o.kind==='claim'?'صحيفة':'حافظة'} · نسخة الملف {o.recordRevision} · {o.actor} · {officeTime(o.createdAt)}</p>)}<small>حُفظت بيانات كل إنشاء مستقلة عن التعديلات اللاحقة.</small></details>}</section></>}
 </TabsContent>
 {!!saved.revision&&<><TabsContent value="statements"><FileStatements file={saved} rows={statements} editable={access.canEdit&&!saved.archived} canPrint={access.canExport} onChanged={onChanged}/></TabsContent>
 <TabsContent value="money"><FilePosition file={saved} rows={payments} editable={access.canEdit&&!saved.archived} canPrint={access.canExport} onChanged={onChanged}/></TabsContent>
 <TabsContent value="history"><DepartmentHistory workspace="collections" id={saved.id} revision={saved.revision}/></TabsContent></>}
 </Tabs>
 </RecordWindow>;
}

/** The file's case: link it once a lawsuit exists, change it, or (with all-case scope) detach it. Statements and payments follow. */
function CaseLink({ask=0,onAsked,file,cases,editable,allScope,onLinked,unsaved=false}:{ask?:number;onAsked?:()=>void;file:CollectionRecord;cases:CaseSummary[];editable:boolean;allScope:boolean;onLinked:(r:CollectionRecord)=>void;unsaved?:boolean}) {
 const [picking,setPicking]=useState(ask>0&&editable),[pick,setPick]=useState(''),[busy,setBusy]=useState(false);
 const c=cases.find(x=>x.id===file.caseId),box=useRef<HTMLElement>(null);
 // The «ربط بقضية» button in the window's side panel opens the picker here.
 const [seen,setSeen]=useState(ask);
 if(ask!==seen){setSeen(ask);if(editable&&ask)setPicking(true)}
 // The request is handled once, whether this section was already open or opens with it.
 useEffect(()=>{if(!ask)return;onAsked?.();requestAnimationFrame(()=>{box.current?.scrollIntoView({block:'center',behavior:'smooth'});box.current?.querySelector<HTMLElement>('select,input,button[role=combobox]')?.focus()})},[ask,onAsked]);
 async function link(caseId:string){setBusy(true);try{const r=await departmentRequest<CollectionRecord>('link_case',{workspace:'collections',id:file.id,revision:file.revision,caseId});onLinked(r);setPicking(false);setPick('');toast.success(caseId?'رُبط الملف بالقضية':'فُك ربط الملف بالقضية')}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <section ref={box} className="department-form-section case-link"><h3>القضية المرتبطة</h3>
  {file.caseId?<p><b>{c?`${c.code?'كود '+c.code:'بلا كود'} · ${clientName(c)} / ${c.opponent}`:'قضية غير متاحة لحسابك'}</b>{c?.autoNumber&&<small> · الرقم الآلي للقضية {c.autoNumber}</small>}</p>:<p className="subtitle">الملف غير مرتبط بقضية بعد. اربطه بالقضية عند رفع الدعوى أو عند تسجيلها في سجل الأحكام. للقضية كودها ورقمها الآلي في بوابة العدل، وهما غير رقم هذا الملف والرقم الآلي لأمر الأداء.</p>}
  {editable&&!picking&&<div className="actions"><button type="button" className="btn" onClick={()=>setPicking(true)}>{file.caseId?'تغيير القضية':'ربط بقضية'}</button>{file.caseId&&allScope&&<button type="button" className="btn" disabled={busy} onClick={()=>{if(window.confirm('فك ربط الملف بهذه القضية؟ تبقى إفادات الملف ودفعاته معه.'))void link('')}}>فك الربط</button>}</div>}
  {picking&&<><CasePicker cases={cases} value={pick} onChange={setPick}/><div className="actions"><button type="button" className="btn primary" disabled={busy||!pick} onClick={()=>void link(pick)}>ربط الملف بالقضية</button><button type="button" className="btn" onClick={()=>setPicking(false)}>إلغاء</button></div></>}
  {unsaved&&file.revision>0&&<small className="muted">احفظ تعديلات الملف أولاً لتغيير ربطه.</small>}
 </section>;
}

/** The client profile this file belongs to. Linking groups the client's files; the name written on the papers stays as entered. */
function ClientLink({value,clients,company,onChange}:{value:string;clients:ClientOption[];company:string;onChange:(v:string)=>void}) {
 const current=clients.find(c=>c.id===value);
 if(!clients.length)return value?<p className="subtitle">مرتبط بملف موكل في سجل الموكلين.</p>:null;
 const guess=!value&&company?clients.find(c=>normalizeSearch(c.name)===normalizeSearch(company)):undefined;
 return <section className="department-form-section"><h3>ملف الموكل</h3>
  <div className="form-grid"><OfficeSelect label="الموكل في سجل الموكلين" value={value} onChange={onChange} options={[['','غير مربوط'],...clients.map(c=>[c.id,c.name] as [string,string])]}/></div>
  <p className="subtitle">{current?'تظهر ملفات التحصيل هذه في ملف الموكل.':'اربط الملف بملف الموكل ليظهر ضمن ملفاته.'} الاسم المكتوب في المستندات يبقى كما أُدخل.</p>
  {guess&&<button type="button" className="btn" onClick={()=>onChange(guess.id)}>ربط بـ «{guess.name}»</button>}
 </section>;
}

/** Opens a case in the cases register from a collection file and links the file to it. The office code is asked for:
 a collection file number is not a case code. Parties, court, numbers and the next hearing are taken from the file. */
function MakeCase({file,cases,onClose,onMade}:{file:CollectionRecord;cases:CaseSummary[];onClose:()=>void;onMade:(r:CollectionRecord,c:CaseSummary)=>void}){
 const p=file.payload;
 const [code,setCode]=useState(''),[autoNumber,setAutoNumber]=useState(''),[caseNumber,setCaseNumber]=useState(p.lawsuitYear&&p.lawsuitNumber?`${p.lawsuitYear}/${p.lawsuitNumber}`:p.lawsuitNumber||''),[court,setCourt]=useState(p.hearingCourt||''),[busy,setBusy]=useState(false);
 // A code or automatic number that already belongs to a case shows that case and the files linked to it, and offers to link this file to it instead.
 const same=(a:string|undefined,b:string)=>!!b.trim()&&(a||'').trim().toLowerCase()===b.trim().toLowerCase();
 const byCode=cases.find(c=>same(c.code,code)),byAuto=cases.find(c=>same(c.autoNumber,autoNumber)),existing=byCode||byAuto;
 const orderNumbers=[p.fileAutoNumber,p.orderAuto].map(x=>(x||'').trim()).filter(Boolean);
 const needs:NeedList=[!code.trim()&&'أدخل كود المكتب للقضية',!!byCode&&'هذا الكود لقضية موجودة؛ اربط الملف بها أو اختر كوداً جديداً',
  !!byAuto&&'هذا الرقم الآلي لقضية موجودة؛ اربط الملف بها أو صحّح الرقم',
  !!p.code&&code.trim()===p.code.trim()&&'هذا رقم ملف التحصيل؛ أدخل كود القضية في سجل المكتب',
  orderNumbers.includes(autoNumber.trim())&&'هذا الرقم الآلي لأمر الأداء؛ الرقم الآلي للقضية يصدر من بوابة العدل عند قيد الدعوى'];
 async function make(){if(needs.some(Boolean)||busy)return;setBusy(true);let made:CaseRecord|null=null;
  try{const amount=p.amount?kwd(fils(p.amount))+' د.ك':'';
   const first=p.hearingDate?[{id:crypto.randomUUID(),date:todayISO(),kind:'قيد الدعوى',court,text:'قيد الدعوى'+(caseNumber?' رقم '+caseNumber:'')+' (من ملف التحصيل)',followup:p.hearingDate,source:'ملف التحصيل'}]:[];
   const d=await api('/api/cases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({case:{...emptyCase(),code:code.trim(),autoNumber:autoNumber.trim(),client:p.company,clientGroup:p.company,clientEntityId:p.clientEntityId,opponent:joinNames(partyNames(p.defendant,p.defendants)),caseNumber:caseNumber.trim(),court:court.trim(),
    subject:'مطالبة مالية'+(amount?' بمبلغ '+amount:''),source:'ملف التحصيل',notes:'أُنشئت من ملف التحصيل'+(p.code?' رقم '+p.code:'')+'.',procedures:first}})});
   made=d.case as CaseRecord;
   const r=await departmentRequest<CollectionRecord>('link_case',{workspace:'collections',id:file.id,revision:file.revision,caseId:made.id});
   onMade(r,{id:made.id,code:made.code,autoNumber:made.autoNumber,client:made.client,clientGroup:made.clientGroup,clientEntityName:made.clientEntityName,opponent:made.opponent,revision:made.revision,archived:false});
   toast.success(`أُنشئت القضية ${made.code} ورُبط بها الملف، وتظهر الآن في سجل الأحكام`)}
  catch(e){toast.error(made?`أُنشئت القضية ${made.code} لكن تعذر ربط الملف بها: ${(e as Error).message}. اربطه من «القضية المرتبطة».`:(e as Error).message)}
  finally{setBusy(false)}}
 async function linkExisting(c:CaseSummary){if(busy)return;setBusy(true);
  try{const r=await departmentRequest<CollectionRecord>('link_case',{workspace:'collections',id:file.id,revision:file.revision,caseId:c.id});onMade(r,c);toast.success(`رُبط الملف بالقضية ${c.code||c.autoNumber}`)}
  catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <EditorDialog title="إنشاء قضية من ملف التحصيل" description="تُفتح قضية في سجل الأحكام بأطراف هذا الملف وتُربط به. للقضية أرقامها: كودها في سجل المكتب ورقمها الآلي في بوابة العدل، وهما غير رقم ملف التحصيل والرقم الآلي لأمر الأداء." busy={busy} onClose={onClose}>
  <dl className="make-case-summary"><div><dt>المدعي (الموكل)</dt><dd>{joinNames(partyNames(p.company,p.plaintiffs))}</dd></div><div><dt>المدعى عليه</dt><dd>{joinNames(partyNames(p.defendant,p.defendants))}</dd></div><div><dt>المطالبة</dt><dd>{p.amount?kwd(fils(p.amount))+' د.ك':'—'}</dd></div><div><dt>رقم ملف التحصيل</dt><dd>{p.code||'—'}</dd></div><div><dt>الرقم الآلي لأمر الأداء</dt><dd>{orderNumbers[0]||'—'}</dd></div></dl>
  <form className="form-grid" onSubmit={e=>{e.preventDefault();void make()}}>
   <Field label="كود المكتب للقضية" value={code} onChange={setCode} placeholder="مثل 1250"/>
   <Field label="الرقم الآلي للقضية (بوابة العدل)" value={autoNumber} onChange={setAutoNumber} placeholder="يُترك فارغاً إن لم تُقيد الدعوى بعد"/>
   <Field label="رقم الدعوى / السنة" value={caseNumber} onChange={setCaseNumber}/>
   <Field label="المحكمة" value={court} onChange={setCourt} suggestions={COURTS}/>
   {existing&&<ExistingCase c={existing} via={byCode?'code':'auto'} fileId={file.id} busy={busy} onLink={()=>void linkExisting(existing)}/>}
   {p.hearingDate&&<p className="subtitle wide">تُضاف جلسة {formatDate(p.hearingDate)} من الملف إلى رول الجلسات.</p>}
   <Needs items={needs} className="wide"/>
   <div className="actions wide"><button className="btn primary" disabled={busy||needs.some(Boolean)}><Scale size={15}/> {busy?'جارٍ الإنشاء…':'إنشاء القضية وربط الملف'}</button><button type="button" className="btn" disabled={busy} onClick={onClose}>إلغاء</button></div>
  </form>
 </EditorDialog>;
}

/** The case a typed code or automatic number belongs to, with the collection files already linked to it. */
function ExistingCase({c,via,fileId,busy,onLink}:{c:CaseSummary;via:'code'|'auto';fileId:string;busy:boolean;onLink:()=>void}){
 const [files,setFiles]=useState<{caseId:string;list:CollectionRecord[]}|null>(null);
 useEffect(()=>{let live=true;departmentRequest<CollectionRecord[]>('case_files',{workspace:'collections',caseId:c.id}).then(r=>{if(live)setFiles({caseId:c.id,list:r})}).catch(()=>{if(live)setFiles({caseId:c.id,list:[]})});return()=>{live=false}},[c.id]);
 const list=files?.caseId===c.id?files.list:null,others=(list||[]).filter(f=>f.id!==fileId),linked=(list||[]).some(f=>f.id===fileId);
 return <div className="existing-case wide" role="status">
  <p><b>{via==='code'?'هذا الكود':'هذا الرقم الآلي'} لقضية موجودة في سجل الأحكام:</b> كود {c.code||'—'}{c.autoNumber?' · الرقم الآلي '+c.autoNumber:''} · {c.clientEntityName||c.client||'—'} ضد {c.opponent||'—'}</p>
  {list===null?<small>جارٍ التحقق من ملفات التحصيل المرتبطة بها…</small>:others.length?<><small>ملفات التحصيل المرتبطة بها ({others.length}):</small>
   <ul>{others.map(f=><li key={f.id}><b>ملف {f.payload.code||'بلا رقم'}</b> · {partyLabel(f.payload.company,f.payload.plaintiffs)} ضد {partyLabel(f.payload.defendant,f.payload.defendants)}{f.payload.amount?' · '+kwd(fils(f.payload.amount))+' د.ك':''}{f.payload.fileStatus?' · '+f.payload.fileStatus:''}</li>)}</ul></>
   :<small>لا يرتبط بها أي ملف تحصيل بعد.</small>}
  {linked?<small>هذا الملف مرتبط بها بالفعل.</small>:<button type="button" className="btn" disabled={busy} onClick={onLink}><Link2 size={15}/> ربط هذا الملف بهذه القضية بدلاً من إنشاء قضية</button>}
 </div>;
}

/** Further plaintiffs and defendants: one person can sue several, and several can sue one. The first of each side stays
 in the fields above; names are suggested from the clients register and from the opponents already on file. */
function ExtraParties({plaintiffs,defendants,clients,opponents,onChange}:{plaintiffs:CollectionParty[];defendants:CollectionParty[];clients:ClientOption[];opponents:string[];onChange:(key:'plaintiffs'|'defendants',v:CollectionParty[])=>void}){
 const side=(key:'plaintiffs'|'defendants',list:CollectionParty[],title:string,add:string,names:string[])=>{
  const edit=(i:number,patch:Partial<CollectionParty>)=>onChange(key,list.map((x,j)=>j===i?{...x,...patch}:x));
  return <div className="extra-side"><div className="client-section-heading"><b>{title}{list.length?` (${list.length})`:''}</b><button type="button" className="btn" disabled={list.length>=20} onClick={()=>onChange(key,[...list,{id:crypto.randomUUID(),name:''}])}><UserPlus size={15}/> {add}</button></div>
   {!list.length?<p className="muted">لا يوجد. أضف طرفاً إذا كان في الملف أكثر من {key==='plaintiffs'?'مدعٍ':'مدعى عليه'}.</p>:list.map((x,i)=><div key={x.id} className="extra-party">
    <Field label={`الاسم ${i+2}`} value={x.name} onChange={v=>{const m=key==='plaintiffs'?clients.find(c=>normalizeSearch(c.name)===normalizeSearch(v)):undefined;edit(i,{name:v,...(key==='plaintiffs'?{clientEntityId:m?.id||''}:{})})}} suggestions={names}/>
    <Field label="الرقم المدني" value={x.civilId||''} onChange={v=>edit(i,{civilId:v})}/>
    <Field label="الهاتف" value={x.phone||''} type="tel" onChange={v=>edit(i,{phone:v})}/>
    <Field label={key==='plaintiffs'?'العنوان':'العنوان / الوظيفة'} value={x.address||''} onChange={v=>edit(i,{address:v})}/>
    <button type="button" className="icon-btn" aria-label={'حذف '+(x.name||'الطرف')} onClick={()=>onChange(key,list.filter((_,j)=>j!==i))}><Trash2 size={15}/></button>
    {key==='plaintiffs'&&x.clientEntityId&&<small className="extra-linked">مرتبط بملف الموكل</small>}
   </div>)}</div>;
 };
 return <section className="department-form-section extra-parties"><h3>أطراف إضافية</h3><p className="subtitle">تُذكر كل الأسماء في صحيفة الدعوى والحافظة، ويظهر عددها في عنوان الملف.</p>
  {side('plaintiffs',plaintiffs,'مدعون آخرون','إضافة مدعٍ',clients.map(c=>c.name))}
  {side('defendants',defendants,'مدعى عليهم آخرون','إضافة مدعى عليه',opponents)}
 </section>;
}
