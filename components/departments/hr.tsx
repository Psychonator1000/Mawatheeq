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
import {PulseStrip,PulseTile} from '../pulse';
import {daysAr} from '@/lib/case-line';
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
   if(added)toast.success((added===1?'أُضيف ملف موظف واحد':added===2?'أُضيف ملفا موظفَين':added%100>=3&&added%100<=10?`أُضيفت ${added} ملفات موظفين`:`أُضيف ${added} ملفاً للموظفين`)+' من حسابات الدخول.');
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
 // Who is away, what waits for a decision and how the staff split head the page; the list takes the whole width.
 const away=(id:string)=>onLeave.find(r=>r.subjectId===id),waiting=(id:string)=>pending.find(r=>r.subjectId===id);
 const live=employees.filter(r=>!r.archived),depts=[...new Set(live.map(r=>r.payload.department||'قسم غير مسجل'))].map(d=>[d,live.filter(r=>(r.payload.department||'قسم غير مسجل')===d).length] as const).sort((x,y)=>y[1]-x[1]);
 const tones=['brand','blue','amber','green','grey'] as const;
 const leaveWhen=(r:DepartmentRecord)=>{const f=r.payload.fromDate,t=r.payload.toDate,st=r.payload.status;if(st==='rejected'||st==='cancelled')return '';
  if(f<=today&&t>=today)return st==='approved'?'في إجازة حتى '+formatDate(t):'تبدأ اليوم ولم يُبتّ فيها';
  if(f>today){const n=Math.round((Date.parse(f)-Date.parse(today))/864e5);return 'تبدأ بعد '+daysAr(n,true)}return 'انتهت '+formatDate(t)};
 return <><div className="work-desk-grid solo">
 <section className="panel work-desk">
  <div className="work-desk-head"><h2>الموارد البشرية</h2><div className="work-chips" role="group" aria-label="سجلات الموارد البشرية"><button className={'work-chip'+(tab==='employee'?' on':'')} aria-pressed={tab==='employee'} onClick={()=>pick('employee')}>ملفات الموظفين</button><button className={'work-chip'+(tab==='leave'?' on':'')} aria-pressed={tab==='leave'} onClick={()=>pick('leave')}>الإجازات{pending.length?<b>{pending.length}</b>:null}</button>{attendance!==false&&ATT_TABS.map(([k,label])=><button key={k} className={'work-chip'+(tab===k?' on':'')} aria-pressed={tab===k} onClick={()=>setTab(k)}>{label}</button>)}</div>
   {(tab==='employee'||tab==='leave')&&<div className="actions">{access.canExport&&<button className="btn" onClick={()=>void exportCsv('hr','Mawatheeq-'+tab,tab==='employee'?[['رقم الموظف','الاسم','المسمى','القسم','تاريخ الانضمام','الحالة'],...filtered.map(r=>[r.payload.employeeNumber,r.payload.name,r.payload.title,r.payload.department,r.payload.startDate,r.archived?'مؤرشف':r.payload.status==='active'?'نشط':'غير نشط'])]:[['الموظف','نوع الإجازة','من','إلى','الحالة','ملاحظة القرار'],...filtered.map(r=>[employeeName(r.subjectId),r.payload.type,r.payload.fromDate,r.payload.toDate,LEAVE_STATUSES[r.payload.status as keyof typeof LEAVE_STATUSES],r.payload.decisionNote])]).catch(e=>toast.error(e.message))}>تصدير القائمة</button>}{access.canEdit&&<button className="btn primary" onClick={()=>add(tab as 'employee'|'leave')}><Plus size={17}/>{tab==='employee'?'موظف جديد':'طلب إجازة جديد'}</button>}</div>}</div>
  {tab!=='employee'&&tab!=='leave'?<div className="work-desk-body"><div className="att-section">{attendance===null?<p role="status">جارٍ التحقق من ميزة الحضور…</p>:attendance===false?<AttendanceUnavailable/>:tab==='attendance'?<AttendanceBoard canExport={access.canExport}/>:tab==='devices'?<DevicesPanel/>:tab==='pay'?<ProfilesPanel/>:<AttendanceSettingsPanel/>}</div></div>:<>
  <div className="work-desk-filters"><Field label="بحث الموارد البشرية" value={search} onChange={v=>{setSearch(v);setPage(1)}} placeholder="الاسم، الرقم الوظيفي، القسم أو المسمى"/><OfficeSelect label="تصفية الحالة" value={status} onChange={v=>{setStatus(v);setPage(1)}} empty="جميع الحالات" options={tab==='employee'?[['active','نشط'],['inactive','غير نشط'],['archived','مؤرشف']]:Object.entries(LEAVE_STATUSES)}/></div>
  {!loading&&!error&&<PulseStrip label="ملخص الموارد البشرية">
   <PulseTile title="اليوم" value={new Set(onLeave.map(r=>r.subjectId)).size} sub={'في إجازة · '+formatDate(today)} parts={[{label:'في إجازة اليوم',value:onLeave.length,tone:'blue',on:tab==='leave'&&status==='approved',onClick:()=>{setTab('leave');setStatus(tab==='leave'&&status==='approved'?'':'approved');setPage(1)}},{label:'بانتظار القرار',value:pending.length,tone:'amber',on:tab==='leave'&&status==='pending',onClick:()=>{setTab('leave');setStatus(tab==='leave'&&status==='pending'?'':'pending');setPage(1)}}]}/>
   {tab==='employee'?<><PulseTile title="الموظفون" value={live.filter(r=>r.payload.status==='active').length} sub="نشط" parts={[{label:'نشط',value:live.filter(r=>r.payload.status==='active').length,tone:'green',on:status==='active',onClick:()=>{setStatus(status==='active'?'':'active');setPage(1)}},{label:'غير نشط',value:live.filter(r=>r.payload.status!=='active').length,tone:'grey',on:status==='inactive',onClick:()=>{setStatus(status==='inactive'?'':'inactive');setPage(1)}},{label:'مؤرشف',value:employees.filter(r=>r.archived).length,tone:'grey',on:status==='archived',onClick:()=>{setStatus(status==='archived'?'':'archived');setPage(1)}}]}/>
    <PulseTile title="الأقسام" parts={depts.slice(0,5).map(([d,n],k)=>({label:d,value:n,tone:tones[k],on:search===d,onClick:()=>{setSearch(search===d?'':d);setPage(1)}}))}/></>
   :<PulseTile title="الإجازات" value={leaves.length} sub="طلب" parts={(Object.keys(LEAVE_STATUSES) as (keyof typeof LEAVE_STATUSES)[]).map((k,i)=>({label:LEAVE_STATUSES[k],value:leaves.filter(r=>r.payload.status===k).length,tone:(['amber','green','red','grey'] as const)[i],on:status===k,onClick:()=>{setStatus(status===k?'':k);setPage(1)}}))}/>}
  </PulseStrip>}
  <div className="work-desk-body"><StatusMessage loading={loading} error={error}/>{!loading&&!error&&<>{!filtered.length?<Empty text={tab==='employee'?'أضف ملف الموظف وبيانات عمله الأساسية.':'أضف طلب إجازة لموظف مسجل.'}/>:tab==='employee'?<ul className="story-list people-lines" aria-label="ملفات الموظفين"><li className="story-head" aria-hidden><span>الموظف</span><span>المسمى والقسم</span><span>إجازات {year}</span><span>الحالة</span><span>باختصار</span><span/></li>{filtered.slice((current-1)*PER_PAGE,current*PER_PAGE).map(r=>{const on=away(r.id),ask=waiting(r.id),act=!r.archived&&r.payload.status==='active';return <li key={r.id}><div className={'story-row e-'+(!act?'grey':on?'blue':ask?'amber':'green')}>
   <span className="person-line"><span className="person-avatar">{r.payload.name.slice(0,1)}</span><span><b>{r.payload.name}</b> <small className="muted">{r.payload.employeeNumber}{accountOf(r)&&<> · <span className="person-account" dir="ltr" title="حساب الدخول المرتبط">@{accountOf(r)!.username}</span></>}</small></span></span>
   <span>{r.payload.title||<span className="muted">المسمى غير مسجل</span>} <small className="muted">· {r.payload.department||'قسم غير مسجل'}</small></span>
   <span className="nowrap">{daysAr(leaveUsed(leaves,r.id,year).total)}</span>
   <span><span className={'tag '+(act?'green':'')}>{r.archived?'مؤرشف':r.payload.status==='active'?'نشط':'غير نشط'}</span></span>
   <span className="line-story">{[on?'في إجازة '+on.payload.type+' حتى '+formatDate(on.payload.toDate):'',ask?'طلب إجازة بانتظار القرار من '+formatDate(ask.payload.fromDate):'',r.payload.startDate?'انضم '+formatDate(r.payload.startDate):''].filter(Boolean).join(' · ')||'—'}</span>
   <button className="btn" onClick={()=>setEditing(r)}>فتح ملف الموظف</button></div></li>})}</ul>
   :<ul className="story-list leave-lines" aria-label="الإجازات"><li className="story-head" aria-hidden><span>الموظف</span><span>نوع الإجازة</span><span>المدة</span><span>الحالة</span><span>باختصار</span><span/></li>{filtered.slice((current-1)*PER_PAGE,current*PER_PAGE).map(r=>{const st=r.payload.status,w=leaveWhen(r);return <li key={r.id}><div className={'story-row e-'+(st==='pending'?'amber':st==='approved'?(w.startsWith('في إجازة')?'blue':'green'):'grey')}>
   <span><b>{employeeName(r.subjectId)}</b></span><span>{r.payload.type}</span>
   <span className="nowrap">{formatDate(r.payload.fromDate)} — {formatDate(r.payload.toDate)} <small className="muted">· {daysAr(leaveDays(r.payload.fromDate,r.payload.toDate))}</small></span>
   <span><span className={'tag '+(st==='approved'?'green':st==='pending'?'amber':st==='rejected'?'red':'')}>{LEAVE_STATUSES[st as keyof typeof LEAVE_STATUSES]}</span></span>
   <span className="line-story">{[w,r.payload.decisionNote].filter(Boolean).join(' · ')||'—'}</span>
   <button className="btn" onClick={()=>setEditing(r)}>فتح طلب الإجازة</button></div></li>})}</ul>}<PageNavigation page={current} pages={pages} total={filtered.length} onChange={setPage}/></>}
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
  facts={employee?[['الهاتف',p.phone],['تاريخ الانضمام',p.startDate?formatDate(p.startDate):''],[`إجازات ${year}`,draft.revision?daysAr(used.total):''],['القسم',p.department]]:[['من',p.fromDate?formatDate(p.fromDate):''],['إلى',p.toDate?formatDate(p.toDate):''],['المدة',requested?daysAr(requested)+' بالتقويم':''],['القرار',status]]}
  nav={nav} onNavigate={onNavigate} unit="السجل" enter={enter} dirty={dirty&&editable} busy={busy} onSave={editable?()=>{if(ready)void save('save_record')}:undefined} onClose={onClose}
  needs={editable?(employee?[!p.name&&'أدخل «اسم الموظف»',!p.employeeNumber&&'أدخل «الرقم الوظيفي»']:[!draft.subjectId&&'اختر «الموظف»',!p.fromDate&&'اختر «بداية الإجازة»',!p.toDate&&'اختر «نهاية الإجازة»']):[]}
  footer={<>{editable&&<button type="submit" form="hr-form" className="btn primary" disabled={busy||!ready}>حفظ سجل الموارد البشرية</button>}{employee&&!!draft.revision&&access.canEdit&&<button className="btn" disabled={busy} onClick={()=>void save('archive_record')}>{draft.archived?'إعادة فتح ملف الموظف':'أرشفة ملف الموظف'}</button>}<button className="btn" disabled={busy} onClick={onClose}>إغلاق السجل</button></>}>
 <p className="subtitle">{employee?'بيانات العمل الأساسية ووسيلة الاتصال.':'يسجل القرار في سجل التغييرات، ولا تقبل إجازتان معتمدتان متداخلتان للموظف.'}</p>
 <form id="hr-form" onSubmit={e=>{e.preventDefault();void save('save_record')}}><fieldset disabled={busy||!editable}><div className="form-grid">{employee?<>{[['employeeNumber','الرقم الوظيفي'],['name','اسم الموظف'],['title','المسمى الوظيفي'],['department','القسم'],['phone','هاتف الموظف']].map(([k,label])=><Field key={k} type={k==='phone'?'tel':'text'} label={label} value={p[k]} onChange={v=>set(k,v)} suggestions={k==='title'?JOB_TITLES:k==='department'?HR_DEPARTMENTS:undefined}/>)}<DateField label="تاريخ الانضمام" value={p.startDate} onChange={v=>set('startDate',v)}/><OfficeSelect label="حالة الموظف" value={p.status} onChange={v=>set('status',v)} options={[['active','نشط'],['inactive','غير نشط']]}/></>:<><fieldset disabled={!!draft.revision}><OfficeSelect label="الموظف" value={draft.subjectId} onChange={v=>setDraft(r=>({...r,subjectId:v}))} empty="اختر الموظف" options={employees.filter(r=>!r.archived||r.id===draft.subjectId).map(r=>[r.id,r.payload.name+' · '+r.payload.employeeNumber])}/></fieldset><PickOrType label="نوع الإجازة" value={p.type} onChange={v=>set('type',v)} options={LEAVE_TYPES} hint="نوع إجازة آخر"/><DateField label="بداية الإجازة" value={p.fromDate} onChange={v=>set('fromDate',v)}/><DateField label="نهاية الإجازة" value={p.toDate} onChange={v=>set('toDate',v)}/><OfficeSelect label="قرار الإجازة" value={p.status} onChange={v=>set('status',v)} options={Object.entries(LEAVE_STATUSES)}/><Field label="ملاحظة القرار / السبب" value={p.decisionNote} onChange={v=>set('decisionNote',v)}/></>}<Field label="ملاحظات الموظف أو الطلب" value={p.notes} onChange={v=>set('notes',v)} multiline wide/></div>
 {employee&&!!draft.revision&&<p className="leave-summary">الإجازات المعتمدة في {year}: <b>{daysAr(used.total)}</b>{used.byType.length>0&&' — '+used.byType.map(([t,d])=>`${t}: ${d}`).join('، ')}</p>}{!employee&&<p className="leave-summary">مدة الطلب: <b>{requested?daysAr(requested)+' بالتقويم':'حدد تاريخين صحيحين'}</b></p>}</fieldset></form>
 {error&&<p className="notice" role="alert">{error}</p>}{!!draft.revision&&<DepartmentHistory workspace="hr" id={draft.id} revision={draft.revision}/>}</RecordWindow>;
}
