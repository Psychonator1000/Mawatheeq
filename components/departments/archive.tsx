import {useEffect,useMemo,useState} from 'react';
import {Plus,Printer,ScanLine,MapPin,ArrowLeftRight,History,FileText,ClipboardCheck,ClipboardList,Undo2,Inbox,BookCopy,CheckCircle2,type LucideIcon} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {type CaseSummary,type DepartmentRecord,newDepartmentRecord} from '@/lib/departments';
import type {Permissions} from '@/lib/permissions';
import {CUSTODY_STATES,MOVEMENTS,FILE_TYPES,OUTSIDE_BODIES,PURPOSES,REQUEST_STATUSES,custodyOf,fileMovements,recordedAt,isOverdue,daysBetween,nextNumber,locationLabel,retentionDue,needsHolder,code39Ready,code39Svg,handoverOf,HANDOVER_LABELS,PAPER_FILES_EVENT,
 type ArchiveFile,type ArchiveLocation,type ArchiveMovement,type ArchiveRequest,type Custody,type FileData,type LocationData,type MovementData,type MovementType,type RequestData} from '@/lib/archive';
import {clientName} from '@/lib/clients';
import {normalizeSearch} from '@/lib/case-browse';
import {formatDate,todayISO} from '@/lib/domain';
import {archiveLabelsHtml,custodyReceiptHtml,listHtml,printHtml,type ArchiveLabel} from '@/lib/print';
import {Field,DateField,Empty,PickOrType} from '../shared';
import {OfficeSelect,officeTime} from '../office-shared';
import PageNavigation from '../page-navigation';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '../ui/tabs';
import {CasePicker,DepartmentHistory,EditorDialog,StatusMessage,useRecords,exportCsv} from './shared';
import RecordWindow,{useListNav,type WindowNav,type Enter} from '../record-window';
import CopyChip from '../copy-chip';
import Needs from '../needs';
import DispatchSheet from './archive-dispatch';
import ArchiveMap from './archive-map';

type View='files'|'dispatch'|'custody'|'requests'|'locations'|'log';
const PER_PAGE=25;
type Person={id:string;username:string;displayName:string};
type Preset={type:MovementType;holder:string;holderId:string;purpose:string;dueDate:string;requestId:string};
const stateTone:Record<string,string>={in:'green',staff:'amber',court:'wine',client:''};
const blankFile=(number:string):FileData=>({number,title:'',type:'ملف قضية',volume:'',pages:'',locationId:'',originals:'no',confidential:'no',intakeDate:todayISO(),retentionUntil:'',notes:''});
const blankLocation:LocationData={code:'',name:'',cabinet:'',shelf:'',box:'',capacity:'',notes:''};
const save=<T,>(record:DepartmentRecord<T>)=>departmentRequest<DepartmentRecord<T>>('save_record',{workspace:'archive',record});
// The archive confirms a file is back on the shelf: the holder reported it, or it came back at the desk.
// Handing a requested file to the colleague who asked: a one-line handover sheet, so they get the notice with «استلمت» and the request closes.
const sendToRequester=(r:ArchiveRequest)=>departmentRequest('dispatch',{workspace:'archive',date:todayISO(),items:[{fileId:r.subjectId,holderId:r.payload.requesterId,purpose:r.payload.purpose,dueDate:''}]});
const approveReturn=(f:ArchiveFile)=>departmentRequest<ArchiveMovement>('approve_return',{workspace:'archive',fileId:f.id});
const personName=(p:Person)=>p.displayName||p.username;

export default function ArchiveRoom({cases,access}:{cases:CaseSummary[];access:Permissions}) {
 const {rows,loading,error,reload,refresh}=useRecords<Record<string,string>>('archive');
 // Receipts, reported returns and new requests arrive from colleagues: look again every minute, on focus and after any paper-file action.
 useEffect(()=>{const t=window.setInterval(()=>{if(!document.hidden)void refresh()},60000);addEventListener('focus',refresh);addEventListener(PAPER_FILES_EVENT,refresh);
  return()=>{clearInterval(t);removeEventListener('focus',refresh);removeEventListener(PAPER_FILES_EVENT,refresh)}},[refresh]);
 const {files,locations,movements,requests}=useMemo(()=>({files:rows.filter(r=>r.kind==='file') as unknown as ArchiveFile[],locations:rows.filter(r=>r.kind==='location') as unknown as ArchiveLocation[],
  movements:rows.filter(r=>r.kind==='movement') as unknown as ArchiveMovement[],requests:rows.filter(r=>r.kind==='request') as unknown as ArchiveRequest[]}),[rows]);
 const custody=useMemo(()=>new Map(files.map(f=>[f.id,custodyOf(f,movements)])),[files,movements]);
 const [people,setPeople]=useState<Person[]>([]);
 useEffect(()=>{departmentRequest<Person[]>('people',{workspace:'archive'}).then(setPeople).catch(()=>setPeople([]))},[]);
 const [view,setView]=useState<View>('files'),[search,setSearch]=useState(''),[state,setState]=useState(''),[place,setPlace]=useState(''),[type,setType]=useState(''),[show,setShow]=useState('active'),[page,setPage]=useState(1);
 const [editing,setEditingRaw]=useState<ArchiveFile|null>(null),[preset,setPreset]=useState<Preset|null>(null),[location,setLocation]=useState<ArchiveLocation|null>(null),[stocktake,setStocktake]=useState<ArchiveLocation|null>(null),[request,setRequest]=useState<ArchiveRequest|null>(null);
 const [picked,setPicked]=useState<Set<string>>(()=>new Set()),[scan,setScan]=useState('');
 const today=todayISO(),all=access.caseScope==='all';
 const caseOf=(id:string)=>cases.find(c=>c.id===id),locOf=(id:string)=>locations.find(l=>l.id===id);
 const caseRef=(f:ArchiveFile)=>{const c=caseOf(f.caseId);return c?c.code||c.autoNumber||'بلا كود':f.caseId?'قضية غير متاحة':'ملف عام'};
 const parties=(f:ArchiveFile)=>{const c=caseOf(f.caseId);return c?`${clientName(c)} / ${c.opponent}`:''};
 const active=files.filter(f=>!f.archived),cu=(f:ArchiveFile)=>custody.get(f.id)!;
 const filtered=files.filter(f=>(show==='all'||(show==='archived'?f.archived:!f.archived))&&(!state||(state==='overdue'?isOverdue(cu(f),today):state==='retention'?retentionDue(f,today):state==='awaiting'?handoverOf(cu(f))==='awaiting-receipt':state==='reported'?handoverOf(cu(f))==='return-reported':cu(f).state===state))
  &&(!place||cu(f).locationId===place)&&(!type||f.payload.type===type)
  &&normalizeSearch([f.payload.number,f.payload.title,f.payload.type,caseRef(f),parties(f),cu(f).holder,f.payload.notes].join(' ')).includes(normalizeSearch(search)))
  .sort((a,b)=>a.payload.number.localeCompare(b.payload.number,'en',{numeric:true}));
 const pages=Math.max(1,Math.ceil(filtered.length/PER_PAGE)),current=Math.min(page,pages);
 const {nav,step,enter,openItem}=useListNav(filtered,editing,setEditingRaw);
 const setEditing=(f:ArchiveFile|null,p:Preset|null=null)=>{setPreset(p);openItem(f)};
 const out=active.filter(f=>cu(f).state!=='in'),overdue=out.filter(f=>isOverdue(cu(f),today)),pending=requests.filter(r=>!r.archived&&(r.payload.status==='pending'||r.payload.status==='ready'));
 const label=(f:ArchiveFile)=>({number:f.payload.number,barcode:code39Ready(f.payload.number)?code39Svg(f.payload.number):'',title:f.payload.title,caseRef:caseRef(f),parties:parties(f),type:[f.payload.type,f.payload.volume&&'مجلد '+f.payload.volume].filter(Boolean).join(' · '),location:locationLabel(locOf(cu(f).locationId))});
 const printLabels=(list:ArchiveFile[])=>{if(!printHtml(archiveLabelsHtml(list.map(label),formatDate(today),'')))toast.error('تعذر فتح نافذة الطباعة.')};
 const openScan=()=>{const v=scan.trim().toUpperCase();if(!v){toast.error('امسح الباركود أو اكتب رقم الأرشيف أولاً.');return}const f=files.find(f=>f.payload.number.toUpperCase()===v);if(f){setScan('');setView('files');setEditing(f)}else toast.error('لا يوجد ملف بهذا الرقم: '+v)};
 const reported=out.filter(f=>handoverOf(cu(f))==='return-reported'),unconfirmed=out.filter(f=>handoverOf(cu(f))==='awaiting-receipt');
 const approve=async(f:ArchiveFile)=>{try{await approveReturn(f);toast.success('عاد الملف '+f.payload.number+' إلى الأرشيف');reload();dispatchEvent(new Event(PAPER_FILES_EVENT))}catch(e){toast.error((e as Error).message)}};
 const views:[View,string,LucideIcon,number?][]=[['files','الملفات',BookCopy],...(access.canEdit?[['dispatch','كشف التسليم',ClipboardList] as [View,string,LucideIcon]]:[]),['custody','العهدة',ArrowLeftRight,out.length],['requests','الطلبات',Inbox,pending.length],['locations','خريطة الحفظ',MapPin],['log','سجل الحركة',History]];
 const newFile=()=>setEditing(newDepartmentRecord('archive','file',blankFile(nextNumber(files))) as unknown as ArchiveFile);
 // Every case has a paper file in the archive: one per office code, whichever of its judgments it is linked to.
 const missing=useMemo(()=>{const covered=new Set(files.map(f=>caseOf(f.caseId)?.code).filter(Boolean));const seen=new Set<string>();
  return cases.filter(c=>!c.archived&&c.code&&!covered.has(c.code)&&!seen.has(c.code)&&seen.add(c.code))},[files,cases]);// eslint-disable-line react-hooks/exhaustive-deps
 const [making,setMaking]=useState(0);
 async function createMissing(){const taken=new Set(files.map(f=>f.payload.number.toLowerCase()));let made=0;setMaking(1);
  try{for(const c of missing){let number=/^[A-Za-z0-9-]{1,30}$/.test(c.code)?'ARC-'+c.code:'';if(!number||taken.has(number.toLowerCase())){let i=1;do number='ARC-X'+String(i++).padStart(5,'0');while(taken.has(number.toLowerCase()))}
    taken.add(number.toLowerCase());
    await save({...newDepartmentRecord('archive','file',{...blankFile(number),title:[clientName(c),c.opponent].filter(Boolean).join(' ضد ').slice(0,300)||'ملف قضية '+c.code,intakeDate:'',notes:'أُدرج لكل قضية في السجل'}),caseId:c.id});made++;setMaking(made+1)}
   toast.success(`أُنشئ ${made} ملف ورقي`)}catch(e){toast.error(`أُنشئ ${made} ملف ثم توقف: ${(e as Error).message}`)}finally{setMaking(0);reload()}}
 // One screen: the scanner, what is late and what is asked for beside the files.
 return <><div className="work-desk-grid">
 <div className="work-desk-aside"><section className="panel sec-agenda" aria-label="اليوم في الأرشيف">
  <div className="sec-agenda-head"><div><h2>اليوم في الأرشيف</h2><small>{formatDate(today)} · {active.length} ملف</small></div></div>
  <div className="archive-scan desk-scan"><ScanLine size={18} aria-hidden/><label className="field"><span>مسح الباركود أو كتابة رقم الأرشيف</span><input dir="ltr" value={scan} onChange={e=>setScan(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();openScan()}}} placeholder="ARC-00001"/></label><button className="btn" onClick={openScan}>فتح الملف</button></div>
  <div className="desk-stats">
   <button type="button" onClick={()=>{setView('files');setShow('active');setState('in');setPage(1)}}><span>في الأرشيف</span><b>{active.filter(f=>cu(f).state==='in').length}</b></button>
   <button type="button" onClick={()=>setView('custody')}><span>خارج الأرشيف</span><b>{out.length}</b></button>
   <button type="button" onClick={()=>{setView('files');setShow('active');setState('retention');setPage(1)}} title="ملفات مفتوحة حلّ تاريخ «يُحفظ حتى» فيها: راجعها ثم أغلقها"><span>انتهت مدة حفظها</span><b>{active.filter(f=>retentionDue(f,today)).length}</b></button>
   <button type="button" onClick={()=>{setView('files');setShow('archived');setState('');setPage(1)}} title="الملفات المغلقة (أُتلفت أو انتهى حفظها)"><span>مغلقة</span><b>{files.length-active.length}</b></button>
  </div>
  <div className="sec-agenda-list">
   {reported.length>0&&<><h3 className="desk-sub">أُبلغ بإرجاعها · أكّد الاستلام ({reported.length})</h3>{reported.map(f=>{const c=cu(f);return <div key={f.id} className="agenda-item agenda-action"><button type="button" className="agenda-open" onClick={()=>setEditing(f)}><span className="agenda-time" dir="ltr">{f.payload.number}</span><span className="agenda-body"><b>{f.payload.title}</b><small>{c.holder} · أبلغ بالإرجاع</small></span></button>{access.canEdit&&<button type="button" className="btn primary" onClick={()=>void approve(f)}><CheckCircle2 size={14}/> عاد الملف</button>}</div>})}</>}
   {unconfirmed.length>0&&<><h3 className="desk-sub">لم يؤكد المستلم استلامها ({unconfirmed.length})</h3>{unconfirmed.map(f=>{const c=cu(f);return <button key={f.id} className="agenda-item" onClick={()=>setEditing(f)}><span className="agenda-time" dir="ltr">{f.payload.number}</span><span className="agenda-body"><b>{f.payload.title}</b><small>{c.holder} · أُرسل {formatDate(c.since)}</small></span></button>})}</>}
   <h3 className="desk-sub">تأخرت إعادتها ({overdue.length})</h3>{overdue.length?overdue.map(f=>{const c=cu(f);return <button key={f.id} className="agenda-item late" onClick={()=>setEditing(f)}><span className="agenda-time" dir="ltr">{f.payload.number}</span><span className="agenda-body"><b>{f.payload.title}</b><small>{c.holder} · متأخر {daysBetween(c.dueDate,today)} يوم</small></span></button>}):<p className="muted sec-empty">كل الملفات في موعدها.</p>}
   <h3 className="desk-sub">طلبات مفتوحة ({pending.length})</h3>{pending.length?pending.map(r=>{const f=files.find(x=>x.id===r.subjectId);return <button key={r.id} className="agenda-item" onClick={()=>setRequest(r)}><span className="agenda-time">{r.payload.neededBy?formatDate(r.payload.neededBy):'دون موعد'}</span><span className="agenda-body"><b>{r.payload.requester||'طلب'}</b><small>{f?.payload.number} · {r.payload.purpose||f?.payload.title}</small></span></button>}):<p className="muted sec-empty">لا توجد طلبات مفتوحة.</p>}
  </div>
 </section></div>
 <section className="panel work-desk">
 <div className="work-desk-head"><h2>الأرشيف</h2><div className="work-chips" role="group" aria-label="أقسام الأرشيف">{views.map(([id,l,Icon,n])=><button key={id} className={'work-chip'+(view===id?' on':'')} aria-pressed={view===id} onClick={()=>setView(id)}><Icon size={14}/> {l}{n?<b>{n}</b>:null}</button>)}</div>
  {view==='files'&&<div className="actions">{access.canExport&&<button className="btn" onClick={()=>void exportCsv('archive','Mawatheeq-archive',[['رقم الأرشيف','العنوان','النوع','المجلد','القضية','الأطراف','الحالة','الموقع','المستلم','موعد الإعادة','آخر جرد'],...filtered.map(f=>{const c=cu(f);return [f.payload.number,f.payload.title,f.payload.type,f.payload.volume,caseRef(f),parties(f),CUSTODY_STATES[c.state],locationLabel(locOf(c.locationId)),c.holder,c.dueDate,c.lastAudit]})]).catch(e=>toast.error(e.message))}>تصدير القائمة</button>}{access.canEdit&&<button className="btn primary" onClick={newFile}><Plus size={17}/> ملف ورقي جديد</button>}</div>}</div>
 <StatusMessage loading={loading} error={error}/>
 {!loading&&!error&&view==='files'&&access.canEdit&&all&&missing.length>0&&<div className="notice archive-missing" role="status"><span><b>{missing.length}</b> قضية في السجل بلا ملف ورقي في الأرشيف.</span><button className="btn primary" disabled={!!making} onClick={()=>void createMissing()}>{making?`جارٍ الإنشاء ${making-1} من ${missing.length}…`:'إنشاء ملفاتها'}</button></div>}
 {!loading&&!error&&view==='files'&&<>
  <div className="status-chips" role="group" aria-label="مكان الملف">{(['',...Object.keys(CUSTODY_STATES)] as string[]).map(s=><button type="button" key={s||'all'} className={'chip'+(state===s&&show==='active'?' on':'')} onClick={()=>{setShow('active');setState(s);setPage(1)}}>{s?CUSTODY_STATES[s as keyof typeof CUSTODY_STATES]:'كل الملفات'} <b>{active.filter(f=>!s||cu(f).state===s).length}</b></button>)}{overdue.length>0&&<button type="button" className={'chip warn'+(state==='overdue'&&show==='active'?' on':'')} onClick={()=>{setShow('active');setState('overdue');setPage(1)}}>متأخرة <b>{overdue.length}</b></button>}{unconfirmed.length>0&&<button type="button" className={'chip warn'+(state==='awaiting'&&show==='active'?' on':'')} onClick={()=>{setShow('active');setState('awaiting');setPage(1)}}>بانتظار الاستلام <b>{unconfirmed.length}</b></button>}{reported.length>0&&<button type="button" className={'chip'+(state==='reported'&&show==='active'?' on':'')} onClick={()=>{setShow('active');setState('reported');setPage(1)}}>أُبلغ بإرجاعها <b>{reported.length}</b></button>}{files.length>active.length&&<button type="button" className={'chip'+(show==='archived'?' on':'')} onClick={()=>{setShow('archived');setState('');setPage(1)}}>المغلقة <b>{files.length-active.length}</b></button>}</div>
  <div className="work-desk-filters"><Field label="بحث الأرشيف" value={search} onChange={v=>{setSearch(v);setPage(1)}} placeholder="رقم الأرشيف، العنوان، الكود، الأطراف أو المستلم"/>
   <OfficeSelect label="الموقع" value={place} onChange={v=>{setPlace(v);setPage(1)}} options={[['','كل المواقع'],...locations.map(l=>[l.id,locationLabel(l)] as [string,string])]}/>
   <OfficeSelect label="نوع الملف" value={type} onChange={v=>{setType(v);setPage(1)}} options={[['','كل الأنواع'],...[...new Set([...FILE_TYPES,...files.map(f=>f.payload.type)])].map(t=>[t,t] as [string,string])]}/>
   <OfficeSelect label="عرض" value={show} onChange={v=>{setShow(v);setPage(1)}} options={[['active','الملفات الفعالة'],['archived','المغلقة'],['all','الكل']]}/>
   </div>
  {picked.size>0&&<div className="pick-bar" role="status"><b>تم تحديد {picked.size} ملف</b>{access.canExport&&<button className="btn primary" onClick={()=>printLabels(files.filter(f=>picked.has(f.id)))}><Printer size={15}/> طباعة الملصقات</button>}<button className="btn" onClick={()=>setPicked(new Set())}>إلغاء التحديد</button></div>}
  <div className="work-desk-body">{!filtered.length?<Empty text={files.length?'جرّب تعديل البحث أو عوامل التصفية.':'سجّل الملفات الورقية الموجودة في المكتب، ثم حدد موقع كل ملف.'}/>:<table className="office-table archive-table"><thead><tr><th><input type="checkbox" aria-label="تحديد كل الملفات المعروضة" checked={filtered.slice((current-1)*PER_PAGE,current*PER_PAGE).every(f=>picked.has(f.id))} onChange={e=>setPicked(old=>{const n=new Set(old);for(const f of filtered.slice((current-1)*PER_PAGE,current*PER_PAGE)){if(e.target.checked)n.add(f.id);else n.delete(f.id)}return n})}/></th><th>رقم الأرشيف</th><th>الملف</th><th>القضية</th><th>مكانه الآن</th><th>آخر جرد</th></tr></thead>
   <tbody>{filtered.slice((current-1)*PER_PAGE,current*PER_PAGE).map(f=>{const c=cu(f),late=isOverdue(c,today);return <tr key={f.id} className={'clickable'+(late?' late':'')} onClick={e=>{if(!(e.target as HTMLElement).closest('input,button'))setEditing(f)}}>
    <td><input type="checkbox" aria-label={'تحديد '+f.payload.number} checked={picked.has(f.id)} onChange={e=>setPicked(old=>{const n=new Set(old);if(e.target.checked)n.add(f.id);else n.delete(f.id);return n})}/></td>
    <td className="nowrap"><b dir="ltr">{f.payload.number}</b>{f.archived&&<small>مغلق</small>}</td>
    <td><b>{f.payload.title}</b><small>{[f.payload.type,f.payload.volume&&'مجلد '+f.payload.volume,f.payload.originals==='yes'&&'أصول',f.payload.confidential==='yes'&&'سري'].filter(Boolean).join(' · ')}</small></td>
    <td><span className="nowrap">{caseRef(f)}</span><small>{parties(f)}</small></td>
    <td>{handoverOf(c)?<span className={'tag '+(handoverOf(c)==='return-reported'?'green':'amber')}>{HANDOVER_LABELS[handoverOf(c)!]}</span>:<span className={'tag '+stateTone[c.state]}>{CUSTODY_STATES[c.state]}</span>}<small>{c.state==='in'?locationLabel(locOf(c.locationId))||'بلا موقع محدد':[c.holder,c.dueDate&&(late?`متأخر ${daysBetween(c.dueDate,today)} يوم`:'حتى '+formatDate(c.dueDate))].filter(Boolean).join(' · ')}</small></td>
    <td className="nowrap">{c.lastAudit?formatDate(c.lastAudit):<span className="muted">—</span>}</td></tr>})}</tbody></table>}
  <PageNavigation page={current} pages={pages} total={filtered.length} onChange={setPage}/></div></>}
 {/* The sheet stays through the reload that follows sending, so its print button stays too. */}
 {!error&&view==='dispatch'&&access.canEdit&&(!loading||files.length>0)&&<div className="work-desk-body"><DispatchSheet files={active} custody={custody} cases={cases} people={people} requests={requests} canPrint={access.canExport} printedBy="" onDone={reload}/></div>}
 {!loading&&!error&&view==='custody'&&<div className="work-desk-body"><CustodyList files={out} custody={custody} today={today} caseRef={caseRef} canPrint={access.canExport} onOpen={f=>setEditing(f)} onApprove={access.canEdit?f=>void approve(f):undefined}/></div>}
 {!loading&&!error&&view==='requests'&&<div className="work-desk-body"><RequestsList movements={movements} onAdd={access.canEdit?()=>setRequest(newDepartmentRecord('archive','request',{requester:'',requesterId:'',neededBy:'',purpose:'',status:'pending',notes:'',decisionNote:''}) as unknown as ArchiveRequest):undefined} requests={requests} files={files} custody={custody} canEdit={access.canEdit} onOpen={setRequest} onDeliver={r=>{const f=files.find(x=>x.id===r.subjectId);if(f&&r.payload.requesterId){void sendToRequester(r).then(()=>{toast.success(`أُرسل ${f.payload.number} إلى ${r.payload.requester}`,{description:'يصله إشعار، ولا تُسلَّم الأوراق قبل أن يضغط «استلمت».'});reload();dispatchEvent(new Event(PAPER_FILES_EVENT))}).catch(e=>toast.error((e as Error).message));return}if(f)setEditing(f,{type:'checkout',holder:r.payload.requester,holderId:r.payload.requesterId,purpose:r.payload.purpose,dueDate:'',requestId:r.id})}}/></div>}
 {!error&&view==='locations'&&(!loading||files.length>0)&&<div className="work-desk-body"><ArchiveMap locations={locations} files={active} custody={custody} cases={cases} canEdit={access.canEdit&&all} canPrint={access.canExport} caseRef={caseRef} onEdit={setLocation} onStocktake={setStocktake} onChanged={()=>void refresh()} onAdd={access.canEdit&&all?()=>setLocation(newDepartmentRecord('archive','location',{...blankLocation}) as unknown as ArchiveLocation):undefined}/></div>}
 {!loading&&!error&&view==='log'&&<div className="work-desk-body"><MovementLog movements={movements} files={files} locOf={locOf} caseCode={id=>caseOf(id)?.code||''} canPrint={access.canExport} onOpen={f=>setEditing(f)}/></div>}
 </section></div>
 {editing&&<FileEditor key={editing.id+(preset?.requestId||'')} nav={nav} onNavigate={step} enter={enter} initial={editing} preset={preset} cases={cases} locations={locations} movements={fileMovements(editing.id,movements)} requests={requests.filter(r=>r.subjectId===editing.id)} people={people} access={access}
  label={label} onClose={()=>setEditing(null)} onChanged={reload} onRequest={f=>setRequest({...newDepartmentRecord('archive','request',{requester:'',requesterId:'',neededBy:'',purpose:'',status:'pending',notes:'',decisionNote:''}) as unknown as ArchiveRequest,caseId:f.caseId,subjectId:f.id})}/>}
 {location&&<LocationEditor initial={location} onClose={()=>setLocation(null)} onSaved={()=>{setLocation(null);reload()}}/>}
 {stocktake&&<Stocktake location={stocktake} files={active.filter(f=>cu(f).locationId===stocktake.id||f.payload.locationId===stocktake.id)} custody={custody} caseRef={caseRef} canPrint={access.canExport} onClose={()=>setStocktake(null)} onDone={()=>{setStocktake(null);reload()}}/>}
 {request&&<RequestEditor initial={request} files={active} custody={custody} people={people} canEdit={access.canEdit} onClose={()=>setRequest(null)} onSaved={()=>{setRequest(null);reload()}}/>}
 </>;
}

function FileEditor({initial,preset,cases,locations,movements,requests,people,access,label,onClose,onChanged,onRequest,nav,onNavigate,enter}:{initial:ArchiveFile;preset:Preset|null;cases:CaseSummary[];locations:ArchiveLocation[];movements:ArchiveMovement[];requests:ArchiveRequest[];people:Person[];access:Permissions;label:(f:ArchiveFile)=>ArchiveLabel;onClose:()=>void;onChanged:()=>void;onRequest:(f:ArchiveFile)=>void;nav?:WindowNav;onNavigate?:(dir:'prev'|'next')=>void;enter?:Enter}) {
 const [saved,setSaved]=useState(initial),[draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [tab,setTab]=useState(preset?'custody':initial.revision?'custody':'file');
 // Movements posted here show at once; the reloaded list replaces them when it arrives.
 const [posted,setPosted]=useState<ArchiveMovement[]>([]);
 const log=useMemo(()=>{const m=new Map(movements.map(x=>[x.id,x]));for(const x of posted){const o=m.get(x.id);if(!o||o.revision<x.revision)m.set(x.id,x)}return fileMovements(initial.id,[...m.values()])},[movements,posted,initial.id]);
 const c=custodyOf(saved,log),caseRow=cases.find(x=>x.id===draft.caseId),editable=access.canEdit&&!saved.archived,dirty=JSON.stringify(draft)!==JSON.stringify(saved);
 const set=(k:keyof FileData,v:string)=>setDraft(r=>({...r,payload:{...r.payload,[k]:v}}));
 const p=draft.payload,ready=!!p.number.trim()&&!!p.title.trim()&&!!p.type.trim()&&(access.caseScope==='all'||!!draft.caseId);
 async function run(fn:()=>Promise<ArchiveFile>,message:string){setBusy(true);setError('');try{const r=await fn();setSaved(r);setDraft(r);onChanged();toast.success(message)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const saveFile=()=>{if(editable&&ready&&(dirty||!saved.revision))void run(()=>save(draft),'حُفظ ملف الأرشيف')};
 const loc=(id:string)=>locations.find(l=>l.id===id);
 const tabs:[string,string,LucideIcon,number?,boolean?][]=[['custody','العهدة والحركة',ArrowLeftRight,log.length,!saved.revision],['file','بيانات الملف',FileText],['requests','الطلبات',Inbox,requests.filter(r=>!r.archived).length,!saved.revision],['history','سجل التغييرات',History,undefined,!saved.revision]];
 return <RecordWindow eyebrow={saved.revision?'ملف الأرشيف':'ملف ورقي جديد'} title={p.title||'ملف بلا عنوان'} subtitle={caseRow?`${caseRow.code||caseRow.autoNumber||'بلا كود'} · ${clientName(caseRow)} / ${caseRow.opponent}`:draft.caseId?'قضية غير متاحة':'ملف عام غير مرتبط بقضية'}
  badges={<>{p.number&&<CopyChip label="رقم الأرشيف" value={p.number}/>}<span className={'tag '+stateTone[c.state]}>{saved.archived?'مغلق':CUSTODY_STATES[c.state]}</span>{p.originals==='yes'&&<span className="tag wine">أصول</span>}{p.confidential==='yes'&&<span className="tag red">سري</span>}</>}
  facts={[['مكان الحفظ',locationLabel(loc(c.locationId))],['مع',c.holder],['منذ',c.since?formatDate(c.since):''],['موعد الإعادة',c.dueDate?formatDate(c.dueDate):''],['آخر جرد',c.lastAudit?formatDate(c.lastAudit):''],['الأوراق',p.pages]]}
  quick={saved.revision?<>{access.canExport&&code39Ready(saved.payload.number)&&<button type="button" className="btn" onClick={()=>{if(!printHtml(archiveLabelsHtml([label(saved)],formatDate(todayISO()),'')))toast.error('تعذر فتح نافذة الطباعة.')}}><Printer size={16}/> ملصق الملف</button>}{editable&&<button type="button" className="btn" onClick={()=>onRequest(saved)}><Inbox size={16}/> تسجيل طلب للملف</button>}</>:undefined}
  nav={nav} onNavigate={onNavigate} unit="الملف" enter={enter} dirty={dirty&&editable} busy={busy} onSave={editable?saveFile:undefined} onClose={onClose}
  needs={editable?[!p.number.trim()&&'أدخل «رقم الأرشيف» في «بيانات الملف»',!p.title.trim()&&'أدخل «عنوان الملف» في «بيانات الملف»',!p.type.trim()&&'اختر «نوع الملف» في «بيانات الملف»',access.caseScope!=='all'&&!draft.caseId&&'اربط الملف بقضية في «بيانات الملف»؛ حسابك يرى قضايا محددة فقط']:[]}
  footer={<>{editable&&<button className="btn primary" type="button" onClick={saveFile} disabled={busy||!ready||(!dirty&&!!saved.revision)}>حفظ بيانات الملف</button>}{!!saved.revision&&access.canEdit&&<button className="btn" title={dirty?'احفظ تعديلات الملف أولاً':undefined} disabled={busy||dirty} onClick={()=>void run(()=>departmentRequest('archive_record',{workspace:'archive',id:saved.id,revision:saved.revision,archived:!saved.archived}),saved.archived?'أُعيد فتح الملف':'أُغلق الملف · تجده في «المغلقة»')}>{saved.archived?'إعادة فتح الملف':'إغلاق الملف (إتلاف أو انتهاء الحفظ)'}</button>}<button type="button" className="btn" disabled={busy} onClick={onClose}>إغلاق</button></>}>
 {error&&<p role="alert" className="notice">{error}</p>}
 <Tabs value={tab} onValueChange={setTab} dir="rtl"><TabsList className="detail-tabs case-tabs">{tabs.map(([v,l,Icon,n,off])=><TabsTrigger key={v} value={v} disabled={off}><Icon aria-hidden/>{l}{n?<span className="tab-count">{n}</span>:null}</TabsTrigger>)}</TabsList>
 {!saved.revision&&<p className="subtitle">تُفتح «العهدة والحركة» و«الطلبات» و«سجل التغييرات» بعد حفظ الملف أول مرة.</p>}
 <TabsContent value="file"><fieldset className="readonly-fields" disabled={busy||!editable}>
  <CasePicker cases={cases} value={draft.caseId} optional={access.caseScope==='all'} disabled={!!saved.revision} onChange={id=>{const k=cases.find(x=>x.id===id);setDraft(r=>({...r,caseId:id,payload:{...r.payload,title:r.payload.title||(k?`${clientName(k)} ضد ${k.opponent}`:'')}}))}}/>
  <div className="form-grid"><Field label="رقم الأرشيف" value={p.number} onChange={v=>set('number',v.toUpperCase())} placeholder="ARC-00001"/><Field label="عنوان الملف" value={p.title} onChange={v=>set('title',v)}/>
   <PickOrType label="نوع الملف" value={p.type} onChange={v=>set('type',v)} options={FILE_TYPES} hint="نوع آخر"/><Field label="رقم المجلد" value={p.volume} onChange={v=>set('volume',v)} placeholder="1، 2…"/>
   <Field label="عدد الأوراق" value={p.pages} onChange={v=>set('pages',v.replace(/\D/g,''))}/><OfficeSelect label="موقع الحفظ" value={p.locationId} onChange={v=>set('locationId',v)} empty="بلا موقع محدد" options={locations.filter(l=>!l.archived||l.id===p.locationId).map(l=>[l.id,locationLabel(l)])}/>
   <DateField label="تاريخ الاستلام في الأرشيف" value={p.intakeDate} onChange={v=>set('intakeDate',v)}/><DateField label="يُحفظ حتى (مدة الحفظ)" value={p.retentionUntil} onChange={v=>set('retentionUntil',v)}/></div>
  <div className="archive-flags"><label className="checkbox-line"><input type="checkbox" checked={p.originals==='yes'} onChange={e=>set('originals',e.target.checked?'yes':'no')}/> يحتوي على مستندات أصلية</label><label className="checkbox-line"><input type="checkbox" checked={p.confidential==='yes'} onChange={e=>set('confidential',e.target.checked?'yes':'no')}/> ملف سري (يُسلّم للمحامي المسؤول فقط)</label></div>
  {!code39Ready(p.number)&&p.number&&<p className="notice">رقم الأرشيف أحرف لاتينية وأرقام وشرطة فقط، ليُطبع باركود يقرؤه الماسح.</p>}
  <Field label="ملاحظات الملف" value={p.notes} onChange={v=>set('notes',v)} multiline wide placeholder="محتويات الملف، الأصول الموجودة، حالة الأوراق…"/>
  {!saved.revision&&<p className="subtitle">يُعد الملف عند حفظه موجوداً في الأرشيف في الموقع المحدد. سجّل بعدها أي تسليم من تبويب «العهدة والحركة».</p>}
 </fieldset></TabsContent>
 {!!saved.revision&&<><TabsContent value="custody"><CustodyPanel file={saved} custody={c} log={log} locations={locations} people={people} preset={preset} editable={editable} canPrint={access.canExport} caseText={caseRow?`${caseRow.code||caseRow.autoNumber||''} · ${clientName(caseRow)} / ${caseRow.opponent}`:''}
   onPosted={(m,requestId)=>{setPosted(l=>[...l.filter(x=>x.id!==m.id),m]);onChanged();if(requestId){const r=requests.find(x=>x.id===requestId);// The server already closed a request handed to its own requester.
    if(r&&(!m.payload.holderId||r.payload.requesterId!==m.payload.holderId))void save({...r,payload:{...r.payload,status:'done'}}).then(onChanged).catch(e=>toast.error(e.message))}}}/></TabsContent>
 <TabsContent value="requests"><div className="table-wrap">{requests.length?<table className="office-table"><thead><tr><th>طالب الملف</th><th>مطلوب بتاريخ</th><th>الغرض</th><th>الحالة</th></tr></thead><tbody>{requests.map(r=><tr key={r.id}><td>{r.payload.requester}</td><td>{r.payload.neededBy?formatDate(r.payload.neededBy):'—'}</td><td>{r.payload.purpose}</td><td><span className="tag">{REQUEST_STATUSES[r.payload.status]}</span></td></tr>)}</tbody></table>:<Empty title="لا توجد طلبات" text="سجّل طلب الزميل للملف ليُجهَّز ويُسلَّم في موعده."/>}</div></TabsContent>
 <TabsContent value="history"><DepartmentHistory workspace="archive" id={saved.id} revision={saved.revision}/></TabsContent></>}
 </Tabs></RecordWindow>;
}

function CustodyPanel({file,custody:c,log,locations,people,preset,editable,canPrint,caseText,onPosted}:{file:ArchiveFile;custody:Custody;log:ArchiveMovement[];locations:ArchiveLocation[];people:Person[];preset:Preset|null;editable:boolean;canPrint:boolean;caseText:string;onPosted:(m:ArchiveMovement,requestId:string)=>void}) {
 const today=todayISO(),allowed=(Object.keys(MOVEMENTS) as MovementType[]).filter(t=>MOVEMENTS[t].from.includes(c.state));
 const blank=(type:MovementType):MovementData=>({type,date:today,holder:type==='client'?caseText.split(' · ')[1]?.split(' / ')[0]||'':'',holderId:'',purpose:'',dueDate:'',locationId:type==='return'||type==='audit'?c.locationId:'',notes:'',status:'posted',voidReason:'',fromState:c.state,toState:c.state});
 const [form,setForm]=useState<MovementData|null>(()=>preset&&MOVEMENTS[preset.type].from.includes(c.state)?{...blank(preset.type),holder:preset.holder,holderId:preset.holderId,purpose:preset.purpose,dueDate:preset.dueDate}:null);
 const [requestId,setRequestId]=useState(preset?.requestId||''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[voiding,setVoiding]=useState(''),[reason,setReason]=useState(''),[last,setLast]=useState<ArchiveMovement|null>(null);
 const loc=(id:string)=>locationLabel(locations.find(l=>l.id===id));
 const set=(k:keyof MovementData,v:string)=>setForm(f=>f&&({...f,[k]:v,...(k==='holder'?{holderId:people.find(p=>personName(p)===v)?.id||''}:{})}));
 const receipt=(m:ArchiveMovement)=>{const p=m.payload,back=p.type==='return';
  if(!printHtml(custodyReceiptHtml(back?'إيصال استلام ملف إلى الأرشيف':'إيصال تسليم ملف من الأرشيف',[['رقم الأرشيف',file.payload.number],['الملف',file.payload.title],['القضية',caseText],['نوع الملف',[file.payload.type,file.payload.volume&&'مجلد '+file.payload.volume,file.payload.pages&&file.payload.pages+' ورقة'].filter(Boolean).join(' · ')],['الأصول',file.payload.originals==='yes'?'يحتوي على مستندات أصلية':''],['الحركة',MOVEMENTS[p.type].label],['التاريخ',formatDate(p.date)],['المستلم',back?'الأرشيف':p.holder],['الغرض',p.purpose],['موعد الإعادة',p.dueDate?formatDate(p.dueDate):''],['الموقع',loc(p.locationId)],['ملاحظات',p.notes]],back?'المُسلِّم':'موظف الأرشيف',back?'موظف الأرشيف':'المستلم',formatDate(today),m.createdBy)))toast.error('تعذر فتح نافذة الطباعة.')};
 async function post(){if(!form)return;setBusy(true);setError('');
  try{const m=await save<MovementData>({...newDepartmentRecord('archive','movement',form),caseId:file.caseId,subjectId:file.id} as ArchiveMovement) as ArchiveMovement;onPosted(m,requestId);setRequestId('');setForm(null);setLast(m);toast.success(MOVEMENTS[m.payload.type].verb)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function confirmBack(){setBusy(true);setError('');try{const m=await approveReturn(file);onPosted(m,'');setLast(m);toast.success('عاد الملف إلى الأرشيف');dispatchEvent(new Event(PAPER_FILES_EVENT))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function cancel(m:ArchiveMovement){setBusy(true);setError('');try{const r=await departmentRequest<ArchiveMovement>('void_record',{workspace:'archive',id:m.id,revision:m.revision,reason});onPosted(r,'');setVoiding('');setReason('');toast.success('أُلغيت الحركة')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const posted=log.filter(m=>m.payload.status==='posted'),lastPosted=posted[posted.length-1];
 const late=isOverdue(c,today);
 return <div className="archive-custody">
  <div className={'custody-now '+c.state+(late?' late':'')}><span className={'tag '+stateTone[c.state]}>{CUSTODY_STATES[c.state]}</span>
   <span className="custody-what">{c.state==='in'?'مكان الحفظ':c.state==='staff'?'مع الموظف':c.state==='court'?'لدى الجهة':'مستلم الأصول'}</span>
   <b>{c.state==='in'?loc(c.locationId)||'لم يُحدَّد رف أو خزانة بعد':c.holder}</b>
   <small>{c.state==='in'?(c.lastAudit?'آخر جرد '+formatDate(c.lastAudit):'لم يُجرد بعد'):[c.purpose,c.since&&'منذ '+formatDate(c.since),c.dueDate&&(late?`متأخر ${daysBetween(c.dueDate,today)} يوم عن ${formatDate(c.dueDate)}`:'يعود في '+formatDate(c.dueDate))].filter(Boolean).join(' · ')}</small></div>
  {handoverOf(c)==='awaiting-receipt'&&<p className="notice handover-note">أُرسل إلى {c.holder} وينتظر تأكيده. لا تسلّم الأوراق قبل أن يضغط «استلمت» في إشعاره.</p>}
  {handoverOf(c)==='return-reported'&&<div className="notice handover-note"><span>أبلغ {c.holder} بإرجاع الملف. تأكد من وصول الأوراق ثم أكّد.</span>{editable&&<button type="button" className="btn primary" disabled={busy} onClick={()=>void confirmBack()}><CheckCircle2 size={15}/> تأكيد عودة الملف</button>}</div>}
  {file.payload.confidential==='yes'&&c.state==='in'&&<p className="notice">ملف سري: يُسلّم للمحامي المسؤول عن القضية أو بإذن مسؤول المكتب.</p>}
  {editable&&!form&&<div className="actions">{allowed.map(t=><button key={t} type="button" className={'btn'+(t==='return'||t==='checkout'?' primary':'')} onClick={()=>setForm(blank(t))}>{t==='return'?<Undo2 size={15}/>:t==='audit'?<ClipboardCheck size={15}/>:t==='move'?<MapPin size={15}/>:<ArrowLeftRight size={15}/>} {MOVEMENTS[t].label}</button>)}</div>}
  {form&&<section className="department-form-section"><h3>{MOVEMENTS[form.type].label}</h3><fieldset disabled={busy}><div className="form-grid">
   <DateField label="تاريخ الحركة" value={form.date} onChange={v=>set('date',v)}/>
   {/* Staff are picked from the accounts, so the hand-out reaches them with «استلمت»; bodies and clients are typed. */}
   {form.type==='checkout'?<OfficeSelect label="الموظف المستلم" value={form.holderId} onChange={id=>{const p=people.find(x=>x.id===id);setForm(f=>f&&({...f,holderId:id,holder:p?personName(p):''}))}} empty="اختر الموظف" options={people.map(p=>[p.id,personName(p)])}/>
    :needsHolder(form.type)&&<Field label={form.type==='court'?'الجهة المستلمة':'اسم مستلم الأصول'} value={form.holder} onChange={v=>set('holder',v)} suggestions={form.type==='court'?OUTSIDE_BODIES:undefined}/>}
   {(form.type==='checkout'||form.type==='court'||form.type==='client')&&<PickOrType label="الغرض" value={form.purpose} onChange={v=>set('purpose',v)} options={PURPOSES} empty="دون تحديد" hint="اكتب الغرض"/>}
   {(form.type==='checkout'||form.type==='court')&&<DateField label="موعد الإعادة" value={form.dueDate} onChange={v=>set('dueDate',v)}/>}
   {(form.type==='return'||form.type==='move'||form.type==='audit')&&<OfficeSelect label={form.type==='move'?'الموقع الجديد':'موقع الحفظ'} value={form.locationId} onChange={v=>set('locationId',v)} empty={form.type==='move'?'اختر الموقع':'الموقع السابق'} options={locations.filter(l=>!l.archived).map(l=>[l.id,locationLabel(l)])}/>}
   <Field label="ملاحظات الحركة" value={form.notes} onChange={v=>set('notes',v)} wide placeholder={form.type==='return'?'حالة الملف عند الاستلام، أوراق ناقصة أو مضافة…':''}/></div>
   <Needs items={[!form.date&&'اختر «تاريخ الحركة»',needsHolder(form.type)&&!form.holder.trim()&&`أدخل «${form.type==='court'?'الجهة المستلمة':form.type==='client'?'اسم مستلم الأصول':'الموظف المستلم'}»`,form.type==='move'&&!form.locationId&&'اختر «الموقع الجديد»']}/>
   <div className="actions"><button type="button" className="btn primary" disabled={busy||!form.date||(needsHolder(form.type)&&!form.holder.trim())||(form.type==='move'&&!form.locationId)} onClick={()=>void post()}>تسجيل الحركة</button><button type="button" className="btn" onClick={()=>{setForm(null);setRequestId('')}}>إلغاء</button></div></fieldset></section>}
  {last&&canPrint&&<p className="archive-receipt-hint"><button type="button" className="btn" onClick={()=>receipt(last)}><Printer size={15}/> طباعة إيصال {last.payload.type==='return'?'الاستلام':'التسليم'} للتوقيع</button></p>}
  {error&&<p className="notice" role="alert">{error}</p>}
  <h3 className="archive-subhead">سجل حركة الملف</h3>
  {!log.length?<p className="subtitle">لم تُسجل حركة بعد. الملف في الأرشيف منذ استلامه.</p>:<ol className="custody-log">{[...log].reverse().map(m=>{const p=m.payload,v=p.status==='void';return <li key={m.id} className={v?'void':''}>
   <div><b>{MOVEMENTS[p.type].label}</b>{p.holder&&<span> · {p.holder}</span>}{p.locationId&&<span> · {loc(p.locationId)}</span>}<small>{formatDate(p.date)}{p.purpose&&' · '+p.purpose}{p.dueDate&&' · يعود '+formatDate(p.dueDate)} · سجّلها {m.createdBy} {officeTime(m.createdAt)}</small>{p.receipt==='pending'&&!v&&<small className="handover-log">بانتظار تأكيد الاستلام</small>}{p.receivedAt&&<small className="handover-log">أكّد الاستلام {officeTime(p.receivedAt)}</small>}{p.returnClaimedAt&&<small className="handover-log">أبلغ بالإرجاع {officeTime(p.returnClaimedAt)}</small>}{p.notes&&<small>{p.notes}</small>}{v&&<small className="void-note">ملغاة: {p.voidReason}</small>}</div>
   <div className="actions">{canPrint&&!v&&p.type!=='audit'&&p.type!=='move'&&<button type="button" className="btn" onClick={()=>receipt(m)}><Printer size={14}/> إيصال</button>}{editable&&!v&&m.id===lastPosted?.id&&(voiding===m.id?<><Field label="سبب الإلغاء" value={reason} onChange={setReason}/><button type="button" className="btn" disabled={busy||!reason.trim()} onClick={()=>void cancel(m)}>تأكيد الإلغاء</button></>:<button type="button" className="btn" onClick={()=>{setVoiding(m.id);setReason('')}}>إلغاء الحركة</button>)}</div></li>})}</ol>}
 </div>;
}

function CustodyList({files,custody,today,caseRef,canPrint,onOpen,onApprove}:{files:ArchiveFile[];custody:Map<string,Custody>;today:string;caseRef:(f:ArchiveFile)=>string;canPrint:boolean;onOpen:(f:ArchiveFile)=>void;onApprove?:(f:ArchiveFile)=>void}) {
 const rank=(c:Custody)=>handoverOf(c)==='return-reported'?0:handoverOf(c)==='awaiting-receipt'?1:2;
 const list=[...files].sort((a,b)=>{const x=custody.get(a.id)!,y=custody.get(b.id)!;return rank(x)-rank(y)||Number(isOverdue(y,today))-Number(isOverdue(x,today))||(x.dueDate||'9').localeCompare(y.dueDate||'9')});
 const holders=[...new Set(list.map(f=>custody.get(f.id)!.holder))];
 return <section className="panel"><div className="panel-head"><div><h2>العهدة: الملفات خارج الأرشيف</h2><p className="panel-note">ما أُبلغ بإرجاعه أولاً، ثم ما لم يؤكد مستلمه استلامه، ثم المتأخر. افتح الملف لتسجيل استلامه.</p></div>{canPrint&&!!list.length&&<button className="btn" onClick={()=>printHtml(listHtml('عهدة ملفات الأرشيف',formatDate(today),['رقم الأرشيف','الملف','القضية','الحالة','مع','الغرض','منذ','موعد الإعادة','التأخير'],list.map(f=>{const c=custody.get(f.id)!;return [f.payload.number,f.payload.title,caseRef(f),CUSTODY_STATES[c.state],c.holder,c.purpose,formatDate(c.since),c.dueDate?formatDate(c.dueDate):'—',isOverdue(c,today)?daysBetween(c.dueDate,today)+' يوم':'']}),formatDate(today),''))}><Printer size={15}/> طباعة العهدة</button>}</div>
  {!list.length?<Empty title="كل الملفات في الأرشيف" text="لا يوجد ملف مسلّم لموظف أو جهة خارجية الآن."/>:<>
  <div className="holder-chips">{holders.map(h=><span key={h} className="chip">{h} <b>{list.filter(f=>custody.get(f.id)!.holder===h).length}</b></span>)}</div>
  <div className="table-wrap"><table className="office-table"><thead><tr><th>رقم الأرشيف</th><th>الملف</th><th>مع</th><th>منذ</th><th>موعد الإعادة</th></tr></thead><tbody>{list.map(f=>{const c=custody.get(f.id)!,late=isOverdue(c,today);return <tr key={f.id} className={'clickable'+(late?' late':'')} onClick={()=>onOpen(f)}>
   <td className="nowrap"><b dir="ltr">{f.payload.number}</b></td><td><b>{f.payload.title}</b><small>{caseRef(f)}</small></td><td>{handoverOf(c)?<span className={'tag '+(handoverOf(c)==='return-reported'?'green':'amber')}>{HANDOVER_LABELS[handoverOf(c)!]}</span>:<span className={'tag '+stateTone[c.state]}>{CUSTODY_STATES[c.state]}</span>}<small>{c.holder}{c.purpose&&' · '+c.purpose}</small>{onApprove&&handoverOf(c)==='return-reported'&&<button type="button" className="btn primary" onClick={e=>{e.stopPropagation();onApprove(f)}}><CheckCircle2 size={14}/> عاد الملف</button>}</td>
   <td className="nowrap">{formatDate(c.since)}<small>{daysBetween(c.since,today)} يوم</small></td><td className="nowrap">{c.dueDate?formatDate(c.dueDate):'—'}{late&&<small className="late-note">متأخر {daysBetween(c.dueDate,today)} يوم</small>}</td></tr>})}</tbody></table></div></>}</section>;
}

function RequestsList({requests,movements,files,custody,canEdit,onOpen,onDeliver,onAdd}:{onAdd?:()=>void;requests:ArchiveRequest[];movements:ArchiveMovement[];files:ArchiveFile[];custody:Map<string,Custody>;canEdit:boolean;onOpen:(r:ArchiveRequest)=>void;onDeliver:(r:ArchiveRequest)=>void}) {
 const [status,setStatus]=useState('open'),today=todayISO();
 // Marked «سُلّم» by hand with no hand-out behind it: the colleague never got the file in the system, so it stays open here.
 const unsent=(r:ArchiveRequest)=>r.payload.status==='done'&&!!r.payload.requesterId&&!movements.some(m=>m.subjectId===r.subjectId&&m.payload.type==='checkout'&&m.payload.status==='posted'&&m.payload.holderId===r.payload.requesterId&&recordedAt(m)>=recordedAt(r));
 const list=requests.filter(r=>!r.archived&&(status==='open'?r.payload.status==='pending'||r.payload.status==='ready'||unsent(r):!status||r.payload.status===status)).sort((a,b)=>(a.payload.neededBy||'9').localeCompare(b.payload.neededBy||'9'));
 const fileOf=(id:string)=>files.find(f=>f.id===id);
 return <section className="panel"><div className="panel-head"><div><h2>طلبات الملفات</h2><p className="panel-note">يطلب الزميل الملف، يجهّزه الأرشيف، ثم يُسلَّم ويُسجَّل في عهدته.</p></div><div className="actions archive-head-actions"><OfficeSelect label="الحالة" value={status} onChange={setStatus} options={[['open','المفتوحة'],...Object.entries(REQUEST_STATUSES),['','الكل']]}/>{onAdd&&<button className="btn primary" onClick={onAdd}><Plus size={17}/> طلب ملف جديد</button>}</div></div>
  {!list.length?<Empty title="لا توجد طلبات" text="سجّل طلباً جديداً عندما يطلب أحد الزملاء ملفاً."/>:<div className="table-wrap"><table className="office-table"><thead><tr><th>الملف</th><th>طالب الملف</th><th>مطلوب بتاريخ</th><th>الحالة</th><th/></tr></thead><tbody>{list.map(r=>{const f=fileOf(r.subjectId),c=f&&custody.get(f.id),late=r.payload.neededBy&&r.payload.neededBy<today&&r.payload.status!=='done';return <tr key={r.id} className={late?'late':''}>
   <td><b dir="ltr">{f?.payload.number||'—'}</b><small>{f?.payload.title}</small></td><td>{r.payload.requester}<small>{r.payload.purpose}</small></td><td className="nowrap">{r.payload.neededBy?formatDate(r.payload.neededBy):'—'}</td>
   <td>{unsent(r)?<span className="tag red">عُلّم «سُلّم» ولم يُرسل</span>:<span className={'tag '+(r.payload.status==='ready'?'green':r.payload.status==='declined'?'red':'amber')}>{REQUEST_STATUSES[r.payload.status]}</span>}{c&&c.state!=='in'&&<small>الملف الآن {CUSTODY_STATES[c.state]}: {c.holder}</small>}</td>
   <td><div className="row-actions">{canEdit&&(r.payload.status==='pending'||r.payload.status==='ready'||unsent(r))&&c?.state==='in'&&<button className="btn primary" title={r.payload.requesterId?'يُرسل الملف ويصل طالبه إشعار ليؤكد الاستلام':undefined} onClick={()=>onDeliver(r)}>{r.payload.requesterId?'إرسال الملف لطالبه':'تسليم الملف'}</button>}<button className="btn" onClick={()=>onOpen(r)}>فتح الطلب</button></div></td></tr>})}</tbody></table></div>}</section>;
}

function RequestEditor({initial,files,custody,people,canEdit,onClose,onSaved}:{initial:ArchiveRequest;files:ArchiveFile[];custody:Map<string,Custody>;people:Person[];canEdit:boolean;onClose:()=>void;onSaved:()=>void}) {
 const [draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const p=draft.payload,set=(k:keyof RequestData,v:string)=>setDraft(r=>({...r,payload:{...r.payload,[k]:v,...(k==='requester'?{requesterId:people.find(x=>personName(x)===v)?.id||''}:{})}}));
 const [search,setSearch]=useState('');
 const options=files.filter(f=>f.id===draft.subjectId||normalizeSearch(f.payload.number+' '+f.payload.title).includes(normalizeSearch(search))).slice(0,200);
 async function submit(){setBusy(true);setError('');try{await save(draft);toast.success('حُفظ الطلب');onSaved()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const ready=!!draft.subjectId&&!!p.requester.trim()&&(p.status!=='declined'||!!p.decisionNote.trim());
 return <EditorDialog title={initial.revision?'طلب ملف':'طلب ملف جديد'} description="من يحتاج الملف ومتى ولماذا. التسليم الفعلي يُسجَّل في عهدة الملف." busy={busy} onClose={onClose}>
  <fieldset disabled={busy||!canEdit}>{!initial.revision&&<><Field label="البحث عن الملف" value={search} onChange={setSearch} placeholder="رقم الأرشيف أو العنوان"/><OfficeSelect label="الملف المطلوب" value={draft.subjectId} onChange={id=>setDraft(r=>({...r,subjectId:id,caseId:files.find(f=>f.id===id)?.caseId||''}))} empty="اختر الملف" options={options.map(f=>[f.id,`${f.payload.number} · ${f.payload.title}`])}/></>}
  <div className="form-grid"><Field label="طالب الملف" value={p.requester} onChange={v=>set('requester',v)} suggestions={people.map(personName)}/><DateField label="مطلوب بتاريخ" value={p.neededBy} onChange={v=>set('neededBy',v)}/>
   <Field label="الغرض" value={p.purpose} onChange={v=>set('purpose',v)} suggestions={PURPOSES}/><OfficeSelect label="حالة الطلب" value={p.status} onChange={v=>set('status',v)} options={Object.entries(REQUEST_STATUSES).filter(([k])=>k!=='done'||initial.payload.status==='done'||!p.requesterId) as [string,string][]}/>
   {p.status==='declined'&&<Field label="سبب الاعتذار" value={p.decisionNote} onChange={v=>set('decisionNote',v)} wide/>}<Field label="ملاحظات" value={p.notes} onChange={v=>set('notes',v)} wide/></div></fieldset>
  {error&&<p className="notice" role="alert">{error}</p>}
  {p.requesterId&&initial.payload.status!=='done'&&<p className="subtitle">«سُلّم» يُسجَّل بإرسال الملف لطالبه، فيصله إشعار ويؤكد الاستلام.</p>}
  {canEdit&&<Needs items={[!draft.subjectId&&'اختر «الملف المطلوب»',!p.requester.trim()&&'أدخل «طالب الملف»',p.status==='declined'&&!p.decisionNote.trim()&&'اكتب «سبب الاعتذار»']}/>}
  <div className="actions">{canEdit&&!!initial.revision&&initial.payload.requesterId&&(initial.payload.status==='pending'||initial.payload.status==='ready')&&custody.get(initial.subjectId)?.state==='in'&&<button className="btn primary" disabled={busy} onClick={()=>{setBusy(true);setError('');sendToRequester(initial).then(()=>{toast.success('أُرسل الملف إلى '+initial.payload.requester,{description:'يصله إشعار، ولا تُسلَّم الأوراق قبل أن يضغط «استلمت».'});dispatchEvent(new Event(PAPER_FILES_EVENT));onSaved()}).catch(e=>setError((e as Error).message)).finally(()=>setBusy(false))}}>إرسال الملف لطالبه</button>}{canEdit&&<button className={'btn'+(initial.revision&&initial.payload.requesterId?'':' primary')} disabled={busy||!ready} onClick={()=>void submit()}>حفظ الطلب</button>}{canEdit&&!!initial.revision&&<button className="btn" disabled={busy} onClick={()=>{setBusy(true);departmentRequest('archive_record',{workspace:'archive',id:initial.id,revision:initial.revision,archived:true}).then(()=>{toast.success('أُزيل الطلب من القائمة');onSaved()}).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}>إزالة من القائمة</button>}<button className="btn" disabled={busy} onClick={onClose}>إغلاق</button></div>
 </EditorDialog>;
}

function LocationEditor({initial,onClose,onSaved}:{initial:ArchiveLocation;onClose:()=>void;onSaved:()=>void}) {
 const [draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const p=draft.payload,set=(k:keyof LocationData,v:string)=>setDraft(r=>({...r,payload:{...r.payload,[k]:v}}));
 async function run(fn:()=>Promise<unknown>,msg:string){setBusy(true);setError('');try{await fn();toast.success(msg);onSaved()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <EditorDialog title={initial.revision?'مكان الحفظ':'مكان حفظ جديد'} description="درج أو رف أو صندوق في خزانة: رمز قصير يُكتب عليه ويظهر على ملصقات ملفاته." busy={busy} onClose={onClose}>
  <fieldset disabled={busy||initial.archived}><div className="form-grid"><Field label="رمز المكان" value={p.code} onChange={v=>set('code',v.toUpperCase())} placeholder="A-1"/><Field label="الغرفة" value={p.name} onChange={v=>set('name',v)} suggestions={['غرفة الأرشيف','المخزن','مكتب المحامي','الخزنة']}/>
   <Field label="الخزانة" value={p.cabinet} onChange={v=>set('cabinet',v)}/><Field label="الدرج أو الرف" value={p.shelf} onChange={v=>set('shelf',v)} placeholder="درج 1"/><Field label="الصندوق" value={p.box} onChange={v=>set('box',v)}/><Field label="السعة (عدد الملفات)" value={p.capacity} onChange={v=>set('capacity',v.replace(/\D/g,''))}/>
   <Field label="ملاحظات" value={p.notes} onChange={v=>set('notes',v)} wide/></div></fieldset>
  {error&&<p className="notice" role="alert">{error}</p>}
  {!initial.archived&&<Needs items={[!p.code.trim()&&'أدخل «رمز المكان»',!p.name.trim()&&'أدخل «الغرفة»']}/>}
  <div className="actions">{!initial.archived&&<button className="btn primary" disabled={busy||!p.code.trim()||!p.name.trim()} onClick={()=>void run(()=>save(draft),'حُفظ المكان')}>حفظ المكان</button>}{!!initial.revision&&<button className="btn" disabled={busy} onClick={()=>void run(()=>departmentRequest('archive_record',{workspace:'archive',id:initial.id,revision:initial.revision,archived:!initial.archived}),initial.archived?'أُعيد فتح الموقع':'أُغلق الموقع')}>{initial.archived?'إعادة فتح الموقع':'إغلاق الموقع'}</button>}<button className="btn" disabled={busy} onClick={onClose}>إغلاق</button></div>
 </EditorDialog>;
}

/** Inventory of one location: tick the files found on the shelf; each ticked file gets an audit movement, the rest are listed as missing. */
function Stocktake({location,files,custody,caseRef,canPrint,onClose,onDone}:{location:ArchiveLocation;files:ArchiveFile[];custody:Map<string,Custody>;caseRef:(f:ArchiveFile)=>string;canPrint:boolean;onClose:()=>void;onDone:()=>void}) {
 const expected=files.filter(f=>custody.get(f.id)!.state==='in'&&custody.get(f.id)!.locationId===location.id).sort((a,b)=>a.payload.number.localeCompare(b.payload.number,'en',{numeric:true}));
 const away=files.filter(f=>custody.get(f.id)!.state!=='in');
 const [found,setFound]=useState<Set<string>>(()=>new Set()),[scan,setScan]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const missing=expected.filter(f=>!found.has(f.id)),today=todayISO();
 const tick=()=>{const v=scan.trim().toUpperCase();const f=expected.find(x=>x.payload.number.toUpperCase()===v);if(f){setFound(s=>new Set(s).add(f.id));setScan('')}else toast.error(v?'الملف '+v+' غير مسجل في هذا الموقع':'اكتب رقم الأرشيف')};
 async function finish(){setBusy(true);setError('');const failed:string[]=[];
  for(const f of expected.filter(f=>found.has(f.id))){try{await save({...newDepartmentRecord('archive','movement',{type:'audit',date:today,holder:'',holderId:'',purpose:'',dueDate:'',locationId:location.id,notes:'جرد الموقع '+location.payload.code}),caseId:f.caseId,subjectId:f.id})}catch(e){failed.push(f.payload.number+': '+(e as Error).message)}}
  setBusy(false);if(failed.length){setError(failed.join('\n'));return}toast.success(`سُجّل جرد ${found.size} ملف${missing.length?`، و${missing.length} غير موجود`:''}`);onDone()}
 return <EditorDialog title={'جرد الموقع '+location.payload.code} description={locationLabel(location)+' — حدد الملفات الموجودة فعلاً على الرف، أو امسح باركود كل ملف.'} busy={busy} onClose={onClose}>
  <div className="archive-scan compact"><ScanLine size={18} aria-hidden/><label className="field"><span>مسح ملف موجود</span><input dir="ltr" value={scan} onChange={e=>setScan(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();tick()}}}/></label><button type="button" className="btn" onClick={tick}>تأكيد</button><button type="button" className="btn" onClick={()=>setFound(new Set(expected.map(f=>f.id)))}>تحديد الكل</button></div>
  <p className="subtitle">وُجد {found.size} من {expected.length}{away.length?` · ${away.length} ملف من هذا الموقع خارج الأرشيف الآن ولا يدخل الجرد`:''}</p>
  <div className="stocktake-list">{expected.map(f=><label key={f.id} className={'checkbox-line'+(found.has(f.id)?' on':'')}><input type="checkbox" checked={found.has(f.id)} onChange={e=>setFound(s=>{const n=new Set(s);if(e.target.checked)n.add(f.id);else n.delete(f.id);return n})}/><b dir="ltr">{f.payload.number}</b> {f.payload.title} <small>{caseRef(f)}</small></label>)}{!expected.length&&<p className="subtitle">لا توجد ملفات مسجلة في هذا الموقع.</p>}</div>
  {error&&<p className="notice" role="alert">{error}</p>}
  <div className="actions"><button className="btn primary" disabled={busy||!found.size} onClick={()=>void finish()}>تسجيل الجرد ({found.size})</button>{canPrint&&missing.length>0&&<button className="btn" onClick={()=>printHtml(listHtml('فروقات جرد '+location.payload.code,locationLabel(location)+' · '+formatDate(today),['رقم الأرشيف','الملف','القضية','آخر جرد'],missing.map(f=>[f.payload.number,f.payload.title,caseRef(f),custody.get(f.id)!.lastAudit?formatDate(custody.get(f.id)!.lastAudit):'—']),formatDate(today),''))}><Printer size={15}/> طباعة غير الموجود ({missing.length})</button>}<button className="btn" disabled={busy} onClick={onClose}>إغلاق</button></div>
 </EditorDialog>;
}

function MovementLog({movements,files,locOf,caseCode,canPrint,onOpen}:{movements:ArchiveMovement[];files:ArchiveFile[];locOf:(id:string)=>ArchiveLocation|undefined;caseCode:(id:string)=>string;canPrint:boolean;onOpen:(f:ArchiveFile)=>void}) {
 const [type,setType]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[q,setQ]=useState(''),[page,setPage]=useState(1);
 const fileOf=(id:string)=>files.find(f=>f.id===id),term=normalizeSearch(q);
 const list=movements.filter(m=>(!type||m.payload.type===type)&&(!from||m.payload.date>=from)&&(!to||m.payload.date<=to)
  &&(!term||normalizeSearch([fileOf(m.subjectId)?.payload.number,fileOf(m.subjectId)?.payload.title,caseCode(m.caseId),m.payload.holder,m.payload.purpose,m.payload.notes,m.createdBy,MOVEMENTS[m.payload.type].label].join(' ')).includes(term))).sort((a,b)=>recordedAt(b)-recordedAt(a));
 const pages=Math.max(1,Math.ceil(list.length/20)),current=Math.min(page,pages);
 return <section className="panel"><div className="panel-head"><div><h2>سجل الحركة</h2><p className="panel-note">كل تسليم واستلام ونقل وجرد، بمن سجّله ومتى. الحركات لا تُعدّل؛ الخاطئة تُلغى بسبب.</p></div>{canPrint&&!!list.length&&<button className="btn" onClick={()=>printHtml(listHtml('سجل حركة الأرشيف',(from||to)?`من ${formatDate(from)||'البداية'} إلى ${formatDate(to)||'اليوم'}`:'كل الفترات',['التاريخ','رقم الأرشيف','الملف','الحركة','المستلم / الموقع','الغرض','سجّلها','الحالة'],list.map(m=>{const f=fileOf(m.subjectId),p=m.payload;return [formatDate(p.date),f?.payload.number||'',f?.payload.title||'',MOVEMENTS[p.type].label,p.holder||locationLabel(locOf(p.locationId)),p.purpose,m.createdBy,p.status==='void'?'ملغاة: '+p.voidReason:'']}),formatDate(todayISO()),''))}><Printer size={15}/> طباعة السجل</button>}</div>
  <div className="department-toolbar movement-filters"><Field label="بحث في الحركات" value={q} onChange={v=>{setQ(v);setPage(1)}} placeholder="رقم الأرشيف، كود القضية، المستلم أو من سجّلها"/><OfficeSelect label="نوع الحركة" value={type} onChange={v=>{setType(v);setPage(1)}} options={[['','كل الحركات'],...(Object.keys(MOVEMENTS) as MovementType[]).map(t=>[t,MOVEMENTS[t].label] as [string,string])]}/><DateField label="من تاريخ" value={from} onChange={v=>{setFrom(v);setPage(1)}}/><DateField label="إلى تاريخ" value={to} onChange={v=>{setTo(v);setPage(1)}}/></div>
  {!list.length?<Empty title="لا توجد حركات" text="تظهر هنا حركات الملفات عند تسجيلها."/>:<div className="table-wrap"><table className="office-table"><thead><tr><th>التاريخ</th><th>الملف</th><th>الحركة</th><th>المستلم / الموقع</th><th>سجّلها</th></tr></thead><tbody>{list.slice((current-1)*20,current*20).map(m=>{const f=fileOf(m.subjectId),p=m.payload;return <tr key={m.id} className={'clickable'+(p.status==='void'?' void':'')} onClick={()=>{if(f)onOpen(f)}}>
   <td className="nowrap">{formatDate(p.date)}</td><td><b dir="ltr">{f?.payload.number}</b><small>{f?.payload.title}</small></td><td>{MOVEMENTS[p.type].label}{p.status==='void'&&<small className="void-note">ملغاة: {p.voidReason}</small>}</td><td>{p.holder||locationLabel(locOf(p.locationId))||'—'}<small>{p.purpose}</small></td><td>{m.createdBy}<small>{officeTime(m.createdAt)}</small></td></tr>})}</tbody></table></div>}
  <PageNavigation page={current} pages={pages} total={list.length} onChange={setPage}/></section>;
}
