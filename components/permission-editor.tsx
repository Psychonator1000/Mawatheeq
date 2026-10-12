'use client';
import {useMemo,useState} from 'react';
import {SECTIONS,LEGAL_SECTIONS,PAGE_PRESETS,WORKSPACE_LABELS,workspacesOf,type Permissions,type Section} from '@/lib/permissions';
import {type CaseRecord} from '@/lib/domain';
import {clientName} from '@/lib/clients';
import {normalizeSearch} from '@/lib/case-browse';
import PageNavigation from './page-navigation';

export default function PermissionEditor({value,onChange,records,suggestLawyer=''}:{value:Permissions;onChange:(v:Permissions)=>void;records:CaseRecord[];suggestLawyer?:string}) {
 const [search,setSearch]=useState(''),[page,setPage]=useState(1),[lawyerSearch,setLawyerSearch]=useState('');
 // Lawyer names as written on the cases, with how many cases carry each.
 const lawyers=useMemo(()=>{const m=new Map<string,number>();for(const c of records){const l=(c.lawyer||'').replace(/\s+/g,' ').trim();if(l)m.set(l,(m.get(l)||0)+1)}return [...m].sort((a,b)=>b[1]-a[1])},[records]);
 const names=value.lawyerNames||[],byLawyer=value.caseScope==='selected'&&names.length>0;
 const suggested=lawyers.find(([l])=>normalizeSearch(l)===normalizeSearch(suggestLawyer))?.[0];
 const ownCount=records.filter(c=>names.some(n=>normalizeSearch(n)===normalizeSearch(c.lawyer||''))).length;
 const filtered=records.filter(c=>normalizeSearch([c.code,c.autoNumber,clientName(c),c.opponent].join(' ')).includes(normalizeSearch(search)));
 const pages=Math.max(1,Math.ceil(filtered.length/10)),current=Math.min(page,pages),rows=filtered.slice((current-1)*10,current*10);
 const patch=(next:Partial<Permissions>)=>onChange({...value,...next});
 const toggle=(id:string,checked:boolean)=>patch({caseIds:checked?[...value.caseIds,id]:value.caseIds.filter(x=>x!==id)});
 const opens=workspacesOf(value);
 return <div className="permission-editor">
  <fieldset className="permission-group"><legend>الصفحات التي يراها</legend>
   <div className="permission-presets" role="group" aria-label="قوالب الصفحات">{PAGE_PRESETS.map(([label,sections])=>{const on=sections.length===value.sections.length&&sections.every(s=>value.sections.includes(s));return <button type="button" key={label} className={'btn '+(on?'primary':'')} aria-pressed={on} onClick={()=>patch({sections})}>{label}</button>})}</div>
   <p className="permission-summary" role="status">{opens.length?<>سيرى هذا الحساب: <b>{opens.map(p=>WORKSPACE_LABELS[p]).join('، ')}</b>{opens.length===1?' — ويفتحها مباشرة عند الدخول.':'.'}</>:'لن يرى هذا الحساب أي صفحة حتى تختار له صفحات.'}</p>
   <p className="subtitle">اختر قالباً أو حدد الصفحات بالتفصيل أدناه. يمكنك الجمع بين أكثر من صفحة.</p>
  </fieldset>
  <fieldset className="permission-group"><legend>نطاق القضايا</legend>
   <label className="checkbox-line"><input type="radio" name="caseScope" checked={byLawyer} onChange={()=>patch({caseScope:'selected',lawyerNames:suggested?[suggested]:lawyers.slice(0,1).map(([l])=>l),sections:value.sections.filter(s=>s!=='documents')})}/>قضاياه فقط (حسب اسم المحامي في القضية)</label>
   <label className="checkbox-line"><input type="radio" name="caseScope" checked={value.caseScope==='selected'&&!byLawyer} onChange={()=>patch({caseScope:'selected',lawyerNames:[],sections:value.sections.filter(s=>s!=='documents')})}/>قضايا أختارها فقط</label>
   <label className="checkbox-line"><input type="radio" name="caseScope" checked={value.caseScope==='all'} onChange={()=>patch({caseScope:'all',lawyerNames:[]})}/>جميع القضايا الحالية والمستقبلية</label>
   {byLawyer&&<div className="permission-lawyers">
    <p className="permission-summary" role="status">يرى <b>{ownCount}</b> قضية الآن، وكل قضية جديدة أو منقولة باسم {names.length>1?'هؤلاء المحامين':'هذا المحامي'} تظهر له تلقائياً.{value.caseIds.length?` وأيضاً ${value.caseIds.length} قضية مختارة يدوياً.`:''}</p>
    <label className="field"><span>البحث عن اسم المحامي كما في القضايا</span><input value={lawyerSearch} onChange={e=>setLawyerSearch(e.target.value)} placeholder="اكتب جزءاً من الاسم"/></label>
    <div className="permission-cases">{lawyers.filter(([l])=>names.includes(l)||normalizeSearch(l).includes(normalizeSearch(lawyerSearch))).slice(0,30).map(([l,n])=><label key={l} className="permission-case"><input type="checkbox" checked={names.includes(l)} onChange={e=>patch({lawyerNames:e.target.checked?[...names,l]:names.filter(x=>x!==l)})} aria-label={'قضايا '+l}/><span><b>{l}</b><small>{n} قضية{l===suggested?' · اسم هذا الحساب':''}</small></span></label>)}</div>
    <p className="subtitle">إذا كُتب اسم المحامي بأكثر من صيغة في القضايا، حدد كل الصيغ. القضايا تُتاح حسب خانة «المحامي» في كل قضية.</p>
   </div>}
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
   <p className="subtitle">بدون التعديل يصبح الحساب للقراءة فقط. إضافة القضايا وتعديل ملفات الموكلين المشتركة تتطلب جميع القضايا والقسم المختص. إدارة المستخدمين والاعتماد والإعدادات والاستيراد والنسخة الكاملة للمسؤول فقط.</p>
  </fieldset>
 </div>;
}
