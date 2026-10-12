'use client';
import {useMemo,useState} from 'react';
import {toast} from 'sonner';
import {Plus,Printer,Pencil,Trash2,Ban,Phone,MessageCircle,AlertTriangle} from 'lucide-react';
import {departmentRequest} from '@/lib/local-auth';
import type {CollectionRecord,DepartmentRecord} from '@/lib/departments';
import {formatDate,todayISO} from '@/lib/domain';
import {listHtml,printHtml} from '@/lib/print';
import {phoneLinks} from '@/lib/contact-links';
import {FILE_STATUSES,EXECUTION_STATUSES,STATEMENT_CATEGORIES,STATEMENT_ACTIONS,STATEMENT_STATUSES,CONTACT_PARTIES,CONTACT_METHODS,PAYMENT_TYPES,PAYMENT_METHODS,fils,kwd,position,
 type StatementCategory,type StatementData,type StatementStatus,type PaymentData,type PaymentType} from '@/lib/collections';
import {Field,DateField,Choice,PickOrType} from '../shared';
import {officeTime} from '../office-shared';

export type StatementRecord=DepartmentRecord<StatementData>;
export type PaymentRecord=DepartmentRecord<PaymentData>;
const label=(list:[string,string][],id:string)=>list.find(x=>x[0]===id)?.[1]||id;
const statusTone:Record<StatementStatus,string>={done:'green',notDone:'amber',postponed:''};

/** Status, assignment, instalments, promissory note, tags and closing of a collection file. */
export function FollowFields({p,set,assignees,batches,tags}:{p:CollectionRecord['payload'];set:(k:string,v:string)=>void;assignees:string[];batches:string[];tags:string[]}) {
 const v=(k:string)=>String((p as Record<string,unknown>)[k]||'');
 const money=(k:string,l:string)=><Field key={k} label={l+' (د.ك)'} value={v(k)} onChange={x=>set(k,x)} placeholder="0.000"/>;
 const total=fils(p.amount)+fils(p.orderFee);
 return <>
  <section className="department-form-section"><h3>حالة الملف والتوزيع</h3><div className="form-grid">
   <label className="field"><span>حالة الملف</span><Choice label="حالة الملف" empty="غير محدد" value={v('fileStatus')} onChange={x=>set('fileStatus',x)} options={FILE_STATUSES}/></label>
   <label className="field"><span>حالة ملف التنفيذ</span><Choice label="حالة ملف التنفيذ" empty="غير محدد" value={v('executionStatus')} onChange={x=>set('executionStatus',x)} options={EXECUTION_STATUSES}/></label>
   <Field label="الموظف المسؤول عن الملف" value={v('assignedTo')} onChange={x=>set('assignedTo',x)} suggestions={assignees}/>
   <DateField label="تاريخ الورود" value={v('arrivalDate')} onChange={x=>set('arrivalDate',x)}/>
   <Field label="رقم الباتش (القائمة)" value={v('batchNumber')} onChange={x=>set('batchNumber',x)} suggestions={batches}/>
   <Field label="رقم العقد المحاسبي" value={v('accountingContract')} onChange={x=>set('accountingContract',x)}/>
   <Field label="سبب المديونية" value={v('debtReason')} onChange={x=>set('debtReason',x)}/>
   <Field label="الإجراء المطلوب" value={v('requiredAction')} onChange={x=>set('requiredAction',x)} suggestions={['اتصال بالخصم','تقديم أمر أداء','رفع دعوى','فتح ملف تنفيذ','متابعة التنفيذ','إغلاق الملف']}/>
  </div></section>
  <section className="department-form-section"><h3>المطالبة والأقساط</h3><div className="form-grid">
   {money('orderFee','قيمة رسم أمر الأداء')}<div className="field readonly-sum"><span>إجمالي قيمة المطالبة</span><b>{kwd(total)} د.ك</b><small>قيمة المطالبة + رسم أمر الأداء</small></div>
   {money('installment','قيمة القسط')}{money('installmentsTotal','إجمالي قيمة الأقساط')}
   <Field label="عدد أيام التأخير" value={v('delayDays')} onChange={x=>set('delayDays',x.replace(/\D/g,''))} placeholder="0"/>{money('overdueAmount','المبلغ المتأخر')}
  </div></section>
  <section className="department-form-section"><h3>السند الإذني</h3><div className="form-grid">
   {money('promissoryAmount','قيمة السند الإذني')}<DateField label="تاريخ السند الإذني" value={v('promissoryDate')} onChange={x=>set('promissoryDate',x)}/><DateField label="تاريخ استحقاق السند الإذني" value={v('promissoryDueDate')} onChange={x=>set('promissoryDueDate',x)}/>
  </div></section>
  <section className="department-form-section"><h3>الترقيم</h3><p className="subtitle">علامات حرة لفرز الملفات (مثل: نادر، متابعة خاصة). تُقترح العلامات المستخدمة سابقاً.</p><div className="form-grid">
   {['tag1','tag2','tag3','tag4'].map((k,i)=><Field key={k} label={'ترقيم '+(i+1)} value={v(k)} onChange={x=>set(k,x)} suggestions={tags}/>)}
  </div></section>
  <section className="department-form-section"><h3>إغلاق الملف</h3><div className="form-grid">
   <DateField label="تاريخ إغلاق الملف" value={v('closedDate')} onChange={x=>set('closedDate',x)}/><Field label="بموجب" value={v('closedReason')} onChange={x=>set('closedReason',x)} suggestions={['سداد كامل','مخالصة','تسوية','طلب الموكل','عدم جدوى التحصيل']}/>
  </div></section>
 </>;
}

const blankStatement=(category:StatementCategory,phone=''):StatementData=>({category,action:'',reviewDate:todayISO(),status:'done',text:'',phone:category==='calls'?phone:'',contactParty:category==='calls'?'defendant':'',method:''});
/** «إفادات الملف»: what was done on the file, by category, with a review date and status. */
export function FileStatements({file,rows,editable,canPrint,onChanged}:{file:CollectionRecord;rows:StatementRecord[];editable:boolean;canPrint:boolean;onChanged:()=>void}) {
 const [category,setCategory]=useState<StatementCategory>('calls');
 const [draft,setDraft]=useState<StatementData>(()=>blankStatement('calls',file.payload.phone));
 const [editing,setEditing]=useState<StatementRecord|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const live=rows.filter(r=>!r.archived),shown=live.filter(r=>r.payload.category===category).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const set=(k:keyof StatementData,v:string)=>setDraft(d=>({...d,[k]:v}));
 const reset=(c=category)=>{setEditing(null);setError('');setDraft(blankStatement(c,file.payload.phone))};
 const pick=(c:StatementCategory)=>{setCategory(c);reset(c)};
 async function save(){
  if(!draft.action.trim()||!draft.text.trim()){setError('اختر الإجراء واكتب نص الإفادة.');return}
  setBusy(true);setError('');try{
   const record={id:editing?.id||crypto.randomUUID(),workspace:'collections',kind:'statement',caseId:file.caseId,subjectId:file.id,payload:{...draft,category},revision:editing?.revision||0};
   await departmentRequest('save_record',{workspace:'collections',record});toast.success(editing?'عُدّلت الإفادة':'أُضيفت الإفادة');reset();onChanged();
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function remove(r:StatementRecord){if(!window.confirm('حذف هذه الإفادة؟ تبقى في سجل التغييرات.'))return;setBusy(true);try{await departmentRequest('archive_record',{workspace:'collections',id:r.id,revision:r.revision,archived:true});toast.success('حُذفت الإفادة');if(editing?.id===r.id)reset();onChanged()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 function print(){printHtml(listHtml('إفادات الملف: '+(file.payload.company||'')+' ضد '+(file.payload.defendant||''),label(STATEMENT_CATEGORIES,category)+(file.payload.code?' · '+file.payload.code:''),
  ['تاريخ الإفادة','الإجراء','التفاصيل',...(category==='calls'?['رقم الاتصال']:[]),'تاريخ المراجعة','الموظف','الحالة'],
  shown.map(r=>[officeTime(r.createdAt),r.payload.action,r.payload.text,...(category==='calls'?[r.payload.phone]:[]),formatDate(r.payload.reviewDate),r.createdBy,label(STATEMENT_STATUSES,r.payload.status)]),formatDate(todayISO()),''))}
 const links=draft.phone?phoneLinks(draft.phone):null;
 return <div className="file-statements">
  <div className="segmented" role="radiogroup" aria-label="نوع الإفادة">{STATEMENT_CATEGORIES.map(([id,l])=>{const n=live.filter(r=>r.payload.category===id).length;return <button type="button" role="radio" aria-checked={category===id} key={id} className={category===id?'on':''} onClick={()=>pick(id)}>{l}{n?<span className="tab-count">{n}</span>:null}</button>})}</div>
  {editable&&<form className="statement-form" onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy}>
   <div className="form-grid">
    <PickOrType key={category+(editing?.id||'')} label="إجراء التحصيل أو التنفيذ" value={draft.action} onChange={v=>set('action',v)} options={STATEMENT_ACTIONS[category]} empty="اختر الإجراء"/>
    <DateField label="تاريخ المراجعة" value={draft.reviewDate} onChange={v=>set('reviewDate',v)}/>
    {category==='calls'&&<><div className="field"><span>رقم الاتصال</span><div className="phone-row"><select aria-label="الطرف" value={draft.contactParty} onChange={e=>set('contactParty',e.target.value)}>{CONTACT_PARTIES.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select><input type="tel" aria-label="رقم الاتصال" value={draft.phone} onChange={e=>set('phone',e.target.value.replace(/[^+0-9 ]/g,''))} placeholder="رقم الهاتف"/>{links&&<><a className="icon-btn" href={links.tel} aria-label="اتصال"><Phone size={15}/></a><a className="icon-btn" href={links.whatsapp} target="_blank" rel="noreferrer" aria-label="واتساب"><MessageCircle size={15}/></a></>}</div></div>
     <div className="field"><span>طريقة الاتصال</span><div className="segmented small" role="radiogroup" aria-label="طريقة الاتصال">{CONTACT_METHODS.map(([id,l])=><button type="button" role="radio" aria-checked={draft.method===id} key={id||'none'} className={draft.method===id?'on':''} onClick={()=>set('method',id)}>{l}</button>)}</div></div></>}
    <div className="field"><span>حالة التنفيذ</span><div className="segmented small" role="radiogroup" aria-label="حالة التنفيذ">{STATEMENT_STATUSES.map(([id,l])=><button type="button" role="radio" aria-checked={draft.status===id} key={id} className={draft.status===id?'on':''} onClick={()=>set('status',id)}>{l}</button>)}</div></div>
    <Field label="الإجراء (نص الإفادة)" value={draft.text} onChange={v=>set('text',v)} wide multiline/>
   </div>
   {error&&<p className="notice" role="alert">{error}</p>}
   <div className="actions"><button className="btn primary" type="submit"><Plus size={15}/> {editing?'حفظ التعديل':'إضافة الإفادة'}</button><button type="button" className="btn" onClick={()=>reset()}>جديد</button></div>
  </fieldset></form>}
  {canPrint&&!!shown.length&&<button type="button" className="btn" onClick={print}><Printer size={15}/> طباعة إفادات {label(STATEMENT_CATEGORIES,category)}</button>}
  {!shown.length?<p className="notice soft"><AlertTriangle size={16}/> لا توجد إفادات {label(STATEMENT_CATEGORIES,category)}</p>:
  <div className="table-wrap"><table className="office-table statements-table"><thead><tr><th>تاريخ الإفادة</th><th>الإجراء</th>{category==='calls'&&<th>رقم الاتصال</th>}<th>تاريخ المراجعة</th><th>الموظف</th><th>الحالة</th>{editable&&<th/>}</tr></thead>
   <tbody>{shown.map(r=><tr key={r.id} className={editing?.id===r.id?'picked':''}><td className="nowrap">{officeTime(r.createdAt)}</td><td><b>{r.payload.action}</b><small>{r.payload.text}</small></td>{category==='calls'&&<td dir="ltr">{r.payload.phone||'—'}<small>{label(CONTACT_PARTIES,r.payload.contactParty)}{r.payload.method?' · '+label(CONTACT_METHODS,r.payload.method):''}</small></td>}<td className="nowrap">{formatDate(r.payload.reviewDate)}</td><td>{r.createdBy}</td><td><span className={'tag '+statusTone[r.payload.status]}>{label(STATEMENT_STATUSES,r.payload.status)}</span></td>
    {editable&&<td className="row-actions"><button type="button" className="icon-btn" aria-label="تعديل الإفادة" onClick={()=>{setEditing(r);setDraft({...r.payload})}}><Pencil size={14}/></button><button type="button" className="icon-btn danger" aria-label="حذف الإفادة" onClick={()=>void remove(r)}><Trash2 size={14}/></button></td>}</tr>)}</tbody></table></div>}
 </div>;
}

const blankPayment=(type:PaymentType):PaymentData=>({type,date:todayISO(),amount:'',method:type==='expense'?'':'نقداً',reference:'',notes:''});
/** «الوضع المالي»: claim, payments, payments made to the client and expenses, with cancellation instead of edits. */
export function FilePosition({file,rows,editable,canPrint,onChanged}:{file:CollectionRecord;rows:PaymentRecord[];editable:boolean;canPrint:boolean;onChanged:()=>void}) {
 const [tab,setTab]=useState<PaymentType>('payment'),[draft,setDraft]=useState<PaymentData>(blankPayment('payment')),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [voiding,setVoiding]=useState<string|null>(null),[reason,setReason]=useState('');
 const pos=useMemo(()=>position(file.payload,rows.map(r=>r.payload)),[file.payload,rows]);
 const shown=rows.filter(r=>r.payload.type===tab).sort((a,b)=>b.payload.date.localeCompare(a.payload.date)||b.createdAt.localeCompare(a.createdAt));
 const set=(k:keyof PaymentData,v:string)=>setDraft(d=>({...d,[k]:v}));
 async function add(){
  if(!fils(draft.amount)){setError('أدخل مبلغاً موجباً بالدينار حتى ثلاث خانات عشرية.');return}
  setBusy(true);setError('');try{await departmentRequest('save_record',{workspace:'collections',record:{id:crypto.randomUUID(),workspace:'collections',kind:'payment',caseId:file.caseId,subjectId:file.id,payload:{...draft,type:tab},revision:0}});
   toast.success('سُجلت الحركة');setDraft(blankPayment(tab));onChanged()}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function cancel(r:PaymentRecord){setBusy(true);try{await departmentRequest('void_record',{workspace:'collections',id:r.id,revision:r.revision,reason});toast.success('أُلغيت الحركة وبقيت في السجل');setVoiding(null);setReason('');onChanged()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 function print(){const live=rows.filter(r=>r.payload.status!=='void').sort((a,b)=>a.payload.date.localeCompare(b.payload.date));
  printHtml(listHtml('كشف حساب ملف التحصيل',`${file.payload.company||''} ضد ${file.payload.defendant||''}${file.payload.code?' · '+file.payload.code:''}`,['التاريخ','النوع','المبلغ (د.ك)','طريقة السداد','المرجع','ملاحظات'],
   live.map(r=>[formatDate(r.payload.date),label(PAYMENT_TYPES,r.payload.type),kwd(Number(r.payload.amountMinor||fils(r.payload.amount))),r.payload.method,r.payload.reference,r.payload.notes]),formatDate(todayISO()),'',
   [['إجمالي قيمة المطالبة',kwd(pos.total)],['إجمالي المسدد',kwd(pos.paid)],['إجمالي المصروفات',kwd(pos.expenses)],['الباقي',kwd(pos.remaining)],['صافي المحصل',kwd(pos.net)]]))}
 const tile=(l:string,v:number,tone='')=><div className={'position-tile '+tone}><span>{l}</span><b>{kwd(v)} <small>د.ك</small></b></div>;
 return <div className="file-position">
  <div className="position-grid">{tile('إجمالي قيمة المطالبة',pos.total)}{tile('قيمة رسم أمر الأداء',pos.fee)}{tile('إجمالي المسدد',pos.paid,'green')}{tile('منه سداد خارجي',pos.external)}{tile('إجمالي المصروفات',pos.expenses)}{tile('الباقي',pos.remaining,pos.remaining>0?'amber':'green')}{tile('صافي المحصل',pos.net)}</div>
  <p className="subtitle">الإجمالي = قيمة المطالبة + رسم أمر الأداء. الباقي = الإجمالي − المسدد (يشمل السداد الخارجي). صافي المحصل = المسدد − المصروفات. الحركات الملغاة لا تُحسب.</p>
  <div className="segmented" role="tablist" aria-label="حركات الملف">{PAYMENT_TYPES.map(([id,l])=><button type="button" role="tab" aria-selected={tab===id} key={id} className={tab===id?'on':''} onClick={()=>{setTab(id);setDraft(blankPayment(id));setError('')}}>{l}<span className="tab-count">{rows.filter(r=>r.payload.type===id&&r.payload.status!=='void').length}</span></button>)}</div>
  {editable&&<form className="statement-form" onSubmit={e=>{e.preventDefault();void add()}}><fieldset disabled={busy}><div className="form-grid">
   <DateField label="التاريخ" value={draft.date} onChange={v=>set('date',v)}/><Field label="المبلغ (د.ك)" value={draft.amount} onChange={v=>set('amount',v.replace(/[^0-9.]/g,''))} placeholder="0.000"/>
   {tab!=='expense'?<PickOrType key={tab} label="طريقة السداد" value={draft.method} onChange={v=>set('method',v)} options={PAYMENT_METHODS}/>:<Field label="بند المصروف" value={draft.method} onChange={v=>set('method',v)} suggestions={['رسوم أمر أداء','رسوم دعوى','رسوم إعلان','رسوم تنفيذ','مواصلات','أخرى']}/>}
   <Field label={tab==='external'?'مرجع السداد لدى الموكل':'رقم الإيصال / المرجع'} value={draft.reference} onChange={v=>set('reference',v)}/><Field label="ملاحظات" value={draft.notes} onChange={v=>set('notes',v)} wide/>
  </div>{error&&<p className="notice" role="alert">{error}</p>}<div className="actions"><button className="btn primary" type="submit"><Plus size={15}/> {tab==='payment'?'إضافة دفعة':tab==='external'?'إضافة سداد خارجي':'إضافة مصروف'}</button></div></fieldset></form>}
  {canPrint&&!!rows.length&&<button type="button" className="btn" onClick={print}><Printer size={15}/> طباعة كشف حساب الملف</button>}
  {!shown.length?<p className="notice soft"><AlertTriangle size={16}/> لا توجد {tab==='payment'?'دفعات على الملف':tab==='external'?'مبالغ سداد خارجي':'مصروفات'}</p>:
  <div className="table-wrap"><table className="office-table"><thead><tr><th>التاريخ</th><th>المبلغ</th><th>{tab==='expense'?'البند':'الطريقة'}</th><th>المرجع</th><th>سجّلها</th><th>الحالة</th>{editable&&<th/>}</tr></thead><tbody>{shown.map(r=><tr key={r.id} className={r.payload.status==='void'?'void-row':''}>
   <td className="nowrap">{formatDate(r.payload.date)}</td><td className="nowrap amount">{kwd(Number(r.payload.amountMinor||fils(r.payload.amount)))} د.ك</td><td>{r.payload.method||'—'}{r.payload.notes&&<small>{r.payload.notes}</small>}</td><td>{r.payload.reference||'—'}</td><td>{r.createdBy}<small>{officeTime(r.createdAt)}</small></td>
   <td>{r.payload.status==='void'?<span className="tag red" title={r.payload.voidReason}>ملغاة: {r.payload.voidReason}</span>:<span className="tag green">مسجلة</span>}</td>
   {editable&&<td className="row-actions">{r.payload.status!=='void'&&(voiding===r.id?<span className="void-inline"><input aria-label="سبب الإلغاء" value={reason} onChange={e=>setReason(e.target.value)} placeholder="سبب الإلغاء" autoFocus/><button type="button" className="btn" disabled={busy||!reason.trim()} onClick={()=>void cancel(r)}>تأكيد</button><button type="button" className="btn" onClick={()=>{setVoiding(null);setReason('')}}>تراجع</button></span>:<button type="button" className="icon-btn danger" aria-label="إلغاء الحركة" onClick={()=>{setVoiding(r.id);setReason('')}}><Ban size={14}/></button>)}</td>}
  </tr>)}</tbody></table></div>}
 </div>;
}
