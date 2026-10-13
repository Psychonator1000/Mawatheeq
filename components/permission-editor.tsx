'use client';
import {useEffect,useMemo,useState} from 'react';
import {ShieldCheck,Scale,CalendarClock,HandCoins,Calculator,Users,Archive,BookOpenCheck,Gavel,ClipboardList,Headset,Car,Building2,SlidersHorizontal,ChevronDown,type LucideIcon} from 'lucide-react';
import {SECTIONS,LEGAL_SECTIONS,PAGE_PRESETS,WORKSPACE_LABELS,JOB_ROLES,ADMIN_POWERS,ALL_POWERS,workspacesOf,type AdminPower,type JobRole,type Permissions,type Section} from '@/lib/permissions';
import {type CaseRecord} from '@/lib/domain';
import {clientName} from '@/lib/clients';
import {normalizeSearch} from '@/lib/case-browse';
import {lawyerLabels,matchLawyer,visibleCases} from '@/lib/lawyer-match';
import PageNavigation from './page-navigation';

const ROLE_ICONS:Record<JobRole,LucideIcon>={manager:ShieldCheck,lawyer:Scale,counsel:BookOpenCheck,sessionsClerk:Gavel,executionClerk:ClipboardList,callCenter:Headset,courier:Car,officeAdmin:Building2,secretary:CalendarClock,collections:HandCoins,accountant:Calculator,hr:Users,archivist:Archive,custom:SlidersHorizontal};
const same=(a:Section[],b:Section[])=>a.length===b.length&&a.every(s=>b.includes(s));
/** Accounts saved before roles existed: recognise the role from their settings when they match one exactly. */
export function inferRole(v:Permissions):JobRole|undefined{
 if(v.jobRole)return v.jobRole;
 if(v.caseScope==='selected'&&v.lawyerNames?.length)return 'lawyer';
 return JOB_ROLES.find(r=>r.preset&&r.id!=='lawyer'&&same(r.preset.sections,v.sections)&&r.preset.caseScope===v.caseScope&&r.preset.canEdit===v.canEdit&&r.preset.canExport===v.canExport)?.id;
}

export default function PermissionEditor({value,onChange,records,suggestLawyer='',grantable=[]}:{value:Permissions;onChange:(v:Permissions)=>void;records:CaseRecord[];suggestLawyer?:string;grantable?:AdminPower[]}) {
 const [search,setSearch]=useState(''),[page,setPage]=useState(1),[lawyerSearch,setLawyerSearch]=useState('');
 // Lawyer names as written on the cases, with how many cases carry each.
 const lawyers=useMemo(()=>lawyerLabels(records),[records]);
 const names=value.lawyerNames||[];
 // «قضاياه فقط» stays chosen while the owner picks the name, even before any name is ticked.
 const [lawyerMode,setLawyerMode]=useState(value.caseScope==='selected'&&names.length>0);
 const byLawyer=value.caseScope==='selected'&&lawyerMode;
 const suggested=matchLawyer(suggestLawyer,lawyers.map(([l])=>l));
 const ownCount=visibleCases({...value,caseIds:[]},records);
 const filtered=records.filter(c=>normalizeSearch([c.code,c.autoNumber,clientName(c),c.opponent].join(' ')).includes(normalizeSearch(search)));
 const pages=Math.max(1,Math.ceil(filtered.length/10)),current=Math.min(page,pages),rows=filtered.slice((current-1)*10,current*10);
 const patch=(next:Partial<Permissions>)=>onChange({...value,...next});
 const toggle=(id:string,checked:boolean)=>patch({caseIds:checked?[...value.caseIds,id]:value.caseIds.filter(x=>x!==id)});
 const opens=workspacesOf(value),powers=value.adminPowers||[];
 const role=inferRole(value);
 // New accounts start folded until a role is chosen; older accounts that match no role open the details.
 const [details,setDetails]=useState(role==='custom'||(!role&&value.revision>0));
 // A lawyer's name typed for a new account ticks the matching name on the cases.
 useEffect(()=>{if(byLawyer&&!names.length&&suggested)onChange({...value,lawyerNames:[suggested]})},[suggested]);// eslint-disable-line react-hooks/exhaustive-deps
 function pickRole(id:JobRole){
  const r=JOB_ROLES.find(x=>x.id===id)!;
  if(!r.preset){setLawyerMode(false);setDetails(true);onChange({...value,jobRole:id});return}
  const lawyer=id==='lawyer';setLawyerMode(lawyer);
  // «مدير» also receives every admin power the person granting it holds; other roles keep the powers already chosen.
  onChange({...value,...r.preset,caseIds:[],jobRole:id,lawyerNames:lawyer?(names.length?names:suggested?[suggested]:[]):[],...(id==='manager'?{adminPowers:[...grantable]}:{})});
 }
 function lawyerPicker(){return <div className="permission-lawyers">
    {!names.length&&<p className="notice" role="alert">{suggestLawyer?`لم يُعثر على «${suggestLawyer}» في خانة «المحامي» بالقضايا. `:''}اختر اسمه كما هو مكتوب في القضايا من القائمة أدناه.</p>}
    <p className="permission-summary" role="status">يرى <b>{ownCount}</b> قضية الآن، وكل قضية جديدة أو منقولة باسم {names.length>1?'هؤلاء المحامين':'هذا المحامي'} تظهر له تلقائياً.{value.caseIds.length?` وأيضاً ${value.caseIds.length} قضية مختارة يدوياً.`:''}</p>
    <label className="field"><span>البحث عن اسم المحامي كما في القضايا</span><input value={lawyerSearch} onChange={e=>setLawyerSearch(e.target.value)} placeholder="اكتب جزءاً من الاسم"/></label>
    <div className="permission-cases">{lawyers.filter(([l])=>names.includes(l)||normalizeSearch(l).includes(normalizeSearch(lawyerSearch))).slice(0,30).map(([l,n])=><label key={l} className="permission-case"><input type="checkbox" checked={names.includes(l)} onChange={e=>patch({lawyerNames:e.target.checked?[...names,l]:names.filter(x=>x!==l)})} aria-label={'قضايا '+l}/><span><b>{l}</b><small>{n} قضية{l===suggested?' · اسم هذا الحساب':''}</small></span></label>)}</div>
    <p className="subtitle">إذا كُتب اسم المحامي بأكثر من صيغة في القضايا، حدد كل الصيغ. القضايا تُتاح حسب خانة «المحامي» في كل قضية.</p>
   </div>;}
 const scopeText=value.caseScope==='all'?`جميع القضايا (${records.length})`:byLawyer?`قضاياه فقط (${ownCount})`:value.caseIds.length?`${value.caseIds.length} قضية مختارة`:'بلا قضايا';
 return <div className="permission-editor">
  <fieldset className="permission-group role-step"><legend>الدور الوظيفي</legend>
   <div className="role-grid" role="radiogroup" aria-label="الدور الوظيفي">{JOB_ROLES.map(r=>{const Icon=ROLE_ICONS[r.id];const on=role===r.id;return <button type="button" role="radio" aria-checked={on} key={r.id} className={'role-card'+(on?' on':'')} onClick={()=>pickRole(r.id)} title={r.hint}><Icon size={18} aria-hidden/><b>{r.label}</b></button>})}</div>
   {role&&<p className="role-hint">{JOB_ROLES.find(r=>r.id===role)?.hint}</p>}
   {role==='manager'&&<p className="subtitle">يحصل المدير أيضاً على صلاحيات الإدارة المحددة أدناه. حساب المالك لا يُعدَّل من أي حساب آخر.</p>}
   <div className="role-summary" role="status">
    <span><small>الصفحات</small><b>{opens.length?opens.map(p=>WORKSPACE_LABELS[p]).join('، '):'لا شيء بعد'}</b></span>
    <span><small>القضايا</small><b>{scopeText}</b></span>
    <span><small>العمليات</small><b>{value.canEdit?'قراءة وتعديل':'قراءة فقط'} · {value.canExport?'تصدير وطباعة':'دون تصدير'}</b></span>
   </div>
   {byLawyer&&lawyerPicker()}
  </fieldset>
  {(grantable.length>0||!!powers.length)&&<fieldset className="permission-group admin-step"><legend>صلاحيات الإدارة</legend>
   <p className="subtitle">ينوب صاحب الحساب عن المالك فيما تختاره هنا. تمنح فقط الصلاحيات التي تملكها، ولا يستطيع أحد تعديل حساب المالك.</p>
   <div className="power-grid">{ALL_POWERS.map(p=>{const on=powers.includes(p),can=grantable.includes(p);return <label key={p} className={'power-option'+(on?' on':'')+(can?'':' locked')} title={can?undefined:'لا تملك هذه الصلاحية لتمنحها'}><input type="checkbox" checked={on} disabled={!can} onChange={e=>patch({adminPowers:e.target.checked?[...powers,p]:powers.filter(x=>x!==p)})}/><span><b>{ADMIN_POWERS[p].label}</b><small>{ADMIN_POWERS[p].hint}</small></span></label>})}</div>
  </fieldset>}
  <button type="button" className="permission-toggle" aria-expanded={details} onClick={()=>setDetails(v=>!v)}><SlidersHorizontal size={16} aria-hidden/>{details?'إخفاء التفاصيل':'تعديل التفاصيل: الصفحات والقضايا والعمليات'}<ChevronDown size={16} aria-hidden className="chev"/></button>
  {details&&<div className="permission-details">
  <fieldset className="permission-group"><legend>الصفحات التي يراها</legend>
   <div className="permission-presets" role="group" aria-label="قوالب الصفحات">{PAGE_PRESETS.map(([label,sections])=>{const on=sections.length===value.sections.length&&sections.every(s=>value.sections.includes(s));return <button type="button" key={label} className={'btn '+(on?'primary':'')} aria-pressed={on} onClick={()=>patch({sections})}>{label}</button>})}</div>
   <p className="permission-summary" role="status">{opens.length?<>سيرى هذا الحساب: <b>{opens.map(p=>WORKSPACE_LABELS[p]).join('، ')}</b>{opens.length===1?' — ويفتحها مباشرة عند الدخول.':'.'}</>:'لن يرى هذا الحساب أي صفحة حتى تختار له صفحات.'}</p>
   <p className="subtitle">اختر قالباً أو حدد الصفحات بالتفصيل أدناه. يمكنك الجمع بين أكثر من صفحة.</p>
  </fieldset>
  <fieldset className="permission-group"><legend>نطاق القضايا</legend>
   <label className="checkbox-line"><input type="radio" name="caseScope" checked={byLawyer} onChange={()=>{setLawyerMode(true);patch({caseScope:'selected',lawyerNames:names.length?names:suggested?[suggested]:[],sections:value.sections.filter(s=>s!=='documents')})}}/>قضاياه فقط (حسب اسم المحامي في القضية)</label>
   <label className="checkbox-line"><input type="radio" name="caseScope" checked={value.caseScope==='selected'&&!byLawyer} onChange={()=>{setLawyerMode(false);patch({caseScope:'selected',lawyerNames:[],sections:value.sections.filter(s=>s!=='documents')})}}/>قضايا أختارها فقط</label>
   <label className="checkbox-line"><input type="radio" name="caseScope" checked={value.caseScope==='all'} onChange={()=>{setLawyerMode(false);patch({caseScope:'all',lawyerNames:[]})}}/>جميع القضايا الحالية والمستقبلية</label>
   {value.caseScope==='selected'&&!byLawyer&&<><label className="field"><span>البحث لاختيار القضايا</span><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="الكود أو الرقم الآلي أو الموكل أو الخصم"/></label>
    <p className="subtitle" role="status">{value.caseIds.length} قضية محددة · {filtered.length} نتيجة بحث</p>
    <div className="permission-cases">{rows.map(c=><label key={c.id} className="permission-case"><input type="checkbox" checked={value.caseIds.includes(c.id)} onChange={e=>toggle(c.id,e.target.checked)} aria-label={`إتاحة القضية ${c.code||c.autoNumber||c.id}`}/><span><b>{c.code||'بلا كود'} · {c.autoNumber||'بلا رقم آلي'}{c.archived?' · مؤرشفة':''}</b><small>{clientName(c)} / {c.opponent||'خصم غير مسجل'}</small></span></label>)}</div>
    {!rows.length&&<p>لا توجد قضايا مطابقة.</p>}<PageNavigation page={current} pages={pages} total={filtered.length} onChange={setPage}/>
    {!value.caseIds.length&&<p className="notice">لن تظهر لهذا المستخدم أي قضية حتى تختار له قضايا.</p>}
   </>}
  </fieldset>
  {[false,true].map(legal=><fieldset className="permission-group" key={String(legal)}><legend>{legal?'أقسام صفحة القضايا (الرئيسية)':'صفحات الأقسام الأخرى'}</legend><div className="permission-sections">{Object.entries(SECTIONS).filter(([id])=>LEGAL_SECTIONS.includes(id as Section)===legal).map(([id,label])=><label className="checkbox-line" key={id}><input type="checkbox" checked={value.sections.includes(id as Section)} disabled={id==='documents'&&value.caseScope!=='all'} onChange={e=>patch({sections:e.target.checked?[...value.sections,id as Section]:value.sections.filter(s=>s!==id)})}/>{label}</label>)}</div>
   <p className="subtitle">صفحات الأقسام الأخرى تتيح ملخص القضية وأدوات القسم فقط، وكل صفحة تعرض القضايا المسموحة فقط. إخفاء قسم لا يحجب حقول القضية المتاحة من قسم آخر. مرفقات القضايا ضمن «التحقق»، و«المستندات والأدلة» تتطلب جميع القضايا.</p>
  </fieldset>)}
  <fieldset className="permission-group"><legend>العمليات المسموحة</legend>
   <label className="checkbox-line"><input type="checkbox" checked={value.canEdit} onChange={e=>patch({canEdit:e.target.checked})}/>السماح بالتعديل في الأقسام المتاحة</label>
   <label className="checkbox-line"><input type="checkbox" checked={value.canExport} onChange={e=>patch({canExport:e.target.checked})}/>السماح بتصدير التقارير وطباعتها</label>
   <p className="subtitle">بدون التعديل يصبح الحساب للقراءة فقط. إضافة القضايا وتعديل ملفات الموكلين المشتركة تتطلب جميع القضايا والقسم المختص. إدارة المستخدمين والاعتماد والإعدادات والاستيراد والنسخة الكاملة تُمنح من «صلاحيات الإدارة».</p>
  </fieldset>
  </div>}
 </div>;
}
