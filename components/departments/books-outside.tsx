import {useEffect,useMemo,useState} from 'react';
import {Plus,Check,Ban,Printer,ArrowLeftRight,FileText,Receipt} from 'lucide-react';
import {toast} from 'sonner';
import {booksRequest} from '@/lib/local-auth';
import {money,toFils,filsText,type BooksSetup,type Doc,type Product} from '@/lib/books';
import {OUTSIDE_BODIES} from '@/lib/archive';
import {todayISO,formatDate} from '@/lib/domain';
import {listHtml,printHtml} from '@/lib/print';
import {Field,DateField,Empty} from '../shared';
import {OfficeSelect} from '../office-shared';
import FilterSelect from '../filter-select';
import Needs from '../needs';
import {EditorDialog} from './shared';

/** Kinds of money handled outside the office for a case, and the papers that prove them. */
export const OUTSIDE_KINDS=['رسوم قيد دعوى','رسوم استئناف','رسوم طعن بالتمييز','رسوم تنفيذ','رسوم إعلان','رسوم صورة رسمية أو صيغة تنفيذية','رسوم شهادة','أمانة خبير','كفالة','إيداع لدى إدارة التنفيذ','صرف من إدارة التنفيذ','غرامة','رسوم حجز','أخرى'];
export const OUTSIDE_DOCS=['إيصال رسوم','إيصال إيداع','شيك','سند قبض','أمر صرف','إشعار بنكي','محضر','لا يوجد'];
export const ORIGINAL_STATES={none:'لا يوجد أصل',staff:'مع موظف أو مندوب',safe:'في خزنة المكتب',archive:'في ملف الأرشيف',court:'لدى الجهة',client:'سُلّم للموكل',lost:'مفقود'} as const;
export const OUTSIDE_METHODS={cash:'نقداً من الصندوق',petty:'من عهدة المندوب',cheque:'شيك',knet:'كي نت',transfer:'تحويل بنكي'} as const;
const STATES={draft:'مسودة',posted:'مرحّلة',billed:'مفوترة للموكل',cancelled:'ملغاة'} as const;
export type Outside={id:string;caseId:string;partnerId:string;date:string;kind:string;direction:'out'|'in';entity:string;amount:string;method:keyof typeof OUTSIDE_METHODS;reference:string;chequeNumber:string;docType:string;handledBy:string;
 billable:boolean;state:keyof typeof STATES;journalId:string;moveId:string;moveName:string;invoiceId:string;invoiceName:string;originalState:keyof typeof ORIGINAL_STATES;originalHolder:string;archiveRef:string;notes:string;revision:number;createdBy:string;
 custody:{date:string;toState:string;holder:string;note:string;by:string;at:string}[]};
type CaseLite={id:string;code?:string;autoNumber?:string;client?:string;archived?:boolean;clientEntityId?:string};
const amount=(v:string)=>money(toFils(v));
// A request sent for approval was announced already; it is not an error.
const fail=(e:unknown)=>{if(!(e as {handled?:boolean}).handled)toast.error((e as Error).message)};
const popupBlocked=()=>toast.error('اسمح بالنوافذ المنبثقة في المتصفح للطباعة.');
const caseLabel=(c?:CaseLite)=>c?((c.code||c.autoNumber||'')+' · '+(c.client||'')):'';
const blank=(caseId=''):Outside=>({id:'',caseId,partnerId:'',date:todayISO(),kind:'',direction:'out',entity:'',amount:'',method:'petty',reference:'',chequeNumber:'',docType:'إيصال رسوم',handledBy:'',billable:true,state:'draft',
 journalId:'',moveId:'',moveName:'',invoiceId:'',invoiceName:'',originalState:'staff',originalHolder:'',archiveRef:'',notes:'',revision:0,createdBy:'',custody:[]});
/** The bank or cash journal a method draws from by default. */
const journalFor=(setup:BooksSetup,method:string)=>setup.journals.find(j=>j.active&&(method==='petty'?j.code==='CSH2':method==='cash'?j.type==='cash'&&j.code!=='CSH2':j.type==='bank'))?.id||setup.journals.find(j=>j.active&&(j.type==='bank'||j.type==='cash'))?.id||'';

/**
 * «المعاملات الخارجية والأصول»: money paid or received outside the office for a case — court and execution fees,
 * deposits, withdrawals, expert fees — with the paper that proves each one and where its ORIGINAL is right now.
 */
export default function OutsideView({setup,cases,onOpen,version,onChanged}:{setup:BooksSetup;cases:CaseLite[];onOpen:(id:string)=>void;version:number;onChanged:()=>void}){
 const [rows,setRows]=useState<Outside[]|null>(null),[v,setV]=useState(0),[state,setState]=useState(''),[original,setOriginal]=useState(''),[caseId,setCaseId]=useState(''),[q,setQ]=useState(''),[editing,setEditing]=useState<Outside|null>(null),[picked,setPicked]=useState<string[]>([]),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;const t=setTimeout(()=>{booksRequest<Outside[]>('list_outside',{state,original,caseId,q}).then(r=>{if(live)setRows(r)},fail)},q?250:0);return()=>{live=false;clearTimeout(t)}},[state,original,caseId,q,version,v]);
 const refresh=()=>{setV(x=>x+1);onChanged()};
 const byId=useMemo(()=>new Map(cases.map(c=>[c.id,c])),[cases]);
 const billable=(o:Outside)=>o.state==='posted'&&o.billable&&o.direction==='out'&&!!o.partnerId;
 const bill=()=>{setBusy(true);booksRequest<Doc>('bill_outside',{ids:picked}).then(d=>{toast.success('أُنشئت فاتورة مسودة للموكل');setPicked([]);refresh();onOpen(d.id)},fail).finally(()=>setBusy(false))};
 const print=()=>{if(!rows)return;if(!printHtml(listHtml('سجل المعاملات الخارجية والأصول','مكان كل أصل (إيصال، شيك، سند) حتى '+formatDate(todayISO()),['التاريخ','القضية','المعاملة','الجهة','المرجع','المبلغ','الأصل','مع / في'],
  rows.map(o=>[formatDate(o.date),caseLabel(byId.get(o.caseId)),o.kind+(o.direction==='in'?' (مقبوض)':''),o.entity,[o.docType,o.reference,o.chequeNumber&&'شيك '+o.chequeNumber].filter(Boolean).join(' · '),amount(o.amount),ORIGINAL_STATES[o.originalState],o.originalState==='archive'?o.archiveRef:o.originalHolder]),formatDate(todayISO()),'')))popupBlocked()};
 const out=rows?rows.filter(o=>o.originalState==='staff'||o.originalState==='court').length:0,lost=rows?rows.filter(o=>o.originalState==='lost').length:0;
 return <section className="panel"><div className="department-toolbar"><h2>المعاملات الخارجية والأصول</h2><div className="actions">
   {picked.length>0&&<button className="btn primary" disabled={busy} onClick={bill}><FileText size={15}/> مطالبة الموكل ({picked.length})</button>}
   <button className="btn" onClick={print} disabled={!rows}><Printer size={15}/> طباعة السجل</button>{setup.canEdit&&<button className="btn primary" onClick={()=>setEditing(blank(caseId))}><Plus size={15}/> معاملة جديدة</button>}</div></div>
  <p className="muted">كل مبلغ دُفع أو استُلم خارج المكتب لقضية (المحكمة، إدارة التنفيذ، الخبراء…)، والمستند الذي يثبته، وأين أصله الآن. ما دُفع عن الموكل يُطالَب به في فاتورة.</p>
  {(out>0||lost>0)&&<div className="books-due">{out>0&&<span className="tag amber">{out} أصل خارج المكتب أو مع موظف</span>}{lost>0&&<span className="tag">{lost} أصل مفقود</span>}</div>}
  <div className="department-filters"><FilterSelect label="القضية" value={caseId} onChange={setCaseId} empty="كل القضايا" options={cases.map(c=>({value:c.id,label:caseLabel(c)}))}/>
   <OfficeSelect label="الحالة" value={state} onChange={setState} empty="كل الحالات" options={Object.entries(STATES) as [string,string][]}/>
   <OfficeSelect label="مكان الأصل" value={original} onChange={setOriginal} empty="كل الأماكن" options={Object.entries(ORIGINAL_STATES) as [string,string][]}/>
   <Field label="بحث" value={q} onChange={setQ} placeholder="المرجع، الشيك، الجهة، الموظف"/></div>
  {!rows&&<p role="status">جارٍ التحميل…</p>}
  {rows&&<div className="table-wrap"><table className="office-table books-table"><thead><tr>{setup.canEdit&&<th aria-label="تحديد"></th>}<th>التاريخ</th><th>القضية</th><th>المعاملة</th><th>الجهة</th><th>المستند</th><th>المبلغ</th><th>الأصل</th><th>الحالة</th><th></th></tr></thead>
   <tbody>{rows.map(o=><tr key={o.id} className={o.state==='cancelled'?'ledger-void':''}>{setup.canEdit&&<td>{billable(o)&&<input type="checkbox" aria-label={'تحديد '+o.kind+' '+o.reference} checked={picked.includes(o.id)} onChange={e=>setPicked(p=>e.target.checked?[...p,o.id]:p.filter(x=>x!==o.id))}/>}</td>}
    <td>{formatDate(o.date)}</td><td>{caseLabel(byId.get(o.caseId))||'—'}</td><td>{o.kind}{o.direction==='in'&&<small className="books-in"> مقبوض</small>}</td><td>{o.entity||'—'}</td><td>{[o.docType,o.reference].filter(Boolean).join(' ')||'—'}{o.chequeNumber&&<small> · شيك {o.chequeNumber}</small>}</td>
    <td dir="ltr">{amount(o.amount)}</td><td><span className={'tag '+(o.originalState==='lost'?'':o.originalState==='staff'||o.originalState==='court'?'amber':'green')}>{ORIGINAL_STATES[o.originalState]}</span><small> {o.originalState==='archive'?o.archiveRef:o.originalHolder}</small></td>
    <td>{STATES[o.state]}</td><td><button className="btn" onClick={()=>setEditing(o)}>فتح</button></td></tr>)}</tbody></table>{!rows.length&&<Empty title="لا توجد معاملات" text="سجّل كل رسم أو إيداع أو صرف تم خارج المكتب، ومكان أصل إيصاله."/>}</div>}
  {editing&&<OutsideEditor setup={setup} cases={cases} initial={editing} onOpen={onOpen} onClose={()=>setEditing(null)} onChanged={o=>{refresh();setEditing(o)}}/>}
 </section>;
}

/** One outside transaction: what, for which case, how it was paid, the proof, and where the original is, with its hand-over log. */
export function OutsideEditor({setup,cases,initial,onOpen,onClose,onChanged}:{setup:BooksSetup;cases:CaseLite[];initial:Outside;onOpen?:(id:string)=>void;onClose:()=>void;onChanged:(o:Outside)=>void}){
 const [o,setO]=useState(initial),[busy,setBusy]=useState(false),[journal,setJournal]=useState(journalFor(setup,initial.method)),[move,setMove]=useState<{toState:string;holder:string;note:string;archiveRef:string}|null>(null),[cancel,setCancel]=useState('');
 const draft=o.state==='draft',edit=setup.canEdit&&o.state!=='cancelled',set=(p:Partial<Outside>)=>setO(x=>({...x,...p}));
 let bad=false;try{if(toFils(o.amount)<=0)bad=true}catch{bad=true}
 const needs=[o.kind?'':'اختر نوع المعاملة',bad&&draft?'اكتب المبلغ':'',o.method==='cheque'&&!o.chequeNumber.trim()?'اكتب رقم الشيك':'',o.date?'':'اختر التاريخ'];
 const act=(fn:()=>Promise<Outside>,done:string)=>{setBusy(true);fn().then(r=>{toast.success(done);setO(r);onChanged(r)},fail).finally(()=>setBusy(false))};
 const save=()=>booksRequest<Outside>('save_outside',{outside:{...o,id:o.id||undefined}});
 return <EditorDialog title={o.id?o.kind:'معاملة خارجية جديدة'} description={o.id?`${STATES[o.state]}${o.moveName?' · '+o.moveName:''}${o.createdBy?' · سجّلها '+o.createdBy:''}`:'رسم أو إيداع أو صرف تم خارج المكتب، والمستند الذي يثبته ومكان أصله.'} busy={busy} onClose={onClose}>
  <div className="books-editor"><div className="form-grid">
   <OfficeSelect label="العملية" value={o.direction} onChange={v=>draft&&set({direction:v as 'out'|'in',billable:v==='out'})} options={[['out','دفعنا مبلغاً'],['in','استلمنا مبلغاً']]}/>
   <FilterSelect label="نوع المعاملة" value={o.kind} onChange={v=>set({kind:v})} disabled={!draft} options={OUTSIDE_KINDS.map(k=>({value:k,label:k}))}/>
   <FilterSelect label="القضية" value={o.caseId} onChange={v=>set({caseId:v})} disabled={!draft} empty="بلا قضية" options={cases.filter(c=>!c.archived||c.id===o.caseId).map(c=>({value:c.id,label:caseLabel(c)}))}/>
   {draft?<DateField label="التاريخ" value={o.date} onChange={v=>set({date:v})}/>:<label className="field"><span>التاريخ</span><input readOnly value={formatDate(o.date)}/></label>}
   <label className="field"><span>المبلغ</span><input dir="ltr" inputMode="decimal" value={o.amount} readOnly={!draft} onChange={e=>set({amount:e.target.value})}/></label>
   <FilterSelect label="الجهة" value={o.entity} onChange={v=>set({entity:v})} disabled={!edit} empty="—" options={[...new Set([...OUTSIDE_BODIES,o.entity].filter(Boolean))].map(b=>({value:b,label:b}))}/>
   <OfficeSelect label="طريقة الدفع" value={o.method} onChange={v=>{if(draft){set({method:v as Outside['method']});setJournal(journalFor(setup,v))}}} options={Object.entries(OUTSIDE_METHODS) as [string,string][]}/>
   {o.method==='cheque'&&<label className="field"><span>رقم الشيك</span><input dir="ltr" value={o.chequeNumber} readOnly={!draft} onChange={e=>set({chequeNumber:e.target.value})}/></label>}
   <FilterSelect label="المستند" value={o.docType} onChange={v=>set({docType:v})} disabled={!edit} options={OUTSIDE_DOCS.map(d=>({value:d,label:d}))}/>
   <label className="field"><span>رقم الإيصال / المرجع</span><input dir="ltr" value={o.reference} readOnly={!edit} onChange={e=>set({reference:e.target.value})}/></label>
   <label className="field"><span>نفّذها (الموظف أو المندوب)</span><input value={o.handledBy} readOnly={!edit} onChange={e=>set({handledBy:e.target.value})}/></label>
   {o.direction==='out'&&<label className="check"><input type="checkbox" checked={o.billable} disabled={!draft} onChange={e=>set({billable:e.target.checked})}/> دُفع عن الموكل ويُطالَب به (وإلا فهو مصروف على المكتب)</label>}
   {!o.id&&<><OfficeSelect label="أين الأصل الآن" value={o.originalState} onChange={v=>set({originalState:v as Outside['originalState']})} options={Object.entries(ORIGINAL_STATES) as [string,string][]}/>
    <label className="field"><span>{o.originalState==='archive'?'رقم ملف الأرشيف':'مع من / لدى أي جهة'}</span><input value={o.originalState==='archive'?o.archiveRef:o.originalHolder} onChange={e=>set(o.originalState==='archive'?{archiveRef:e.target.value}:{originalHolder:e.target.value})}/></label></>}
   <Field label="ملاحظات" value={o.notes} onChange={v=>edit&&set({notes:v})} wide multiline/></div>
  {o.id&&<section className="books-original"><h3>الأصل: <span className={'tag '+(o.originalState==='lost'?'':o.originalState==='staff'||o.originalState==='court'?'amber':'green')}>{ORIGINAL_STATES[o.originalState]}</span> {o.originalState==='archive'?o.archiveRef:o.originalHolder}</h3>
   <ol className="books-custody">{o.custody.map((c,i)=><li key={i}><b>{ORIGINAL_STATES[c.toState as keyof typeof ORIGINAL_STATES]||c.toState}</b>{c.holder&&` — ${c.holder}`} · {formatDate(c.date)} · {c.by}{c.note&&<small> · {c.note}</small>}</li>)}</ol>
   {edit&&!move&&<button className="btn" onClick={()=>setMove({toState:o.originalState==='staff'?'safe':'archive',holder:'',note:'',archiveRef:o.archiveRef})}><ArrowLeftRight size={15}/> نقل الأصل</button>}
   {move&&<div className="books-reverse panel"><div className="form-grid"><OfficeSelect label="إلى" value={move.toState} onChange={v=>setMove({...move,toState:v})} options={Object.entries(ORIGINAL_STATES) as [string,string][]}/>
    <label className="field"><span>{move.toState==='archive'?'رقم ملف الأرشيف':'مع من / لدى أي جهة'}</span><input value={move.toState==='archive'?move.archiveRef:move.holder} onChange={e=>setMove(move.toState==='archive'?{...move,archiveRef:e.target.value}:{...move,holder:e.target.value})}/></label>
    <Field label="ملاحظة" value={move.note} onChange={v=>setMove({...move,note:v})}/></div>
    <Needs items={[['staff','court','client'].includes(move.toState)&&!move.holder.trim()?'اكتب اسم المستلم أو الجهة':'']}/>
    <div className="actions"><button className="btn primary" disabled={busy||(['staff','court','client'].includes(move.toState)&&!move.holder.trim())} onClick={()=>{act(()=>booksRequest<Outside>('move_original',{id:o.id,...move}),'سُجّل نقل الأصل');setMove(null)}}>تسجيل</button><button className="btn" onClick={()=>setMove(null)}>تراجع</button></div></div>}
  </section>}
  {setup.canEdit&&draft&&o.id&&<div className="form-grid"><FilterSelect label="دُفع من / دخل إلى" value={journal} onChange={setJournal} options={setup.journals.filter(j=>j.active&&(j.type==='bank'||j.type==='cash')).map(j=>({value:j.id,label:`${j.code} · ${j.name}`}))}/></div>}
  {cancel!==''&&<div className="books-reverse panel"><DateField label="تاريخ الإلغاء" value={cancel} onChange={setCancel}/><div className="actions"><button className="btn danger" disabled={busy||!cancel} onClick={()=>act(()=>booksRequest<Outside>('cancel_outside',{id:o.id,date:cancel}),'أُلغيت المعاملة')}>تأكيد الإلغاء</button><button className="btn" onClick={()=>setCancel('')}>تراجع</button></div></div>}
  {edit&&<Needs items={needs}/>}
  <div className="actions">
   {edit&&<button className="btn primary" disabled={busy||needs.some(Boolean)} onClick={()=>act(save,'حُفظت المعاملة')}>حفظ</button>}
   {setup.canEdit&&draft&&o.id&&<button className="btn primary" disabled={busy||!journal} onClick={()=>act(async()=>{await save();return booksRequest<Outside>('post_outside',{id:o.id,journalId:journal})},'رُحّلت إلى الدفاتر')}><Check size={15}/> ترحيل إلى الدفاتر</button>}
   {setup.canEdit&&o.id&&(o.state==='draft'||o.state==='posted')&&cancel===''&&<button className="btn" onClick={()=>setCancel(todayISO())}><Ban size={15}/> إلغاء</button>}
   {o.moveId&&onOpen&&<button className="btn" onClick={()=>onOpen(o.moveId)}>القيد {o.moveName}</button>}
   {o.invoiceId&&onOpen&&<button className="btn" onClick={()=>onOpen(o.invoiceId)}>الفاتورة {o.invoiceName||''}</button>}
   <button className="btn" onClick={onClose}>إغلاق</button></div>
 </div></EditorDialog>;
}

/** A fee invoice made from a case or collection file: the client becomes the accounting partner, the case is set. */
export function QuickInvoice({caseId,client,clientEntityId,reference='',onClose,onDone}:{caseId:string;client:string;clientEntityId?:string;reference?:string;onClose:()=>void;onDone:(d:Doc)=>void}){
 const [setup,setSetup]=useState<(BooksSetup&{products?:Product[]})|null>(null),[product,setProduct]=useState(''),[label,setLabel]=useState(''),[price,setPrice]=useState(''),[date,setDate]=useState(todayISO()),[due,setDue]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;booksRequest<BooksSetup&{products?:Product[]}>('setup').then(s=>{if(!live)return;setSetup(s);const p=s.products?.find(x=>x.name==='أتعاب محاماة');if(p){setProduct(p.id);if(toFils(p.salePrice))setPrice(filsText(toFils(p.salePrice)))}},fail);return()=>{live=false}},[]);
 const products=(setup?.products||[]).filter(p=>p.active&&p.incomeAccount);
 let bad=false;try{if(toFils(price)<=0)bad=true}catch{bad=true}
 const go=(post:boolean)=>{if(!setup)return;setBusy(true);(async()=>{const partner=await booksRequest<{id:string}>('partner_for_client',{name:client,clientEntityId:clientEntityId||''});
  const journal=setup.journals.find(j=>j.active&&j.type==='sale');if(!journal)throw new Error('لا يوجد دفتر مبيعات فعال.');
  const d=await booksRequest<Doc>('save_invoice',{invoice:{moveType:'out_invoice',journalId:journal.id,date,dueDate:due,partnerId:partner.id,caseId,ref:reference,lines:[{productId:product,label:label||products.find(p=>p.id===product)?.name||'أتعاب',priceUnit:price,quantity:'1'}]}});
  return post?booksRequest<Doc>('post',{id:d.id,revision:d.revision}):d})().then(d=>{toast.success(post?'أُكدت فاتورة الأتعاب '+d.name:'حُفظت فاتورة الأتعاب مسودة');onDone(d)},fail).finally(()=>setBusy(false))};
 return <EditorDialog title="فاتورة أتعاب" description={`للموكل ${client||'—'}${caseId?'، مرتبطة بهذه القضية':''}${reference?' · '+reference:''}. تُراجع وتُدفع من «المحاسبة» › «الموكلون».`} busy={busy} onClose={onClose}>
  {!setup?<p role="status">جارٍ التحميل…</p>:<><div className="form-grid">
   <FilterSelect label="الخدمة" value={product} onChange={v=>{setProduct(v);const p=products.find(x=>x.id===v);if(p&&toFils(p.salePrice)&&!price)setPrice(filsText(toFils(p.salePrice)))}} options={products.map(p=>({value:p.id,label:p.name}))}/>
   <Field label="البيان" value={label} onChange={setLabel} placeholder="مثل أتعاب الدرجة الأولى"/>
   <label className="field"><span>المبلغ</span><input dir="ltr" inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)}/></label>
   <DateField label="التاريخ" value={date} onChange={setDate}/><DateField label="تاريخ الاستحقاق" value={due} onChange={setDue}/></div>
   <Needs items={[product?'':'اختر الخدمة',bad?'اكتب المبلغ':'',client?'':'لا يوجد اسم موكل لهذه القضية']}/>
   <div className="actions"><button className="btn primary" disabled={busy||!product||bad||!client} onClick={()=>go(true)}><Check size={15}/> تأكيد الفاتورة</button><button className="btn" disabled={busy||!product||bad||!client} onClick={()=>go(false)}>حفظ كمسودة</button><button className="btn" onClick={onClose}>إغلاق</button></div></>}
 </EditorDialog>;
}

type CaseBooksData={documents:{id:string;name:string;moveType:string;paymentType:string;state:string;date:string;dueDate:string|null;amountTotal:string;amountResidual:string;paymentState:string;currency:string;ref:string}[];outside:Outside[];
 totals:{invoiced:number;open:number;outsidePaid:number;outsideReceived:number;unbilled:number}};
const DOC_LABEL:Record<string,string>={out_invoice:'فاتورة',out_refund:'إشعار دائن',in_invoice:'فاتورة مورد',in_refund:'إشعار مورد'};
const PAY_LABEL:Record<string,string>={not_paid:'غير مدفوعة',partial:'مدفوعة جزئياً',paid:'مدفوعة',reversed:'معكوسة','n/a':''};
/** A case's money from the books: fee invoices and what is still owed, payments, and outside transactions with their originals. */
export function CaseBooks({caseId,client,clientEntityId,cases}:{caseId:string;client:string;clientEntityId?:string;cases:CaseLite[]}){
 const [data,setData]=useState<CaseBooksData|null>(null),[error,setError]=useState(''),[v,setV]=useState(0),[setup,setSetup]=useState<BooksSetup|null>(null),[invoice,setInvoice]=useState(false),[outside,setOutside]=useState<Outside|null>(null);
 useEffect(()=>{let live=true;Promise.all([booksRequest<CaseBooksData>('case_books',{caseId}),booksRequest<BooksSetup>('setup')]).then(([d,s])=>{if(live){setData(d);setSetup(s);setError('')}}).catch(e=>{if(live)setError((e as Error).message)});return()=>{live=false}},[caseId,v]);
 if(error)return null;
 if(!data||!setup)return <p role="status">جارٍ تحميل الحسابات…</p>;
 const t=data.totals,f=(n:number)=>money(Math.round(n*1000));
 return <section className="case-books">
  <div className="department-toolbar"><h3><Receipt size={16}/> حسابات القضية في الدفاتر</h3>{setup.canEdit&&<div className="actions"><button className="btn primary" onClick={()=>setInvoice(true)}><Plus size={15}/> فاتورة أتعاب</button><button className="btn" onClick={()=>setOutside(blank(caseId))}><Plus size={15}/> معاملة خارجية</button></div>}</div>
  <dl className="books-totals"><div><dt>المفوتر</dt><dd dir="ltr">{f(t.invoiced)}</dd></div><div className={t.open?'off':'net'}><dt>غير محصل</dt><dd dir="ltr">{f(t.open)}</dd></div><div><dt>رسوم دُفعت عنه</dt><dd dir="ltr">{f(t.outsidePaid)}</dd></div>
   <div className={t.unbilled?'off':''}><dt>رسوم لم يُطالب بها</dt><dd dir="ltr">{f(t.unbilled)}</dd></div>{t.outsideReceived>0&&<div><dt>مبالغ استُلمت لحسابه</dt><dd dir="ltr">{f(t.outsideReceived)}</dd></div>}</dl>
  {data.documents.length>0&&<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>المستند</th><th>التاريخ</th><th>الإجمالي</th><th>المتبقي</th><th>الحالة</th></tr></thead>
   <tbody>{data.documents.map(d=><tr key={d.id}><td className="mono">{d.name==='/'?'مسودة':d.name} <small>{d.paymentType?(d.paymentType==='inbound'?'سند قبض':'سند صرف'):DOC_LABEL[d.moveType]}</small></td><td>{formatDate(d.date)}</td><td dir="ltr">{amount(d.amountTotal)}</td><td dir="ltr">{d.state==='posted'?amount(d.amountResidual):'—'}</td><td>{d.state==='draft'?'مسودة':PAY_LABEL[d.paymentState]||''}</td></tr>)}</tbody></table></div>}
  {data.outside.length>0&&<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>المعاملة الخارجية</th><th>التاريخ</th><th>المبلغ</th><th>المستند</th><th>الأصل</th><th></th></tr></thead>
   <tbody>{data.outside.map(o=><tr key={o.id} className={o.state==='cancelled'?'ledger-void':''}><td>{o.kind}{o.direction==='in'&&<small className="books-in"> مقبوض</small>}</td><td>{formatDate(o.date)}</td><td dir="ltr">{amount(o.amount)}</td><td>{[o.docType,o.reference].filter(Boolean).join(' ')}</td>
    <td><span className={'tag '+(o.originalState==='staff'||o.originalState==='court'?'amber':o.originalState==='lost'?'':'green')}>{ORIGINAL_STATES[o.originalState]}</span><small> {o.originalState==='archive'?o.archiveRef:o.originalHolder}</small></td><td><button className="btn" onClick={()=>setOutside(o)}>فتح</button></td></tr>)}</tbody></table></div>}
  {!data.documents.length&&!data.outside.length&&<p className="muted">لا توجد فواتير أو معاملات في الدفاتر لهذه القضية بعد.</p>}
  {invoice&&<QuickInvoice caseId={caseId} client={client} clientEntityId={clientEntityId} onClose={()=>setInvoice(false)} onDone={()=>{setInvoice(false);setV(x=>x+1)}}/>}
  {outside&&<OutsideEditor setup={setup} cases={cases} initial={outside} onClose={()=>{setOutside(null);setV(x=>x+1)}} onChanged={o=>{setOutside(o);setV(x=>x+1)}}/>}
 </section>;
}

type Month={month:string;income:string;expenses:string;cash:string};
const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const monthName=(m:string)=>MONTHS[Number(m.slice(5,7))-1]+' '+m.slice(2,4);
/**
 * Income against expenses for each of the last twelve months: grouped bars on one axis, a legend, a hover title on
 * every bar, and the same figures in a table below for reading and for screen readers.
 */
export function MonthlyChart(){
 const [rows,setRows]=useState<Month[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;booksRequest<Month[]>('monthly',{months:12}).then(r=>{if(live)setRows(r)}).catch(e=>{if(live)setError((e as Error).message)});return()=>{live=false}},[]);
 if(error||!rows)return null;
 const max=Math.max(1,...rows.flatMap(r=>[toFils(r.income),toFils(r.expenses)]));
 const W=640,H=180,pad=24,step=(W-pad*2)/rows.length,bw=Math.min(16,step/2-3);
 const y=(v:number)=>H-pad-Math.max(0,v)/max*(H-pad*2);
 return <section className="panel books-chart"><div className="department-toolbar"><h2>الإيرادات والمصروفات شهرياً</h2><div className="books-legend" aria-hidden><span className="in"/>الإيرادات<span className="out"/>المصروفات</div></div>
  <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="الإيرادات والمصروفات لآخر اثني عشر شهراً؛ الأرقام في الجدول أدناه" className="books-bars">
   {[0.5,1].map(f=><line key={f} x1={pad} x2={W-pad} y1={y(max*f)} y2={y(max*f)} className="grid"/>)}<line x1={pad} x2={W-pad} y1={H-pad} y2={H-pad} className="axis"/>
   {rows.map((r,i)=>{const x=W-pad-(i+1)*step+step/2,inc=toFils(r.income),exp=toFils(r.expenses);return <g key={r.month}>
    <rect className="in" x={x-bw-1} y={y(inc)} width={bw} height={Math.max(0,H-pad-y(inc))} rx={3}><title>{monthName(r.month)} · الإيرادات {money(inc)}</title></rect>
    <rect className="out" x={x+1} y={y(exp)} width={bw} height={Math.max(0,H-pad-y(exp))} rx={3}><title>{monthName(r.month)} · المصروفات {money(exp)}</title></rect>
    <text x={x} y={H-6} textAnchor="middle">{MONTHS[Number(r.month.slice(5,7))-1].slice(0,3)}</text></g>})}
  </svg>
  <details><summary>الأرقام</summary><div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الشهر</th><th>الإيرادات</th><th>المصروفات</th><th>الصافي</th><th>النقد آخر الشهر</th></tr></thead>
   <tbody>{rows.map(r=><tr key={r.month}><td>{monthName(r.month)}</td><td dir="ltr">{amount(r.income)}</td><td dir="ltr">{amount(r.expenses)}</td><td dir="ltr">{money(toFils(r.income)-toFils(r.expenses))}</td><td dir="ltr">{amount(r.cash)}</td></tr>)}</tbody></table></div></details>
 </section>;
}

/** Payroll for a month into the books: one entry for the net salaries, then paid from the bank. */
export function PayrollToBooks({month,lines}:{month:string;lines:{name:string;amount:string}[]}){
 const [status,setStatus]=useState<{posted:{id:string;name:string;amount:string}|null;paid:{id:string;name:string;date:string}|null}|null>(null),[setup,setSetup]=useState<BooksSetup|null>(null),[journal,setJournal]=useState(''),[busy,setBusy]=useState(false),[v,setV]=useState(0);
 useEffect(()=>{let live=true;Promise.all([booksRequest<typeof status>('payroll_status',{month}),booksRequest<BooksSetup>('setup')]).then(([st,s])=>{if(!live)return;setStatus(st);setSetup(s);setJournal(j=>j||s.journals.find(x=>x.active&&x.type==='bank')?.id||'')}).catch(()=>{if(live)setStatus(null)});return()=>{live=false}},[month,v]);
 if(!status||!setup)return null;
 const total=lines.reduce((t,l)=>t+toFils(l.amount),0);
 const run=(action:string,data:Record<string,unknown>,done:string)=>{setBusy(true);booksRequest(action,data).then(()=>{toast.success(done);setV(x=>x+1)},fail).finally(()=>setBusy(false))};
 return <div className="books-payroll"><b>الدفاتر:</b> {status.posted?<>رُحّلت رواتب الشهر ({status.posted.name}، {amount(status.posted.amount)})</>:<>لم تُرحّل رواتب هذا الشهر بعد.</>}
  {status.paid&&<> · صُرفت في {formatDate(status.paid.date)} ({status.paid.name})</>}
  {setup.canEdit&&!status.posted&&total>0&&<button className="btn" disabled={busy} onClick={()=>run('post_payroll',{month,lines},'رُحّلت الرواتب إلى الدفاتر')}>ترحيل صافي الرواتب ({money(total)}) إلى الدفاتر</button>}
  {setup.canEdit&&status.posted&&!status.paid&&<><FilterSelect label="الصرف من" value={journal} onChange={setJournal} options={setup.journals.filter(j=>j.active&&(j.type==='bank'||j.type==='cash')).map(j=>({value:j.id,label:`${j.code} · ${j.name}`}))}/>
   <button className="btn" disabled={busy||!journal} onClick={()=>run('pay_payroll',{month,journalId:journal,date:todayISO()},'سُجّل صرف الرواتب')}>تسجيل صرف الرواتب</button></>}
 </div>;
}

/** Collection payments moved into the books: money collected is held for the client, file expenses are to recover. */
export function CollectionsToBooks({setup,onChanged}:{setup:BooksSetup;onChanged:()=>void}){
 const journals=setup.journals.filter(j=>j.active&&(j.type==='bank'||j.type==='cash'));
 const [journal,setJournal]=useState(journals.find(j=>j.type==='bank')?.id||''),[res,setRes]=useState<Record<string,number|string|boolean>|null>(null),[busy,setBusy]=useState(false);
 const run=(dryRun:boolean)=>{setBusy(true);booksRequest<Record<string,number|string|boolean>>('sync_collections',{journalId:journal,dryRun}).then(r=>{setRes(r);if(!dryRun){toast.success('نُقلت مدفوعات التحصيل');onChanged()}},fail).finally(()=>setBusy(false))};
 const n=(k:string)=>Number(res?.[k]||0);
 return <section className="books-reverse panel"><h3>مدفوعات التحصيل إلى الدفاتر</h3><p className="muted">المبالغ المحصلة من المدينين تُسجل مبالغ لحساب الموكلين (التزاماً عليهم للمكتب أن يسلمها)، ومصروفات الملفات تُسجل رسوماً تُطالب بها الموكلين. «السداد الخارجي» لا يدخل الدفاتر لأنه لم يمر بالمكتب. النقل مرة ثانية يضيف الجديد فقط.</p>
  <div className="form-grid"><FilterSelect label="دخلت المبالغ في" value={journal} onChange={setJournal} options={journals.map(j=>({value:j.id,label:`${j.code} · ${j.name}`}))}/></div>
  {res&&<dl className="roll-stats"><div><dt>دفعات تحصيل</dt><dd>{n('payments')}</dd></div><div><dt>مصروفات ملفات</dt><dd>{n('expenses')}</dd></div><div><dt>المبلغ</dt><dd dir="ltr">{amount(String(res.amount||'0'))}</dd></div><div><dt>نُقلت من قبل</dt><dd>{n('already')}</dd></div><div><dt>سداد خارجي (لا يُنقل)</dt><dd>{n('external')}</dd></div></dl>}
  {setup.canEdit&&<div className="actions"><button className="btn" disabled={busy||!journal} onClick={()=>run(true)}>معاينة</button><button className="btn primary" disabled={busy||!res||!res.dryRun||!(n('payments')+n('expenses'))} onClick={()=>run(false)}>نقل إلى الدفاتر</button></div>}
 </section>;
}

/** A client's statement from the books: every invoice, payment and credit with a running balance, ready to print. */
export async function printStatement(partner:{id:string;name:string},from:string,to:string){
 const rows=await booksRequest<{opening:string;closing:string;lines:{name:string;date:string;ref:string;label:string;debit:string;credit:string}[]}[]>('partner_ledger',{partnerId:partner.id,side:'receivable',from,to,details:true});
 const p=rows[0];let run=p?toFils(p.opening):0;
 const body=[['','رصيد سابق','','','',money(run)],...(p?.lines||[]).map(l=>{run+=toFils(l.debit)-toFils(l.credit);return [formatDate(l.date),l.name,[l.ref,l.label].filter(Boolean).join(' — '),toFils(l.debit)?amount(l.debit):'',toFils(l.credit)?amount(l.credit):'',money(run)]})];
 if(!printHtml(listHtml('كشف حساب — '+partner.name,`من ${formatDate(from)} إلى ${formatDate(to)}`,['التاريخ','المستند','البيان','مدين','دائن','الرصيد'],body,formatDate(todayISO()),'',[['الرصيد المستحق',money(run)]])))popupBlocked();
}
