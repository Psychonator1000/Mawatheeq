import {lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {HOLIDAYS} from '@/lib/choices';
import {ChevronRight,ChevronLeft,Upload,Printer,Plus,RefreshCw,Trash2,Pencil,Settings2} from 'lucide-react';
import {toast} from 'sonner';
import {attendanceRequest} from '@/lib/local-auth';
import {type AttendanceSettings,type AttEmployee,type Schedule,type DayHours,hoursOn,type AttAdjustment,type DayKind,type DayRecord,type MonthSummary,DAY_LABELS,WEEKDAYS,monthDays,monthSummary,formatMinutes,parseAttendanceFile,scheduleOf,toMinor,fromMinor} from '@/lib/attendance';
import {type AttContext,type AttDevice,type AttMonth,attendanceAvailable,useAttendanceMonth,officeNow} from '@/lib/attendance-api';
import {CURRENCIES,moneyText,type Currency} from '@/lib/departments';
import {formatDate,todayISO} from '@/lib/domain';
import {normalizeSearch} from '@/lib/case-browse';
import {payrollHtml,printHtml,warningLetterHtml} from '@/lib/print';
import {Field,DateField,Empty} from '../shared';
import {OfficeSelect} from '../office-shared';
import {EditorDialog,StatusMessage,exportCsv} from './shared';
import Needs from '../needs';
import {useBooksAvailable} from '@/lib/books-api';

const PayrollToBooks=lazy(()=>import('./books-outside').then(m=>({default:m.PayrollToBooks})));

const MONTH_NAMES=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
export const monthLabel=(month:string)=>MONTH_NAMES[Number(month.slice(5,7))-1]+' '+month.slice(0,4);
const shiftMonth=(month:string,by:number)=>{const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+by,1));return d.toISOString().slice(0,7)};
const WEEKDAY_SHORT=['أحد','اثن','ثلا','أرب','خمي','جمع','سبت'];
const KIND_SHORT:Record<DayKind,string>={present:'✓',late:'م',absent:'غ',leave:'إ',holiday:'ع',weekend:'·',excused:'ذ',missing:'!',upcoming:'',expected:'…'};
const money=(m:string|bigint,c:string)=>moneyText(m,(c in CURRENCIES?c:'KWD') as Currency);
const popupBlocked=()=>toast.error('اسمح بالنوافذ المنبثقة في المتصفح للطباعة.');
const fail=(e:unknown)=>toast.error((e as Error).message);

/** null while checking; false when the attendance migration is not applied yet. */
export function useAttendanceEnabled(){const [on,setOn]=useState<boolean|null>(null);useEffect(()=>{let active=true;void attendanceAvailable().then(v=>{if(active)setOn(v)});return()=>{active=false}},[]);return on}
export function AttendanceUnavailable(){return <section className="panel"><p className="notice">ميزة الحضور والبصمة تحتاج إلى تطبيق ملف قاعدة البيانات الخاص بها أولاً. راجع docs/ATTENDANCE.md.</p></section>}

function MonthSwitcher({month,onChange}:{month:string;onChange:(m:string)=>void}){
 return <div className="month-switcher" role="group" aria-label="الشهر"><button className="icon-btn" aria-label="الشهر السابق" onClick={()=>onChange(shiftMonth(month,-1))}><ChevronRight size={18}/></button><b aria-live="polite">{monthLabel(month)}</b><button className="icon-btn" aria-label="الشهر التالي" onClick={()=>onChange(shiftMonth(month,1))}><ChevronLeft size={18}/></button></div>;
}
function summaries(data:AttMonth,month:string,includeInactive=false){
 const now=officeNow(data.context.settings.timezone);
 return data.employees.filter(e=>includeInactive||e.active).map(e=>monthSummary(e,month,data.context.settings,data.punches,data.leaves,data.adjustments,now));
}

// ───────────── HR: attendance board ─────────────
export function AttendanceBoard({canExport}:{canExport:boolean}){
 const [month,setMonth]=useState(()=>todayISO().slice(0,7)),[search,setSearch]=useState(''),[day,setDay]=useState<{employee:AttEmployee;record:DayRecord}|null>(null),[importing,setImporting]=useState(false);
 const {data,error,loading,reload}=useAttendanceMonth(month);
 const rows=useMemo(()=>data?summaries(data,month).filter(s=>normalizeSearch([s.employee.name,s.employee.employeeNumber,s.employee.pin].join(' ')).includes(normalizeSearch(search))):[],[data,month,search]);
 const dates=monthDays(month),today=data?.context.today||'';
 const todayCounts=useMemo(()=>{const c:Partial<Record<DayKind,number>>={};for(const s of rows){const d=s.days.find(x=>x.date===today);if(d)c[d.kind]=(c[d.kind]||0)+1}return c},[rows,today]);
 const unknownPins=useMemo(()=>{if(!data)return [];const known=new Set(data.employees.map(e=>e.pin).filter(Boolean));return [...new Set(data.punches.map(p=>p.pin).filter(p=>!known.has(p)))]},[data]);
 function exportMonth(){void exportCsv('hr','Mawatheeq-attendance-'+month,[['الموظف','الرقم الوظيفي','رقم البصمة','التاريخ','الحالة','الدخول','الخروج','تأخير (د)','خروج مبكر (د)','ساعات العمل (د)','إضافي (د)','ملاحظة'],...rows.flatMap(s=>s.days.filter(d=>d.kind!=='upcoming').map(d=>[s.employee.name,s.employee.employeeNumber,s.employee.pin,d.date,DAY_LABELS[d.kind],d.first,d.last,d.lateMinutes,d.earlyMinutes,d.workedMinutes,d.overtimeMinutes,d.note]))]).catch(fail)}
 return <section className="panel attendance-board">
  <div className="department-toolbar"><MonthSwitcher month={month} onChange={setMonth}/><div className="actions">{data?.context.canManageDevices&&<button className="btn" onClick={()=>setImporting(true)}><Upload size={16}/> استيراد ملف بصمات</button>}{canExport&&<button className="btn" disabled={!data} onClick={exportMonth}>تصدير الحضور</button>}<button className="btn" onClick={reload}><RefreshCw size={16}/> تحديث الحضور</button></div></div>
  {data&&month===today.slice(0,7)&&<div className="att-today" aria-label="حضور اليوم">{(['present','late','expected','absent','missing','leave','excused'] as DayKind[]).map(k=><div key={k} className={'att-stat k-'+k}><span>{k==='missing'?'بصمة دخول فقط':DAY_LABELS[k]}</span><b>{todayCounts[k]||0}</b></div>)}</div>}
  <div className="department-toolbar"><Field label="بحث الموظفين في الحضور" value={search} onChange={setSearch}/><div className="att-legend" aria-hidden>{(['present','late','absent','missing','leave','excused','holiday'] as DayKind[]).map(k=><span key={k} className={'att-cell k-'+k}>{KIND_SHORT[k]}<i>{DAY_LABELS[k]}</i></span>)}</div></div>
  <StatusMessage loading={loading&&!data} error={error}/>
  {data&&<>{unknownPins.length>0&&<p className="notice">بصمات لأرقام غير مربوطة بأي موظف: {unknownPins.slice(0,12).join('، ')}{unknownPins.length>12&&'…'}. اربطها من «الرواتب والبصمات».</p>}
  <div className="table-wrap att-grid-wrap"><table className="att-grid"><thead><tr><th scope="col">الموظف</th>{dates.map(d=><th key={d} scope="col" className={d===today?'is-today':''} title={WEEKDAYS[new Date(d+'T00:00:00Z').getUTCDay()]}>{Number(d.slice(8))}<small>{WEEKDAY_SHORT[new Date(d+'T00:00:00Z').getUTCDay()]}</small></th>)}<th scope="col">حضور</th><th scope="col">غياب</th><th scope="col">تأخير</th></tr></thead>
  <tbody>{rows.map(s=><tr key={s.employee.id}><th scope="row">{s.employee.name}<small>{s.employee.pin?'بصمة '+s.employee.pin:'غير مربوط'}</small></th>{s.days.map(d=><td key={d.date}><button className={'att-cell k-'+d.kind+(d.date===today?' is-today':'')} aria-label={`${s.employee.name} ${formatDate(d.date)}: ${DAY_LABELS[d.kind]}${d.first?' دخول '+d.first:''}${d.last?' خروج '+d.last:''}`} onClick={()=>setDay({employee:s.employee,record:d})}>{KIND_SHORT[d.kind]}</button></td>)}<td>{s.presentDays}/{s.scheduledDays}</td><td>{s.absentDays}</td><td className={s.excessMinutes?'office-alert':''}>{formatMinutes(s.shortfallMinutes)}</td></tr>)}</tbody></table></div>
  {!rows.length&&<Empty text="أضف ملفات الموظفين، ثم اربط كل موظف برقم بصمته."/>}</>}
  {day&&data&&<DayDialog key={day.employee.id+day.record.date} employee={day.employee} record={day.record} data={data} onClose={()=>setDay(null)} onSaved={()=>{setDay(null);reload()}}/>}
  {importing&&<ImportDialog onClose={()=>setImporting(false)} onDone={()=>{setImporting(false);reload()}}/>}
 </section>;
}

function DayDialog({employee,record,data,onClose,onSaved}:{employee:AttEmployee;record:DayRecord;data:AttMonth;onClose:()=>void;onSaved:()=>void}){
 const items=data.adjustments.filter(a=>a.employeeId===employee.id&&a.day===record.date),canEdit=data.context.canEdit;
 const [kind,setKind]=useState<AttAdjustment['kind']>('excuse'),[time,setTime]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
 const sched=scheduleOf(employee,data.context.settings);
 async function run(action:string,item:Partial<AttAdjustment>){setBusy(true);try{await attendanceRequest(action,{item});toast.success(action==='archive_adjustment'?'أُزيل التعديل':'حُفظ تعديل الحضور');onSaved()}catch(e){fail(e)}finally{setBusy(false)}}
 return <EditorDialog title={employee.name+' · '+formatDate(record.date)} description={`${WEEKDAYS[new Date(record.date+'T00:00:00Z').getUTCDay()]} · الدوام ${hoursOn(sched,record.date).start}–${hoursOn(sched,record.date).end}`} busy={busy} onClose={onClose}>
  <dl className="summary-grid"><dt>الحالة</dt><dd><span className={'att-cell k-'+record.kind}>{KIND_SHORT[record.kind]}</span> {DAY_LABELS[record.kind]}{record.note&&' — '+record.note}</dd><dt>البصمات</dt><dd dir="ltr" className="att-punches">{record.punches.length?record.punches.join('  ·  '):'لا توجد'}</dd><dt>التأخير</dt><dd>{formatMinutes(record.lateMinutes)}</dd><dt>الخروج المبكر</dt><dd>{formatMinutes(record.earlyMinutes)}</dd><dt>مدة العمل</dt><dd>{formatMinutes(record.workedMinutes)}</dd><dt>العمل الإضافي</dt><dd>{formatMinutes(record.overtimeMinutes)}</dd></dl>
  {items.length>0&&<section className="department-form-section"><h3>تعديلات مسجلة</h3>{items.map(a=><p key={a.id} className="att-adjustment"><span>{a.kind==='excuse'?'عذر':a.kind==='manual_in'?'دخول يدوي '+a.time:'خروج يدوي '+a.time} — {a.note}<small>{a.by}</small></span>{canEdit&&<button className="btn" disabled={busy} onClick={()=>void run('archive_adjustment',{id:a.id,revision:a.revision})}>إزالة التعديل</button>}</p>)}</section>}
  {canEdit&&<form className="department-form-section" onSubmit={e=>{e.preventDefault();void run('save_adjustment',{id:crypto.randomUUID(),revision:0,employeeId:employee.id,day:record.date,kind,time:kind==='excuse'?null:time,note:note.trim()})}}><h3>إضافة تعديل</h3><fieldset disabled={busy}><div className="form-grid"><OfficeSelect label="نوع التعديل" value={kind} onChange={v=>setKind(v as AttAdjustment['kind'])} options={[['excuse','عذر مقبول (لا يحتسب غياباً أو تأخيراً)'],['manual_in','بصمة دخول يدوية'],['manual_out','بصمة خروج يدوية']]}/>{kind!=='excuse'&&<Field label="الوقت" type="time" value={time} onChange={setTime}/>}<Field label="سبب التعديل" value={note} onChange={setNote} wide/></div><Needs items={[!note.trim()&&'اكتب «سبب التعديل»',kind!=='excuse'&&!/^\d{2}:\d{2}$/.test(time)&&'أدخل «الوقت» بصيغة ساعة:دقيقة']}/><button type="submit" className="btn primary" disabled={!note.trim()||kind!=='excuse'&&!/^\d{2}:\d{2}$/.test(time)}>حفظ التعديل</button></fieldset></form>}
  <p className="subtitle">التعديلات لا تغيّر البصمات الأصلية، وتُحفظ مع اسم من أجراها.</p><button className="btn" disabled={busy} onClick={onClose}>إغلاق اليوم</button>
 </EditorDialog>;
}

function ImportDialog({onClose,onDone}:{onClose:()=>void;onDone:()=>void}){
 const [parsed,setParsed]=useState<{punches:{pin:string;wall:string}[];skipped:number;name:string}|null>(null),[busy,setBusy]=useState(false),[devices,setDevices]=useState<AttDevice[]>([]),[deviceId,setDeviceId]=useState('');
 useEffect(()=>{attendanceRequest<AttDevice[]>('devices').then(setDevices).catch(()=>setDevices([]))},[]);
 async function read(file:File){const text=await file.text();setParsed({...parseAttendanceFile(text),name:file.name})}
 async function upload(){if(!parsed)return;setBusy(true);try{let inserted=0,skipped=0;for(let i=0;i<parsed.punches.length;i+=5000){const r=await attendanceRequest<{inserted:number;skipped:number}>('import_punches',{punches:parsed.punches.slice(i,i+5000),deviceId:deviceId||null});inserted+=r.inserted;skipped+=r.skipped}toast.success(`استُورد ${inserted} بصمة جديدة${skipped?`، و${skipped} موجودة مسبقاً`:''}`);onDone()}catch(e){fail(e)}finally{setBusy(false)}}
 const range=parsed?.punches.length?[parsed.punches.reduce((a,p)=>p.wall<a?p.wall:a,parsed.punches[0].wall),parsed.punches.reduce((a,p)=>p.wall>a?p.wall:a,parsed.punches[0].wall)]:null;
 return <EditorDialog title="استيراد ملف بصمات" description="ملف attlog.dat من ذاكرة USB للجهاز، أو تقرير CSV/TXT من برنامج الحضور. البصمات المكررة لا تُحفظ مرتين." busy={busy} onClose={onClose}>
  <label className="field file-drop"><span>ملف البصمات</span><input type="file" accept=".dat,.txt,.csv,text/plain,text/csv" onChange={e=>{const f=e.target.files?.[0];if(f)void read(f)}}/></label>
  {devices.length>0&&<OfficeSelect label="الجهاز المصدر (اختياري)" value={deviceId} onChange={setDeviceId} empty="غير محدد" options={devices.map(d=>[d.id,d.name])}/>}
  {parsed&&<div className="notice" role="status"><b>{parsed.name}</b>: {parsed.punches.length} بصمة صالحة لـ {new Set(parsed.punches.map(p=>p.pin)).size} رقم{range&&` من ${range[0].slice(0,10)} إلى ${range[1].slice(0,10)}`}{parsed.skipped>0&&` · ${parsed.skipped} سطر غير مقروء`}</div>}
  <div className="actions"><button className="btn primary" disabled={busy||!parsed?.punches.length} onClick={()=>void upload()}>استيراد البصمات</button><button className="btn" disabled={busy} onClick={onClose}>إلغاء</button></div>
 </EditorDialog>;
}

// ───────────── Settings (HR and accounting) ─────────────
export function AttendanceSettingsPanel(){
 const [ctx,setCtx]=useState<AttContext|null>(null),[draft,setDraft]=useState<AttendanceSettings|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[holiday,setHoliday]=useState({date:'',name:''});
 useEffect(()=>{attendanceRequest<AttContext>('context').then(c=>{setCtx(c);setDraft(c.settings)}).catch(e=>setError(e.message))},[]);
 if(!draft||!ctx)return <section className="panel"><StatusMessage loading={!error} error={error}/></section>;
 const set=<K extends keyof AttendanceSettings>(k:K,v:AttendanceSettings[K])=>setDraft(d=>d&&{...d,[k]:v});
 const num=(v:string)=>Math.max(0,Math.round(Number(v)||0));
 async function save(){if(!draft||!ctx)return;setBusy(true);try{const r=await attendanceRequest<{settings:AttendanceSettings;revision:number}>('save_settings',{settings:draft,revision:ctx.revision});setCtx({...ctx,...r});setDraft(r.settings);toast.success('حُفظت إعدادات الدوام')}catch(e){fail(e)}finally{setBusy(false)}}
 return <section className="panel att-settings"><h2><Settings2 size={20}/> إعدادات الدوام والرواتب</h2><p className="subtitle">تنطبق على جميع الموظفين ما لم يكن للموظف دوام خاص. يمكن للموارد البشرية والمحاسبة تعديلها، وكل تعديل يُسجل.</p>
 <form onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy||!ctx.canEdit}>
  <div className="department-form-section"><h3>الدوام الرسمي</h3><div className="form-grid"><Field label="بداية الدوام" type="time" value={draft.start} onChange={v=>set('start',v)}/><Field label="نهاية الدوام" type="time" value={draft.end} onChange={v=>set('end',v)}/><Field label="فترة السماح اليومية (دقائق)" type="number" value={String(draft.graceMinutes)} onChange={v=>set('graceMinutes',Math.min(240,num(v)))}/><Field label="المنطقة الزمنية لأجهزة البصمة" value={draft.timezone} onChange={v=>set('timezone',v)}/></div>
   <fieldset className="weekday-picker"><legend>أيام العمل</legend>{WEEKDAYS.map((d,i)=><label key={d} className={'chip-toggle'+(draft.workDays.includes(i)?' on':'')}><input type="checkbox" checked={draft.workDays.includes(i)} onChange={e=>set('workDays',e.target.checked?[...draft.workDays,i].sort():draft.workDays.filter(x=>x!==i))}/>{d}</label>)}</fieldset><DayHoursEditor sched={draft} onChange={days=>set('days',days)}/></div>
  <div className="department-form-section"><h3>التأخير والخصم</h3><div className="form-grid"><Field label="سماحية التأخير الشهرية (دقائق)" type="number" value={String(draft.monthlyLateAllowanceMinutes)} onChange={v=>set('monthlyLateAllowanceMinutes',Math.min(10000,num(v)))}/><OfficeSelect label="عند تجاوز السماحية" value={draft.deductionMode} onChange={v=>set('deductionMode',v as 'warn'|'deduct')} options={[['warn','تنبيه وإنذار فقط دون خصم'],['deduct','خصم تلقائي من الراتب التقديري']]}/><OfficeSelect label="أساس أجر اليوم" value={draft.dayRateBasis} onChange={v=>set('dayRateBasis',v as '30'|'workdays')} options={[['30','الراتب ÷ 30 يوم'],['workdays','الراتب ÷ أيام العمل في الشهر']]}/><OfficeSelect label="عملة الرواتب الافتراضية" value={draft.currency} onChange={v=>set('currency',v)} options={Object.keys(CURRENCIES).map(k=>[k,k])}/></div>
   <label className="checkbox-line"><input type="checkbox" checked={draft.absenceDeduction} onChange={e=>set('absenceDeduction',e.target.checked)}/> خصم أيام الغياب دون إجازة أو عذر (في وضع الخصم فقط)</label></div>
  <div className="department-form-section"><h3>العمل الإضافي</h3><label className="checkbox-line"><input type="checkbox" checked={draft.overtime.enabled} onChange={e=>set('overtime',{...draft.overtime,enabled:e.target.checked})}/> احتساب بدل العمل الإضافي</label><div className="form-grid"><Field label="معامل الساعة الإضافية" type="number" value={String(draft.overtime.multiplier)} onChange={v=>set('overtime',{...draft.overtime,multiplier:Math.min(3,Math.max(1,Number(v)||1))})}/><Field label="أقل مدة تُحتسب (دقائق)" type="number" value={String(draft.overtime.minMinutes)} onChange={v=>set('overtime',{...draft.overtime,minMinutes:Math.min(600,num(v))})}/></div></div>
  <div className="department-form-section"><h3>العطل الرسمية</h3><ul className="holiday-list">{[...draft.holidays].sort((a,b)=>a.date.localeCompare(b.date)).map(h=><li key={h.date}><span>{formatDate(h.date)} — {h.name}</span><button type="button" className="icon-btn" aria-label={'حذف عطلة '+h.name} onClick={()=>set('holidays',draft.holidays.filter(x=>x.date!==h.date))}><Trash2 size={15}/></button></li>)}{!draft.holidays.length&&<li className="subtitle">لا توجد عطل مسجلة.</li>}</ul>
   <div className="form-grid"><DateField label="تاريخ العطلة" value={holiday.date} onChange={v=>setHoliday(h=>({...h,date:v}))}/><Field label="اسم العطلة" suggestions={HOLIDAYS} value={holiday.name} onChange={v=>setHoliday(h=>({...h,name:v}))}/></div><button type="button" className="btn" title={draft.holidays.some(h=>h.date===holiday.date)?'توجد عطلة مسجلة في هذا التاريخ':!holiday.date||!holiday.name.trim()?'اختر التاريخ واكتب اسم العطلة':undefined} disabled={!holiday.date||!holiday.name.trim()||draft.holidays.some(h=>h.date===holiday.date)} onClick={()=>{set('holidays',[...draft.holidays,{date:holiday.date,name:holiday.name.trim()}]);setHoliday({date:'',name:''})}}><Plus size={15}/> إضافة العطلة</button></div>
  {ctx.canEdit&&<><Needs items={[draft.start>=draft.end&&'«بداية الدوام» يجب أن تسبق «نهاية الدوام»',...badDays(draft)]}/><button type="submit" className="btn primary" disabled={draft.start>=draft.end}>حفظ إعدادات الدوام</button></>}
 </fieldset></form></section>;
}

// ───────────── Pay and fingerprint profiles ─────────────
export function ProfilesPanel(){
 const [month]=useState(()=>todayISO().slice(0,7));
 const {data,error,loading,reload}=useAttendanceMonth(month);
 const [editing,setEditing]=useState<AttEmployee|null>(null),[search,setSearch]=useState('');
 const list=(data?.employees||[]).filter(e=>normalizeSearch([e.name,e.employeeNumber,e.pin,e.department].join(' ')).includes(normalizeSearch(search)));
 return <section className="panel"><div className="department-toolbar"><h2>الرواتب وأرقام البصمة</h2><Field label="بحث الموظفين" value={search} onChange={setSearch}/></div><StatusMessage loading={loading&&!data} error={error}/>
  {data&&<div className="table-wrap"><table className="office-table"><thead><tr><th>الموظف</th><th>رقم البصمة</th><th>الراتب الشهري</th><th>الدوام</th><th>الإجراء</th></tr></thead><tbody>{list.map(e=>{const s=scheduleOf(e,data.context.settings);return <tr key={e.id} className={e.active?'':'ledger-void'}><td>{e.name}<small>{e.employeeNumber}{e.department&&' · '+e.department}{!e.active&&' · غير نشط'}</small></td><td>{e.pin||<span className="tag amber">غير مربوط</span>}</td><td dir="ltr" className="ledger-value">{money(e.salaryMinor,e.currency)}</td><td>{s.start}–{s.end}<small>{e.schedule?'دوام خاص':'الدوام العام'} · {s.workDays.length} أيام{Object.keys(s.days||{}).filter(d=>s.workDays.includes(Number(d))).map(d=>' · '+WEEKDAYS[Number(d)]+' '+s.days![d]!.start+'–'+s.days![d]!.end).join('')}</small></td><td>{data.context.canEdit&&<button className="btn" onClick={()=>setEditing(e)}><Pencil size={14}/> تعديل {e.name}</button>}</td></tr>})}</tbody></table></div>}
  {data&&!list.length&&<Empty text="أضف ملفات الموظفين من الموارد البشرية أولاً."/>}
  {editing&&data&&<ProfileDialog employee={editing} settings={data.context.settings} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);reload()}}/>}
 </section>;
}
function ProfileDialog({employee,settings,onClose,onSaved}:{employee:AttEmployee;settings:AttendanceSettings;onClose:()=>void;onSaved:()=>void}){
 const currency=(employee.profileRevision?employee.currency:settings.currency) as Currency;
 const [pin,setPin]=useState(employee.pin||''),[cur,setCur]=useState<Currency>(currency),[salary,setSalary]=useState(employee.profileRevision?fromMinor(employee.salaryMinor,CURRENCIES[currency]):''),[custom,setCustom]=useState(!!employee.schedule),[sched,setSched]=useState(scheduleOf(employee,settings)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const minor=toMinor(salary||'0',CURRENCIES[cur]);
 async function save(){setBusy(true);setError('');try{await attendanceRequest('save_profile',{employeeId:employee.id,revision:employee.profileRevision||0,profile:{pin:pin.trim(),salaryMinor:minor,currency:cur,schedule:custom?sched:null}});toast.success('حُفظ ملف الحضور والراتب');onSaved()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <EditorDialog title={'الحضور والراتب · '+employee.name} description="رقم البصمة هو رقم المستخدم المسجل على جهاز البصمة (User ID)." busy={busy} onClose={onClose}>
  <form onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy}><div className="form-grid"><Field label="رقم البصمة" value={pin} onChange={setPin}/><OfficeSelect label="عملة الراتب" value={cur} onChange={v=>setCur(v as Currency)} options={Object.keys(CURRENCIES).map(k=>[k,k])}/><Field label="الراتب الشهري" value={salary} onChange={setSalary} placeholder="0.000"/></div>
  {minor===null&&<p role="alert" className="office-alert">اكتب المبلغ بأرقام وبحد أقصى {CURRENCIES[cur]} خانات عشرية.</p>}
  <label className="checkbox-line"><input type="checkbox" checked={custom} onChange={e=>setCustom(e.target.checked)}/> دوام خاص لهذا الموظف</label>
  {custom&&<div className="department-form-section"><div className="form-grid"><Field label="بداية الدوام الخاص" type="time" value={sched.start} onChange={v=>setSched(s=>({...s,start:v}))}/><Field label="نهاية الدوام الخاص" type="time" value={sched.end} onChange={v=>setSched(s=>({...s,end:v}))}/></div><fieldset className="weekday-picker"><legend>أيام العمل</legend>{WEEKDAYS.map((d,i)=><label key={d} className={'chip-toggle'+(sched.workDays.includes(i)?' on':'')}><input type="checkbox" checked={sched.workDays.includes(i)} onChange={e=>setSched(s=>({...s,workDays:e.target.checked?[...s.workDays,i].sort():s.workDays.filter(x=>x!==i)}))}/>{d}</label>)}</fieldset><DayHoursEditor sched={sched} onChange={days=>setSched(s=>({...s,days}))}/></div>}
  <Needs items={[!!pin&&!/^[0-9A-Za-z]{1,24}$/.test(pin.trim())&&'«رقم البصمة» أحرف لاتينية وأرقام فقط، حتى 24 خانة',custom&&sched.start>=sched.end&&'«بداية الدوام الخاص» يجب أن تسبق نهايته',...(custom?badDays(sched):[])]}/>
  <button type="submit" className="btn primary" disabled={minor===null||!!pin&&!/^[0-9A-Za-z]{1,24}$/.test(pin.trim())||custom&&(sched.start>=sched.end||badDays(sched).length>0)}>حفظ ملف الحضور</button></fieldset></form>
  {error&&<p className="notice" role="alert">{error}</p>}<button className="btn" disabled={busy} onClick={onClose}>إغلاق</button>
 </EditorDialog>;
}

// ───────────── Accounting: payroll estimate ─────────────
export function PayrollPanel({canExport}:{canExport:boolean}){
 const [month,setMonth]=useState(()=>todayISO().slice(0,7)),[detail,setDetail]=useState<MonthSummary|null>(null),[search,setSearch]=useState('');
 const {data,error,loading,reload}=useAttendanceMonth(month);
 const rows=useMemo(()=>data?summaries(data,month).filter(s=>normalizeSearch([s.employee.name,s.employee.employeeNumber].join(' ')).includes(normalizeSearch(search))):[],[data,month,search]);
 const mode=data?.context.settings.deductionMode||'warn',books=useBooksAvailable();
 // The books keep Kuwaiti dinars; each employee's estimated net goes in as one line (fils to three decimals).
 const bookLines=useMemo(()=>data?summaries(data,month).filter(s=>s.employee.currency==='KWD'&&s.netMinor>BigInt(0)).map(s=>({name:s.employee.name,amount:fromMinor(String(s.netMinor),3)})):[],[data,month]);
 const totals=useMemo(()=>{const t:Record<string,{salary:bigint;net:bigint;deduct:bigint;overtime:bigint;n:number}>={};for(const r of rows){const c=r.employee.currency,x=t[c]||={salary:BigInt(0),net:BigInt(0),deduct:BigInt(0),overtime:BigInt(0),n:0};x.salary+=r.salaryMinor;x.net+=r.netMinor;x.deduct+=mode==='deduct'?r.lateDeductionMinor+r.absenceDeductionMinor:r.potentialDeductionMinor;x.overtime+=r.overtimePayMinor;x.n++}return t},[rows,mode]);
 function print(){if(!printHtml(payrollHtml(rows,monthLabel(month),mode,money,formatDate(data?.context.today||''),'')))popupBlocked()}
 function exportRows(){void exportCsv('accounting','Mawatheeq-payroll-'+month,[['الموظف','الرقم الوظيفي','أيام العمل','الحضور','الغياب','الإجازات','دقائق التأخير والخروج المبكر','تجاوز السماحية (د)','الإضافي (د)','العملة','الراتب','الخصم'+(mode==='warn'?' المحتمل':''),'بدل الإضافي','الصافي التقديري','التنبيهات'],...rows.map(r=>[r.employee.name,r.employee.employeeNumber,r.scheduledDays,r.presentDays,r.absentDays,r.leaveDays,r.shortfallMinutes,r.excessMinutes,r.overtimeMinutes,r.employee.currency,fromMinor(r.salaryMinor.toString(),CURRENCIES[r.employee.currency as Currency]??3),fromMinor((mode==='deduct'?r.lateDeductionMinor+r.absenceDeductionMinor:r.potentialDeductionMinor).toString(),CURRENCIES[r.employee.currency as Currency]??3),fromMinor(r.overtimePayMinor.toString(),CURRENCIES[r.employee.currency as Currency]??3),fromMinor(r.netMinor.toString(),CURRENCIES[r.employee.currency as Currency]??3),r.warnings.join('؛ ')])]).catch(fail)}
 return <section className="panel payroll-panel"><div className="department-toolbar"><MonthSwitcher month={month} onChange={setMonth}/><div className="actions">{canExport&&<button className="btn" disabled={!rows.length} onClick={exportRows}>تصدير الرواتب</button>}{canExport&&<button className="btn" disabled={!rows.length} onClick={print}><Printer size={16}/> طباعة كشف الرواتب</button>}<button className="btn" onClick={reload}><RefreshCw size={16}/> تحديث</button></div></div>
  <p className={'payroll-mode '+mode}>{mode==='warn'?'وضع التنبيه: يُعرض الخصم المحتمل للمعلومة فقط، ولا يُخصم أي مبلغ من الصافي.':'وضع الخصم: يُخصم تجاوز سماحية التأخير'+(data?.context.settings.absenceDeduction?' وأيام الغياب':'')+' من الصافي التقديري.'}</p>
  <div className="payroll-totals">{Object.entries(totals).map(([c,t])=><div key={c}><span>{t.n} موظف · {c}</span><b dir="ltr">{money(t.net,c)}</b><small>الرواتب {money(t.salary,c)} · {mode==='warn'?'خصم محتمل':'خصومات'} {money(t.deduct,c)} · إضافي {money(t.overtime,c)}</small></div>)}</div>
  <Field label="بحث الرواتب" value={search} onChange={setSearch}/><StatusMessage loading={loading&&!data} error={error}/>
  {data&&<div className="table-wrap"><table className="office-table ledger-table"><thead><tr><th>الموظف</th><th>الحضور</th><th>الغياب</th><th>تأخير وخروج مبكر</th><th>إضافي</th><th>الراتب</th><th>{mode==='warn'?'خصم محتمل':'الخصم'}</th><th>الصافي التقديري</th><th>التفاصيل</th></tr></thead><tbody>{rows.map(r=><tr key={r.employee.id}><td>{r.employee.name}<small>{r.employee.employeeNumber}</small>{r.warnings.length>0&&<small className="office-alert">{r.warnings[0]}{r.warnings.length>1&&` (+${r.warnings.length-1})`}</small>}</td><td>{r.presentDays}/{r.scheduledDays}</td><td>{r.absentDays}</td><td className={r.excessMinutes?'office-alert':''}>{formatMinutes(r.shortfallMinutes)}<small>السماحية {formatMinutes(r.allowanceMinutes)}</small></td><td>{formatMinutes(r.overtimeMinutes)}</td><td dir="ltr" className="ledger-value">{money(r.salaryMinor,r.employee.currency)}</td><td dir="ltr" className="ledger-value">{money(mode==='deduct'?r.lateDeductionMinor+r.absenceDeductionMinor:r.potentialDeductionMinor,r.employee.currency)}</td><td dir="ltr" className="ledger-value"><b>{money(r.netMinor,r.employee.currency)}</b></td><td><button className="btn" onClick={()=>setDetail(r)}>تفاصيل {r.employee.name}</button></td></tr>)}</tbody></table></div>}
  {data&&!rows.length&&<Empty text="لا يوجد موظفون نشطون. أضفهم من الموارد البشرية ثم حدد رواتبهم أدناه."/>}
  {books&&data&&<Suspense fallback={null}><PayrollToBooks month={month} lines={bookLines}/></Suspense>}
  <p className="subtitle">تقدير آلي من البصمات والإجازات المعتمدة وتعديلات الحضور. يُراجع قبل الصرف{books?'، ثم يُرحّل صافيه إلى الدفاتر من الزر أعلاه':''}.</p>
  {detail&&<PayrollDetail row={detail} month={month} mode={mode} today={data?.context.today||''} onClose={()=>setDetail(null)}/>}
 </section>;
}
function PayrollDetail({row,month,mode,today,onClose}:{row:MonthSummary;month:string;mode:'warn'|'deduct';today:string;onClose:()=>void}){
 const c=row.employee.currency,lines:[string,string][]=[['الراتب الشهري',money(row.salaryMinor,c)],[mode==='warn'?'خصم التأخير المحتمل (غير مطبق)':'خصم تجاوز سماحية التأخير',money(mode==='warn'?row.potentialDeductionMinor:row.lateDeductionMinor,c)],...(mode==='deduct'?[['خصم الغياب',money(row.absenceDeductionMinor,c)] as [string,string]]:[]),['بدل العمل الإضافي',money(row.overtimePayMinor,c)],['الصافي التقديري',money(row.netMinor,c)]];
 const problems=row.days.filter(d=>d.kind==='absent'||d.kind==='missing'||d.lateMinutes||d.earlyMinutes||d.overtimeMinutes);
 return <EditorDialog title={row.employee.name+' · '+monthLabel(month)} description={`أيام العمل ${row.scheduledDays} · حضور ${row.presentDays} · غياب ${row.absentDays} · إجازة ${row.leaveDays} · معذور ${row.excusedDays}`} busy={false} onClose={onClose}>
  <table className="office-table payroll-lines"><tbody>{lines.map(([k,v],i)=><tr key={k} className={i===lines.length-1?'total':''}><th>{k}</th><td dir="ltr" className="ledger-value">{v}</td></tr>)}</tbody></table>
  <dl className="summary-grid"><dt>التأخير</dt><dd>{formatMinutes(row.lateMinutes)} في {row.lateDays} يوم</dd><dt>الخروج المبكر</dt><dd>{formatMinutes(row.earlyMinutes)}</dd><dt>السماحية الشهرية</dt><dd>{formatMinutes(row.allowanceMinutes)}</dd><dt>تجاوز السماحية</dt><dd className={row.excessMinutes?'office-alert':''}>{formatMinutes(row.excessMinutes)}</dd><dt>العمل الإضافي</dt><dd>{formatMinutes(row.overtimeMinutes)}</dd></dl>
  {row.warnings.length>0&&<ul className="notice">{row.warnings.map(w=><li key={w}>{w}</li>)}</ul>}
  {problems.length>0&&<details><summary>الأيام المؤثرة ({problems.length})</summary><table className="office-table"><tbody>{problems.map(d=><tr key={d.date}><td>{formatDate(d.date)}</td><td>{DAY_LABELS[d.kind]}</td><td dir="ltr">{d.first||'—'} → {d.last||'—'}</td><td>{d.lateMinutes?'تأخير '+formatMinutes(d.lateMinutes):''}{d.earlyMinutes?' خروج مبكر '+formatMinutes(d.earlyMinutes):''}{d.overtimeMinutes?' إضافي '+formatMinutes(d.overtimeMinutes):''}</td></tr>)}</tbody></table></details>}
  <div className="actions">{row.warnings.length>0&&<button className="btn" onClick={()=>{if(!printHtml(warningLetterHtml(row,monthLabel(month),DAY_LABELS,formatDate(today),'')))popupBlocked()}}><Printer size={15}/> طباعة إنذار</button>}<button className="btn" onClick={onClose}>إغلاق</button></div>
 </EditorDialog>;
}

/** Days whose own hours do not end after they start. */
const badDays=(sched:Schedule)=>Object.entries(sched.days||{}).filter(([d,h])=>sched.workDays.includes(Number(d))&&h&&h.start>=h.end).map(([d])=>`ساعات يوم ${WEEKDAYS[Number(d)]}: البداية يجب أن تسبق النهاية`);

/** Hours for single weekdays that differ from the usual ones, such as a short Thursday or Saturday: one small card per work day. */
function DayHoursEditor({sched,onChange}:{sched:Schedule;onChange:(days:Schedule['days'])=>void}){
 const days=sched.days||{};
 const put=(d:number,h:DayHours|null)=>{const next={...days};if(h)next[String(d)]=h;else delete next[String(d)];onChange(Object.keys(next).length?next:undefined)};
 return <fieldset className="day-hours"><legend>ساعات تختلف في بعض الأيام</legend>
  <div className="day-hours-grid">{sched.workDays.map(d=>{const own=days[String(d)];return <div key={d} className={'day-hours-card'+(own?' on':'')}>
   <label className="checkbox-line"><input type="checkbox" checked={!!own} onChange={e=>put(d,e.target.checked?{start:sched.start,end:sched.end}:null)}/> {WEEKDAYS[d]}</label>
   {own?<div className="day-hours-times" dir="ltr"><input type="time" aria-label={'بداية '+WEEKDAYS[d]} value={own.start} onChange={e=>put(d,{...own,start:e.target.value})}/><span>–</span><input type="time" aria-label={'نهاية '+WEEKDAYS[d]} value={own.end} onChange={e=>put(d,{...own,end:e.target.value})}/></div>
    :<small className="muted" dir="ltr">{sched.start} – {sched.end}</small>}
  </div>})}</div>
 </fieldset>;
}
