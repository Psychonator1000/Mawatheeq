import {useEffect,useMemo,useState} from 'react';
import {Plus,Printer,Download,RotateCcw,Ban,Trash2,Check,HandCoins,FileMinus2,Link2,Unlink,ArrowRightLeft,UserPlus} from 'lucide-react';
import {toast} from 'sonner';
import {booksRequest} from '@/lib/local-auth';
import {DOC_KINDS,MOVE_STATES,PAYMENT_MATCH,PAYMENT_STATES,PARTNER_KINDS,daysLate,filsText,lineSubtotal,money,termSchedule,toFils,
 type BooksSetup,type Doc,type DocKind,type DocLine,type DocSummary,type InvoicingSetup,type PaymentTerm,type PaymentTermLine,type Product} from '@/lib/books';
import type {CaseSummary} from '@/lib/departments';
import {todayISO,formatDate} from '@/lib/domain';
import {clientName} from '@/lib/clients';
import {amountInWords} from '@/lib/document-fields';
import {invoiceHtml,printHtml} from '@/lib/print';
import {Field,DateField,Empty} from '../shared';
import {OfficeSelect} from '../office-shared';
import FilterSelect,{FilterBox,type FilterOption} from '../filter-select';
import PageNavigation from '../page-navigation';
import Needs from '../needs';
import {EditorDialog,exportCsv} from './shared';

export type FullSetup=BooksSetup&InvoicingSetup;
const amount=(v:string)=>money(toFils(v));
const fail=(e:unknown)=>toast.error((e as Error).message);
const popupBlocked=()=>toast.error('اسمح بالنوافذ المنبثقة في المتصفح للطباعة.');
const isInvoice=(k:DocKind)=>k==='out_invoice'||k==='out_refund'||k==='in_invoice'||k==='in_refund';
const sideOf=(k:DocKind)=>DOC_KINDS[k].side;
const partnerOptions=(setup:FullSetup,side:'customer'|'vendor',keep='')=>setup.partners.filter(p=>p.id===keep||(p.active&&(p.kind===side||p.kind==='both'||p.kind==='other'))).map(p=>({value:p.id,label:p.name,hint:PARTNER_KINDS[p.kind]}));
const caseOptions=(cases:CaseSummary[],keep='')=>cases.filter(c=>c.id===keep||!c.archived).map(c=>({value:c.id,label:`${c.code?'كود '+c.code:'بلا كود'} · ${clientName(c)} / ${c.opponent}`,hint:c.autoNumber?'الرقم الآلي '+c.autoNumber:undefined}));
const stateTag=(d:Pick<DocSummary,'state'|'paymentState'|'paymentType'>)=>d.state!=='posted'?<span className={'tag '+(d.state==='draft'?'amber':'')}>{MOVE_STATES[d.state]}</span>
 :<span className={'tag '+(d.paymentState==='paid'||d.paymentState==='reversed'?'green':d.paymentState==='partial'?'amber':'')}>{(d.paymentType?PAYMENT_MATCH:PAYMENT_STATES)[d.paymentState]}</span>;

/** A new invoice, bill or credit note, or a payment, ready to fill in. */
export function blankDoc(setup:FullSetup,kind:DocKind,partnerId=''):Doc{
 const pay=!isInvoice(kind),journal=setup.journals.find(j=>j.active&&(pay?j.type==='bank'||j.type==='cash':j.type===(sideOf(kind)==='customer'?'sale':'purchase')));
 return {id:'',journalId:journal?.id||'',name:'/',moveType:pay?'entry':kind,state:'draft',date:todayISO(),ref:'',narration:'',partnerId,caseId:'',reversedFrom:'',reversedBy:'',source:'',revision:0,createdBy:'',postedBy:'',postedAt:null,debit:'0',credit:'0',
  invoiceDateDue:null,paymentTermId:'',paymentType:pay?(kind==='customer_payment'?'inbound':'outbound'):'',partnerType:pay?sideOf(kind):'',amountTotal:'0',amountResidual:'0',paymentState:'not_paid',
  lines:pay?[{...blankDocLine(),kind:'payment'}]:[blankDocLine()],matches:[],outstanding:[]};
}
const blankDocLine=():DocLine=>({kind:'product',productId:'',accountId:'',partnerId:'',caseId:'',label:'',quantity:'1',priceUnit:'',discount:'',debit:'',credit:'',dateMaturity:null});

/** Invoices, bills, credit notes or payments of one kind, with what is still due. */
export function Documents({setup,cases,kind,partner,onPartner,onOpen,onNew,version,canExport}:{setup:FullSetup;cases:CaseSummary[];kind:DocKind;partner:string;onPartner:(id:string)=>void;onOpen:(id:string)=>void;onNew:()=>void;version:number;canExport:boolean}){
 const [state,setState]=useState(''),[paymentState,setPaymentState]=useState(''),[overdue,setOverdue]=useState(false),[q,setQ]=useState(''),[rows,setRows]=useState<DocSummary[]|null>(null),[error,setError]=useState(''),[page,setPage]=useState(1);
 useEffect(()=>{let live=true;const t=setTimeout(()=>{booksRequest<{documents:DocSummary[]}>('list_documents',{kind,state,paymentState,partnerId:partner,overdue:overdue?'1':'',q}).then(r=>{if(live){setRows(r.documents);setError('');setPage(1)}}).catch(e=>{if(live)setError((e as Error).message)})},q?250:0);return()=>{live=false;clearTimeout(t)}},[kind,state,paymentState,partner,overdue,q,version]);
 const pay=!isInvoice(kind),today=todayISO(),pName=(id:string)=>setup.partners.find(p=>p.id===id)?.name||'',cCode=(id:string)=>{const c=cases.find(x=>x.id===id);return c?c.code||c.autoNumber||'':''};
 const list=rows||[],pages=Math.max(1,Math.ceil(list.length/25)),current=Math.min(page,pages),open=list.filter(d=>d.state==='posted').reduce((t,d)=>t+toFils(d.amountResidual),0);
 const csv=()=>void exportCsv('accounting','Mawatheeq-'+kind,[['الرقم','الشريك','التاريخ',...(pay?[]:['الاستحقاق']),'المرجع','القضية','الإجمالي','المتبقي','الحالة'],
  ...list.map(d=>[d.name,pName(d.partnerId),d.date,...(pay?[]:[d.dueDate||'']),d.ref,cCode(d.caseId),d.amountTotal,d.amountResidual,d.state==='posted'?(pay?PAYMENT_MATCH:PAYMENT_STATES)[d.paymentState]:MOVE_STATES[d.state]])]).catch(fail);
 return <section className="panel"><div className="department-toolbar"><h2>{DOC_KINDS[kind].label}</h2><div className="actions">{canExport&&<button className="btn" onClick={csv}><Download size={15}/> تصدير</button>}
   {setup.canEdit&&<button className="btn primary" onClick={onNew}><Plus size={15}/> {DOC_KINDS[kind].one} جديد{kind.endsWith('invoice')?'ة':''}</button>}</div></div>
  <div className="department-filters"><FilterSelect label={sideOf(kind)==='customer'?'العميل':'المورد'} value={partner} onChange={onPartner} empty="الكل" options={partnerOptions(setup,sideOf(kind),partner)}/>
   <OfficeSelect label="الحالة" value={state} onChange={setState} empty="كل الحالات" options={Object.entries(MOVE_STATES) as [string,string][]}/>
   <OfficeSelect label={pay?'المطابقة':'الدفع'} value={paymentState} onChange={setPaymentState} empty="الكل" options={(pay?[['not_paid',PAYMENT_MATCH.not_paid],['partial',PAYMENT_MATCH.partial],['paid',PAYMENT_MATCH.paid]]:[['not_paid',PAYMENT_STATES.not_paid],['partial',PAYMENT_STATES.partial],['paid',PAYMENT_STATES.paid],['reversed',PAYMENT_STATES.reversed]]) as [string,string][]}/>
   <Field label="بحث" value={q} onChange={setQ} placeholder="الرقم أو المرجع أو الاسم"/></div>
  {!pay&&<label className="check"><input type="checkbox" checked={overdue} onChange={e=>setOverdue(e.target.checked)}/> المتأخرة عن الاستحقاق فقط</label>}
  {error&&<p className="notice" role="alert">{error}</p>}{!rows&&!error&&<p role="status">جارٍ التحميل…</p>}
  {rows&&<><div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الرقم</th><th>{sideOf(kind)==='customer'?'العميل':'المورد'}</th><th>التاريخ</th>{!pay&&<th>الاستحقاق</th>}<th>المرجع</th><th>القضية</th><th>الإجمالي</th><th>المتبقي</th><th>الحالة</th><th></th></tr></thead>
   <tbody>{list.slice((current-1)*25,current*25).map(d=>{const late=pay?0:daysLate(d.dueDate,today,d.state==='posted'?d.amountResidual:'0');
    return <tr key={d.id} className={d.state==='cancel'?'ledger-void':''}><td className="mono">{d.name==='/'?'مسودة':d.name}</td><td>{pName(d.partnerId)||'—'}</td><td>{formatDate(d.date)}</td>
     {!pay&&<td>{d.dueDate?formatDate(d.dueDate):'—'}{late>0&&<small className="books-late"> متأخرة {late} يوماً</small>}</td>}<td>{d.ref||'—'}</td><td>{cCode(d.caseId)||'—'}</td>
     <td className="ledger-value" dir="ltr">{amount(d.amountTotal)}</td><td className="ledger-value" dir="ltr">{d.state==='posted'?amount(d.amountResidual):'—'}</td><td>{stateTag(d)}</td><td><button className="btn" onClick={()=>onOpen(d.id)}>فتح</button></td></tr>})}</tbody>
   {list.length>0&&<tfoot><tr><th colSpan={pay?6:7}>المتبقي المفتوح</th><th dir="ltr">{money(open)}</th><th colSpan={2}></th></tr></tfoot>}</table></div>
   {!list.length&&<Empty text="لا توجد مستندات مطابقة."/>}<PageNavigation page={current} pages={pages} total={list.length} onChange={setPage}/></>}
 </section>;
}

/** An invoice, bill or credit note: its partner, dates, service lines and instalments; once confirmed, its payments. */
export function InvoiceEditor({setup,cases,initial,onClose,onChanged,onOpen,onSetup}:{setup:FullSetup;cases:CaseSummary[];initial:Doc;onClose:()=>void;onChanged:(d:Doc|null)=>void;onOpen:(id:string)=>void;onSetup:()=>void}){
 const kind=initial.moveType as DocKind,side=sideOf(kind),[d,setD]=useState<Doc>({...initial,lines:initial.lines.filter(l=>l.kind==='product').length?initial.lines.filter(l=>l.kind==='product'):[blankDocLine()]});
 const [busy,setBusy]=useState(false),[paying,setPaying]=useState(false),[crediting,setCrediting]=useState(false),[newPartner,setNewPartner]=useState('');
 const editable=setup.canEdit&&d.state==='draft',set=(p:Partial<Doc>)=>setD(x=>({...x,...p})),line=(i:number,p:Partial<DocLine>)=>setD(x=>({...x,lines:x.lines.map((l,k)=>k===i?{...l,...p}:l)}));
 const accounts:FilterOption[]=useMemo(()=>setup.accounts.filter(a=>!a.deprecated).map(a=>({value:a.id,label:a.code+' '+a.name})),[setup.accounts]);
 const products:FilterOption[]=setup.products.filter(p=>p.active&&(side==='customer'?p.incomeAccount:p.expenseAccount)).map(p=>({value:p.id,label:p.name,hint:money(toFils(side==='customer'?p.salePrice:p.purchasePrice))}));
 const lock=[setup.settings.fiscalLockDate,...(setup.canConfigure?[]:[setup.settings.lockDate])].filter(Boolean).sort().pop()||'';
 const subs=d.lines.map(l=>{try{return lineSubtotal(l.quantity,l.priceUnit,l.discount)}catch{return NaN}}),total=subs.reduce((t,s)=>t+(isNaN(s)?0:s),0);
 const term=setup.paymentTerms.find(t=>t.id===d.paymentTermId),schedule=termSchedule(total,term?term.lines:null,d.date,d.invoiceDateDue||'');
 const pickProduct=(i:number,id:string)=>{const p=setup.products.find(x=>x.id===id);line(i,{productId:id,...(p?{label:d.lines[i].label||p.name,accountId:(side==='customer'?p.incomeAccount:p.expenseAccount)||'',priceUnit:d.lines[i].priceUnit||filsText(toFils(side==='customer'?p.salePrice:p.purchasePrice))}:{})})};
 const needs=editable?[!d.journalId&&'اختر الدفتر',!d.date&&'اختر التاريخ',d.date&&lock&&d.date<=lock&&`التاريخ ضمن فترة مقفلة (حتى ${formatDate(lock)})`,subs.some(isNaN)&&'راجع الكميات والأسعار والخصم',
  d.lines.some((l,i)=>subs[i]>0&&!l.accountId)&&'اختر الحساب أو الخدمة في كل سطر',total<=0&&'أضف بنداً بمبلغ',!!d.invoiceDateDue&&d.invoiceDateDue<d.date&&'تاريخ الاستحقاق قبل تاريخ الفاتورة']:[];
 const postNeeds=[...needs,editable&&!d.partnerId?`اختر ${side==='customer'?'العميل':'المورد'}`:''].map(x=>typeof x==='string'?x:'');
 async function act(fn:()=>Promise<Doc|null>,done:string){setBusy(true);try{const r=await fn();toast.success(done);onChanged(r)}catch(e){fail(e)}finally{setBusy(false)}}
 const save=()=>booksRequest<Doc>('save_invoice',{invoice:{id:d.id||undefined,revision:d.revision,moveType:kind,journalId:d.journalId,date:d.date,dueDate:d.paymentTermId?'':d.invoiceDateDue||'',paymentTermId:d.paymentTermId,
  partnerId:d.partnerId,caseId:d.caseId,ref:d.ref,narration:d.narration,lines:d.lines.map(l=>({productId:l.productId,label:l.label,accountId:l.accountId,quantity:l.quantity,priceUnit:l.priceUnit,discount:l.discount,caseId:l.caseId}))}});
 const pName=setup.partners.find(p=>p.id===d.partnerId)?.name||'';
 function print(){const cs=cases.find(c=>c.id===d.caseId),paid=toFils(d.amountTotal)-toFils(d.amountResidual);
  if(!printHtml(invoiceHtml({title:DOC_KINDS[kind].one,number:d.name==='/'?'مسودة':d.name,date:d.date,due:d.invoiceDateDue||'',partner:pName,reference:d.ref,caseLabel:cs?(cs.code||cs.autoNumber||'')+' · '+clientName(cs):'',
   status:d.state==='posted'?PAYMENT_STATES[d.paymentState]:MOVE_STATES[d.state],lines:d.lines.map((l,i)=>({label:l.label,quantity:l.quantity,price:amount(l.priceUnit),discount:Number(l.discount||0)?l.discount+'٪':'',amount:money(subs[i]||0)})),
   total:money(total),paid:money(d.state==='posted'?paid:0),due_amount:money(d.state==='posted'?toFils(d.amountResidual):total),words:amountInWords(filsText(total)),schedule:schedule.length>1?schedule.map(s=>[s.date,money(s.amount)]):[],note:setup.invoicing.invoiceNote},formatDate(todayISO()),'')))popupBlocked()}
 async function addPartner(){setBusy(true);try{const p=await booksRequest<{id:string}>('save_partner',{partner:{name:newPartner.trim(),kind:side}});set({partnerId:p.id});setNewPartner('');onSetup();toast.success('أُضيف '+newPartner.trim())}catch(e){fail(e)}finally{setBusy(false)}}
 return <EditorDialog title={d.name==='/'?(d.id?DOC_KINDS[kind].one+' (مسودة)':DOC_KINDS[kind].one+' جديد'+(kind.endsWith('invoice')?'ة':'')):d.name} description={`${pName||'—'} · ${d.state==='posted'?PAYMENT_STATES[d.paymentState]:MOVE_STATES[d.state]}`} busy={busy} onClose={onClose}>
  <div className="books-editor">
   {d.reversedFrom&&<p className="muted">إشعار دائن لـ <button type="button" className="link" onClick={()=>onOpen(d.reversedFrom)}>الفاتورة الأصلية</button></p>}
   <div className="form-grid">
    <FilterSelect label={side==='customer'?'العميل':'المورد'} value={d.partnerId} onChange={v=>set({partnerId:v})} disabled={!editable} empty={`اختر ${side==='customer'?'العميل':'المورد'}`} options={partnerOptions(setup,side,d.partnerId)}/>
    {editable&&<div className="books-quick"><label className="field"><span>{side==='customer'?'عميل جديد':'مورد جديد'}</span><input value={newPartner} onChange={e=>setNewPartner(e.target.value)} placeholder="الاسم"/></label>
     <button type="button" className="btn" disabled={busy||!newPartner.trim()} onClick={()=>void addPartner()}><UserPlus size={15}/> إضافة</button></div>}
    {editable?<DateField label="تاريخ الفاتورة" value={d.date} onChange={v=>set({date:v})}/>:<label className="field"><span>تاريخ الفاتورة</span><input readOnly value={formatDate(d.date)}/></label>}
    <FilterSelect label="شرط الدفع" value={d.paymentTermId} onChange={v=>set({paymentTermId:v})} disabled={!editable} empty="تاريخ استحقاق محدد" options={setup.paymentTerms.filter(t=>t.active||t.id===d.paymentTermId).map(t=>({value:t.id,label:t.name}))}/>
    {!d.paymentTermId&&(editable?<DateField label="تاريخ الاستحقاق" value={d.invoiceDateDue||''} onChange={v=>set({invoiceDateDue:v||null})}/>:<label className="field"><span>تاريخ الاستحقاق</span><input readOnly value={d.invoiceDateDue?formatDate(d.invoiceDateDue):'—'}/></label>)}
    <label className="field"><span>المرجع</span><input value={d.ref} readOnly={!editable} onChange={e=>set({ref:e.target.value})} maxLength={200}/></label>
    <FilterSelect label="الدفتر" value={d.journalId} onChange={v=>set({journalId:v})} disabled={!editable||d.name!=='/'} options={setup.journals.filter(j=>j.type===(side==='customer'?'sale':'purchase')&&(j.active||j.id===d.journalId)).map(j=>({value:j.id,label:`${j.code} · ${j.name}`}))}/>
    <FilterSelect label="القضية" value={d.caseId} onChange={v=>set({caseId:v})} disabled={!editable} empty="غير مرتبطة بقضية" options={caseOptions(cases,d.caseId)} className="case-picker"/>
   </div>
   <div className="table-wrap"><table className="office-table books-lines books-invoice-lines"><thead><tr><th>الخدمة</th><th>البيان</th><th>الحساب</th><th>الكمية</th><th>السعر</th><th>خصم ٪</th><th>المبلغ</th>{editable&&<th></th>}</tr></thead>
    <tbody>{d.lines.map((l,i)=><tr key={i}>
     <td>{editable?<FilterBox label={`خدمة السطر ${i+1}`} value={l.productId} onChange={v=>pickProduct(i,v)} empty="بلا خدمة" options={products}/>:setup.products.find(p=>p.id===l.productId)?.name||'—'}</td>
     <td>{editable?<input aria-label={`بيان السطر ${i+1}`} value={l.label} onChange={e=>line(i,{label:e.target.value})} maxLength={300}/>:l.label}</td>
     <td>{editable?<FilterBox label={`حساب السطر ${i+1}`} value={l.accountId} onChange={v=>line(i,{accountId:v})} options={accounts}/>:accounts.find(a=>a.value===l.accountId)?.label}</td>
     <td>{editable?<input aria-label={`كمية السطر ${i+1}`} dir="ltr" inputMode="decimal" value={l.quantity} onChange={e=>line(i,{quantity:e.target.value})}/>:<span dir="ltr">{Number(l.quantity)}</span>}</td>
     <td>{editable?<input aria-label={`سعر السطر ${i+1}`} dir="ltr" inputMode="decimal" value={l.priceUnit} onChange={e=>line(i,{priceUnit:e.target.value})}/>:<span dir="ltr">{amount(l.priceUnit)}</span>}</td>
     <td>{editable?<input aria-label={`خصم السطر ${i+1}`} dir="ltr" inputMode="decimal" value={l.discount} onChange={e=>line(i,{discount:e.target.value})}/>:<span dir="ltr">{Number(l.discount)||''}</span>}</td>
     <td dir="ltr" className="ledger-value">{isNaN(subs[i])?'؟':money(subs[i])}</td>
     {editable&&<td><button type="button" className="btn icon" aria-label={`حذف السطر ${i+1}`} disabled={d.lines.length<=1} title={d.lines.length<=1?'يبقى سطر واحد على الأقل':undefined} onClick={()=>setD(x=>({...x,lines:x.lines.filter((_,k)=>k!==i)}))}><Trash2 size={14}/></button></td>}
    </tr>)}</tbody>
    <tfoot><tr><th colSpan={6}>الإجمالي (KWD)</th><th dir="ltr">{money(total)}</th>{editable&&<th></th>}</tr></tfoot></table></div>
   {editable&&<div className="actions"><button type="button" className="btn" onClick={()=>setD(x=>({...x,lines:[...x.lines,blankDocLine()]}))}><Plus size={15}/> بند</button></div>}
   {schedule.length>1&&<p className="muted">الدفعات: {schedule.map(s=>`${money(s.amount)} في ${formatDate(s.date)}`).join(' · ')}</p>}
   {d.state==='posted'&&<div className="books-payments">
    <dl className="books-totals"><div><dt>الإجمالي</dt><dd dir="ltr">{amount(d.amountTotal)}</dd></div><div><dt>المدفوع</dt><dd dir="ltr">{money(toFils(d.amountTotal)-toFils(d.amountResidual))}</dd></div><div className={toFils(d.amountResidual)?'':'net'}><dt>المتبقي</dt><dd dir="ltr">{amount(d.amountResidual)}</dd></div></dl>
    {d.matches.length>0&&<ul className="books-matches">{d.matches.map(m=><li key={m.partialId}><button type="button" className="link mono" onClick={()=>onOpen(m.moveId)}>{m.name}</button> · {formatDate(m.date)} · <b dir="ltr">{amount(m.amount)}</b>
     {setup.canEdit&&<button type="button" className="btn icon" aria-label={'فك مطابقة '+m.name} title="فك المطابقة" disabled={busy} onClick={()=>void act(()=>booksRequest<Doc>('remove_partial',{id:d.id,partialId:m.partialId}),'فُكت المطابقة')}><Unlink size={14}/></button>}</li>)}</ul>}
    {setup.canEdit&&d.outstanding.length>0&&<div className="books-outstanding"><b>أرصدة مفتوحة لهذا {side==='customer'?'العميل':'المورد'} يمكن استخدامها:</b>
     <ul>{d.outstanding.map(o=><li key={o.lineId}>{o.name} · {formatDate(o.date)} · <b dir="ltr">{amount(o.amount)}</b> <button type="button" className="btn" disabled={busy} onClick={()=>void act(()=>booksRequest<Doc>('add_outstanding',{id:d.id,lineId:o.lineId}),'طُبق الرصيد')}><Link2 size={14}/> استخدام</button></li>)}</ul></div>}
   </div>}
   <label className="field wide"><span>ملاحظات داخلية</span><textarea value={d.narration} readOnly={!editable} onChange={e=>set({narration:e.target.value})} maxLength={4000}/></label>
   {editable&&<Needs items={postNeeds}/>}
   {paying&&<RegisterPayment setup={setup} docs={[d]} onClose={()=>setPaying(false)} onDone={p=>{setPaying(false);toast.success('سُجلت الدفعة '+p.name);void booksRequest<Doc>('get_move',{id:d.id}).then(x=>onChanged(x),fail)}}/>}
   {crediting&&<CreditNote doc={d} lock={lock} onClose={()=>setCrediting(false)} onDone={c=>{setCrediting(false);toast.success('أُنشئ الإشعار الدائن');onChanged(c)}}/>}
   <div className="actions">
    {editable&&<><button className="btn primary" disabled={busy||postNeeds.some(Boolean)} onClick={()=>void act(async()=>{const s=await save();return booksRequest<Doc>('post',{id:s.id,revision:s.revision})},'أُكدت '+DOC_KINDS[kind].one)}><Check size={15}/> تأكيد</button>
     <button className="btn" disabled={busy||needs.some(Boolean)} onClick={()=>void act(save,'حُفظت المسودة')}>حفظ كمسودة</button></>}
    {setup.canEdit&&d.state==='posted'&&toFils(d.amountResidual)>0&&<button className="btn primary" disabled={busy} onClick={()=>setPaying(true)}><HandCoins size={15}/> تسجيل دفعة</button>}
    {setup.canEdit&&d.state==='posted'&&(kind==='out_invoice'||kind==='in_invoice')&&<button className="btn" disabled={busy} onClick={()=>setCrediting(true)}><FileMinus2 size={15}/> إشعار دائن</button>}
    {setup.canEdit&&d.id&&d.state!=='draft'&&<button className="btn" disabled={busy||!!(lock&&d.date<=lock)} title={lock&&d.date<=lock?'المستند ضمن فترة مقفلة':undefined} onClick={()=>void act(()=>booksRequest<Doc>('reset_draft',{id:d.id,revision:d.revision}),'أُعيد المستند إلى مسودة')}><RotateCcw size={15}/> إعادة إلى مسودة</button>}
    {setup.canEdit&&d.id&&d.state==='draft'&&<button className="btn" disabled={busy} onClick={()=>void act(()=>booksRequest<Doc>('cancel',{id:d.id,revision:d.revision}),'أُلغي المستند')}><Ban size={15}/> إلغاء</button>}
    {setup.canEdit&&d.id&&d.state==='draft'&&d.name==='/'&&<button className="btn danger" disabled={busy} onClick={()=>{if(confirm('حذف هذه المسودة نهائياً؟'))void act(async()=>{await booksRequest('delete_move',{id:d.id,revision:d.revision});return null},'حُذفت المسودة')}}><Trash2 size={15}/> حذف</button>}
    <button className="btn" onClick={print}><Printer size={15}/> طباعة</button>
    <button className="btn" disabled={busy} onClick={onClose}>إغلاق</button>
   </div>
  </div>
 </EditorDialog>;
}

/** Pay one or more confirmed invoices of a partner from a bank or cash journal, in full or in part. */
export function RegisterPayment({setup,docs,onClose,onDone}:{setup:FullSetup;docs:Doc[];onClose:()=>void;onDone:(p:Doc)=>void}){
 const due=docs.reduce((t,x)=>t+toFils(x.amountResidual),0),journals=setup.journals.filter(j=>j.active&&(j.type==='bank'||j.type==='cash'));
 const [journal,setJournal]=useState(journals[0]?.id||''),[date,setDate]=useState(todayISO()),[value,setValue]=useState(filsText(due)),[ref,setRef]=useState(''),[busy,setBusy]=useState(false);
 let paid=0,bad=false;try{paid=toFils(value)}catch{bad=true}
 const needs=[!journal&&'اختر دفتر البنك أو الصندوق',!date&&'اختر التاريخ',(bad||paid<=0)&&'اكتب مبلغاً صحيحاً'];
 return <div className="books-reverse panel"><h3>تسجيل دفعة</h3><div className="form-grid">
  <FilterSelect label="الدفع عبر" value={journal} onChange={setJournal} options={journals.map(j=>({value:j.id,label:`${j.code} · ${j.name}`}))}/>
  <DateField label="تاريخ الدفع" value={date} onChange={setDate}/>
  <label className="field"><span>المبلغ</span><input dir="ltr" inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)}/></label>
  <Field label="البيان" value={ref} onChange={setRef} placeholder={docs.map(x=>x.name).join('، ')}/></div>
  {!bad&&paid>0&&paid<due&&<p className="muted">دفعة جزئية: يبقى {money(due-paid)} مستحقاً.</p>}
  {!bad&&paid>due&&<p className="muted">المبلغ أكبر من المستحق؛ يبقى {money(paid-due)} رصيداً للشريك يُستخدم في فاتورة لاحقة.</p>}
  <Needs items={needs}/>
  <div className="actions"><button className="btn primary" disabled={busy||needs.some(Boolean)} onClick={()=>{setBusy(true);booksRequest<Doc>('register_payment',{moveIds:docs.map(x=>x.id),journalId:journal,date,amount:value,ref}).then(onDone,fail).finally(()=>setBusy(false))}}>
   <Check size={15}/> تسجيل الدفعة</button><button className="btn" onClick={onClose}>تراجع</button></div></div>;
}
function CreditNote({doc,lock,onClose,onDone}:{doc:Doc;lock:string;onClose:()=>void;onDone:(d:Doc)=>void}){
 const [date,setDate]=useState(todayISO()),[reason,setReason]=useState(''),[full,setFull]=useState(true),[busy,setBusy]=useState(false);
 return <div className="books-reverse panel"><h3>إشعار دائن</h3><p className="muted">يُنشأ إشعار بالبنود نفسها. اختر «عكس كامل» لتأكيده فوراً وتسوية الفاتورة به، أو اتركه مسودة لتعديل المبالغ (مثل خصم جزئي).</p>
  <div className="form-grid"><DateField label="تاريخ الإشعار" value={date} onChange={setDate}/><Field label="السبب" value={reason} onChange={setReason}/></div>
  <label className="check"><input type="checkbox" checked={full} onChange={e=>setFull(e.target.checked)}/> عكس كامل وتسوية الفاتورة</label>
  <Needs items={[date&&lock&&date<=lock?`التاريخ ضمن فترة مقفلة (حتى ${formatDate(lock)})`:'']}/>
  <div className="actions"><button className="btn primary" disabled={busy||!date||(!!lock&&date<=lock)} onClick={()=>{setBusy(true);booksRequest<Doc>('credit_note',{id:doc.id,date,reason,post:full}).then(onDone,fail).finally(()=>setBusy(false))}}>إنشاء الإشعار</button>
   <button className="btn" onClick={onClose}>تراجع</button></div></div>;
}

/** A payment received or made on its own: partner, bank or cash, amount; once posted, the documents it settles. */
export function PaymentEditor({setup,cases,initial,onClose,onChanged,onOpen}:{setup:FullSetup;cases:CaseSummary[];initial:Doc;onClose:()=>void;onChanged:(d:Doc|null)=>void;onOpen:(id:string)=>void}){
 const [d,setD]=useState(initial),[value,setValue]=useState(initial.id?filsText(toFils(initial.amountTotal)):''),[busy,setBusy]=useState(false);
 const side=d.partnerType||'customer',editable=setup.canEdit&&d.state==='draft',set=(p:Partial<Doc>)=>setD(x=>({...x,...p}));
 const lock=[setup.settings.fiscalLockDate,...(setup.canConfigure?[]:[setup.settings.lockDate])].filter(Boolean).sort().pop()||'';
 let bad=false;try{if(toFils(value)<=0)bad=true}catch{bad=true}
 const needs=editable?[!d.journalId&&'اختر دفتر البنك أو الصندوق',!d.date&&'اختر التاريخ',d.date&&lock&&d.date<=lock&&`التاريخ ضمن فترة مقفلة (حتى ${formatDate(lock)})`,bad&&'اكتب مبلغاً صحيحاً']:[];
 const postNeeds=[...needs,editable&&!d.partnerId?`اختر ${side==='customer'?'العميل':'المورد'}`:''].map(x=>typeof x==='string'?x:'');
 async function act(fn:()=>Promise<Doc|null>,done:string){setBusy(true);try{const r=await fn();toast.success(done);onChanged(r)}catch(e){fail(e)}finally{setBusy(false)}}
 const save=()=>booksRequest<Doc>('save_payment',{payment:{id:d.id||undefined,revision:d.revision,paymentType:d.paymentType,partnerType:side,partnerId:d.partnerId,journalId:d.journalId,date:d.date,amount:value,ref:d.ref,narration:d.narration,caseId:d.caseId}});
 const pName=setup.partners.find(p=>p.id===d.partnerId)?.name||'';
 function print(){if(!printHtml(invoiceHtml({title:d.paymentType==='inbound'?'سند قبض':'سند صرف',number:d.name==='/'?'مسودة':d.name,date:d.date,due:'',partner:pName,reference:d.ref,caseLabel:'',status:MOVE_STATES[d.state],
  lines:[{label:d.ref||(d.paymentType==='inbound'?'مقبوضات':'مدفوعات'),quantity:'1',price:amount(value||'0'),discount:'',amount:amount(value||'0')}],total:amount(value||'0'),paid:amount(value||'0'),due_amount:money(0),words:amountInWords(value),schedule:[],note:''},formatDate(todayISO()),'')))popupBlocked()}
 return <EditorDialog title={d.name==='/'?(d.paymentType==='inbound'?'سند قبض':'سند صرف')+(d.id?' (مسودة)':' جديد'):d.name} description={`${pName||'—'} · ${d.state==='posted'?PAYMENT_MATCH[d.paymentState]:MOVE_STATES[d.state]}`} busy={busy} onClose={onClose}>
  <div className="books-editor"><div className="form-grid">
   <OfficeSelect label="النوع" value={d.paymentType} onChange={v=>editable&&set({paymentType:v as 'inbound'|'outbound'})} options={side==='customer'?[['inbound','قبض من العميل'],['outbound','رد مبلغ للعميل']]:[['outbound','دفع للمورد'],['inbound','استرداد من المورد']]}/>
   <FilterSelect label={side==='customer'?'العميل':'المورد'} value={d.partnerId} onChange={v=>set({partnerId:v})} disabled={!editable} empty="اختر" options={partnerOptions(setup,side,d.partnerId)}/>
   <FilterSelect label="عبر" value={d.journalId} onChange={v=>set({journalId:v})} disabled={!editable||d.name!=='/'} options={setup.journals.filter(j=>(j.type==='bank'||j.type==='cash')&&(j.active||j.id===d.journalId)).map(j=>({value:j.id,label:`${j.code} · ${j.name}`}))}/>
   {editable?<DateField label="التاريخ" value={d.date} onChange={v=>set({date:v})}/>:<label className="field"><span>التاريخ</span><input readOnly value={formatDate(d.date)}/></label>}
   <label className="field"><span>المبلغ</span><input dir="ltr" inputMode="decimal" value={value} readOnly={!editable} onChange={e=>setValue(e.target.value)}/></label>
   <label className="field"><span>البيان</span><input value={d.ref} readOnly={!editable} onChange={e=>set({ref:e.target.value})} maxLength={200}/></label>
   <FilterSelect label="القضية" value={d.caseId} onChange={v=>set({caseId:v})} disabled={!editable} empty="غير مرتبطة بقضية" options={caseOptions(cases,d.caseId)} className="case-picker"/></div>
   {d.state==='posted'&&<div className="books-payments">
    {d.matches.length>0&&<><b>طُبقت على:</b><ul className="books-matches">{d.matches.map(m=><li key={m.partialId}><button type="button" className="link mono" onClick={()=>onOpen(m.moveId)}>{m.name}</button> · <b dir="ltr">{amount(m.amount)}</b>
     {setup.canEdit&&<button type="button" className="btn icon" aria-label={'فك مطابقة '+m.name} title="فك المطابقة" disabled={busy} onClick={()=>void act(()=>booksRequest<Doc>('remove_partial',{id:d.id,partialId:m.partialId}),'فُكت المطابقة')}><Unlink size={14}/></button>}</li>)}</ul></>}
    {toFils(d.amountResidual)>0&&<p className="muted">غير مستخدم بعد: <b dir="ltr">{amount(d.amountResidual)}</b></p>}
    {setup.canEdit&&d.outstanding.length>0&&<div className="books-outstanding"><b>مستندات مفتوحة لهذا الشريك:</b><ul>{d.outstanding.map(o=><li key={o.lineId}>{o.name} · {formatDate(o.date)} · <b dir="ltr">{amount(o.amount)}</b> <button type="button" className="btn" disabled={busy} onClick={()=>void act(()=>booksRequest<Doc>('add_outstanding',{id:d.id,lineId:o.lineId}),'طُبقت الدفعة')}><Link2 size={14}/> تطبيق</button></li>)}</ul></div>}
   </div>}
   {editable&&<Needs items={postNeeds}/>}
   <div className="actions">
    {editable&&<><button className="btn primary" disabled={busy||postNeeds.some(Boolean)} onClick={()=>void act(async()=>{const s=await save();return booksRequest<Doc>('post',{id:s.id,revision:s.revision})},'رُحّلت الدفعة')}><Check size={15}/> ترحيل</button>
     <button className="btn" disabled={busy||needs.some(Boolean)} onClick={()=>void act(save,'حُفظت المسودة')}>حفظ كمسودة</button></>}
    {setup.canEdit&&d.id&&d.state!=='draft'&&<button className="btn" disabled={busy||!!(lock&&d.date<=lock)} onClick={()=>void act(()=>booksRequest<Doc>('reset_draft',{id:d.id,revision:d.revision}),'أُعيدت الدفعة إلى مسودة')}><RotateCcw size={15}/> إعادة إلى مسودة</button>}
    {setup.canEdit&&d.id&&d.state==='draft'&&<button className="btn" disabled={busy} onClick={()=>void act(()=>booksRequest<Doc>('cancel',{id:d.id,revision:d.revision}),'أُلغيت الدفعة')}><Ban size={15}/> إلغاء</button>}
    {setup.canEdit&&d.id&&d.state==='draft'&&d.name==='/'&&<button className="btn danger" disabled={busy} onClick={()=>{if(confirm('حذف هذه المسودة نهائياً؟'))void act(async()=>{await booksRequest('delete_move',{id:d.id,revision:d.revision});return null},'حُذفت المسودة')}}><Trash2 size={15}/> حذف</button>}
    <button className="btn" onClick={print}><Printer size={15}/> طباعة السند</button><button className="btn" disabled={busy} onClick={onClose}>إغلاق</button>
   </div></div>
 </EditorDialog>;
}

/** «العملاء» or «الموردون»: their invoices, credit notes and payments, and who owes what. */
export function PartnerSide({setup,cases,side,onOpen,onNew,version,canExport}:{setup:FullSetup;cases:CaseSummary[];side:'customer'|'vendor';onOpen:(id:string)=>void;onNew:(kind:DocKind,partnerId:string)=>void;version:number;canExport:boolean}){
 const kinds:DocKind[]=side==='customer'?['out_invoice','out_refund','customer_payment']:['in_invoice','in_refund','vendor_payment'];
 const [tab,setTab]=useState<DocKind|'partners'>(kinds[0]),[partner,setPartner]=useState('');
 const s=setup.documentStats[kinds[0]],key=side==='customer'?'receivable':'payable';
 const partners=setup.partners.filter(p=>p.kind===side||p.kind==='both'||toFils(setup.partnerBalances[p.id]?.[key]||'0')!==0);
 return <>
  <div className="department-metrics books-metrics"><div><span>مسودات</span><b>{s?.draft??0}</b></div><div><span>{side==='customer'?'بانتظار التحصيل':'بانتظار الدفع'}</span><b dir="ltr">{amount(s?.openAmount||'0')}</b></div><div><span>متأخرة ({s?.late??0})</span><b dir="ltr">{amount(s?.lateAmount||'0')}</b></div></div>
  <div className="department-tabs view-switch" role="group" aria-label={side==='customer'?'العملاء':'الموردون'}>{[...kinds.map(k=>[k,DOC_KINDS[k].label] as const),['partners',side==='customer'?'أرصدة العملاء':'أرصدة الموردين'] as const].map(([k,l])=>
   <button key={k} className={'btn '+(tab===k?'primary':'')} aria-pressed={tab===k} onClick={()=>setTab(k)}>{l}</button>)}</div>
  {tab!=='partners'?<Documents setup={setup} cases={cases} kind={tab} partner={partner} onPartner={setPartner} onOpen={onOpen} onNew={()=>onNew(tab,partner)} version={version} canExport={canExport}/>
   :<section className="panel"><div className="table-wrap"><table className="office-table books-table"><thead><tr><th>{side==='customer'?'العميل':'المورد'}</th><th>الهاتف</th><th>{side==='customer'?'مستحق لنا':'مستحق علينا'}</th><th></th></tr></thead>
    <tbody>{partners.map(p=>{const b=toFils(setup.partnerBalances[p.id]?.[key]||'0');return <tr key={p.id}><td>{p.name}</td><td dir="ltr">{p.phone||'—'}</td><td className="ledger-value" dir="ltr">{money(b)}</td>
     <td><div className="actions"><button className="btn" onClick={()=>{setPartner(p.id);setTab(kinds[0])}}>المستندات</button>{setup.canEdit&&<button className="btn" onClick={()=>onNew(kinds[0],p.id)}><Plus size={14}/> {DOC_KINDS[kinds[0]].one}</button>}</div></td></tr>})}</tbody></table>
    {!partners.length&&<Empty title="لا يوجد شركاء بعد" text="أضفهم من الحسابات والإعدادات أو من داخل الفاتورة."/>}</div></section>}
 </>;
}

/** Services used on invoice lines, with the account each one goes to. */
export function ProductsPanel({setup,onChanged}:{setup:FullSetup;onChanged:()=>void}){
 const [p,setP]=useState<Product|null>(null),[busy,setBusy]=useState(false);
 const accounts=setup.accounts.filter(a=>!a.deprecated).map(a=>({value:a.id,label:a.code+' '+a.name})),name=(id:string)=>setup.accounts.find(a=>a.id===id)?.name||'—';
 return <><div className="actions"><button className="btn primary" disabled={!setup.canEdit} title={setup.canEdit?undefined:'صلاحيتك للقراءة فقط'} onClick={()=>setP({id:'',name:'',incomeAccount:'',expenseAccount:'',salePrice:'',purchasePrice:'',description:'',active:true,revision:0})}><Plus size={15}/> خدمة جديدة</button></div>
  <div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الخدمة</th><th>حساب الإيراد</th><th>سعر البيع</th><th>حساب المصروف</th><th>سعر الشراء</th><th></th></tr></thead>
   <tbody>{setup.products.map(x=><tr key={x.id} className={x.active?'':'ledger-void'}><td>{x.name}</td><td>{x.incomeAccount?name(x.incomeAccount):'—'}</td><td dir="ltr">{amount(x.salePrice)}</td><td>{x.expenseAccount?name(x.expenseAccount):'—'}</td><td dir="ltr">{amount(x.purchasePrice)}</td>
    <td><button className="btn" onClick={()=>setP(x)}>{setup.canEdit?'تعديل':'عرض'}</button></td></tr>)}</tbody></table></div>
  {p&&<EditorDialog title={p.id?p.name:'خدمة جديدة'} description="تظهر الخدمة في بنود الفواتير، ويذهب مبلغها إلى حسابها." busy={busy} onClose={()=>setP(null)}><div className="form-grid">
   <Field label="اسم الخدمة" value={p.name} onChange={v=>setP({...p,name:v})}/>
   <FilterSelect label="حساب الإيراد (للعملاء)" value={p.incomeAccount} onChange={v=>setP({...p,incomeAccount:v})} empty="لا تُباع" options={accounts}/>
   <label className="field"><span>سعر البيع</span><input dir="ltr" inputMode="decimal" value={p.salePrice} onChange={e=>setP({...p,salePrice:e.target.value})}/></label>
   <FilterSelect label="حساب المصروف (للموردين)" value={p.expenseAccount} onChange={v=>setP({...p,expenseAccount:v})} empty="لا تُشترى" options={accounts}/>
   <label className="field"><span>سعر الشراء</span><input dir="ltr" inputMode="decimal" value={p.purchasePrice} onChange={e=>setP({...p,purchasePrice:e.target.value})}/></label>
   {p.id&&<label className="check"><input type="checkbox" checked={p.active} onChange={e=>setP({...p,active:e.target.checked})}/> فعّالة</label>}
   <Field label="الوصف" value={p.description} onChange={v=>setP({...p,description:v})} wide multiline/></div>
   <Needs items={[!p.name.trim()&&'اكتب اسم الخدمة',!p.incomeAccount&&!p.expenseAccount&&'اختر حساب الإيراد أو المصروف']}/>
   <div className="actions">{setup.canEdit&&<button className="btn primary" disabled={busy||!p.name.trim()||(!p.incomeAccount&&!p.expenseAccount)} onClick={()=>{setBusy(true);booksRequest('save_product',{product:{...p,id:p.id||undefined}}).then(()=>{toast.success('حُفظت الخدمة');setP(null);onChanged()},fail).finally(()=>setBusy(false))}}>حفظ الخدمة</button>}<button className="btn" onClick={()=>setP(null)}>إغلاق</button></div>
  </EditorDialog>}</>;
}

/** Payment terms: instalments as a share of the total and days after the invoice date; the last one takes the rest. */
export function TermsPanel({setup,onChanged}:{setup:FullSetup;onChanged:()=>void}){
 const [t,setT]=useState<PaymentTerm|null>(null),[busy,setBusy]=useState(false),ro=!setup.canConfigure;
 const describe=(lines:PaymentTermLine[])=>lines.map(l=>(l.kind==='percent'?l.percent+'٪':'الباقي')+(l.days?` بعد ${l.days} يوماً`:' فوراً')).join('، ');
 const line=(i:number,p:Partial<PaymentTermLine>)=>t&&setT({...t,lines:t.lines.map((l,k)=>k===i?{...l,...p}:l)});
 const sum=t?t.lines.filter(l=>l.kind==='percent').reduce((s,l)=>s+Number(l.percent||0),0):0;
 return <><div className="actions"><button className="btn primary" disabled={ro} title={ro?'يحتاج صلاحية الإعدادات':undefined} onClick={()=>setT({id:'',name:'',lines:[{kind:'balance',days:30}],note:'',active:true,revision:0})}><Plus size={15}/> شرط دفع جديد</button></div>
  <div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الشرط</th><th>الدفعات</th><th></th></tr></thead>
   <tbody>{setup.paymentTerms.map(x=><tr key={x.id} className={x.active?'':'ledger-void'}><td>{x.name}</td><td>{describe(x.lines)}</td><td><button className="btn" onClick={()=>setT(x)}>{ro?'عرض':'تعديل'}</button></td></tr>)}</tbody></table></div>
  {t&&<EditorDialog title={t.id?t.name:'شرط دفع جديد'} description="آخر دفعة هي «الباقي»؛ ما قبلها نسب من الإجمالي." busy={busy} onClose={()=>setT(null)}>
   <Field label="اسم الشرط" value={t.name} onChange={v=>ro||setT({...t,name:v})}/>
   <div className="table-wrap"><table className="office-table"><thead><tr><th>الدفعة</th><th>النسبة ٪</th><th>بعد (أيام)</th>{!ro&&<th></th>}</tr></thead><tbody>{t.lines.map((l,i)=><tr key={i}><td>{l.kind==='balance'?'الباقي':'نسبة'}</td>
    <td>{l.kind==='percent'?<input aria-label={`نسبة الدفعة ${i+1}`} dir="ltr" inputMode="decimal" readOnly={ro} value={l.percent??''} onChange={e=>line(i,{percent:Number(e.target.value)||0})}/>:'—'}</td>
    <td><input aria-label={`أيام الدفعة ${i+1}`} dir="ltr" inputMode="numeric" readOnly={ro} value={l.days} onChange={e=>line(i,{days:Math.max(0,Math.floor(Number(e.target.value)||0))})}/></td>
    {!ro&&<td>{l.kind==='percent'&&<button type="button" className="btn icon" aria-label={`حذف الدفعة ${i+1}`} onClick={()=>setT({...t,lines:t.lines.filter((_,k)=>k!==i)})}><Trash2 size={14}/></button>}</td>}</tr>)}</tbody></table></div>
   {!ro&&<button type="button" className="btn" onClick={()=>setT({...t,lines:[{kind:'percent',percent:50,days:0},...t.lines]})}><Plus size={15}/> دفعة بنسبة</button>}
   {t.id&&<label className="check"><input type="checkbox" checked={t.active} disabled={ro} onChange={e=>setT({...t,active:e.target.checked})}/> فعّال</label>}
   <Needs items={ro?[]:[!t.name.trim()&&'اكتب اسم الشرط',sum>=100&&'مجموع النسب يجب أن يكون أقل من 100٪']}/>
   <div className="actions">{!ro&&<button className="btn primary" disabled={busy||!t.name.trim()||sum>=100} onClick={()=>{setBusy(true);booksRequest('save_term',{term:{...t,id:t.id||undefined}}).then(()=>{toast.success('حُفظ شرط الدفع');setT(null);onChanged()},fail).finally(()=>setBusy(false))}}>حفظ الشرط</button>}<button className="btn" onClick={()=>setT(null)}>إغلاق</button></div>
  </EditorDialog>}</>;
}

/** Receivable and payable accounts, the note printed on invoices, and moving the old simple ledger into the books. */
export function InvoicingPanel({setup,onChanged}:{setup:FullSetup;onChanged:()=>void}){
 const i=setup.invoicing,ro=!setup.canConfigure,[rec,setRec]=useState(i.receivableAccount),[pay,setPay]=useState(i.payableAccount),[note,setNote]=useState(i.invoiceNote),[busy,setBusy]=useState(false);
 const journals=setup.journals.filter(j=>j.active&&(j.type==='bank'||j.type==='cash')),[journal,setJournal]=useState(journals[0]?.id||''),[preview,setPreview]=useState<Record<string,number|boolean>|null>(null);
 const run=(dryRun:boolean)=>{setBusy(true);booksRequest<Record<string,number|boolean>>('convert_ledger',{journalId:journal,dryRun}).then(r=>{setPreview(r);if(!dryRun){toast.success('نُقل الدفتر القديم إلى الدفاتر');onChanged()}},fail).finally(()=>setBusy(false))};
 const n=(k:string)=>Number(preview?.[k]||0);
 return <div className="books-locks">
  <div className="form-grid">
   <FilterSelect label="حساب ذمم العملاء" value={rec} onChange={setRec} disabled={ro} options={setup.accounts.filter(a=>a.type==='asset_receivable'&&a.reconcile).map(a=>({value:a.id,label:a.code+' '+a.name}))}/>
   <FilterSelect label="حساب ذمم الموردين" value={pay} onChange={setPay} disabled={ro} options={setup.accounts.filter(a=>a.type==='liability_payable'&&a.reconcile).map(a=>({value:a.id,label:a.code+' '+a.name}))}/>
   <label className="field wide"><span>ملاحظة تُطبع أسفل الفواتير</span><textarea value={note} readOnly={ro} onChange={e=>setNote(e.target.value)} maxLength={2000}/></label></div>
  {!ro&&<div className="actions"><button className="btn primary" disabled={busy} onClick={()=>{setBusy(true);booksRequest('save_invoicing',{receivableAccount:rec,payableAccount:pay,invoiceNote:note,revision:i.revision}).then(()=>{toast.success('حُفظت إعدادات الفوترة');onChanged()},fail).finally(()=>setBusy(false))}}>حفظ</button></div>}
  {!ro&&<section className="books-reverse panel"><h3><ArrowRightLeft size={16}/> نقل «دفتر الحركات» القديم إلى الدفاتر</h3>
   <p className="muted">مرة واحدة: الأتعاب المستحقة تصبح فواتير عملاء، والمقبوضات دفعات تُطبق على أقدم فواتير الطرف نفسه، والمصروفات فواتير موردين مدفوعة. القيود الملغاة والعملات غير الدينار لا تُنقل. النقل مرة ثانية لا يكرر شيئاً.</p>
   <div className="form-grid"><FilterSelect label="المقبوضات والمصروفات عبر" value={journal} onChange={setJournal} options={journals.map(j=>({value:j.id,label:`${j.code} · ${j.name}`}))}/></div>
   {preview&&<dl className="roll-stats"><div><dt>أتعاب → فواتير</dt><dd>{n('fees')}</dd></div><div><dt>مقبوضات → دفعات</dt><dd>{n('receipts')}</dd></div><div><dt>مصروفات → فواتير مدفوعة</dt><dd>{n('expenses')}</dd></div>
    <div><dt>شركاء جدد</dt><dd>{n('partners')}</dd></div><div><dt>نُقلت من قبل</dt><dd>{n('already')}</dd></div><div><dt>لا تُنقل (ملغاة / عملة أخرى / فترة مقفلة)</dt><dd>{n('skippedVoid')+n('skippedCurrency')+n('skippedLocked')}</dd></div></dl>}
   <div className="actions"><button className="btn" disabled={busy||!journal} onClick={()=>run(true)}>معاينة</button>
    <button className="btn primary" disabled={busy||!preview||!preview.dryRun||!(n('fees')+n('receipts')+n('expenses'))} title={!preview?'اعرض المعاينة أولاً':undefined} onClick={()=>run(false)}>نقل إلى الدفاتر</button></div></section>}
 </div>;
}
