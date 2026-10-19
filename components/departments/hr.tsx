import {useEffect,useRef,useState} from 'react';
import {Plus} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {type DepartmentRecord,newDepartmentRecord,LEAVE_STATUSES} from '@/lib/departments';
import type {Permissions} from '@/lib/permissions';
import {todayISO,formatDate} from '@/lib/domain';
import {normalizeSearch} from '@/lib/case-browse';
import {Field,DateField,Empty,PickOrType} from '../shared';
import {HR_DEPARTMENTS,JOB_TITLES,LEAVE_TYPES} from '@/lib/choices';
import {OfficeSelect} from '../office-shared';
import PageNavigation from '../page-navigation';
import {DepartmentHistory,StatusMessage,useRecords,exportCsv} from './shared';
import RecordWindow,{useListNav,type WindowNav,type Enter} from '../record-window';
import {leaveDays,leaveUsed} from '@/lib/leave';
import {AttendanceBoard,AttendanceSettingsPanel,AttendanceUnavailable,ProfilesPanel,useAttendanceEnabled} from './attendance';
import DevicesPanel from './devices';
import {personName} from '@/lib/staff-accounts';
type StaffAccount={id:string;username:string;displayName:string;role:string};
type Tab='employee'|'leave'|'attendance'|'devices'|'pay'|'settings';
const PER_PAGE=25;
const ATT_TABS:[Tab,string][]=[['attendance','الحضور'],['devices','الأجهزة'],['pay','الرواتب والبصمات'],['settings','إعدادات الدوام']];
export default function HR({access}:{access:Permissions}) {
 const {rows,loading,error,reload}=useRecords<Record<string,string>>('hr');
 const attendance=useAttendanceEnabled();
 const [tab,setTab]=useState<Tab>('employee'),[search,setSearch]=useState(''),[status,setStatus]=useState(''),[page,setPage]=useState(1),[editing,setEditingRaw]=useState<DepartmentRecord|null>(null);
 const employees=rows.filter(r=>r.kind==='employee'),leaves=rows.filter(r=>r.kind==='leave');
 const employeeName=(id:string)=>employees.find(r=>r.id===id)?.payload.name||'غير متاح';
 // Every sign-in account has an HR file: link a same-named file, otherwise create one (HR editors only).
 const [staff,setStaff]=useState<StaffAccount[]>([]),synced=useRef(false);
 useEffect(()=>{
  if(loading||error||synced.current)return;synced.current=true;
  void (async()=>{
   let accounts:StaffAccount[];try{accounts=await departmentRequest<StaffAccount[]>('staff_accounts',{workspace:'hr'})}catch{return}
   setStaff(accounts);if(!access.canEdit)return;
   const linked=new Set(employees.map(r=>r.payload.accountId).filter(Boolean)),norm=(v:string)=>normalizeSearch(personName(v||''));
   let next=Math.max(0,...employees.map(r=>Number(/^EMP-(\d+)$/.exec(r.payload.employeeNumber||'')?.[1]||0)))+1,added=0;
   for(const a of accounts.filter(a=>!linked.has(a.id))){
    const name=personName(a.displayName)||a.username,match=employees.find(r=>!r.payload.accountId&&[norm(a.displayName),norm(a.username)].includes(norm(r.payload.name)));
    try{
     if(match)await departmentRequest('save_record',{workspace:'hr',record:{...match,payload:{...match.payload,accountId:a.id}}});
     else{await departmentRequest('save_record',{workspace:'hr',record:newDepartmentRecord('hr','employee',{employeeNumber:`EMP-${String(next++).padStart(3,'0')}`,name,title:'',department:'',phone:'',startDate:'',status:'active',notes:'',accountId:a.id})});added++}
    }catch{/* Shown again on the next visit; the server keeps one file per account. */}
   }
   if(added)toast.success(`أُضيف ${added} ملف موظف من حسابات الدخول.`);
   if(accounts.some(a=>!linked.has(a.id)))reload();
  })();
 },[loading,error,employees,access.canEdit,reload]);
 const accountOf=(r:DepartmentRecord)=>staff.find(a=>a.id===r.payload.accountId);
 const filtered=rows.filter(r=>r.kind===tab&&(!status||(status==='archived'?r.archived:!r.archived&&r.payload.status===status))&&normalizeSearch([r.payload.name,r.payload.employeeNumber,r.payload.department,r.payload.title,r.payload.type,employeeName(r.subjectId)].join(' ')).includes(normalizeSearch(search)));
 const pages=Math.max(1,Math.ceil(filtered.length/PER_PAGE)),current=Math.min(page,pages),today=todayISO(),year=Number(today.slice(0,4));
 const {nav,step,enter,openItem:setEditing}=useListNav(filtered,editing,setEditingRaw);
 function add(kind:'employee'|'leave'){setEditing(newDepartmentRecord('hr',kind,kind==='employee'?{employeeNumber:'',name:'',title:'',department:'',phone:'',startDate:'',status:'active',notes:''}:{type:'سنوية',fromDate:today,toDate:today,status:'pending',notes:'',decisionNote:''} as Record<string,string>))}
 const onLeave=leaves.filter(r=>r.payload.status==='approved'&&r.payload.fromDate<=today&&r.payload.toDate>=today),pending=leaves.filter(r=>r.payload.status==='pending').sort((a,b)=>a.payload.fromDate.localeCompare(b.payload.fromDate));
 const pick=(t:Tab)=>{setTab(t);setStatus('');setPage(1)};
 const leaveItem=(r:DepartmentRecord)=><button key={r.id} className="agenda-item" onClick={()=>setEditing(r)}><span className="agenda-time">{formatDate(r.payload.fromDate)}</span><span className="agenda-body"><b>{employeeName(r.subjectId)}</b><small>{r.payload.type} · {leaveDays(r.payload.fromDate,r.payload.toDate)} يوم · حتى {formatDate(r.payload.toDate)}</small></span></button>;
 // One screen: who is away and what waits for a decision, beside the staff list.
 return <><div className="work-desk-grid">
 <div className="work-desk-aside"><section className="panel sec-agenda" aria-label="اليوم في الموارد البشرية">
  <div className="sec-agenda-head"><div><h2>اليوم في الموارد البشرية</h2><small>{formatDate(today)}</small></div></div>
  <div className="desk-stats"><div><span>الموظفون النشطون</span><b>{employees.filter(r=>!r.archived&&r.payload.status==='active').length}</b></div><div><span>في إجازة اليوم</span><b>{new Set(onLeave.map(r=>r.subjectId)).size}</b></div></div>
  <div className="sec-agenda-list">
   <h3 className="desk-sub">طلبات بانتظار القرار ({pending.length})</h3>{pending.length?pending.map(leaveItem):<p className="muted sec-empty">لا توجد طلبات معلقة.</p>}
   <h3 className="desk-sub">في إجازة اليوم ({onLeave.length})</h3>{onLeave.length?onLeave.map(leaveItem):<p className="muted sec-empty">لا أحد في إجازة اليوم.</p>}
  </div>
 </section></div>
 <section className="panel work-desk">
  <div className="work-desk-head"><h2>الموارد البشرية</h2><div className="work-chips" role="group" aria-label="سجلات الموارد البشرية"><button className={'work-chip'+(tab==='employee'?' on':'')} aria-pressed={tab==='employee'} onClick={()=>pick('employee')}>ملفات الموظفين</button><button className={'work-chip'+(tab==='leave'?' on':'')} aria-pressed={tab==='leave'} onClick={()=>pick('leave')}>الإجازات{pending.length?<b>{pending.length}</b>:null}</button>{attendance!==false&&ATT_TABS.map(([k,label])=><button key={k} className={'work-chip'+(tab===k?' on':'')} aria-pressed={tab===k} onClick={()=>setTab(k)}>{label}</button>)}</div>
   {(tab==='employee'||tab==='leave')&&<div className="actions">{access.canExport&&<button className="btn" onClick={()=>void exportCsv('hr','Mawatheeq-'+tab,tab==='employee'?[['رقم الموظف','الاسم','المسمى','القسم','تاريخ الانضمام','الحالة'],...filtered.map(r=>[r.payload.employeeNumber,r.payload.name,r.payload.title,r.payload.department,r.payload.startDate,r.archived?'مؤرشف':r.payload.status==='active'?'نشط':'غير نشط'])]:[['الموظف','نوع الإجازة','من','إلى','الحالة','ملاحظة القرار'],...filtered.map(r=>[employeeName(r.subjectId),r.payload.type,r.payload.fromDate,r.payload.toDate,LEAVE_STATUSES[r.payload.status as keyof typeof LEAVE_STATUSES],r.payload.decisionNote])]).catch(e=>toast.error(e.message))}>تصدير القائمة</button>}{access.canEdit&&<button className="btn primary" onClick={()=>add(tab as 'employee'|'leave')}><Plus size={17}/>{tab==='employee'?'موظف جديد':'طلب إجازة جديد'}</button>}</div>}</div>
  {tab!=='employee'&&tab!=='leave'?<div className="work-desk-body"><div className="att-section">{attendance===null?<p role="status">جارٍ التحقق من ميزة الحضور…</p>:attendance===false?<AttendanceUnavailable/>:tab==='attendance'?<AttendanceBoard canExport={access.canExport}/>:tab==='devices'?<DevicesPanel/>:tab==='pay'?<ProfilesPanel/>:<AttendanceSettingsPanel/>}</div></div>:<>
  <div className="work-desk-filters"><Field label="بحث الموارد البشرية" value={search} onChange={v=>{setSearch(v);setPage(1)}} placeholder="الاسم، الرقم الوظيفي، القسم أو المسمى"/><OfficeSelect label="تصفية الحالة" value={status} onChange={v=>{setStatus(v);setPage(1)}} empty="جميع الحالات" options={tab==='employee'?[['active','نشط'],['inactive','غير نشط'],['archived','مؤرشف']]:Object.entries(LEAVE_STATUSES)}/></div>
  <div className="work-desk-body"><StatusMessage loading={loading} error={error}/>{!loading&&!error&&<>{!filtered.length?<Empty text={tab==='employee'?'أضف ملف الموظف وبيانات عمله الأساسية.':'أضف طلب إجازة لموظف مسجل.'}/>:tab==='employee'?<table className="office-table people-table"><thead><tr><th>الموظف</th><th>المسمى والقسم</th><th>إجازات {year}</th><th>الحالة</th><th/></tr></thead><tbody>{filtered.slice((current-1)*PER_PAGE,current*PER_PAGE).map(r=><tr key={r.id}>
   <td><div className="person-line"><span className="person-avatar">{r.payload.name.slice(0,1)}</span><span><b>{r.payload.name}</b><small>{r.payload.employeeNumber}{accountOf(r)&&<> · <span className="person-account" dir="ltr" title="حساب الدخول المرتبط">@{accountOf(r)!.username}</span></>}</small></span></div></td>
   <td>{r.payload.title||<span className="muted">المسمى غير مسجل</span>}<small>{r.payload.department||'قسم غير مسجل'}</small></td>
   <td className="nowrap">{leaveUsed(leaves,r.id,year).total} يوم</td>
   <td><span className={'tag '+(!r.archived&&r.payload.status==='active'?'green':'')}>{r.archived?'مؤرشف':r.payload.status==='active'?'نشط':'غير نشط'}</span></td>
   <td><button className="btn" onClick={()=>setEditing(r)}>فتح ملف الموظف</button></td></tr>)}</tbody></table>:<table className="office-table"><thead><tr><th>الموظف</th><th>نوع الإجازة</th><th>المدة</th><th>الحالة</th><th>التفاصيل</th></tr></thead><tbody>{filtered.slice((current-1)*PER_PAGE,current*PER_PAGE).map(r=><tr key={r.id}><td>{employeeName(r.subjectId)}</td><td>{r.payload.type}</td><td>{formatDate(r.payload.fromDate)} — {formatDate(r.payload.toDate)}<small>{leaveDays(r.payload.fromDate,r.payload.toDate)} يوم</small></td><td><span className={'tag '+(r.payload.status==='approved'?'green':'amber')}>{LEAVE_STATUSES[r.payload.status as keyof typeof LEAVE_STATUSES]}</span></td><td><button className="btn" onClick={()=>setEditing(r)}>فتح طلب الإجازة</button></td></tr>)}</tbody></table>}<PageNavigation page={current} pages={pages} total={filtered.length} onChange={setPage}/></>}
  {tab==='employee'&&<p className="subtitle desk-note">لكل حساب دخول ملف موظف يُنشأ تلقائياً ويمكن استكماله هنا. إنشاء الحسابات ومنح صلاحياتها من إعدادات مسؤول المكتب.</p>}</div></>}
 </section></div>
 {editing&&<HREditor key={editing.id} nav={nav} onNavigate={step} enter={enter} account={accountOf(editing)} initial={editing} employees={employees} leaves={leaves} access={access} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);reload()}}/>}</>;
}
function HREditor({initial,employees,leaves,access,account,onClose,onSaved,nav,onNavigate,enter}:{initial:DepartmentRecord;employees:DepartmentRecord[];leaves:DepartmentRecord[];access:Permissions;account?:StaffAccount;onClose:()=>void;onSaved:()=>void;nav?:WindowNav;onNavigate?:(dir:'prev'|'next')=>void;enter?:Enter}) {
 const [draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const year=Number(todayISO().slice(0,4)),used=leaveUsed(leaves,draft.id,year),requested=leaveDays(draft.payload.fromDate,draft.payload.toDate);
 const employee=draft.kind==='employee',editable=access.canEdit&&!draft.archived,dirty=JSON.stringify(draft)!==JSON.stringify(initial);
 const set=(key:string,value:string)=>setDraft(r=>({...r,payload:{...r.payload,[key]:value}}));
 async function save(action:string){setBusy(true);setError('');try{await departmentRequest(action,{workspace:'hr',record:draft,id:draft.id,revision:draft.revision,archived:!draft.archived});toast.success('حُفظ سجل الموارد البشرية');onSaved()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const p=draft.payload,ready=employee?!!p.name&&!!p.employeeNumber:!!draft.subjectId&&!!p.fromDate&&!!p.toDate;
 const person=employee?draft:employees.find(r=>r.id===draft.subjectId),status=employee?(draft.archived?'مؤرشف':p.status==='active'?'نشط':'غير نشط'):LEAVE_STATUSES[p.status as keyof typeof LEAVE_STATUSES];
 return <RecordWindow size="compact" eyebrow={employee?(draft.revision?'ملف الموظف':'موظف جديد'):'طلب إجازة'} title={person?.payload.name||(employee?'موظف جديد':'اختر الموظف')} subtitle={employee?[p.title||'المسمى غير مسجل',p.department].filter(Boolean).join(' · '):`${p.type||'إجازة'} · ${requested?requested+' يوم':'حدد التاريخين'}`}
  badges={<>{person?.payload.employeeNumber&&<span className="tag">{person.payload.employeeNumber}</span>}{employee&&account&&<span className="tag" dir="ltr">@{account.username}</span>}<span className={'tag '+((employee?p.status==='active'&&!draft.archived:p.status==='approved')?'green':'amber')}>{status}</span></>}
  facts={employee?[['الهاتف',p.phone],['تاريخ الانضمام',p.startDate?formatDate(p.startDate):''],[`إجازات ${year}`,draft.revision?used.total+' يوم':''],['القسم',p.department]]:[['من',p.fromDate?formatDate(p.fromDate):''],['إلى',p.toDate?formatDate(p.toDate):''],['المدة',requested?requested+' يوم تقويمي':''],['القرار',status]]}
  nav={nav} onNavigate={onNavigate} unit="السجل" enter={enter} dirty={dirty&&editable} busy={busy} onSave={editable?()=>{if(ready)void save('save_record')}:undefined} onClose={onClose}
  needs={editable?(employee?[!p.name&&'أدخل «اسم الموظف»',!p.employeeNumber&&'أدخل «الرقم الوظيفي»']:[!draft.subjectId&&'اختر «الموظف»',!p.fromDate&&'اختر «بداية الإجازة»',!p.toDate&&'اختر «نهاية الإجازة»']):[]}
  footer={<>{editable&&<button type="submit" form="hr-form" className="btn primary" disabled={busy||!ready}>حفظ سجل الموارد البشرية</button>}{employee&&!!draft.revision&&access.canEdit&&<button className="btn" disabled={busy} onClick={()=>void save('archive_record')}>{draft.archived?'إعادة فتح ملف الموظف':'أرشفة ملف الموظف'}</button>}<button className="btn" disabled={busy} onClick={onClose}>إغلاق السجل</button></>}>
 <p className="subtitle">{employee?'بيانات العمل الأساسية ووسيلة الاتصال.':'يسجل القرار في سجل التغييرات، ولا تقبل إجازتان معتمدتان متداخلتان للموظف.'}</p>
 <form id="hr-form" onSubmit={e=>{e.preventDefault();void save('save_record')}}><fieldset disabled={busy||!editable}><div className="form-grid">{employee?<>{[['employeeNumber','الرقم الوظيفي'],['name','اسم الموظف'],['title','المسمى الوظيفي'],['department','القسم'],['phone','هاتف الموظف']].map(([k,label])=><Field key={k} type={k==='phone'?'tel':'text'} label={label} value={p[k]} onChange={v=>set(k,v)} suggestions={k==='title'?JOB_TITLES:k==='department'?HR_DEPARTMENTS:undefined}/>)}<DateField label="تاريخ الانضمام" value={p.startDate} onChange={v=>set('startDate',v)}/><OfficeSelect label="حالة الموظف" value={p.status} onChange={v=>set('status',v)} options={[['active','نشط'],['inactive','غير نشط']]}/></>:<><fieldset disabled={!!draft.revision}><OfficeSelect label="الموظف" value={draft.subjectId} onChange={v=>setDraft(r=>({...r,subjectId:v}))} empty="اختر الموظف" options={employees.filter(r=>!r.archived||r.id===draft.subjectId).map(r=>[r.id,r.payload.name+' · '+r.payload.employeeNumber])}/></fieldset><PickOrType label="نوع الإجازة" value={p.type} onChange={v=>set('type',v)} options={LEAVE_TYPES} hint="نوع إجازة آخر"/><DateField label="بداية الإجازة" value={p.fromDate} onChange={v=>set('fromDate',v)}/><DateField label="نهاية الإجازة" value={p.toDate} onChange={v=>set('toDate',v)}/><OfficeSelect label="قرار الإجازة" value={p.status} onChange={v=>set('status',v)} options={Object.entries(LEAVE_STATUSES)}/><Field label="ملاحظة القرار / السبب" value={p.decisionNote} onChange={v=>set('decisionNote',v)}/></>}<Field label="ملاحظات الموظف أو الطلب" value={p.notes} onChange={v=>set('notes',v)} multiline wide/></div>
 {employee&&!!draft.revision&&<p className="leave-summary">الإجازات المعتمدة في {year}: <b>{used.total} يوم</b>{used.byType.length>0&&' — '+used.byType.map(([t,d])=>`${t}: ${d}`).join('، ')}</p>}{!employee&&<p className="leave-summary">مدة الطلب: <b>{requested?requested+' يوم تقويمي':'حدد تاريخين صحيحين'}</b></p>}</fieldset></form>
 {error&&<p className="notice" role="alert">{error}</p>}{!!draft.revision&&<DepartmentHistory workspace="hr" id={draft.id} revision={draft.revision}/>}</RecordWindow>;
}
