'use client';
import {useState} from 'react';
import {SECTIONS,LEGAL_SECTIONS,type Permissions,type Section} from '@/lib/permissions';
import {type CaseRecord} from '@/lib/domain';
import {clientName} from '@/lib/clients';
import {normalizeSearch} from '@/lib/case-browse';
import PageNavigation from './page-navigation';

export default function PermissionEditor({value,onChange,records}:{value:Permissions;onChange:(v:Permissions)=>void;records:CaseRecord[]}) {
 const [search,setSearch]=useState(''),[page,setPage]=useState(1);
 const filtered=records.filter(c=>normalizeSearch([c.code,c.autoNumber,clientName(c),c.opponent].join(' ')).includes(normalizeSearch(search)));
 const pages=Math.max(1,Math.ceil(filtered.length/10)),current=Math.min(page,pages),rows=filtered.slice((current-1)*10,current*10);
 const patch=(next:Partial<Permissions>)=>onChange({...value,...next});
 const toggle=(id:string,checked:boolean)=>patch({caseIds:checked?[...value.caseIds,id]:value.caseIds.filter(x=>x!==id)});
 return <div className="permission-editor">
  <fieldset className="permission-group"><legend>نطاق القضايا</legend>
   <label className="checkbox-line"><input type="radio" name="caseScope" checked={value.caseScope==='selected'} onChange={()=>patch({caseScope:'selected',sections:value.sections.filter(s=>s!=='documents')})}/>قضايا أختارها فقط</label>
   <label className="checkbox-line"><input type="radio" name="caseScope" checked={value.caseScope==='all'} onChange={()=>patch({caseScope:'all'})}/>جميع القضايا الحالية والمستقبلية</label>
   {value.caseScope==='selected'&&<><label className="field"><span>البحث لاختيار القضايا</span><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="الكود أو الرقم الآلي أو الموكل أو الخصم"/></label>
    <p className="subtitle" role="status">{value.caseIds.length} قضية محددة · {filtered.length} نتيجة بحث</p>
    <div className="permission-cases">{rows.map(c=><label key={c.id} className="permission-case"><input type="checkbox" checked={value.caseIds.includes(c.id)} onChange={e=>toggle(c.id,e.target.checked)} aria-label={`إتاحة القضية ${c.code||c.autoNumber||c.id}`}/><span><b>{c.code||'بلا كود'} · {c.autoNumber||'بلا رقم آلي'}{c.archived?' · مؤرشفة':''}</b><small>{clientName(c)} / {c.opponent||'خصم غير مسجل'}</small></span></label>)}</div>
    {!rows.length&&<p>لا توجد قضايا مطابقة.</p>}<PageNavigation page={current} pages={pages} total={filtered.length} onChange={setPage}/>
    {!value.caseIds.length&&<p className="notice">لن تظهر لهذا المستخدم أي قضية حتى تختار له قضايا.</p>}
   </>}
  </fieldset>
  {[false,true].map(legal=><fieldset className="permission-group" key={String(legal)}><legend>{legal?'أقسام مساحة القضايا':'بيئات العمل الإضافية'}</legend><div className="permission-sections">{Object.entries(SECTIONS).filter(([id])=>LEGAL_SECTIONS.includes(id as Section)===legal).map(([id,label])=><label className="checkbox-line" key={id}><input type="checkbox" checked={value.sections.includes(id as Section)} disabled={id==='documents'&&value.caseScope!=='all'} onChange={e=>patch({sections:e.target.checked?[...value.sections,id as Section]:value.sections.filter(s=>s!==id)})}/>{label}</label>)}</div>
   <p className="subtitle">بيئات العمل الإضافية تتيح ملخص القضية وأدوات القسم فقط. كل قسم يعرض القضايا المسموحة فقط. إخفاء قسم لا يحجب حقول القضية المتاحة من قسم آخر. مرفقات القضايا ضمن «التحقق»؛ مكتبة إعداد المستندات غير المصنفة تتطلب جميع القضايا.</p>
  </fieldset>)}
  <fieldset className="permission-group"><legend>العمليات المسموحة</legend>
   <label className="checkbox-line"><input type="checkbox" checked={value.canEdit} onChange={e=>patch({canEdit:e.target.checked})}/>السماح بالتعديل في الأقسام المتاحة</label>
   <label className="checkbox-line"><input type="checkbox" checked={value.canExport} onChange={e=>patch({canExport:e.target.checked})}/>السماح بتصدير التقارير وطباعتها</label>
   <p className="subtitle">بدون التعديل يصبح الحساب للقراءة فقط. إضافة القضايا وتعديل ملفات الموكلين المشتركة تتطلب جميع القضايا والقسم المختص. إدارة المستخدمين والاعتماد والإعدادات والاستيراد والنسخة الكاملة للمسؤول فقط.</p>
  </fieldset>
 </div>;
}
