import {useEffect,useState} from 'react';
import {Plus,Upload,Trash2,Check,Unlink,ArrowRightLeft,Landmark,Banknote,FileSpreadsheet,Printer} from 'lucide-react';
import {toast} from 'sonner';
import {booksRequest} from '@/lib/local-auth';
import {EXCEL_ACCEPT} from '@/lib/excel-files';
import {money,toFils,PAYMENT_METHODS,CHEQUE_STATES,type BankStats,type Batch,type Cheque,type Statement,type StatementSummary,type Suggestions} from '@/lib/books';
import {readStatement,type StatementParse} from '@/lib/bank-import';
import {todayISO,formatDate} from '@/lib/domain';
import {listHtml,printHtml} from '@/lib/print';
import {Field,DateField,Empty} from '../shared';
import {OfficeSelect} from '../office-shared';
import FilterSelect from '../filter-select';
import Needs from '../needs';
import {EditorDialog} from './shared';
import type {FullSetup} from './books-invoicing';

export type BankSetup=FullSetup&{bank:Record<string,BankStats>};
const amount=(v:string)=>money(toFils(v));
// A request sent for approval was announced already; it is not an error.
const fail=(e:unknown)=>{if(!(e as {handled?:boolean}).handled)toast.error((e as Error).message)};
type Tab='statements'|'reconcile'|'cheques'|'transfer'|'batches';

/**
 * «البنك والنقد»: each bank and cash account with its balance in the books and on the last statement; statements
 * entered or imported from the bank's file; matching each statement line to invoices, a recorded payment or an
 * account; cheques; transfers between accounts; and batch payments.
 */
export default function BankCash({setup,onOpen,onChanged,version}:{setup:BankSetup;onOpen:(id:string)=>void;onChanged:()=>void;version:number}){
 const journals=setup.journals.filter(j=>j.active&&(j.type==='bank'||j.type==='cash'));
 const [journal,setJournal]=useState(journals[0]?.id||''),[tab,setTab]=useState<Tab>('statements');
 return <>
  <div className="books-journals">{journals.map(j=>{const b=setup.bank[j.id],Icon=j.type==='bank'?Landmark:Banknote,diff=b?.statementBalance?toFils(b.statementBalance)-toFils(b.booksBalance):0;
   return <button key={j.id} type="button" className={'books-journal books-pick'+(journal===j.id?' active':'')} aria-pressed={journal===j.id} onClick={()=>setJournal(j.id)}>
    <header><Icon size={20}/><div><h3>{j.name}</h3><small>{j.code}</small></div></header>
    <p className="books-balance"><span>في الدفاتر</span><b dir="ltr">{amount(b?.booksBalance||'0')}</b></p>
    {b?.statementBalance?<p className="muted">آخر كشف ({b.lastStatementDate?formatDate(b.lastStatementDate):''}): <b dir="ltr">{amount(b.statementBalance)}</b>{diff!==0&&<small className="books-late"> فرق {money(diff)}</small>}</p>:<p className="muted">لا يوجد كشف بعد</p>}
    {(b?.toReconcile||0)>0&&<span className="tag amber">{b.toReconcile} حركة للمطابقة</span>}{(b?.chequesHeld||0)>0&&<span className="tag">{b.chequesHeld} شيك قيد التحصيل</span>}
   </button>})}</div>
  <div className="department-tabs view-switch" role="group" aria-label="البنك والنقد">{([['statements','كشوف الحساب'],['reconcile','المطابقة'],['cheques','الشيكات'],['transfer','التحويل بين الحسابات'],['batches','الدفعات المجمعة']] as const).map(([k,l])=>
   <button key={k} className={'btn '+(tab===k?'primary':'')} aria-pressed={tab===k} onClick={()=>setTab(k)}>{l}</button>)}</div>
  {journal&&tab==='statements'&&<Statements key={journal} setup={setup} journalId={journal} onOpen={onOpen} onChanged={onChanged} version={version}/>}
  {journal&&tab==='reconcile'&&<ReconcileAll key={journal} setup={setup} journalId={journal} onChanged={onChanged} version={version}/>}
  {tab==='cheques'&&<Cheques setup={setup} onOpen={onOpen} onChanged={onChanged} version={version}/>}
  {tab==='transfer'&&<Transfer setup={setup} from={journal} onOpen={onOpen} onChanged={onChanged}/>}
  {tab==='batches'&&<Batches setup={setup} onOpen={onOpen} version={version}/>}
 </>;
}

function Statements({setup,journalId,onOpen,onChanged,version}:{setup:BankSetup;journalId:string;onOpen:(id:string)=>void;onChanged:()=>void;version:number}){
 const [rows,setRows]=useState<StatementSummary[]|null>(null),[open,setOpen]=useState<Statement|null>(null),[editing,setEditing]=useState<Statement|null>(null),[importing,setImporting]=useState(false),[v,setV]=useState(0);
 useEffect(()=>{let live=true;booksRequest<StatementSummary[]>('list_statements',{journalId}).then(r=>{if(live)setRows(r)},fail);return()=>{live=false}},[journalId,version,v]);
 const refresh=()=>{setV(x=>x+1);onChanged()};
 const view=(id:string)=>booksRequest<Statement>('get_statement',{id}).then(setOpen,fail);
 const blank=():Statement=>({id:'',journalId,name:'',date:todayISO(),balanceStart:rows?.[0]?.balanceEnd||'0',balanceEnd:'',note:'',sourceFile:'',revision:0,computedEnd:'0',lines:[]});
 return <section className="panel"><div className="department-toolbar"><h2>كشوف الحساب</h2>{setup.canEdit&&<div className="actions"><button className="btn" onClick={()=>setImporting(true)}><Upload size={15}/> استيراد كشف من ملف</button><button className="btn primary" onClick={()=>setEditing(blank())}><Plus size={15}/> كشف جديد</button></div>}</div>
  {!rows&&<p role="status">جارٍ التحميل…</p>}
  {rows&&<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الكشف</th><th>التاريخ</th><th>رصيد البداية</th><th>رصيد النهاية</th><th>الحركات</th><th>غير مطابقة</th><th></th></tr></thead>
   <tbody>{rows.map(r=>{const off=toFils(r.computedEnd)!==toFils(r.balanceEnd);return <tr key={r.id}><td>{r.name}</td><td>{formatDate(r.date)}</td><td dir="ltr">{amount(r.balanceStart)}</td>
    <td dir="ltr">{amount(r.balanceEnd)}{off&&<small className="books-late"> المحسوب {amount(r.computedEnd)}</small>}</td><td>{r.lines}</td><td>{r.open?<span className="tag amber">{r.open}</span>:<span className="tag green">مكتمل</span>}</td>
    <td><button className="btn" onClick={()=>void view(r.id)}>فتح</button></td></tr>})}</tbody></table>{!rows.length&&<Empty title="لا توجد كشوف" text="أضف كشف الحساب يدوياً أو استورده من ملف البنك."/>}</div>}
  {open&&<StatementView setup={setup} initial={open} onClose={()=>setOpen(null)} onEdit={()=>{setEditing(open);setOpen(null)}} onOpen={onOpen} onChanged={s=>{setOpen(s);refresh()}} onDeleted={()=>{setOpen(null);refresh()}}/>}
  {editing&&<StatementEditor setup={setup} initial={editing} onClose={()=>setEditing(null)} onSaved={s=>{setEditing(null);refresh();setOpen(s)}}/>}
  {importing&&<StatementImport setup={setup} journalId={journalId} onClose={()=>setImporting(false)} onSaved={s=>{setImporting(false);refresh();setOpen(s)}}/>}
 </section>;
}

function StatementEditor({setup,initial,onClose,onSaved}:{setup:BankSetup;initial:Statement;onClose:()=>void;onSaved:(s:Statement)=>void}){
 const [s,setS]=useState(initial),[lines,setLines]=useState(initial.lines.filter(l=>!l.reconciled).map(l=>({...l}))),[busy,setBusy]=useState(false);
 const kept=initial.lines.filter(l=>l.reconciled),sum=[...kept,...lines].reduce((t,l)=>{try{return t+toFils(l.amount)}catch{return t}},0);
 let start=0,end=0,bad=false;try{start=toFils(s.balanceStart);end=toFils(s.balanceEnd||'0')}catch{bad=true}
 const line=(i:number,p:Partial<Statement['lines'][number]>)=>setLines(x=>x.map((l,k)=>k===i?{...l,...p}:l));
 const blank=()=>({id:'',date:s.date,label:'',ref:'',partnerName:'',partnerId:'',amount:'',reconciled:false,moveId:'',moveName:''});
 return <EditorDialog title={s.id?s.name:'كشف جديد'} description="سطر موجب للإيداع وسالب للسحب. السطور المطابقة لا تُعدّل هنا." busy={busy} onClose={onClose}><div className="books-editor">
  <div className="form-grid"><Field label="اسم الكشف" value={s.name} onChange={v=>setS({...s,name:v})} placeholder="مثل كشف فبراير"/><DateField label="تاريخ الكشف" value={s.date} onChange={v=>setS({...s,date:v})}/>
   <label className="field"><span>رصيد البداية</span><input dir="ltr" inputMode="decimal" value={s.balanceStart} onChange={e=>setS({...s,balanceStart:e.target.value})}/></label>
   <label className="field"><span>رصيد النهاية في الكشف</span><input dir="ltr" inputMode="decimal" value={s.balanceEnd} onChange={e=>setS({...s,balanceEnd:e.target.value})}/></label></div>
  <div className="table-wrap"><table className="office-table books-lines"><thead><tr><th>التاريخ</th><th>البيان</th><th>الطرف</th><th>المرجع</th><th>المبلغ</th><th></th></tr></thead><tbody>
   {lines.map((l,i)=><tr key={i}><td><input aria-label={`تاريخ الحركة ${i+1}`} type="date" value={l.date} onChange={e=>line(i,{date:e.target.value})}/></td><td><input aria-label={`بيان الحركة ${i+1}`} value={l.label} onChange={e=>line(i,{label:e.target.value})}/></td>
    <td><input aria-label={`طرف الحركة ${i+1}`} value={l.partnerName} onChange={e=>line(i,{partnerName:e.target.value})} list="books-partner-names"/></td><td><input aria-label={`مرجع الحركة ${i+1}`} value={l.ref} onChange={e=>line(i,{ref:e.target.value})}/></td>
    <td><input aria-label={`مبلغ الحركة ${i+1}`} dir="ltr" inputMode="decimal" value={l.amount} onChange={e=>line(i,{amount:e.target.value})}/></td>
    <td><button type="button" className="btn icon" aria-label={`حذف الحركة ${i+1}`} onClick={()=>setLines(x=>x.filter((_,k)=>k!==i))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
  <datalist id="books-partner-names">{setup.partners.map(p=><option key={p.id} value={p.name}/>)}</datalist>
  <div className="actions"><button type="button" className="btn" onClick={()=>setLines(x=>[...x,blank()])}><Plus size={15}/> حركة</button></div>
  <p className="muted">البداية {money(start)} + الحركات {money(sum)} = <b dir="ltr">{money(start+sum)}</b>{s.balanceEnd&&!bad&&start+sum!==end&&<span className="books-late"> · لا يساوي رصيد النهاية ({money(end)})</span>}</p>
  <Needs items={[!s.date&&'اختر تاريخ الكشف',bad&&'راجع الأرصدة',lines.some(l=>!l.date||!l.amount)&&'لكل حركة تاريخ ومبلغ']}/>
  <div className="actions"><button className="btn primary" disabled={busy||!s.date||bad||lines.some(l=>!l.date||!l.amount)} onClick={()=>{setBusy(true);booksRequest<Statement>('save_statement',{statement:{...s,id:s.id||undefined,balanceEnd:s.balanceEnd||String((start+sum)/1000),lines}}).then(r=>{toast.success('حُفظ الكشف');onSaved(r)},fail).finally(()=>setBusy(false))}}>حفظ الكشف</button><button className="btn" onClick={onClose}>إغلاق</button></div>
 </div></EditorDialog>;
}

function StatementImport({setup,journalId,onClose,onSaved}:{setup:BankSetup;journalId:string;onClose:()=>void;onSaved:(s:Statement)=>void}){
 const [file,setFile]=useState(''),[parsed,setParsed]=useState<StatementParse|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[start,setStart]=useState(''),[end,setEnd]=useState('');
 const journal=setup.journals.find(j=>j.id===journalId);
 async function choose(f:File){setFile(f.name);setError('');setParsed(null);try{const p=await readStatement(f);setParsed(p);setStart(p.opening||setup.bank[journalId]?.statementBalance||'0');setEnd(p.closing)}catch(e){setError((e as Error).message)}}
 const inSum=parsed?parsed.lines.filter(l=>!l.amount.startsWith('-')).reduce((t,l)=>t+toFils(l.amount),0):0,outSum=parsed?parsed.lines.filter(l=>l.amount.startsWith('-')).reduce((t,l)=>t+toFils(l.amount),0):0;
 const dates=parsed?parsed.lines.map(l=>l.date).sort():[];
 return <EditorDialog title="استيراد كشف من ملف" description={`كشف ${journal?.name||''} كما يُصدر من البنك (Excel أو CSV). يُعرف عمود التاريخ والمبلغ (أو السحب والإيداع) من عناوين الأعمدة، والحركات المستوردة من قبل لا تتكرر.`} busy={busy} onClose={onClose}>
  <label className="field"><span>ملف الكشف</span><input type="file" accept={EXCEL_ACCEPT} aria-label="ملف كشف البنك" onChange={e=>{const f=e.target.files?.[0];if(f)void choose(f)}}/></label>
  {error&&<p className="notice" role="alert">{error}</p>}
  {parsed&&<><p><FileSpreadsheet size={15}/> <b>{file}</b>: {parsed.lines.length} حركة من {formatDate(dates[0])} إلى {formatDate(dates[dates.length-1])}{parsed.skipped?` (تُرك ${parsed.skipped} سطراً بلا تاريخ أو مبلغ)`:''}.</p>
   <p className="muted">الأعمدة: {Object.entries(parsed.columns).map(([k,v])=>`${({date:'التاريخ',label:'البيان',ref:'المرجع',partner:'الطرف',amount:'المبلغ',debit:'السحب',credit:'الإيداع',balance:'الرصيد'} as Record<string,string>)[k]}: «${v}»`).join('، ')}</p>
   <dl className="roll-stats"><div><dt>إيداعات</dt><dd dir="ltr">{money(inSum)}</dd></div><div><dt>سحوبات</dt><dd dir="ltr">{money(outSum)}</dd></div></dl>
   <div className="form-grid"><label className="field"><span>رصيد البداية</span><input dir="ltr" value={start} onChange={e=>setStart(e.target.value)}/></label><label className="field"><span>رصيد النهاية</span><input dir="ltr" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
   <div className="table-wrap books-preview"><table className="office-table"><thead><tr><th>التاريخ</th><th>البيان</th><th>المرجع</th><th>المبلغ</th></tr></thead><tbody>{parsed.lines.slice(0,12).map((l,i)=><tr key={i}><td>{formatDate(l.date)}</td><td>{l.label}</td><td>{l.ref}</td><td dir="ltr">{amount(l.amount)}</td></tr>)}</tbody></table></div></>}
  <div className="actions"><button className="btn primary" disabled={busy||!parsed} onClick={()=>{if(!parsed)return;setBusy(true);booksRequest<Statement&{added:number;skipped:number}>('save_statement',{skipDuplicates:true,statement:{journalId,name:'كشف '+formatDate(dates[dates.length-1]),date:dates[dates.length-1],balanceStart:start||'0',balanceEnd:end||String((toFils(start||'0')+inSum+outSum)/1000),sourceFile:file,lines:parsed.lines}})
   .then(r=>{toast.success(`استُورد ${r.added} حركة${r.skipped?`، وتُرك ${r.skipped} موجودة من قبل`:''}`);onSaved(r)},fail).finally(()=>setBusy(false))}}><Upload size={15}/> استيراد</button><button className="btn" onClick={onClose}>إغلاق</button></div>
 </EditorDialog>;
}

function StatementView({setup,initial,onClose,onEdit,onOpen,onChanged,onDeleted}:{setup:BankSetup;initial:Statement;onClose:()=>void;onEdit:()=>void;onOpen:(id:string)=>void;onChanged:(s:Statement)=>void;onDeleted:()=>void}){
 const [s,setS]=useState(initial),[busy,setBusy]=useState(false),[active,setActive]=useState<string>(initial.lines.find(l=>!l.reconciled)?.id||'');
 const done=(r:Statement)=>{setS(r);onChanged(r);setActive(r.lines.find(l=>!l.reconciled)?.id||'')};
 const off=toFils(s.computedEnd)!==toFils(s.balanceEnd);
 return <EditorDialog title={s.name} description={`${formatDate(s.date)} · البداية ${amount(s.balanceStart)} · النهاية ${amount(s.balanceEnd)}${off?` (المحسوب ${amount(s.computedEnd)})`:''}`} busy={busy} onClose={onClose}><div className="books-editor">
  <div className="table-wrap"><table className="office-table books-table"><thead><tr><th>التاريخ</th><th>البيان</th><th>الطرف</th><th>المبلغ</th><th>المطابقة</th></tr></thead><tbody>
   {s.lines.map(l=><tr key={l.id} className={active===l.id?'books-active':''}><td>{formatDate(l.date)}</td><td>{l.label}{l.ref&&<small> · {l.ref}</small>}</td><td>{setup.partners.find(p=>p.id===l.partnerId)?.name||l.partnerName||'—'}</td>
    <td dir="ltr" className={'ledger-value '+(l.amount.startsWith('-')?'books-out':'books-in')}>{amount(l.amount)}</td>
    <td>{l.reconciled?<><button type="button" className="link mono" onClick={()=>l.moveId&&onOpen(l.moveId)}>{l.moveName||'مطابقة'}</button>{setup.canEdit&&<button type="button" className="btn icon" aria-label={'فك مطابقة '+l.label} title="فك المطابقة" disabled={busy}
     onClick={()=>{setBusy(true);booksRequest<Statement>('unreconcile_line',{lineId:l.id}).then(done,fail).finally(()=>setBusy(false))}}><Unlink size={14}/></button>}</>
     :setup.canEdit?<button className={'btn '+(active===l.id?'primary':'')} onClick={()=>setActive(l.id)}>مطابقة</button>:<span className="tag amber">غير مطابقة</span>}</td></tr>)}</tbody></table></div>
  {setup.canEdit&&active&&s.lines.find(l=>l.id===active&&!l.reconciled)&&<LineMatcher key={active} setup={setup} line={s.lines.find(l=>l.id===active)!} onDone={done}/>}
  <div className="actions">{setup.canEdit&&<button className="btn" onClick={onEdit}>تعديل الكشف</button>}
   {setup.canEdit&&!s.lines.some(l=>l.reconciled)&&<button className="btn danger" disabled={busy} onClick={()=>{if(confirm('حذف هذا الكشف؟')){setBusy(true);booksRequest('delete_statement',{id:s.id}).then(onDeleted,fail).finally(()=>setBusy(false))}}}><Trash2 size={15}/> حذف الكشف</button>}
   <button className="btn" onClick={onClose}>إغلاق</button></div>
 </div></EditorDialog>;
}

/** Matching one statement line: open invoices (several may be ticked; any difference to an account or left as credit), a recorded payment, or an account. */
function LineMatcher({setup,line,onDone}:{setup:BankSetup;line:Statement['lines'][number];onDone:(s:Statement)=>void}){
 const [sug,setSug]=useState<Suggestions|null>(null),[mode,setMode]=useState<'items'|'payment'|'account'>('items'),[picked,setPicked]=useState<string[]>([]),[payment,setPayment]=useState(''),[account,setAccount]=useState(''),[label,setLabel]=useState(line.label),[writeoff,setWriteoff]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;booksRequest<Suggestions>('reconcile_suggestions',{lineId:line.id}).then(r=>{if(!live)return;setSug(r);
  if(r.payments.length&&toFils(r.payments[0].amount)===Math.abs(toFils(line.amount))){setMode('payment');setPayment(r.payments[0].moveId)}else if(r.items.length){setPicked([r.items[0].lineId])}else setMode('account')},fail);return()=>{live=false}},[line.id,line.amount]);
 const total=Math.abs(toFils(line.amount)),chosen=sug?sug.items.filter(x=>picked.includes(x.lineId)).reduce((t,x)=>t+toFils(x.residual),0):0,rest=total-chosen;
 const partners=new Set(sug?sug.items.filter(x=>picked.includes(x.lineId)).map(x=>x.partnerId):[]);
 const accounts=setup.accounts.filter(a=>!a.deprecated).map(a=>({value:a.id,label:a.code+' '+a.name}));
 const needs=(mode==='items'?[picked.length?'':'اختر فاتورة واحدة على الأقل',partners.size>1?'اختر فواتير شريك واحد':'']:mode==='payment'?[payment?'':'اختر الدفعة']:[account?'':'اختر الحساب المقابل']);
 function go(){setBusy(true);booksRequest<Statement>('reconcile_line',{lineId:line.id,mode,itemLineIds:picked,paymentId:payment,accountId:account,label,writeoffAccountId:rest>0?writeoff:'',writeoffLabel:label}).then(r=>{toast.success('طوبقت الحركة');onDone(r)},fail).finally(()=>setBusy(false))}
 return <section className="books-reverse panel"><h3>مطابقة: {line.label||line.ref} · <span dir="ltr">{amount(line.amount)}</span></h3>
  <div className="department-tabs" role="group" aria-label="طريقة المطابقة">{([['items',line.amount.startsWith('-')?'فواتير موردين مفتوحة':'فواتير موكلين مفتوحة'],['payment','دفعة مسجلة'],['account','حساب مباشر']] as const).map(([k,l])=>
   <button key={k} type="button" className={'btn '+(mode===k?'primary':'')} aria-pressed={mode===k} onClick={()=>setMode(k)}>{l}</button>)}</div>
  {!sug&&<p role="status">جارٍ البحث عن المطابقات…</p>}
  {sug&&mode==='items'&&(sug.items.length?<><ul className="books-suggest">{sug.items.map(x=><li key={x.lineId}><label className="check"><input type="checkbox" checked={picked.includes(x.lineId)} onChange={e=>setPicked(p=>e.target.checked?[...p,x.lineId]:p.filter(y=>y!==x.lineId))}/>
    <b className="mono">{x.name}</b> · {x.partner} · {formatDate(x.dueDate||x.date)}{x.ref&&` · ${x.ref}`} · <b dir="ltr">{amount(x.residual)}</b></label></li>)}</ul>
   {picked.length>0&&<p className="muted">المختار {money(chosen)} من {money(total)}{rest>0?` · يبقى ${money(rest)}`:rest<0?` · يُدفع ${money(total)} فقط والباقي يبقى مستحقاً`:''}</p>}
   {rest>0&&picked.length>0&&<div className="form-grid"><FilterSelect label="الفرق إلى حساب" value={writeoff} onChange={setWriteoff} empty="يبقى رصيداً للشريك" options={accounts}/>{writeoff&&<Field label="بيان الفرق" value={label} onChange={setLabel}/>}</div>}</>
   :<Empty title="لا توجد فواتير مفتوحة مناسبة" text="جرّب «حساب مباشر» أو «دفعة مسجلة»."/>)}
  {sug&&mode==='payment'&&(sug.payments.length?<ul className="books-suggest">{sug.payments.map(p=><li key={p.moveId}><label className="check"><input type="radio" name={'pay-'+line.id} checked={payment===p.moveId} onChange={()=>setPayment(p.moveId)}/>
    <b className="mono">{p.name}</b> · {p.partner} · {formatDate(p.date)} · {PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS]||p.method}{p.chequeNumber&&` ${p.chequeNumber}`} · <b dir="ltr">{amount(p.amount)}</b></label></li>)}</ul>
   :<Empty title="لا توجد دفعات مسجلة غير مطابقة في هذا الحساب"/>)}
  {mode==='account'&&<div className="form-grid"><FilterSelect label="الحساب المقابل" value={account} onChange={setAccount} options={accounts}/><Field label="البيان" value={label} onChange={setLabel}/></div>}
  <Needs items={needs}/>
  <div className="actions"><button className="btn primary" disabled={busy||!sug||needs.some(Boolean)} onClick={go}><Check size={15}/> تأكيد المطابقة</button></div>
 </section>;
}

function ReconcileAll({setup,journalId,onChanged,version}:{setup:BankSetup;journalId:string;onChanged:()=>void;version:number}){
 const [list,setList]=useState<Statement[]|null>(null),[v,setV]=useState(0);
 useEffect(()=>{let live=true;booksRequest<StatementSummary[]>('list_statements',{journalId}).then(rows=>Promise.all(rows.filter(r=>r.open>0).map(r=>booksRequest<Statement>('get_statement',{id:r.id})))).then(r=>{if(live)setList(r)},fail);return()=>{live=false}},[journalId,version,v]);
 if(!list)return <p role="status">جارٍ التحميل…</p>;
 if(!list.length)return <section className="panel"><Empty title="كل الحركات مطابقة" text="لا توجد حركات كشف بانتظار المطابقة في هذا الحساب."/></section>;
 return <>{list.map(s=><section key={s.id} className="panel"><h2>{s.name}</h2>{s.lines.filter(l=>!l.reconciled).map(l=><div key={l.id} className="books-open-line">
  <p><b>{formatDate(l.date)}</b> · {l.label||l.ref} · {setup.partners.find(p=>p.id===l.partnerId)?.name||l.partnerName} · <b dir="ltr" className={l.amount.startsWith('-')?'books-out':'books-in'}>{amount(l.amount)}</b></p>
  {setup.canEdit&&<LineMatcher setup={setup} line={l} onDone={()=>{setV(x=>x+1);onChanged()}}/>}</div>)}
  </section>)}</>;
}

function Cheques({setup,onOpen,onChanged,version}:{setup:BankSetup;onOpen:(id:string)=>void;onChanged:()=>void;version:number}){
 const [state,setState]=useState('held'),[rows,setRows]=useState<Cheque[]|null>(null),[v,setV]=useState(0),[busy,setBusy]=useState(false),[bounce,setBounce]=useState<{id:string;date:string}|null>(null);
 useEffect(()=>{let live=true;booksRequest<Cheque[]>('list_cheques',{state}).then(r=>{if(live)setRows(r)},fail);return()=>{live=false}},[state,version,v]);
 const set=(id:string,next:string,date='')=>{setBusy(true);booksRequest('set_cheque',{id,state:next,date}).then(()=>{toast.success('حُدّثت حالة الشيك');setBounce(null);setV(x=>x+1);onChanged()},fail).finally(()=>setBusy(false))};
 const today=todayISO();
 return <section className="panel"><div className="department-toolbar"><h2>الشيكات</h2><OfficeSelect label="الحالة" value={state} onChange={setState} empty="كل الشيكات" options={Object.entries(CHEQUE_STATES) as [string,string][]}/></div>
  <p className="muted">الشيكات المستلمة والمصدرة المسجلة في الدفعات بطريقة «شيك». الشيك المرتجع يعكس دفعته فتعود الفاتورة مستحقة.</p>
  {rows&&<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الشيك</th><th>النوع</th><th>الطرف</th><th>البنك</th><th>تاريخ الاستحقاق</th><th>المبلغ</th><th>الحالة</th><th></th></tr></thead>
   <tbody>{rows.map(c=><tr key={c.id}><td className="mono">{c.chequeNumber}<small> · <button type="button" className="link" onClick={()=>onOpen(c.id)}>{c.name}</button></small></td><td>{c.paymentType==='inbound'?'مستلم':'مصدر'}</td><td>{c.partner}</td><td>{c.chequeBank||'—'}</td>
    <td>{c.chequeDate?formatDate(c.chequeDate):'—'}{c.chequeDate&&c.chequeDate<=today&&c.chequeState==='held'&&<small className="books-late"> مستحق</small>}</td><td dir="ltr">{amount(c.amount)}</td><td><span className={'tag '+(c.chequeState==='cleared'?'green':c.chequeState==='bounced'?'':'amber')}>{CHEQUE_STATES[c.chequeState as keyof typeof CHEQUE_STATES]||'—'}</span></td>
    <td>{setup.canEdit&&c.chequeState!=='bounced'&&c.chequeState!=='cleared'&&<div className="actions">{c.chequeState==='held'&&<button className="btn" disabled={busy} onClick={()=>set(c.id,'deposited')}>أودع</button>}
     <button className="btn" disabled={busy} onClick={()=>set(c.id,'cleared')}>صُرف</button><button className="btn danger" disabled={busy} onClick={()=>setBounce({id:c.id,date:today})}>مرتجع</button></div>}</td></tr>)}</tbody></table>{!rows.length&&<Empty title="لا توجد شيكات بهذه الحالة"/>}</div>}
  {bounce&&<div className="books-reverse panel"><h3>شيك مرتجع</h3><p className="muted">تُعكس الدفعة بتاريخ الارتجاع وتعود الفاتورة مستحقة.</p><DateField label="تاريخ الارتجاع" value={bounce.date} onChange={v=>setBounce({...bounce,date:v})}/>
   <div className="actions"><button className="btn danger" disabled={busy||!bounce.date} onClick={()=>set(bounce.id,'bounced',bounce.date)}>تسجيل الارتجاع</button><button className="btn" onClick={()=>setBounce(null)}>تراجع</button></div></div>}
 </section>;
}

function Transfer({setup,from,onOpen,onChanged}:{setup:BankSetup;from:string;onOpen:(id:string)=>void;onChanged:()=>void}){
 const journals=setup.journals.filter(j=>j.active&&(j.type==='bank'||j.type==='cash')).map(j=>({value:j.id,label:`${j.code} · ${j.name}`}));
 const [a,setA]=useState(from),[b,setB]=useState(journals.find(j=>j.value!==from)?.value||''),[value,setValue]=useState(''),[date,setDate]=useState(todayISO()),[ref,setRef]=useState(''),[busy,setBusy]=useState(false);
 let bad=false;try{if(toFils(value)<=0)bad=true}catch{bad=true}
 const needs=[a===b?'اختر حسابين مختلفين':'',bad?'اكتب مبلغ التحويل':'',date?'':'اختر التاريخ'];
 return <section className="panel"><h2><ArrowRightLeft size={18}/> التحويل بين الحسابات</h2><p className="muted">مثل إيداع نقد الصندوق في البنك أو سحب نقد للعهدة؛ يُسجل قيداً واحداً مرحّلاً.</p>
  <div className="form-grid"><FilterSelect label="من" value={a} onChange={setA} options={journals}/><FilterSelect label="إلى" value={b} onChange={setB} options={journals}/>
   <label className="field"><span>المبلغ</span><input dir="ltr" inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)}/></label><DateField label="التاريخ" value={date} onChange={setDate}/><Field label="البيان" value={ref} onChange={setRef}/></div>
  <Needs items={needs}/>
  {setup.canEdit&&<div className="actions"><button className="btn primary" disabled={busy||needs.some(Boolean)} onClick={()=>{setBusy(true);booksRequest<{id:string;name:string}>('transfer',{fromJournalId:a,toJournalId:b,amount:value,date,ref}).then(r=>{toast.success('سُجل التحويل '+r.name);setValue('');setRef('');onChanged();onOpen(r.id)},fail).finally(()=>setBusy(false))}}>تسجيل التحويل</button></div>}
 </section>;
}

function Batches({setup,onOpen,version}:{setup:BankSetup;onOpen:(id:string)=>void;version:number}){
 const [rows,setRows]=useState<Batch[]|null>(null);
 useEffect(()=>{let live=true;booksRequest<Batch[]>('list_batches').then(r=>{if(live)setRows(r)},fail);return()=>{live=false}},[version]);
 const print=(b:Batch)=>{if(!printHtml(listHtml((b.type==='inbound'?'كشف إيداع ':'كشف دفعات ')+b.name,`${setup.journals.find(j=>j.id===b.journalId)?.name||''} · ${formatDate(b.date)} · ${PAYMENT_METHODS[b.method as keyof typeof PAYMENT_METHODS]||b.method}`,
  ['الدفعة','الطرف','المبلغ'],b.payments.map(p=>[p.name,p.partner,amount(p.amount)]),formatDate(todayISO()),'',[['الإجمالي',amount(b.total)]])))toast.error('اسمح بالنوافذ المنبثقة في المتصفح للطباعة.')};
 return <section className="panel"><h2>الدفعات المجمعة</h2><p className="muted">تُنشأ من «الموكلون» أو «الموردون»: حدّد عدة فواتير مفتوحة ثم «دفع المحدد»؛ تُسجل دفعة لكل شريك تحت رقم دفعة مجمعة واحد.</p>
  {rows&&<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الدفعة المجمعة</th><th>النوع</th><th>التاريخ</th><th>الدفعات</th><th>الإجمالي</th><th></th></tr></thead>
   <tbody>{rows.map(b=><tr key={b.id}><td className="mono">{b.name}</td><td>{b.type==='inbound'?'مقبوضات':'مدفوعات'}</td><td>{formatDate(b.date)}</td><td>{b.payments.map(p=><button key={p.id} type="button" className="link mono" onClick={()=>onOpen(p.id)}>{p.name} </button>)}</td>
    <td dir="ltr">{amount(b.total)}</td><td><button className="btn" onClick={()=>print(b)}><Printer size={14}/> طباعة</button></td></tr>)}</tbody></table>{!rows.length&&<Empty title="لا توجد دفعات مجمعة"/>}</div>}
 </section>;
}

/** Paying several open invoices or bills at once: one payment per partner under one batch. */
export function BatchPay({setup,ids,onClose,onDone}:{setup:FullSetup;ids:string[];onClose:()=>void;onDone:()=>void}){
 const journals=setup.journals.filter(j=>j.active&&(j.type==='bank'||j.type==='cash'));
 const [journal,setJournal]=useState(journals[0]?.id||''),[date,setDate]=useState(todayISO()),[method,setMethod]=useState('transfer'),[busy,setBusy]=useState(false);
 return <EditorDialog title={`دفع ${ids.length} مستند`} description="تُسجل دفعة كاملة لكل شريك، وتُجمع تحت رقم دفعة مجمعة واحد للطباعة." busy={busy} onClose={onClose}>
  <div className="form-grid"><FilterSelect label="عبر" value={journal} onChange={setJournal} options={journals.map(j=>({value:j.id,label:`${j.code} · ${j.name}`}))}/><DateField label="التاريخ" value={date} onChange={setDate}/>
   <OfficeSelect label="الطريقة" value={method} onChange={setMethod} options={Object.entries(PAYMENT_METHODS).filter(([k])=>k!=='cheque') as [string,string][]}/></div>
  <div className="actions"><button className="btn primary" disabled={busy||!journal||!date} onClick={()=>{setBusy(true);booksRequest<{name:string;payments:unknown[]}>('batch_pay',{moveIds:ids,journalId:journal,date,method}).then(r=>{toast.success(`سُجلت ${r.payments.length} دفعة تحت ${r.name}`);onDone()},fail).finally(()=>setBusy(false))}}><Check size={15}/> تسجيل الدفعات</button>
   <button className="btn" onClick={onClose}>إلغاء</button></div>
 </EditorDialog>;
}
