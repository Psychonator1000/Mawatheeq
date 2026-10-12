import {useEffect,useRef,useState} from 'react';
import {UsersRound,Plus} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {type DepartmentRecord,newDepartmentRecord,LEAVE_STATUSES} from '@/lib/departments';
import type {Permissions} from '@/lib/permissions';
import {todayISO,formatDate} from '@/lib/domain';
import {normalizeSearch} from '@/lib/case-browse';
import {Field,DateField,Empty} from '../shared';
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
 const pages=Math.max(1,Math.ceil(filtered.length/12)),current=Math.min(page,pages),today=todayISO(),year=Number(today.slice(0,4));
 const {nav,step,enter,openItem:setEditing}=useListNav(filtered,editing,setEditingRaw);
 function add(kind:'employee'|'leave'){setEditing(newDepartmentRecord('hr',kind,kind==='employee'?{employeeNumber:'',name:'',title:'',department:'',phone:'',startDate:'',status:'active',notes:''}:{type:'سنوية',fromDate:today,toDate:today,status:'pending',notes:'',decisionNote:''} as Record<string,string>))}
 return <><section className="department-hero"><div><div className="eyebrow">فريق مواثيق</div><h1>الموارد البشرية</h1><p>ملفات الموظفين ومواعيد الإجازات في سجل مشترك.</p></div><UsersRound size={64}/></section>
 <div className="department-metrics"><div><span>الموظفون النشطون</span><b>{employees.filter(r=>!r.archived&&r.payload.status==='active').length}</b></div><div><span>طلبات بانتظار القرار</span><b>{leaves.filter(r=>r.payload.status==='pending').length}</b></div><div><span>في إجازة اليوم</span><b>{new Set(leaves.filter(r=>r.payload.status==='approved'&&r.payload.fromDate<=today&&r.payload.toDate>=today).map(r=>r.subjectId)).size}</b></div></div>
 <section className="panel"><div className="department-toolbar"><div className="department-tabs" role="group" aria-label="سجلات الموارد البشرية"><button className={'btn '+(tab==='employee'?'primary':'')} aria-pressed={tab==='employee'} onClick={()=>{setTab('employee');setStatus('');setPage(1)}}>ملفات الموظفين</button><button className={'btn '+(tab==='leave'?'primary':'')} aria-pressed={tab==='leave'} onClick={()=>{setTab('leave');setStatus('');setPage(1)}}>الإجازات</button>{attendance!==false&&ATT_TABS.map(([k,label])=><button key={k} className={'btn '+(tab===k?'primary':'')} aria-pressed={tab===k} onClick={()=>setTab(k)}>{label}</button>)}</div>{access.canEdit&&(tab==='employee'||tab==='leave')&&<button className="btn primary" onClick={()=>add(tab as 'employee'|'leave')}><Plus size={17}/>{tab==='employee'?'موظف جديد':'طلب إجازة جديد'}</button>}</div>
 {tab!=='employee'&&tab!=='leave'?<div className="att-section">{attendance===null?<p role="status">جارٍ التحقق من ميزة الحضور…</p>:attendance===false?<AttendanceUnavailable/>:tab==='attendance'?<AttendanceBoard canExport={access.canExport}/>:tab==='devices'?<DevicesPanel/>:tab==='pay'?<ProfilesPanel/>:<AttendanceSettingsPanel/>}</div>:<>
 <div className="department-toolbar"><Field label="بحث الموارد البشرية" value={search} onChange={v=>{setSearch(v);setPage(1)}}/><OfficeSelect label="تصفية الحالة" value={status} onChange={v=>{setStatus(v);setPage(1)}} empty="جميع الحالات" options={tab==='employee'?[['active','نشط'],['inactive','غير نشط'],['archived','مؤرشف']]:Object.entries(LEAVE_STATUSES)}/>{access.canExport&&<button className="btn" onClick={()=>void exportCsv('hr','Mawatheeq-'+tab,tab==='employee'?[['رقم الموظف','الاسم','المسمى','القسم','تاريخ الانضمام','الحالة'],...filtered.map(r=>[r.payload.employeeNumber,r.payload.name,r.payload.title,r.payload.department,r.payload.startDate,r.archived?'مؤرشف':r.payload.status==='active'?'نشط':'غير نشط'])]:[['الموظف','نوع الإجازة','من','إلى','الحالة','ملاحظة القرار'],...filtered.map(r=>[employeeName(r.subjectId),r.payload.type,r.payload.fromDate,r.payload.toDate,LEAVE_STATUSES[r.payload.status as keyof typeof LEAVE_STATUSES],r.payload.decisionNote])]).catch(e=>toast.error(e.message))}>تصدير القائمة</button>}</div>
 <StatusMessage loading={loading} error={error}/>{!loading&&!error&&<>{tab==='employee'?<div className="people-grid">{filtered.slice((current-1)*12,current*12).map(r=><article className="person-card" data-tilt key={r.id}><div className="person-avatar">{r.payload.name.slice(0,1)}</div><span className={'tag '+(!r.archived&&r.payload.status==='active'?'green':'')}>{r.archived?'مؤرشف':r.payload.status==='active'?'نشط':'غير نشط'}</span><h2>{r.payload.name}</h2>{accountOf(r)&&<small className="person-account" dir="ltr" title="حساب الدخول المرتبط">@{accountOf(r)!.username}</small>}<p>{r.payload.title||'المسمى غير مسجل'}</p><small>{r.payload.department||'قسم غير مسجل'} · {r.payload.employeeNumber}</small><small>إجازات معتمدة {year}: {leaveUsed(leaves,r.id,year).total} يوم</small><button className="btn" onClick={()=>setEditing(r)}>فتح ملف الموظف</button></article>)}</div>:<div className="table-wrap"><table className="office-table"><thead><tr><th>الموظف</th><th>نوع الإجازة</th><th>المدة</th><th>الحالة</th><th>التفاصيل</th></tr></thead><tbody>{filtered.slice((current-1)*12,current*12).map(r=><tr key={r.id}><td>{employeeName(r.subjectId)}</td><td>{r.payload.type}</td><td>{formatDate(r.payload.fromDate)} — {formatDate(r.payload.toDate)}<small>{leaveDays(r.payload.fromDate,r.payload.toDate)} يوم</small></td><td><span className={'tag '+(r.payload.status==='approved'?'green':'amber')}>{LEAVE_STATUSES[r.payload.status as keyof typeof LEAVE_STATUSES]}</span></td><td><button className="btn" onClick={()=>setEditing(r)}>فتح طلب الإجازة</button></td></tr>)}</tbody></table></div>}{!filtered.length&&<Empty text={tab==='employee'?'أضف ملف الموظف وبيانات عمله الأساسية.':'أضف طلب إجازة لموظف مسجل.'}/>}<PageNavigation page={current} pages={pages} total={filtered.length} onChange={setPage}/></>}
 </>}<p className="subtitle">لكل حساب دخول ملف موظف يُنشأ تلقائياً ويمكن استكماله هنا. إنشاء الحسابات ومنح صلاحياتها من إعدادات مسؤول المكتب.</p></section>
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
  footer={<>{editable&&<button type="submit" form="hr-form" className="btn primary" disabled={busy||!ready}>حفظ سجل الموارد البشرية</button>}{employee&&!!draft.revision&&access.canEdit&&<button className="btn" disabled={busy} onClick={()=>void save('archive_record')}>{draft.archived?'إعادة فتح ملف الموظف':'أرشفة ملف الموظف'}</button>}<button className="btn" disabled={busy} onClick={onClose}>إغلاق السجل</button></>}>
 <p className="subtitle">{employee?'بيانات العمل الأساسية ووسيلة الاتصال.':'يسجل القرار في سجل التغييرات، ولا تقبل إجازتان معتمدتان متداخلتان للموظف.'}</p>
 <form id="hr-form" onSubmit={e=>{e.preventDefault();void save('save_record')}}><fieldset disabled={busy||!editable}><div className="form-grid">{employee?<>{[['employeeNumber','الرقم الوظيفي'],['name','اسم الموظف'],['title','المسمى الوظيفي'],['department','القسم'],['phone','هاتف الموظف']].map(([k,label])=><Field key={k} label={label} value={p[k]} onChange={v=>set(k,v)}/>)}<DateField label="تاريخ الانضمام" value={p.startDate} onChange={v=>set('startDate',v)}/><OfficeSelect label="حالة الموظف" value={p.status} onChange={v=>set('status',v)} options={[['active','نشط'],['inactive','غير نشط']]}/></>:<><fieldset disabled={!!draft.revision}><OfficeSelect label="الموظف" value={draft.subjectId} onChange={v=>setDraft(r=>({...r,subjectId:v}))} empty="اختر الموظف" options={employees.filter(r=>!r.archived||r.id===draft.subjectId).map(r=>[r.id,r.payload.name+' · '+r.payload.employeeNumber])}/></fieldset><Field label="نوع الإجازة" value={p.type} onChange={v=>set('type',v)}/><DateField label="بداية الإجازة" value={p.fromDate} onChange={v=>set('fromDate',v)}/><DateField label="نهاية الإجازة" value={p.toDate} onChange={v=>set('toDate',v)}/><OfficeSelect label="قرار الإجازة" value={p.status} onChange={v=>set('status',v)} options={Object.entries(LEAVE_STATUSES)}/><Field label="ملاحظة القرار / السبب" value={p.decisionNote} onChange={v=>set('decisionNote',v)}/></>}<Field label="ملاحظات الموظف أو الطلب" value={p.notes} onChange={v=>set('notes',v)} multiline wide/></div>
 {employee&&!!draft.revision&&<p className="leave-summary">الإجازات المعتمدة في {year}: <b>{used.total} يوم</b>{used.byType.length>0&&' — '+used.byType.map(([t,d])=>`${t}: ${d}`).join('، ')}</p>}{!employee&&<p className="leave-summary">مدة الطلب: <b>{requested?requested+' يوم تقويمي':'حدد تاريخين صحيحين'}</b></p>}</fieldset></form>
 {error&&<p className="notice" role="alert">{error}</p>}{!!draft.revision&&<DepartmentHistory workspace="hr" id={draft.id} revision={draft.revision}/>}</RecordWindow>;
}
