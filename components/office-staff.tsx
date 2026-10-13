'use client';
import {useContext,useState} from 'react';
import {toast} from 'sonner';
import {Search} from 'lucide-react';
import {officeRequest,switchToUser} from '@/lib/local-auth';
import {copyText} from '@/lib/polyfills';
import {generatePassword} from '@/lib/staff-accounts';
import {workspaceStorageKey} from '@/lib/departments';
import {ADMIN_POWERS,JOB_ROLES,NO_ACCESS,SECTIONS,WORKSPACE_LABELS,jobRoleLabel,powersOf,workspacesOf,type AdminPower,type JobRole,type Permissions} from '@/lib/permissions';
import type {OfficeContext,Member} from '@/lib/office';
import type {CaseRecord} from '@/lib/domain';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import PermissionEditor,{inferRole} from './permission-editor';
import {lawyerLabels,lawyerKey,matchLawyer,visibleCases} from '@/lib/lawyer-match';
import {officeTime} from './office-shared';
import {AccountContext} from './account-menu';
import LawyerAccounts from './lawyer-accounts';

type AccessChange={id:number;before:Permissions|null;after:Permissions;revision:number;actor:string;createdAt:string};
type Mode='permissions'|'password'|'rename'|'role';
/** Server versions before the account-administration update do not know these actions yet. */
const friendly=(e:unknown)=>{const m=(e as Error).message;return /العملية المطلوبة غير متاحة/.test(m)?'هذه الميزة تحتاج تحديث قاعدة البيانات أولاً.':m};
export default function OfficeStaff({context,records,onChanged,powers}:{context:OfficeContext;records:CaseRecord[];onChanged:()=>void;powers:AdminPower[]}) {
 const [editing,setEditing]=useState<Member|'new'|null>(null),[mode,setMode]=useState<Mode>('permissions'),[mustChange,setMustChange]=useState(false);
 const account=useContext(AccountContext);
 const [lawyers,setLawyers]=useState(false),[showPassword,setShowPassword]=useState(false),[issued,setIssued]=useState<{username:string;password:string}|null>(null);
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[access,setAccess]=useState<Permissions>(NO_ACCESS),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [history,setHistory]=useState<AccessChange[]>([]),[historyError,setHistoryError]=useState('');
 const [newRole,setNewRole]=useState<JobRole|''>(''),[applyPreset,setApplyPreset]=useState(false);
 const [staffSearch,setStaffSearch]=useState(''),[displayName,setDisplayName]=useState(''),[typedName,setTypedName]=useState('');
 const shownMembers=context.members.filter(m=>lawyerKey([m.username,m.displayName,...(m.permissions?.lawyerNames||[])].join(' ')).includes(lawyerKey(staffSearch)));
 if(!context.canManage)return null;
 const isOwner=context.user.role==='owner';
 // Admins manage other staff whose admin powers they also hold; never themselves or the owner.
 const blocked=(m:Member)=>!isOwner&&(m.id===context.user.id?'حسابك: يديره المالك أو مسؤول آخر.':powersOf(m.permissions||{}).some(p=>!powers.includes(p))?'يملك صلاحيات إدارة لا تملكها.':'');
 const open=(m:Member|'new',nextMode:Mode='permissions')=>{
  setUsername(m!=='new'&&nextMode==='rename'?m.username:'');setDisplayName('');setTypedName('');setMustChange(false);setShowPassword(false);setIssued(null);setPassword('');setError('');setMode(nextMode);setAccess(m==='new'?{...NO_ACCESS}:m.permissions||{...NO_ACCESS});setNewRole(m!=='new'&&m.permissions?inferRole(m.permissions)||'':'');setApplyPreset(false);setHistory([]);setHistoryError('');setEditing(m);
  if(m!=='new'&&nextMode==='permissions')officeRequest<AccessChange[]>('access_history',{id:m.id}).then(setHistory).catch(e=>setHistoryError(e.message));
 };
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  if(editing==='new'){
   const created=await officeRequest<Member>('create_member',{username,password,permissions:access});
   // New accounts start with a temporary password; keep it as the permanent one when asked.
   if(!mustChange)await officeRequest('set_member_password',{id:created.id,password,mustChange:false}).catch(()=>toast.message('أُنشئ الحساب بكلمة مرور مؤقتة؛ سيُطلب من الموظف تغييرها.'));
   if(displayName.trim())await officeRequest('set_display_name',{id:created.id,displayName:displayName.trim()}).catch(()=>toast.message('أُنشئ الحساب دون اسم الموظف؛ أضفه من «تغيير الاسم».'));
  }
  else if(editing&&mode==='password')await (mustChange?officeRequest('reset_member_password',{id:editing.id,password}):officeRequest('set_member_password',{id:editing.id,password,mustChange:false}));
  else if(editing&&mode==='rename'){
   const renamed=await officeRequest<Member>('rename_member',{id:editing.id,username});
   if(editing.id===context.user.id){toast.success(`اسم دخولك الآن ${renamed.username}`);setTimeout(()=>window.location.reload(),900)}
  }
  else if(editing&&mode==='role'){
   // Changing the role keeps the account's pages and cases unless asked to apply the role's suggested settings.
   const r=JOB_ROLES.find(x=>x.id===newRole);if(!r)throw new Error('اختر الدور الوظيفي.');
   const names=access.lawyerNames?.length?access.lawyerNames:[matchLawyer(editing.displayName||'',lawyerLabels(records).map(([l])=>l))].filter(Boolean) as string[];
   const next:Permissions=applyPreset&&r.preset?{...access,...r.preset,caseIds:[],jobRole:r.id,lawyerNames:r.id==='lawyer'?names:[],...(r.id==='manager'?{adminPowers:[...powers]}:{})}:{...access,jobRole:r.id};
   await officeRequest('set_member_access',{id:editing.id,permissions:next,revision:access.revision});
  }
  else if(editing)await officeRequest('set_member_access',{id:editing.id,permissions:access,revision:access.revision});
  onChanged();
  // Show the password once more with a copy button, so it can be handed to the employee.
  if(editing==='new'||mode==='password'){setIssued({username:editing==='new'?username.trim().toLowerCase():editing!.username,password});setPassword('');return}
  setPassword('');setEditing(null);toast.success(mode==='rename'?'تم تغيير اسم المستخدم. يسجل الدخول بالاسم الجديد.':mode==='role'?'تم تغيير الدور الوظيفي.':'تم حفظ الصلاحيات. تُطبّق عند تسجيل الدخول.');
 }catch(e){setError(friendly(e))}finally{setBusy(false)}}
 async function switchTo(m:Member){if(!window.confirm(`الدخول إلى حساب ${m.displayName||m.username}؟ سترى ما يراه فقط، ويمكنك العودة إلى حسابك من الشريط أسفل الصفحة.`))return;setBusy(true);try{sessionStorage.removeItem(workspaceStorageKey);await switchToUser(m.id)}catch(e){toast.error(friendly(e))}finally{setBusy(false)}}
 // Lawyer accounts (named as on the cases) that still see every case or a fixed list: switch them to their own cases by name.
 const labels=lawyerLabels(records).map(([l])=>l);
 const candidates=context.members.filter(m=>m.role==='editor'&&m.permissions&&!(m.permissions.caseScope==='selected'&&m.permissions.lawyerNames?.length)&&!!m.displayName)
  .map(m=>({m,label:matchLawyer(m.displayName||'',labels)}));
 const unscoped=candidates.filter(x=>x.label).map(x=>({...x.m,label:x.label!}));
 async function scopeLawyers(){
  if(!window.confirm(`سيرى كل محامٍ قضاياه فقط (حسب اسمه في خانة «المحامي»)، وتظهر له قضاياه الجديدة تلقائياً:\n\n${unscoped.map(m=>`${m.username} ← «${m.label}» (${visibleCases({caseScope:'selected',caseIds:[],lawyerNames:[m.label]},records)} قضية)`).join('\n')}\n\n تبقى صفحاته وصلاحية التعديل كما هي، وتنتهي جلساته الحالية. متابعة؟`))return;
  setBusy(true);let done=0;const failed:string[]=[];
  for(const m of unscoped){const p=m.permissions!;try{await officeRequest('set_member_access',{id:m.id,revision:p.revision,permissions:{...p,caseScope:'selected',caseIds:[],lawyerNames:[m.label],sections:p.sections.filter(s=>s!=='documents')}});done++}catch(e){failed.push(`${m.displayName||m.username}: ${(e as Error).message}`)}}
  setBusy(false);onChanged();if(done)toast.success(`أصبح ${done} محامٍ يرى قضاياه فقط.`);if(failed.length)toast.error(failed.join('\n'));
 }
 async function copy(text:string){try{await copyText(text);toast.success('نُسخت كلمة المرور')}catch{toast.error('تعذر النسخ؛ حدد النص وانسخه يدوياً.')}}
 async function toggle(m:Member){if(!window.confirm(m.enabled?`إيقاف حساب ${m.username} وإنهاء جلساته الحالية؟`:`إعادة تفعيل حساب ${m.username}؟`))return;setBusy(true);try{await officeRequest('set_member_enabled',{id:m.id,enabled:!m.enabled});onChanged();toast.success('تم تحديث حالة الحساب')}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 return <section className="panel office-staff"><div className="panel-head"><div><h2>فريق المكتب والصلاحيات</h2><p className="panel-note">المالك ومن مُنح «إدارة الموظفين والصلاحيات» ينشئون المستخدمين ويحددون الأقسام والقضايا والعمليات وصلاحيات الإدارة.</p></div><div className="actions">{unscoped.length>0&&<button className="btn" disabled={busy} onClick={()=>void scopeLawyers()}>كل محامٍ يرى قضاياه فقط ({unscoped.length})</button>}<button className="btn" onClick={()=>setLawyers(true)}>حسابات المحامين</button><button className="btn primary" onClick={()=>open('new')}>إضافة موظف</button></div></div>
 {lawyers&&<LawyerAccounts members={context.members} records={records} onClose={()=>setLawyers(false)} onCreated={onChanged}/>}
 <div className="panel-body"><p className="subtitle">حسابات محلية دون بريد إلكتروني. تبدأ الحسابات الجديدة بلا صلاحيات حتى تختارها. تغيير الصلاحيات أو إيقاف الحساب ينهي جلساته الحالية.</p><div className="staff-search searchbox"><Search size={16}/><input aria-label="بحث في فريق المكتب" placeholder="ابحث باسم المستخدم أو اسم الموظف…" value={staffSearch} onChange={e=>setStaffSearch(e.target.value)}/>{staffSearch&&<small>{shownMembers.length} من {context.members.length}</small>}</div><div className="table-wrap"><table className="office-table"><thead><tr><th>اسم المستخدم</th><th>الوصول</th><th>الحالة</th><th>إدارة الحساب</th></tr></thead><tbody>{shownMembers.map(m=><tr key={m.id}><td><span dir="ltr">{m.username}</span>{m.displayName&&<small>{m.displayName}</small>}</td><td>{m.role==='owner'?'مسؤول المكتب · وصول كامل':<>{m.permissions&&inferRole(m.permissions)&&<span className="role-chip">{jobRoleLabel(inferRole(m.permissions))}</span>}{m.permissions?.caseScope==='all'?`جميع القضايا (${records.length})`:m.permissions?.lawyerNames?.length?<>قضاياه فقط: <b>{visibleCases(m.permissions,records)}</b> قضية <small>باسم {m.permissions.lawyerNames.join('، ')}</small></>:`${m.permissions?.caseIds.length||0} قضية محددة`}<small>{m.permissions&&workspacesOf(m.permissions).map(p=>WORKSPACE_LABELS[p]).join('، ')||'بلا صفحات'} · {m.permissions?.canEdit?'قراءة وتعديل':'قراءة فقط'} · {m.permissions?.canExport?'التصدير متاح':'دون تصدير التقارير'}</small>{!!m.permissions?.adminPowers?.length&&<small className="admin-powers">مسؤول: {m.permissions.adminPowers.map(p=>ADMIN_POWERS[p]?.label||p).join('، ')}</small>}</>}</td><td>{m.enabled?'فعال':'موقوف'}{m.mustChangePassword?' · يلزم تغيير كلمة المرور':''}</td><td>{m.role==='owner'&&isOwner&&<div className="actions"><button className="btn" disabled={busy} onClick={()=>open(m,'rename')}>تغيير الاسم</button>{m.id===context.user.id&&account&&<button className="btn" disabled={busy} onClick={account.onChangePassword}>تغيير كلمة مروري</button>}</div>}{m.role==='editor'&&blocked(m)&&<small className="muted">{blocked(m)}</small>}{m.role==='editor'&&!blocked(m)&&<div className="actions">{m.enabled&&<button className="btn" disabled={busy} onClick={()=>void switchTo(m)} title="افتح التطبيق كما يراه هذا الموظف، دون كلمة مروره">الدخول بحسابه</button>}<button className="btn" disabled={busy} onClick={()=>open(m,'role')}>الدور الوظيفي</button><button className="btn" disabled={busy} onClick={()=>open(m)}>تعديل الصلاحيات</button><button className="btn" disabled={busy} onClick={()=>open(m,'rename')}>تغيير الاسم</button><button className="btn" disabled={busy} onClick={()=>open(m,'password')}>كلمة المرور</button><button className="btn" disabled={busy} onClick={()=>void toggle(m)}>{m.enabled?'إيقاف الحساب':'إعادة تفعيل'}</button></div>}</td></tr>)}</tbody></table></div></div>
 {editing&&<Dialog open onOpenChange={v=>{if(!v&&!busy){setEditing(null);setPassword('')}}}><DialogContent dir="rtl" className="office-dialog permissions-dialog"><DialogHeader><DialogTitle>{editing==='new'?'إضافة موظف':({password:'كلمة مرور ',rename:'تغيير اسم ',permissions:'صلاحيات ',role:'الدور الوظيفي لـ '}[mode])+editing.username}</DialogTitle><DialogDescription>{mode==='password'?'اختر كلمة مرور الموظف بنفسك. تنتهي جلساته الحالية عند الحفظ.':mode==='rename'?'يسجل صاحب الحساب الدخول بالاسم الجديد. تبقى صلاحياته وسجلاته كما هي.':mode==='role'?'يظهر الدور في قائمة الفريق وملفه. تبقى صفحاته وقضاياه كما هي ما لم تطلب تطبيق إعدادات الدور.':'حدد الصفحات والقضايا قبل الحفظ. صلاحيات الحساب تُفحص على الخادم في كل طلب.'}</DialogDescription></DialogHeader>
 {issued?<div className="issued-password" role="status"><p>كلمة مرور <b dir="ltr">{issued.username}</b> الجديدة. انسخها الآن وسلّمها للموظف؛ لا يمكن عرضها مرة أخرى لأنها تُحفظ مشفرة.</p><code dir="ltr">{issued.password}</code><div className="actions"><button className="btn primary" onClick={()=>void copy(issued.password)}>نسخ كلمة المرور</button><button className="btn" onClick={()=>{setIssued(null);setEditing(null)}}>تم</button></div></div>:
 <form className="office-form" onSubmit={save}><fieldset disabled={busy}>
 <div className={editing==='new'?'account-fields':''}>
 {(editing==='new'||mode==='rename')&&<label className="field"><span id="staff-username-label">اسم المستخدم الجديد</span><input aria-labelledby="staff-username-label" aria-describedby="staff-username-help" dir="ltr" value={username} onChange={e=>setUsername(e.target.value)} required pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{2,31}" autoComplete="off"/><small id="staff-username-help">3–32 حرفاً إنجليزياً أو رقماً أو . _ -</small></label>}
 {(editing==='new'||mode==='password')&&<label className="field"><span id="staff-password-label">كلمة المرور</span><span className="password-row"><input aria-labelledby="staff-password-label" aria-describedby="staff-password-help" type={showPassword?'text':'password'} dir="ltr" value={password} onChange={e=>setPassword(e.target.value)} minLength={12} required autoComplete="new-password"/><button type="button" className="btn" onClick={()=>{setPassword(generatePassword());setShowPassword(true)}}>توليد</button><button type="button" className="btn" onClick={()=>setShowPassword(v=>!v)}>{showPassword?'إخفاء':'إظهار'}</button></span><small id="staff-password-help">12 حرفاً على الأقل. «توليد» ينشئ كلمة مرور قوية سهلة القراءة.</small></label>}
 {editing==='new'&&<label className="field"><span>اسم الموظف كما يظهر للزملاء</span><input value={displayName} onChange={e=>setDisplayName(e.target.value)} onBlur={()=>setTypedName(displayName.trim())} maxLength={80} placeholder="للمحامي: اسمه كما في خانة «المحامي»"/><small>اختياري. يظهر في المحادثة والمهام وملف الموارد البشرية.</small></label>}
 {(editing==='new'||mode==='password')&&<label className="checkbox-line"><input type="checkbox" checked={mustChange} onChange={e=>setMustChange(e.target.checked)}/>اطلب من الموظف تغييرها عند الدخول التالي</label>}
 </div>
 {mode==='role'&&editing!=='new'&&<RolePicker value={newRole} onChange={setNewRole} apply={applyPreset} onApply={setApplyPreset} current={access}/>}
 {mode==='permissions'&&<PermissionEditor grantable={powers} value={access} onChange={setAccess} records={records} suggestLawyer={editing!=='new'&&editing?editing.displayName||'':typedName}/>}
 {error&&<p className="notice" role="alert">{error}</p>}
 <button className="btn primary" type="submit">{busy?'جارٍ الحفظ…':editing==='new'||mode==='password'?'حفظ الحساب':mode==='rename'?'حفظ الاسم':mode==='role'?'حفظ الدور الوظيفي':'حفظ الصلاحيات وإنهاء الجلسات'}</button>
 </fieldset></form>}
 {mode==='permissions'&&editing!=='new'&&<section className="office-history"><h3>سجل تغييرات الصلاحيات</h3>{historyError&&<p role="alert">{historyError}</p>}{history.map(h=><details key={h.id}><summary>النسخة {h.revision} · {h.actor} · {officeTime(h.createdAt)}</summary><p>الأقسام: {h.after.sections.map(s=>SECTIONS[s]).join('، ')||'لا توجد'}</p><p>القضايا: {h.after.caseScope==='all'?'جميع القضايا':h.after.caseIds.map(id=>records.find(c=>c.id===id)?.code||id).join('، ')||'لا توجد'}</p><p>{h.after.canEdit?'قراءة وتعديل':'قراءة فقط'} · {h.after.canExport?'تصدير التقارير متاح':'دون تصدير التقارير'}</p></details>)}{!history.length&&!historyError&&<p className="subtitle">لا توجد تغييرات مسجلة.</p>}</section>}
 </DialogContent></Dialog>}
 </section>;
}

/** Change only the job role, or apply the role's suggested pages and settings as well. */
function RolePicker({value,onChange,apply,onApply,current}:{value:JobRole|'';onChange:(r:JobRole)=>void;apply:boolean;onApply:(v:boolean)=>void;current:Permissions}) {
 const r=JOB_ROLES.find(x=>x.id===value),preset=r?.preset;
 const pages=(p:Pick<Permissions,'sections'>)=>workspacesOf(p).map(w=>WORKSPACE_LABELS[w]).join('، ')||'بلا صفحات';
 return <div className="permission-group role-step">
  <div className="role-grid" role="radiogroup" aria-label="الدور الوظيفي">{JOB_ROLES.map(x=><button type="button" role="radio" aria-checked={value===x.id} key={x.id} className={'role-card'+(value===x.id?' on':'')} title={x.hint} onClick={()=>onChange(x.id)}><b>{x.label}</b></button>)}</div>
  {r&&<p className="role-hint">{r.hint}</p>}
  {preset&&<label className="checkbox-line"><input type="checkbox" checked={apply} onChange={e=>onApply(e.target.checked)}/> تطبيق الصفحات والصلاحيات المقترحة لهذا الدور أيضاً</label>}
  <p className="permission-summary" role="status">{apply&&preset?<>سيرى بعد الحفظ: <b>{pages(preset)}</b> · {preset.caseScope==='all'?'جميع القضايا':'قضاياه فقط'} · {preset.canEdit?'قراءة وتعديل':'قراءة فقط'} · {preset.canExport?'تصدير وطباعة':'دون تصدير'}. تنتهي جلساته الحالية.</>:<>تبقى صلاحياته كما هي: <b>{pages(current)}</b>. يتغير المسمى فقط.</>}</p>
 </div>;
}
