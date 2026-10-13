import {useEffect,useState} from 'react';
import {Fingerprint,Plus,RefreshCw,Users,Clock,Info,KeyRound,Trash2,Wifi,WifiOff,Pencil,DoorOpen,Volume2,Power,Eraser,ShieldCheck,CreditCard} from 'lucide-react';
import {toast} from 'sonner';
import {attendanceRequest} from '@/lib/local-auth';
import {copyText} from '@/lib/polyfills';
import type {AttEmployee} from '@/lib/attendance';
import {type AttContext,type AttDevice,type AttDeviceUser,type AttCommand,type AttBridge,type DeviceKind,COMMAND_LABELS,COMMAND_STATUS,DEVICE_KINDS} from '@/lib/attendance-api';
import {formatDate} from '@/lib/domain';
import {normalizeSearch} from '@/lib/case-browse';
import {Field,Empty} from '../shared';
import {OfficeSelect} from '../office-shared';
import {EditorDialog} from './shared';
import Needs from '../needs';

const fail=(e:unknown)=>toast.error((e as Error).message);
const ago=(iso:string|null)=>{if(!iso)return 'لم يتصل بعد';const m=Math.round((Date.now()-new Date(iso).getTime())/60000);return m<1?'الآن':m<60?`قبل ${m} د`:m<1440?`قبل ${Math.round(m/60)} س`:formatDate(iso.slice(0,10))};
const isDoor=(d:AttDevice)=>d.kind==='access'||d.kind==='both';
const doorLabel=(d:AttDevice)=>d.doorName||'الباب';
type Confirm={title:string;description:string;action:string;danger?:boolean;run:()=>Promise<void>};

function ConfirmDialog({confirm,onClose}:{confirm:Confirm;onClose:()=>void}){
 const [busy,setBusy]=useState(false);
 return <EditorDialog title={confirm.title} description={confirm.description} busy={busy} onClose={onClose}>
  <div className="actions"><button className={'btn '+(confirm.danger?'danger':'primary')} disabled={busy} onClick={()=>{setBusy(true);void confirm.run().then(onClose,e=>{fail(e);setBusy(false)})}}>{confirm.action}</button><button className="btn" disabled={busy} onClick={onClose}>إلغاء</button></div>
 </EditorDialog>;
}

/** Fingerprint and door devices: add, edit, remove, open doors and run device commands through the office bridge. */
export default function DevicesPanel(){
 const [devices,setDevices]=useState<AttDevice[]|null>(null),[commands,setCommands]=useState<AttCommand[]>([]),[bridges,setBridges]=useState<AttBridge[]>([]),[ctx,setCtx]=useState<AttContext|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0),[loadedAt,setLoadedAt]=useState(0);
 const [editing,setEditing]=useState<AttDevice|null>(null),[usersOf,setUsersOf]=useState<AttDevice|null>(null),[newKey,setNewKey]=useState(''),[bridgeName,setBridgeName]=useState(''),[confirm,setConfirm]=useState<Confirm|null>(null);
 const reload=()=>setVersion(v=>v+1);
 useEffect(()=>{let active=true;Promise.all([attendanceRequest<AttDevice[]>('devices'),attendanceRequest<AttCommand[]>('commands'),attendanceRequest<AttBridge[]>('bridges'),attendanceRequest<AttContext>('context')]).then(([d,c,b,x])=>{if(active){setDevices(d);setCommands(c);setBridges(b);setCtx(x);setError('');setLoadedAt(Date.now())}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[version]);
 const pending=commands.some(c=>c.status==='pending'||c.status==='running');
 useEffect(()=>{if(!pending)return;const t=setInterval(reload,3000);return()=>clearInterval(t)},[pending]);
 const manage=!!ctx?.canManageDevices,doorsReady=!devices?.length||'kind' in devices[0];
 const busyWith=(d:AttDevice,kind:string)=>commands.some(c=>c.deviceId===d.id&&c.kind===kind&&(c.status==='pending'||c.status==='running'));
 async function queue(device:AttDevice,kind:string,payload:Record<string,unknown>={}){await attendanceRequest('queue_command',{deviceId:device.id,kind,payload});toast.success(COMMAND_LABELS[kind]+': أُرسل الطلب إلى جسر المكتب');reload()}
 const send=(device:AttDevice,kind:string,payload:Record<string,unknown>={})=>void queue(device,kind,payload).catch(fail);
 async function createBridge(){try{const r=await attendanceRequest<{key:string}>('create_bridge',{name:bridgeName.trim()});setNewKey(r.key);setBridgeName('');reload()}catch(e){fail(e)}}
 const blank=():AttDevice=>({id:crypto.randomUUID(),name:'',host:'',port:4370,location:'',enabled:true,kind:'attendance',doorName:'',unlockSeconds:5,notes:'',serial:null,info:{},status:'unknown',lastSeen:null,lastSync:null,lastError:null,revision:0,userCount:0,pendingCommands:0});
 const bridgeOnline=bridges.some(b=>!b.revoked&&b.lastSeen&&loadedAt-new Date(b.lastSeen).getTime()<5*60000);
 const openDoor=(d:AttDevice)=>setConfirm({title:'فتح '+doorLabel(d),description:`يفتح ${doorLabel(d)} عن بعد لمدة ${d.unlockSeconds||5} ثوانٍ عبر جسر المكتب، ويُسجل الطلب باسمك.`,action:'فتح الباب الآن',run:()=>queue(d,'unlock_door')});
 return <>{error&&<p className="notice" role="alert">{error}</p>}
 {!doorsReady&&<p className="notice">لتفعيل أجهزة الأبواب وحذف الأجهزة وخيارات المستخدمين، طبّق ملف قاعدة البيانات 20261011200000_attendance_doors.sql (راجع docs/ATTENDANCE.md).</p>}
 <section className="panel"><div className="department-toolbar"><h2><Fingerprint size={20}/> أجهزة البصمة والأبواب</h2><div className="actions"><span className={'bridge-pill '+(bridgeOnline?'on':'off')}>{bridgeOnline?<Wifi size={15}/>:<WifiOff size={15}/>} {bridgeOnline?'جسر المكتب متصل':'جسر المكتب غير متصل'}</span><button className="btn" onClick={reload}><RefreshCw size={16}/> تحديث الأجهزة</button>{manage&&<button className="btn primary" onClick={()=>setEditing(blank())}><Plus size={16}/> إضافة جهاز</button>}</div></div>
  {!devices&&!error&&<p role="status">جارٍ تحميل الأجهزة…</p>}
  {devices&&<div className="device-grid">{devices.map(d=><article key={d.id} className={'device-card s-'+(d.enabled?d.status:'disabled')+(isDoor(d)?' is-door':'')}><header><span className="device-dot" aria-hidden/><div><h3>{d.name}</h3><small dir="ltr">{d.host}:{d.port}</small></div><span className="tag" title={!d.enabled?'الجهاز معطل: فعّله من «تعديل» ← «الجهاز مفعل» لتعمل أزراره':undefined}>{!d.enabled?'معطل':d.status==='online'?'متصل':d.status==='offline'?'غير متصل':'لم يُفحص'}</span></header>{!d.enabled&&<p className="needs">الجهاز معطل، لذلك أزراره متوقفة. فعّله من «تعديل» ← «الجهاز مفعل».</p>}
   {d.kind&&<p className="device-kind">{isDoor(d)?<DoorOpen size={15}/>:<Fingerprint size={15}/>} {DEVICE_KINDS[d.kind]}{isDoor(d)&&' · '+doorLabel(d)}</p>}
   {isDoor(d)&&manage&&<button className="btn primary door-btn" disabled={!d.enabled||busyWith(d,'unlock_door')} onClick={()=>openDoor(d)}><DoorOpen size={18}/> {busyWith(d,'unlock_door')?'جارٍ فتح '+doorLabel(d)+'…':'فتح '+doorLabel(d)}</button>}
   <dl><dt>الموقع</dt><dd>{d.location||'—'}</dd><dt>الرقم التسلسلي</dt><dd dir="ltr">{d.serial||'—'}</dd><dt>المستخدمون</dt><dd>{d.userCount}</dd><dt>آخر اتصال</dt><dd>{ago(d.lastSeen)}</dd><dt>آخر مزامنة</dt><dd>{ago(d.lastSync)}</dd>{Object.keys(d.info||{}).length>0&&<><dt>السجلات</dt><dd>{String(d.info.logs??d.info.logCounts??'—')} / {String(d.info.capacity??d.info.logCapacity??'—')}</dd></>}</dl>
   {d.notes&&<p className="subtitle device-notes">{d.notes}</p>}
   {d.lastError&&d.status==='offline'&&<p className="office-alert device-error">{d.lastError}</p>}{d.pendingCommands>0&&<p className="subtitle">{d.pendingCommands} طلب بانتظار الجسر</p>}
   <footer><button className="btn" onClick={()=>setUsersOf(d)}><Users size={15}/> مستخدمو {d.name}</button>{manage&&<><button className="btn" disabled={!d.enabled} onClick={()=>send(d,'sync_logs')}><RefreshCw size={15}/> مزامنة</button><button className="btn" onClick={()=>setEditing(d)}><Pencil size={15}/> تعديل {d.name}</button></>}</footer>
   {manage&&<details className="device-more"><summary>خيارات الجهاز</summary><div className="device-more-actions">
    <button className="btn" disabled={!d.enabled} onClick={()=>send(d,'set_time')}><Clock size={15}/> ضبط الساعة</button>
    <button className="btn" disabled={!d.enabled} onClick={()=>send(d,'read_info')}><Info size={15}/> قراءة المعلومات</button>
    {doorsReady&&<><button className="btn" disabled={!d.enabled} onClick={()=>send(d,'voice_test')}><Volume2 size={15}/> اختبار الصوت</button>
    <button className="btn" disabled={!d.enabled} onClick={()=>setConfirm({title:'إعادة تشغيل '+d.name,description:'يتوقف الجهاز عن العمل دقيقة تقريباً أثناء إعادة التشغيل. البصمات المحفوظة لا تتأثر.',action:'إعادة التشغيل',run:()=>queue(d,'restart')})}><Power size={15}/> إعادة التشغيل</button>
    <button className="btn" disabled={!d.enabled} onClick={()=>setConfirm({title:'مسح سجل البصمات من '+d.name,description:'يرسل الجسر كل البصمات المخزنة على الجهاز إلى مواثيق أولاً، ثم يمسحها من الجهاز لتوفير المساحة. إذا تعذر الحفظ لا يُمسح شيء.',action:'حفظ ثم مسح',danger:true,run:()=>queue(d,'clear_logs')})}><Eraser size={15}/> مسح السجل من الجهاز</button></>}
   </div></details>}
  </article>)}</div>}
  {devices&&!devices.length&&<Empty title="لا توجد أجهزة" text="أضف جهاز البصمة أو الباب بعنوان IP الثابت، ثم شغّل جسر المكتب على حاسوب داخل الشبكة."/>}
 </section>
 <section className="panel"><h2>سجل أوامر الأجهزة</h2>{commands.length?<div className="table-wrap"><table className="office-table"><thead><tr><th>الوقت</th><th>الجهاز</th><th>الأمر</th><th>الحالة</th><th>النتيجة</th></tr></thead><tbody>{commands.map(c=><tr key={c.id}><td>{new Date(c.createdAt).toLocaleString('ar-KW-u-nu-latn',{dateStyle:'short',timeStyle:'short'})}<small>{c.requestedBy}</small></td><td>{devices?.find(d=>d.id===c.deviceId)?.name||'—'}</td><td>{COMMAND_LABELS[c.kind]||c.kind}{c.payload?.pin!==undefined&&<small>رقم {String(c.payload.pin)} {String(c.payload.name||'')}</small>}{c.kind==='unlock_door'&&<small>{String(c.payload?.door||'الباب')} · {String(c.payload?.seconds||'')} ث</small>}</td><td><span className={'tag '+(c.status==='done'?'green':c.status==='failed'?'red':'amber')}>{COMMAND_STATUS[c.status]}</span></td><td>{c.error||(c.result?Object.entries(c.result).map(([k,v])=>`${k}: ${typeof v==='object'?JSON.stringify(v):v}`).join(' · '):'')}</td></tr>)}</tbody></table></div>:<p className="subtitle">لم تُرسل أوامر بعد.</p>}</section>
 <section className="panel"><h2><KeyRound size={20}/> جسر المكتب</h2><p className="subtitle">برنامج صغير مجاني يعمل على حاسوب داخل شبكة المكتب: يسحب البصمات كل دقيقة، ويتحقق من الأوامر مثل فتح الباب كل بضع ثوانٍ. لا يرى القضايا ولا ملفات الموظفين. طريقة التثبيت في مجلد bridge داخل المستودع.</p>
  {bridges.length>0&&<ul className="bridge-list">{bridges.map(b=><li key={b.id} className={b.revoked?'ledger-void':''}><span><b>{b.name}</b><small>{b.revoked?'ملغى':`آخر اتصال: ${ago(b.lastSeen)}${b.version?' · إصدار '+b.version:''}`}</small></span>{manage&&!b.revoked&&<button className="btn" onClick={()=>setConfirm({title:'إلغاء مفتاح '+b.name,description:'يتوقف هذا الجسر فوراً عن الاتصال بمواثيق، ولا يمكن استعادة المفتاح. أنشئ مفتاحاً جديداً لحاسوب آخر.',action:'إلغاء المفتاح',danger:true,run:async()=>{await attendanceRequest('revoke_bridge',{id:b.id});reload()}})}>إلغاء مفتاح {b.name}</button>}</li>)}</ul>}
  {manage&&<div className="department-toolbar"><Field label="اسم حاسوب الجسر" value={bridgeName} onChange={setBridgeName} placeholder="حاسوب الاستقبال"/><button className="btn primary" disabled={!bridgeName.trim()} onClick={()=>void createBridge()}><KeyRound size={16}/> إنشاء مفتاح جسر</button></div>}
 </section>
 {newKey&&<EditorDialog title="مفتاح الجسر الجديد" description="انسخه الآن إلى ملف config.json على حاسوب الجسر. لن يظهر مرة أخرى." busy={false} onClose={()=>setNewKey('')}><BridgeKey bridgeKey={newKey}/><button className="btn primary" onClick={()=>setNewKey('')}>تم النسخ</button></EditorDialog>}
 {editing&&<DeviceDialog device={editing} doorsReady={doorsReady} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);reload()}} onDelete={d=>setConfirm({title:'حذف '+d.name,description:'يُحذف الجهاز من مواثيق مع قائمة مستخدميه وأوامره. البصمات المسجلة منه تبقى محفوظة في سجل الحضور. لا يُمسح شيء من الجهاز نفسه.',action:'حذف الجهاز',danger:true,run:async()=>{await attendanceRequest('delete_device',{id:d.id,revision:d.revision});toast.success('حُذف الجهاز');setEditing(null);reload()}})}/>}
 {usersOf&&<DeviceUsersDialog device={usersOf} manage={manage} doorsReady={doorsReady} onClose={()=>setUsersOf(null)} onQueue={(k,p)=>queue(usersOf,k,p)} onConfirm={setConfirm}/>}
 {confirm&&<ConfirmDialog confirm={confirm} onClose={()=>setConfirm(null)}/>}
 </>;
}

function BridgeKey({bridgeKey}:{bridgeKey:string}){
 const [config,setConfig]=useState('');
 useEffect(()=>{fetch(new URL('app-config.json',document.baseURI)).then(r=>r.json()).then(c=>setConfig(JSON.stringify({supabaseUrl:c.supabaseUrl,publishableKey:c.supabasePublishableKey,bridgeKey,intervalSeconds:60,commandSeconds:4},null,2))).catch(()=>setConfig(''))},[bridgeKey]);
 const copy=(text:string)=>void copyText(text).then(()=>toast.success('نُسخ'),()=>toast.error('انسخه يدوياً'));
 return <div className="bridge-key"><code dir="ltr">{bridgeKey}</code><button className="btn" onClick={()=>copy(bridgeKey)}>نسخ المفتاح</button>{config&&<><p className="subtitle">أو انسخ ملف config.json كاملاً:</p><pre dir="ltr">{config}</pre><button className="btn" onClick={()=>copy(config)}>نسخ config.json</button></>}</div>;
}

function DeviceDialog({device,doorsReady,onClose,onSaved,onDelete}:{device:AttDevice;doorsReady:boolean;onClose:()=>void;onSaved:()=>void;onDelete:(d:AttDevice)=>void}){
 const [draft,setDraft]=useState({...device,kind:device.kind||'attendance',doorName:device.doorName||'',unlockSeconds:device.unlockSeconds||5,notes:device.notes||''}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const set=<K extends keyof typeof draft>(k:K,v:(typeof draft)[K])=>setDraft(d=>({...d,[k]:v}));
 const valid=draft.name.trim()&&/^[0-9A-Za-z.-]{3,253}$/.test(draft.host.trim())&&draft.port>0&&draft.port<65536&&draft.unlockSeconds>=1&&draft.unlockSeconds<=60;
 async function save(){setBusy(true);setError('');try{await attendanceRequest('save_device',{device:{...draft,name:draft.name.trim(),host:draft.host.trim(),doorName:draft.doorName.trim()}});toast.success('حُفظ الجهاز');onSaved()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const door=draft.kind!=='attendance';
 return <EditorDialog title={device.revision?'تعديل '+device.name:'جهاز جديد'} description="استخدم عنوان IP ثابتاً للجهاز داخل شبكة المكتب. المنفذ الافتراضي 4370، وكلمة الاتصال (Comm Key) على الجهاز يجب أن تكون 0." busy={busy} onClose={onClose}>
  <form onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy}>
   <div className="form-grid"><Field label="اسم الجهاز" value={draft.name} onChange={v=>set('name',v)}/><Field label="موقع الجهاز" value={draft.location} onChange={v=>set('location',v)}/><Field label="عنوان IP" value={draft.host} onChange={v=>set('host',v)} placeholder="192.168.1.201"/><Field label="المنفذ" type="number" value={String(draft.port)} onChange={v=>set('port',Math.round(Number(v)||0))}/></div>
   {doorsReady&&<div className="department-form-section"><h3><DoorOpen size={18}/> نوع الجهاز والباب</h3><div className="form-grid"><OfficeSelect label="نوع الجهاز" value={draft.kind} onChange={v=>set('kind',v as DeviceKind)} options={Object.entries(DEVICE_KINDS)}/>{door&&<><Field label="اسم الباب" value={draft.doorName} onChange={v=>set('doorName',v)} placeholder="الباب الرئيسي"/><Field label="مدة فتح الباب (ثوانٍ)" type="number" value={String(draft.unlockSeconds)} onChange={v=>set('unlockSeconds',Math.round(Number(v)||0))}/></>}</div>
    {door&&<p className="subtitle">زر «فتح الباب» يظهر لمحرري الموارد البشرية فقط، ويُسجل كل فتح باسم من طلبه. يجب أن يكون قفل الباب موصولاً بمخرج القفل في الجهاز.</p>}
    <Field label="ملاحظات الجهاز" value={draft.notes} onChange={v=>set('notes',v)} multiline wide/></div>}
   <label className="checkbox-line"><input type="checkbox" checked={draft.enabled} onChange={e=>set('enabled',e.target.checked)}/> الجهاز مفعل (يتصل به الجسر)</label>
   <Needs items={[!draft.name.trim()&&'أدخل «اسم الجهاز»',!/^[0-9A-Za-z.-]{3,253}$/.test(draft.host.trim())&&'أدخل «عنوان IP» صحيحاً، مثل 192.168.1.201',!(draft.port>0&&draft.port<65536)&&'«المنفذ» رقم بين 1 و65535',!(draft.unlockSeconds>=1&&draft.unlockSeconds<=60)&&'«مدة فتح الباب» بين 1 و60 ثانية']}/><button type="submit" className="btn primary" disabled={!valid}>حفظ الجهاز</button></fieldset></form>
  {error&&<p className="notice" role="alert">{error}</p>}
  <div className="actions">{!!device.revision&&doorsReady&&<button className="btn danger" disabled={busy} onClick={()=>onDelete(device)}><Trash2 size={15}/> حذف الجهاز</button>}<button className="btn" disabled={busy} onClick={onClose}>إغلاق</button></div>
 </EditorDialog>;
}

type UserDraft={pin:string;name:string;card:string;role:string;editing:boolean};
function DeviceUsersDialog({device,manage,doorsReady,onClose,onQueue,onConfirm}:{device:AttDevice;manage:boolean;doorsReady:boolean;onClose:()=>void;onQueue:(kind:string,payload:Record<string,unknown>)=>Promise<void>;onConfirm:(c:Confirm)=>void}){
 const [users,setUsers]=useState<AttDeviceUser[]|null>(null),[employees,setEmployees]=useState<AttEmployee[]>([]),[error,setError]=useState(''),[search,setSearch]=useState('');
 const empty:UserDraft={pin:'',name:'',card:'',role:'0',editing:false},[form,setForm]=useState<UserDraft>(empty);
 useEffect(()=>{Promise.all([attendanceRequest<AttDeviceUser[]>('device_users',{deviceId:device.id}),attendanceRequest<AttEmployee[]>('employees')]).then(([u,e])=>{setUsers(u);setEmployees(e)}).catch(e=>setError(e.message))},[device.id]);
 const nameOf=(id:string|null)=>employees.find(e=>e.id===id)?.name;
 const missing=employees.filter(e=>e.active&&e.pin&&/^\d{1,9}$/.test(e.pin)&&users&&!users.some(u=>u.pin===e.pin));
 const shown=(users||[]).filter(u=>normalizeSearch([u.pin,u.name,u.card,nameOf(u.employeeId)].join(' ')).includes(normalizeSearch(search)));
 const send=(kind:string,payload:Record<string,unknown>)=>void onQueue(kind,payload).catch(fail);
 const valid=/^\d{1,9}$/.test(form.pin.trim())&&/^\d{0,10}$/.test(form.card.trim())&&form.name.trim().length<=24;
 function submit(){const payload=doorsReady?{pin:form.pin.trim(),name:form.name.trim(),card:form.card.trim(),role:Number(form.role)}:{pin:form.pin.trim(),name:form.name.trim()};send(form.editing?'update_user':'add_user',payload);setForm(empty)}
 return <EditorDialog title={'مستخدمو '+device.name} description={users?.length?`${users.length} مستخدم · آخر قراءة: ${ago(users.reduce((a,u)=>u.syncedAt>a?u.syncedAt:a,users[0].syncedAt))}`:'اطلب قراءة المستخدمين ليظهروا هنا.'} busy={false} onClose={onClose}>
  {error&&<p className="notice" role="alert">{error}</p>}{manage&&<button className="btn" onClick={()=>send('fetch_users',{})}><RefreshCw size={15}/> قراءة المستخدمين من الجهاز</button>}
  {users&&users.length>0&&<><Field label="بحث مستخدمي الجهاز" value={search} onChange={setSearch}/><div className="table-wrap"><table className="office-table"><thead><tr><th>رقم البصمة</th><th>الاسم على الجهاز</th><th>الموظف في مواثيق</th><th>البطاقة</th><th>الصلاحية</th>{manage&&<th>إجراء</th>}</tr></thead><tbody>{shown.map(u=><tr key={u.pin}><td>{u.pin}</td><td>{u.name||'—'}</td><td>{nameOf(u.employeeId)||<span className="tag amber">غير مربوط</span>}</td><td dir="ltr">{u.card&&u.card!=='0'?u.card:'—'}</td><td>{u.role>0?<span className="tag wine"><ShieldCheck size={12}/> مدير الجهاز</span>:'مستخدم'}</td>{manage&&<td className="user-actions">{doorsReady&&<button className="btn" onClick={()=>setForm({pin:u.pin,name:u.name,card:u.card&&u.card!=='0'?u.card:'',role:u.role>0?'14':'0',editing:true})}><Pencil size={14}/> تعديل {u.pin}</button>}<button className="btn" onClick={()=>onConfirm({title:`حذف ${u.name||u.pin} من ${device.name}`,description:'تُحذف بصماته وبطاقته من الجهاز نفسه، ولن يستطيع البصم أو فتح الباب بها. سجل حضوره السابق في مواثيق يبقى.',action:'حذف من الجهاز',danger:true,run:()=>onQueue('delete_user',{pin:u.pin})})}><Trash2 size={14}/> حذف {u.pin}</button></td>}</tr>)}</tbody></table></div></>}
  {manage&&missing.length>0&&<div className="notice"><span>موظفون لهم رقم بصمة وغير موجودين على هذا الجهاز:</span> {missing.map(e=><button key={e.id} className="btn" onClick={()=>send('add_user',{pin:e.pin,name:e.name.slice(0,24)})}>إضافة {e.name} ({e.pin})</button>)}</div>}
  {manage&&<form className="department-form-section" onSubmit={e=>{e.preventDefault();submit()}}><h3>{form.editing?'تعديل المستخدم '+form.pin:'إضافة مستخدم إلى الجهاز'}</h3>
   <div className="form-grid"><label className="field"><span>رقم المستخدم على الجهاز</span><input value={form.pin} disabled={form.editing} onChange={e=>setForm(f=>({...f,pin:e.target.value}))}/></label><Field label="الاسم على الجهاز" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))}/>
    {doorsReady&&<><Field label="رقم البطاقة (اختياري)" value={form.card} onChange={v=>setForm(f=>({...f,card:v}))}/><OfficeSelect label="الصلاحية على الجهاز" value={form.role} onChange={v=>setForm(f=>({...f,role:v}))} options={[['0','مستخدم عادي'],['14','مدير الجهاز (يدخل القائمة)']]}/></>}</div>
   <p className="subtitle"><CreditCard size={13}/> بعد الإضافة يسجّل الموظف بصمته على الجهاز نفسه. البطاقة تتيح فتح الباب بتمريرها على أجهزة الأبواب.</p>
   <div className="actions"><Needs items={[!/^\d{1,9}$/.test(form.pin.trim())&&'«رقم المستخدم» أرقام فقط، حتى 9 خانات',!/^\d{0,10}$/.test(form.card.trim())&&'«رقم البطاقة» أرقام فقط، حتى 10 خانات',form.name.trim().length>24&&'«الاسم على الجهاز» حتى 24 حرفاً']}/><button type="submit" className="btn primary" disabled={!valid}>{form.editing?'حفظ التعديل على الجهاز':'إرسال الإضافة'}</button>{form.editing&&<button type="button" className="btn" onClick={()=>setForm(empty)}>إلغاء التعديل</button>}</div></form>}
  <button className="btn" onClick={onClose}>إغلاق</button>
 </EditorDialog>;
}
