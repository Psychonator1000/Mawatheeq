'use client';
import {useContext,useState} from 'react';
import {toast} from 'sonner';
import {officeRequest} from '@/lib/local-auth';
import {NO_ACCESS,SECTIONS,WORKSPACE_LABELS,workspacesOf,type Permissions} from '@/lib/permissions';
import type {OfficeContext,Member} from '@/lib/office';
import type {CaseRecord} from '@/lib/domain';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import PermissionEditor from './permission-editor';
import {officeTime} from './office-shared';
import {AccountContext} from './account-menu';

type AccessChange={id:number;before:Permissions|null;after:Permissions;revision:number;actor:string;createdAt:string};
type Mode='permissions'|'password'|'rename';
/** Server versions before the account-administration update do not know these actions yet. */
const friendly=(e:unknown)=>{const m=(e as Error).message;return /العملية المطلوبة غير متاحة/.test(m)?'هذه الميزة تحتاج تحديث قاعدة البيانات (20261012090000_account_admin.sql) أولاً.':m};
export default function OfficeStaff({context,records,onChanged}:{context:OfficeContext;records:CaseRecord[];onChanged:()=>void}) {
 const [editing,setEditing]=useState<Member|'new'|null>(null),[mode,setMode]=useState<Mode>('permissions'),[mustChange,setMustChange]=useState(false);
 const account=useContext(AccountContext);
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[access,setAccess]=useState<Permissions>(NO_ACCESS),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [history,setHistory]=useState<AccessChange[]>([]),[historyError,setHistoryError]=useState('');
 if(!context.canManage)return null;
 const open=(m:Member|'new',nextMode:Mode='permissions')=>{
  setUsername(m!=='new'&&nextMode==='rename'?m.username:'');setMustChange(false);setPassword('');setError('');setMode(nextMode);setAccess(m==='new'?{...NO_ACCESS}:m.permissions||{...NO_ACCESS});setHistory([]);setHistoryError('');setEditing(m);
  if(m!=='new'&&nextMode==='permissions')officeRequest<AccessChange[]>('access_history',{id:m.id}).then(setHistory).catch(e=>setHistoryError(e.message));
 };
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  if(editing==='new'){
   const created=await officeRequest<Member>('create_member',{username,password,permissions:access});
   // New accounts start with a temporary password; keep it as the permanent one when asked.
   if(!mustChange)await officeRequest('set_member_password',{id:created.id,password,mustChange:false}).catch(()=>toast.message('أُنشئ الحساب بكلمة مرور مؤقتة؛ سيُطلب من الموظف تغييرها.'));
  }
  else if(editing&&mode==='password')await (mustChange?officeRequest('reset_member_password',{id:editing.id,password}):officeRequest('set_member_password',{id:editing.id,password,mustChange:false}));
  else if(editing&&mode==='rename'){
   const renamed=await officeRequest<Member>('rename_member',{id:editing.id,username});
   if(editing.id===context.user.id){toast.success(`اسم دخولك الآن ${renamed.username}`);setTimeout(()=>window.location.reload(),900)}
  }
  else if(editing)await officeRequest('set_member_access',{id:editing.id,permissions:access,revision:access.revision});
  setPassword('');setEditing(null);onChanged();toast.success(mode==='rename'?'تم تغيير اسم المستخدم. يسجل الدخول بالاسم الجديد.':mode==='password'?'تم حفظ كلمة المرور وإنهاء جلسات الموظف الحالية.':'تم حفظ الحساب والصلاحيات. تُطبّق عند تسجيل الدخول.');
 }catch(e){setError(friendly(e))}finally{setBusy(false)}}
 async function toggle(m:Member){if(!window.confirm(m.enabled?`إيقاف حساب ${m.username} وإنهاء جلساته الحالية؟`:`إعادة تفعيل حساب ${m.username}؟`))return;setBusy(true);try{await officeRequest('set_member_enabled',{id:m.id,enabled:!m.enabled});onChanged();toast.success('تم تحديث حالة الحساب')}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <section className="panel office-staff"><div className="panel-head"><div><h2>فريق المكتب والصلاحيات</h2><p className="panel-note">المسؤول وحده ينشئ المستخدمين ويحدد الأقسام والقضايا والعمليات المتاحة.</p></div><button className="btn primary" onClick={()=>open('new')}>إضافة موظف</button></div>
 <div className="panel-body"><p className="subtitle">حسابات محلية دون بريد إلكتروني. تبدأ الحسابات الجديدة بلا صلاحيات حتى تختارها. تغيير الصلاحيات أو إيقاف الحساب ينهي جلساته الحالية.</p><div className="table-wrap"><table className="office-table"><thead><tr><th>اسم المستخدم</th><th>الوصول</th><th>الحالة</th><th>إدارة الحساب</th></tr></thead><tbody>{context.members.map(m=><tr key={m.id}><td dir="ltr">{m.username}</td><td>{m.role==='owner'?'مسؤول المكتب · وصول كامل':<>{m.permissions?.caseScope==='all'?'جميع القضايا':`${m.permissions?.caseIds.length||0} قضية محددة`}<small>{m.permissions&&workspacesOf(m.permissions).map(p=>WORKSPACE_LABELS[p]).join('، ')||'بلا صفحات'} · {m.permissions?.canEdit?'قراءة وتعديل':'قراءة فقط'} · {m.permissions?.canExport?'التصدير متاح':'دون تصدير التقارير'}</small></>}</td><td>{m.enabled?'فعال':'موقوف'}{m.mustChangePassword?' · يلزم تغيير كلمة المرور':''}</td><td>{m.role==='owner'&&<div className="actions"><button className="btn" disabled={busy} onClick={()=>open(m,'rename')}>تغيير الاسم</button>{m.id===context.user.id&&account&&<button className="btn" disabled={busy} onClick={account.onChangePassword}>تغيير كلمة مروري</button>}</div>}{m.role==='editor'&&<div className="actions"><button className="btn" disabled={busy} onClick={()=>open(m)}>تعديل الصلاحيات</button><button className="btn" disabled={busy} onClick={()=>open(m,'rename')}>تغيير الاسم</button><button className="btn" disabled={busy} onClick={()=>open(m,'password')}>كلمة المرور</button><button className="btn" disabled={busy} onClick={()=>void toggle(m)}>{m.enabled?'إيقاف الحساب':'إعادة تفعيل'}</button></div>}</td></tr>)}</tbody></table></div></div>
 {editing&&<Dialog open onOpenChange={v=>{if(!v&&!busy){setEditing(null);setPassword('')}}}><DialogContent dir="rtl" className="office-dialog permissions-dialog"><DialogHeader><DialogTitle>{editing==='new'?'إضافة موظف':({password:'كلمة مرور ',rename:'تغيير اسم ',permissions:'صلاحيات '}[mode])+editing.username}</DialogTitle><DialogDescription>{mode==='password'?'اختر كلمة مرور الموظف بنفسك. تنتهي جلساته الحالية عند الحفظ.':mode==='rename'?'يسجل صاحب الحساب الدخول بالاسم الجديد. تبقى صلاحياته وسجلاته كما هي.':'حدد الصفحات والقضايا قبل الحفظ. صلاحيات الحساب تُفحص على الخادم في كل طلب.'}</DialogDescription></DialogHeader>
 <form className="office-form" onSubmit={save}><fieldset disabled={busy}>
 {(editing==='new'||mode==='rename')&&<label className="field"><span id="staff-username-label">اسم المستخدم الجديد</span><input aria-labelledby="staff-username-label" aria-describedby="staff-username-help" dir="ltr" value={username} onChange={e=>setUsername(e.target.value)} required pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{2,31}" autoComplete="off"/><small id="staff-username-help">3–32 حرفاً إنجليزياً أو رقماً أو . _ -</small></label>}
 {(editing==='new'||mode==='password')&&<label className="field"><span id="staff-password-label">كلمة المرور</span><input aria-labelledby="staff-password-label" aria-describedby="staff-password-help" type="password" dir="ltr" value={password} onChange={e=>setPassword(e.target.value)} minLength={12} required autoComplete="new-password"/><small id="staff-password-help">12 حرفاً على الأقل.</small></label>}
 {(editing==='new'||mode==='password')&&<label className="checkbox-line"><input type="checkbox" checked={mustChange} onChange={e=>setMustChange(e.target.checked)}/>اطلب من الموظف تغييرها عند الدخول التالي</label>}
 {mode==='permissions'&&<PermissionEditor value={access} onChange={setAccess} records={records}/>}
 {error&&<p className="notice" role="alert">{error}</p>}
 <button className="btn primary" type="submit">{busy?'جارٍ الحفظ…':editing==='new'||mode==='password'?'حفظ الحساب':mode==='rename'?'حفظ الاسم':'حفظ الصلاحيات وإنهاء الجلسات'}</button>
 </fieldset></form>
 {mode==='permissions'&&editing!=='new'&&<section className="office-history"><h3>سجل تغييرات الصلاحيات</h3>{historyError&&<p role="alert">{historyError}</p>}{history.map(h=><details key={h.id}><summary>النسخة {h.revision} · {h.actor} · {officeTime(h.createdAt)}</summary><p>الأقسام: {h.after.sections.map(s=>SECTIONS[s]).join('، ')||'لا توجد'}</p><p>القضايا: {h.after.caseScope==='all'?'جميع القضايا':h.after.caseIds.map(id=>records.find(c=>c.id===id)?.code||id).join('، ')||'لا توجد'}</p><p>{h.after.canEdit?'قراءة وتعديل':'قراءة فقط'} · {h.after.canExport?'تصدير التقارير متاح':'دون تصدير التقارير'}</p></details>)}{!history.length&&!historyError&&<p className="subtitle">لا توجد تغييرات مسجلة.</p>}</section>}
 </DialogContent></Dialog>}
 </section>;
}
