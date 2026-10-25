import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {Plus,Printer,Download,FileSpreadsheet,Scale,RotateCcw,Undo2,Ban,Trash2,Check,History,Landmark,Banknote,Receipt,ShoppingCart,NotebookPen,Lock} from 'lucide-react';
import {toast} from 'sonner';
import {BOOKS_NOTICE,booksRequest,type BooksNotice} from '@/lib/local-auth';
import {ACCOUNT_TYPES,DOC_KINDS,GROUP_LABELS,docKindOf,type Doc,type DocKind,JOURNAL_TYPES,MOVE_STATES,PARTNER_KINDS,balanceSheet,balancingLine,fiscalYearStart,money,moveTotals,nextAccountCode,profitAndLoss,runningLedger,toFils,
 type Account,type AccountType,type BooksSetup,type Journal,type JournalType,type LedgerLine,type Move,type MoveLine,type MoveSummary,type Partner,type PartnerKind,type StatementSection,type TrialRow} from '@/lib/books';
import type {CaseSummary} from '@/lib/departments';
import type {Permissions} from '@/lib/permissions';
import {todayISO,formatDate} from '@/lib/domain';
import {clientName} from '@/lib/clients';
import {listHtml,printHtml} from '@/lib/print';
import {Field,DateField,Empty} from '../shared';
import {OfficeSelect,officeTime} from '../office-shared';
import FilterSelect,{FilterBox,type FilterOption} from '../filter-select';
import PageNavigation from '../page-navigation';
import Needs from '../needs';
import {EditorDialog,exportCsv,exportXlsx} from './shared';
import {EXTRA_REPORTS,ExtraReports,type ExtraReport} from './books-reports';
import BankCash,{type BankSetup} from './books-bank';
import Advanced,{AnalyticPanel,CurrenciesPanel,TaxesPanel,type AdvSetup} from './books-advanced';
import OutsideView,{CollectionsToBooks,MonthlyChart} from './books-outside';
import Controls,{type CtlSetup} from './books-controls';
import {InvoiceEditor,InvoicingPanel,PartnerSide,PaymentEditor,ProductsPanel,TermsPanel,blankDoc,type FullSetup} from './books-invoicing';

type View='dashboard'|'customers'|'vendors'|'bank'|'outside'|'advanced'|'controls'|'moves'|'reports'|'config';
type Report='trial'|'ledger'|'pl'|'bs'|ExtraReport;
type Draft=Omit<Move,'lines'>&{lines:MoveLine[]};
const JOURNAL_ICONS:Record<JournalType,typeof Landmark>={bank:Landmark,cash:Banknote,sale:Receipt,purchase:ShoppingCart,general:NotebookPen};
const amount=(v:string)=>money(toFils(v));
const popupBlocked=()=>toast.error('اسمح بالنوافذ المنبثقة في المتصفح للطباعة.');
// A request sent for approval was announced already; it is not an error.
const fail=(e:unknown)=>{if(!(e as {handled?:boolean}).handled)toast.error((e as Error).message)};
const blankLine=():MoveLine=>({accountId:'',partnerId:'',caseId:'',label:'',debit:'',credit:'',dateMaturity:null});
const blankMove=(journalId:string):Draft=>({id:'',journalId,name:'/',moveType:'entry',state:'draft',date:todayISO(),ref:'',narration:'',partnerId:'',caseId:'',reversedFrom:'',reversedBy:'',source:'',revision:0,createdBy:'',postedBy:'',postedAt:null,debit:'0',credit:'0',lines:[blankLine(),blankLine()]});

export {booksAvailable,useBooksAvailable} from '@/lib/books-api';

/**
 * «الدفاتر المحاسبية»: double-entry books for the office. A dashboard of journals, journal entries from draft to
 * posted (numbered per journal and year, reversed rather than edited once posted), the trial balance, the general
 * ledger, the profit and loss and the balance sheet, and the chart of accounts, journals, partners and lock dates.
 */
export default function Books({cases,access,views}:{cases:CaseSummary[];access:Permissions;views:ReactNode}){
 const [setup,setSetup]=useState<BooksSetup|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0),[view,setView]=useState<View>('dashboard');
 const [editing,setEditing]=useState<Draft|null>(null),[doc,setDoc]=useState<Doc|null>(null),[journalFilter,setJournalFilter]=useState(''),[ledgerAccount,setLedgerAccount]=useState(''),[report,setReport]=useState<Report>('trial');
 useEffect(()=>{let live=true;booksRequest<BooksSetup>('setup').then(s=>{if(live){setSetup(s);setError('')}}).catch(e=>{if(live)setError((e as Error).message)});return()=>{live=false}},[version]);
 const reload=()=>setVersion(v=>v+1);
 // Sent for approval instead of posted, or a client over their credit limit: said once, wherever it happened.
 useEffect(()=>{const on=(e:Event)=>{const n=(e as CustomEvent<BooksNotice>).detail;
   if(n.kind==='pending'){toast.message('أُرسل للاعتماد',{description:n.message,action:{label:'طلبات الاعتماد',onClick:()=>setView('controls')}});setVersion(v=>v+1)}else toast.warning(n.message)};
  addEventListener(BOOKS_NOTICE,on);return()=>removeEventListener(BOOKS_NOTICE,on)},[]);
 // Invoices, bills and payments open in their own editor; other entries in the journal entry editor.
 async function open(id:string){try{const m=await booksRequest<Doc>('get_move',{id});if(docKindOf(m)){setEditing(null);setDoc(m)}else{setDoc(null);setEditing(m as unknown as Draft)}}catch(e){fail(e)}}
 const full=setup&&'paymentTerms' in setup?setup as FullSetup:null,bank=setup&&'bank' in setup?setup as BankSetup:null,adv=setup&&'advanced' in setup?setup as AdvSetup:null,links=!!setup&&'links' in setup,ctl=setup&&'controls' in setup?setup as CtlSetup:null;
 const newDoc=(kind:DocKind,partnerId='')=>{if(full){setEditing(null);setDoc(blankDoc(full,kind,partnerId))}};
 const tabs=<div className="work-chips books-tabs" role="group" aria-label="أقسام الدفاتر">{([['dashboard','لوحة المحاسبة'],...(full?[['customers','الموكلون'],['vendors','الموردون']] as const:[]),...(bank?[['bank','البنك والنقد']] as const:[]),...(links?[['outside','المعاملات الخارجية']] as const:[]),...(adv?[['advanced','المحاسبة المتقدمة']] as const:[]),...(ctl?[['controls',ctl.controls.pending&&ctl.controls.canApprove?`الرقابة والاعتماد (${ctl.controls.pending})`:'الرقابة والاعتماد']] as const:[]),['moves','القيود اليومية'],['reports','التقارير المالية'],['config','الحسابات والإعدادات']] as const).map(([k,label])=>
  <button key={k} className={'work-chip'+(view===k?' on':'')} aria-pressed={view===k} onClick={()=>setView(k)}>{label}</button>)}</div>;
 return <>
  {/* One screen: the section's header and the books' pages scrolling inside one panel. */}
  <section className="panel work-desk desk-full"><div className="work-desk-head">{views}</div>{tabs}<div className="work-desk-body books-body">
  {error&&<p className="notice" role="alert">{error}</p>}{!setup&&!error&&<p role="status">جارٍ تحميل الدفاتر…</p>}
  {setup&&<div className="att-section books">
   {view==='dashboard'&&<><Dashboard setup={setup} full={full} onNew={j=>setEditing(blankMove(j))} onNewDoc={newDoc} onList={j=>{setJournalFilter(j);setView('moves')}} onView={setView}/>{links&&<MonthlyChart key={version}/>}</>}
   {full&&(view==='customers'||view==='vendors')&&<PartnerSide key={view} setup={full} cases={cases} side={view==='customers'?'customer':'vendor'} onOpen={id=>void open(id)} onNew={newDoc} onChanged={reload} version={version} canExport={access.canExport}/>}
   {bank&&view==='bank'&&<BankCash setup={bank} onOpen={id=>void open(id)} onChanged={reload} version={version}/>}
   {links&&setup&&view==='outside'&&<OutsideView setup={setup} cases={cases} onOpen={id=>void open(id)} onChanged={reload} version={version}/>}
   {adv&&view==='advanced'&&<Advanced setup={adv} cases={cases} onOpen={id=>void open(id)} onChanged={reload} version={version}/>}
   {ctl&&view==='controls'&&<Controls setup={ctl} onOpen={id=>void open(id)} onChanged={reload} version={version}/>}
   {view==='moves'&&<Moves setup={setup} cases={cases} journal={journalFilter} onJournal={setJournalFilter} onOpen={id=>void open(id)} onNew={()=>setEditing(blankMove(journalFilter||setup.journals.find(j=>j.type==='general')?.id||setup.journals[0]?.id||''))} version={version} canExport={access.canExport}/>}
   {view==='reports'&&<Reports setup={setup} report={report} onReport={setReport} account={ledgerAccount} onAccount={setLedgerAccount} onOpen={id=>void open(id)} canExport={access.canExport} version={version}/>}
   {view==='config'&&<Config setup={setup} full={full} adv={adv} onChanged={reload}/>}
  </div>}
  </div></section>
  {full&&doc&&(doc.paymentType?<PaymentEditor key={doc.id+':'+doc.revision+':'+doc.amountResidual+':'+doc.matches.length} setup={full} cases={cases} initial={doc} onClose={()=>setDoc(null)} onChanged={d=>{reload();setDoc(d)}} onOpen={id=>void open(id)}/>
   :<InvoiceEditor key={doc.id+':'+doc.revision+':'+doc.state+':'+doc.amountResidual+':'+doc.matches.length} setup={full} cases={cases} initial={doc} onClose={()=>setDoc(null)} onChanged={d=>{reload();setDoc(d)}} onOpen={id=>void open(id)} onSetup={reload}/>)}
  {setup&&editing&&<MoveEditor key={editing.id+':'+editing.revision} setup={setup} cases={cases} initial={editing} onClose={()=>setEditing(null)} onChanged={m=>{reload();if(m)setEditing(m);else setEditing(null)}} onOpen={id=>void open(id)}/>}
 </>;
}

function Dashboard({setup,full,onNew,onNewDoc,onList,onView}:{setup:BooksSetup;full:FullSetup|null;onNew:(journalId:string)=>void;onNewDoc:(k:DocKind)=>void;onList:(journalId:string)=>void;onView:(v:View)=>void}){
 const locked=setup.settings.lockDate||setup.settings.fiscalLockDate;
 return <section className="panel"><div className="department-toolbar"><h2>الدفاتر اليومية</h2>{locked&&<span className="tag amber"><Lock size={13}/> مقفل حتى {formatDate(([setup.settings.lockDate,setup.settings.fiscalLockDate].filter(Boolean) as string[]).sort().pop()!)}</span>}</div>
  <div className="books-journals">{setup.journals.filter(j=>j.active).map(j=>{const Icon=JOURNAL_ICONS[j.type],s=setup.journalStats[j.id]||{drafts:0,posted:0,balance:'0'},acc=setup.accounts.find(a=>a.id===j.defaultAccount);
   return <article key={j.id} className="books-journal"><header><Icon size={20}/><div><h3>{j.name}</h3><small>{j.code} · {JOURNAL_TYPES[j.type]}</small></div></header>
    {(j.type==='bank'||j.type==='cash')&&<p className="books-balance"><span>رصيد {acc?.name||'الحساب'}</span><b dir="ltr">{amount(s.balance)}</b></p>}
    {full&&(j.type==='sale'||j.type==='purchase')?(()=>{const k:DocKind=j.type==='sale'?'out_invoice':'in_invoice',st=full.documentStats[k];return <>
     <p className="books-balance"><span>{j.type==='sale'?'بانتظار التحصيل':'بانتظار الدفع'}</span><b dir="ltr">{amount(st?.openAmount||'0')}</b></p>
     <p className="muted">{st?.open??0} مفتوحة{st?.late?` · ${st.late} متأخرة (${amount(st.lateAmount)})`:''}{st?.draft?` · ${st.draft} مسودة`:''}</p>
     <div className="actions">{setup.canEdit&&<button className="btn primary" onClick={()=>onNewDoc(k)}><Plus size={15}/> {DOC_KINDS[k].one} جديدة</button>}<button className="btn" onClick={()=>onView(j.type==='sale'?'customers':'vendors')}>{j.type==='sale'?'الموكلون':'الموردون'}</button></div></>})()
    :<><p className="muted">{s.posted} قيد مرحّل{s.drafts?` · ${s.drafts} مسودة بانتظار الترحيل`:''}</p>
    <div className="actions">{setup.canEdit&&<button className="btn primary" onClick={()=>onNew(j.id)}><Plus size={15}/> قيد في {j.code}</button>}{full&&setup.canEdit&&(j.type==='bank'||j.type==='cash')&&<><button className="btn" onClick={()=>onNewDoc('customer_payment')}>سند قبض</button><button className="btn" onClick={()=>onNewDoc('vendor_payment')}>سند صرف</button></>}<button className="btn" onClick={()=>onList(j.id)}>عرض القيود</button></div></>}</article>})}</div>
  {!setup.canEdit&&<p className="muted">صلاحيتك للقراءة فقط: يمكنك عرض القيود والتقارير دون تعديلها.</p>}
 </section>;
}

function Moves({setup,cases,journal,onJournal,onOpen,onNew,version,canExport}:{setup:BooksSetup;cases:CaseSummary[];journal:string;onJournal:(v:string)=>void;onOpen:(id:string)=>void;onNew:()=>void;version:number;canExport:boolean}){
 const [state,setState]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[q,setQ]=useState(''),[rows,setRows]=useState<MoveSummary[]|null>(null),[error,setError]=useState(''),[page,setPage]=useState(1);
 useEffect(()=>{let live=true;const t=setTimeout(()=>{booksRequest<{moves:MoveSummary[]}>('list_moves',{journalId:journal,state,from,to,q}).then(r=>{if(live){setRows(r.moves);setError('');setPage(1)}}).catch(e=>{if(live)setError((e as Error).message)})},q?250:0);return()=>{live=false;clearTimeout(t)}},[journal,state,from,to,q,version]);
 const jName=(id:string)=>setup.journals.find(j=>j.id===id)?.code||'',pName=(id:string)=>setup.partners.find(p=>p.id===id)?.name||'',cCode=(id:string)=>{const c=cases.find(x=>x.id===id);return c?c.code||c.autoNumber||'':''};
 const list=rows||[],pages=Math.max(1,Math.ceil(list.length/25)),current=Math.min(page,pages);
 const csv=()=>void exportCsv('accounting','Mawatheeq-journal-entries',[['التاريخ','الرقم','الدفتر','المرجع','الشريك','القضية','المبلغ','الحالة'],...list.map(m=>[m.date,m.name,jName(m.journalId),m.ref,pName(m.partnerId),cCode(m.caseId),m.amount,MOVE_STATES[m.state]])]).catch(fail);
 return <section className="panel"><div className="department-toolbar"><h2>القيود اليومية</h2><div className="actions">{canExport&&<button className="btn" onClick={csv}><Download size={15}/> تصدير</button>}{setup.canEdit&&<button className="btn primary" onClick={onNew}><Plus size={15}/> قيد يومية جديد</button>}</div></div>
  <div className="department-filters"><OfficeSelect label="الدفتر" value={journal} onChange={onJournal} empty="كل الدفاتر" options={setup.journals.map(j=>[j.id,`${j.code} · ${j.name}`])}/>
   <OfficeSelect label="الحالة" value={state} onChange={setState} empty="كل الحالات" options={Object.entries(MOVE_STATES) as [string,string][]}/>
   <DateField label="من تاريخ" value={from} onChange={setFrom}/><DateField label="إلى تاريخ" value={to} onChange={setTo}/></div>
  <Field label="بحث في القيود" value={q} onChange={setQ} placeholder="الرقم أو المرجع أو البيان أو الشريك"/>
  {error&&<p className="notice" role="alert">{error}</p>}{!rows&&!error&&<p role="status">جارٍ تحميل القيود…</p>}
  {rows&&<><div className="table-wrap"><table className="office-table books-table"><thead><tr><th>التاريخ</th><th>الرقم</th><th>الدفتر</th><th>المرجع</th><th>الشريك</th><th>القضية</th><th>المبلغ</th><th>الحالة</th><th></th></tr></thead>
   <tbody>{list.slice((current-1)*25,current*25).map(m=><tr key={m.id} className={m.state==='cancel'?'ledger-void':''}><td>{formatDate(m.date)}</td><td className="mono">{m.name==='/'?'—':m.name}</td><td>{jName(m.journalId)}</td><td>{m.ref||'—'}</td><td>{pName(m.partnerId)||'—'}</td><td>{cCode(m.caseId)||'—'}</td>
    <td className="ledger-value" dir="ltr">{amount(m.amount)}</td><td><span className={'tag '+(m.state==='posted'?'green':m.state==='draft'?'amber':'')}>{MOVE_STATES[m.state]}</span>{m.reversedFrom&&<small> عكسي</small>}</td><td><button className="btn" onClick={()=>onOpen(m.id)}>فتح القيد</button></td></tr>)}</tbody></table></div>
   {!list.length&&<Empty text="لا توجد قيود مطابقة. أنشئ قيداً أو غيّر التصفية."/>}<PageNavigation page={current} pages={pages} total={list.length} onChange={setPage}/></>}
 </section>;
}

function MoveEditor({setup,cases,initial,onClose,onChanged,onOpen}:{setup:BooksSetup;cases:CaseSummary[];initial:Draft;onClose:()=>void;onChanged:(m:Move|null)=>void;onOpen:(id:string)=>void}){
 const [m,setM]=useState<Draft>(initial),[busy,setBusy]=useState(false),[reverse,setReverse]=useState<{date:string;reason:string}|null>(null),[history,setHistory]=useState<{action:string;at:string;by:string}[]|null>(null);
 const editable=setup.canEdit&&m.state==='draft',journal=setup.journals.find(j=>j.id===m.journalId),t=moveTotals(m.lines);
 const analytic:FilterOption[]=('analytic' in setup?(setup as AdvSetup).analytic:[]).filter(a=>a.active||m.lines.some(l=>l.analyticId===a.id)).map(a=>({value:a.id,label:a.name,hint:a.plan}));
 const lock=[setup.settings.fiscalLockDate,...(setup.canConfigure?[]:[setup.settings.lockDate])].filter(Boolean).sort().pop()||'';
 const accounts:FilterOption[]=useMemo(()=>setup.accounts.filter(a=>!a.deprecated||m.lines.some(l=>l.accountId===a.id)).map(a=>({value:a.id,label:a.code+' '+a.name,hint:ACCOUNT_TYPES[a.type].label})),[setup.accounts,m.lines]);
 const partners:FilterOption[]=setup.partners.filter(p=>p.active||p.id===m.partnerId).map(p=>({value:p.id,label:p.name,hint:PARTNER_KINDS[p.kind]}));
 const caseOptions:FilterOption[]=cases.filter(c=>c.id===m.caseId||!c.archived).map(c=>({value:c.id,label:`${c.code?'كود '+c.code:'بلا كود'} · ${clientName(c)} / ${c.opponent}`,hint:c.autoNumber?'الرقم الآلي '+c.autoNumber:undefined}));
 const set=(p:Partial<Draft>)=>setM(x=>({...x,...p})),line=(i:number,p:Partial<MoveLine>)=>setM(x=>({...x,lines:x.lines.map((l,k)=>k===i?{...l,...p}:l)}));
 const dated=m.date&&lock&&m.date<=lock;
 const needs=editable?[!m.journalId&&'اختر الدفتر',!m.date&&'اختر التاريخ',dated&&`التاريخ ضمن فترة مقفلة (حتى ${formatDate(lock)})`,m.lines.some(l=>(l.debit||l.credit)&&!l.accountId)&&'اختر الحساب في كل سطر به مبلغ',!t.valid&&(t.both?'سطر فيه مدين ودائن معاً':'راجع المبالغ: أرقام فقط وحتى ثلاث خانات عشرية')]:[];
 const postNeeds=[...needs,!t.balanced&&(t.difference?`القيد غير متوازن: الفرق ${money(t.difference<0?-t.difference:t.difference)}`:'يحتاج القيد سطرين على الأقل بمبالغ')];
 async function act(fn:()=>Promise<Move|null>,done:string){setBusy(true);try{const r=await fn();toast.success(done);onChanged(r)}catch(e){fail(e)}finally{setBusy(false)}}
 const save=()=>booksRequest<Move>('save_move',{move:{...m,id:m.id||undefined,lines:m.lines.filter(l=>l.accountId||l.debit||l.credit||l.label)}});
 const post=()=>act(async()=>{const s=await save();return booksRequest<Move>('post',{id:s.id,revision:s.revision})},'رُحّل القيد');
 const title=m.id?(m.name==='/'?'قيد مسودة':m.name):'قيد يومية جديد';
 return <EditorDialog title={title} description={`${journal?journal.name:'—'} · ${MOVE_STATES[m.state]}${m.postedBy?` · رحّله ${m.postedBy}`:''}`} busy={busy} onClose={onClose}>
  <div className="books-editor">
   {m.reversedFrom&&<p className="muted">هذا قيد عكسي. <button type="button" className="link" onClick={()=>onOpen(m.reversedFrom)}>فتح القيد الأصلي</button></p>}
   {m.reversedBy&&<p className="notice">عُكس هذا القيد. <button type="button" className="link" onClick={()=>onOpen(m.reversedBy)}>فتح القيد العكسي</button></p>}
   <div className="form-grid">
    <FilterSelect label="الدفتر" value={m.journalId} onChange={v=>set({journalId:v})} disabled={!editable||m.name!=='/'} options={setup.journals.filter(j=>j.active||j.id===m.journalId).map(j=>({value:j.id,label:`${j.code} · ${j.name}`}))}/>
    {editable?<DateField label="تاريخ القيد" value={m.date} onChange={v=>set({date:v})}/>:<label className="field"><span>تاريخ القيد</span><input readOnly value={formatDate(m.date)}/></label>}
    <label className="field"><span>المرجع</span><input value={m.ref} readOnly={!editable} onChange={e=>set({ref:e.target.value})} maxLength={200}/></label>
    <FilterSelect label="الشريك" value={m.partnerId} onChange={v=>set({partnerId:v})} disabled={!editable} empty="بلا شريك" options={partners}/>
    <FilterSelect label="القضية" value={m.caseId} onChange={v=>set({caseId:v})} disabled={!editable} empty="قيد مكتبي غير مرتبط بقضية" options={caseOptions} className="case-picker"/>
   </div>
   <div className="table-wrap"><table className="office-table books-lines"><thead><tr><th>الحساب</th><th>البيان</th><th>الشريك</th>{analytic.length>0&&<th>مركز التكلفة</th>}<th>مدين</th><th>دائن</th>{editable&&<th></th>}</tr></thead>
    <tbody>{m.lines.map((l,i)=><tr key={i}>
     <td>{editable?<FilterBox label={`حساب السطر ${i+1}`} value={l.accountId} onChange={v=>line(i,{accountId:v})} options={accounts}/>:accounts.find(a=>a.value===l.accountId)?.label}</td>
     <td>{editable?<input aria-label={`بيان السطر ${i+1}`} value={l.label} onChange={e=>line(i,{label:e.target.value})} maxLength={300}/>:l.label}</td>
     <td>{editable?<FilterBox label={`شريك السطر ${i+1}`} value={l.partnerId} onChange={v=>line(i,{partnerId:v})} empty="شريك القيد" options={partners}/>:setup.partners.find(p=>p.id===l.partnerId)?.name}</td>
     {analytic.length>0&&<td>{editable?<FilterBox label={`مركز تكلفة السطر ${i+1}`} value={l.analyticId||''} onChange={v=>line(i,{analyticId:v})} empty="بلا" options={analytic}/>:analytic.find(x=>x.value===l.analyticId)?.label}</td>}
     <td>{editable?<input aria-label={`مدين السطر ${i+1}`} dir="ltr" inputMode="decimal" value={l.debit} onChange={e=>line(i,{debit:e.target.value,...(e.target.value?{credit:''}:{})})}/>:<span dir="ltr">{toFils(l.debit)?amount(l.debit):''}</span>}</td>
     <td>{editable?<input aria-label={`دائن السطر ${i+1}`} dir="ltr" inputMode="decimal" value={l.credit} onChange={e=>line(i,{credit:e.target.value,...(e.target.value?{debit:''}:{})})}/>:<span dir="ltr">{toFils(l.credit)?amount(l.credit):''}</span>}</td>
     {editable&&<td><button type="button" className="btn icon" aria-label={`حذف السطر ${i+1}`} disabled={m.lines.length<=1} title={m.lines.length<=1?'يبقى سطر واحد على الأقل':undefined} onClick={()=>setM(x=>({...x,lines:x.lines.filter((_,k)=>k!==i)}))}><Trash2 size={14}/></button></td>}
    </tr>)}</tbody>
    <tfoot><tr><th colSpan={analytic.length>0?4:3}>الإجمالي{t.valid&&t.difference!==0&&<span className="books-diff"> · الفرق {money(t.difference<0?-t.difference:t.difference)}</span>}</th><th dir="ltr">{money(t.debit)}</th><th dir="ltr">{money(t.credit)}</th>{editable&&<th></th>}</tr></tfoot></table></div>
   {editable&&<div className="actions"><button type="button" className="btn" onClick={()=>setM(x=>({...x,lines:[...x.lines,{...blankLine(),label:x.lines[x.lines.length-1]?.label||''}]}))}><Plus size={15}/> سطر</button>
    <button type="button" className="btn" disabled={!t.valid||t.difference===0} title={t.difference===0?'القيد متوازن':undefined} onClick={()=>{const last=[...m.lines].reverse().find(l=>l.accountId),add=balancingLine(m.lines,journal?.defaultAccount||'',last?.label||'');if(add)setM(x=>({...x,lines:[...x.lines.filter(l=>l.accountId||l.debit||l.credit),add]}))}}><Scale size={15}/> موازنة القيد</button></div>}
   <label className="field wide"><span>ملاحظات داخلية</span><textarea value={m.narration} readOnly={!editable} onChange={e=>set({narration:e.target.value})} maxLength={4000}/></label>
   {editable&&<Needs items={postNeeds}/>}
   {reverse&&<div className="books-reverse panel"><h3>عكس القيد</h3><p className="muted">يُنشأ قيد معاكس بالمبالغ نفسها ويُرحّل فوراً، ويبقى القيد الأصلي كما هو في السجل.</p>
    <div className="form-grid"><DateField label="تاريخ القيد العكسي" value={reverse.date} onChange={v=>setReverse({...reverse,date:v})}/><Field label="السبب" value={reverse.reason} onChange={v=>setReverse({...reverse,reason:v})}/></div>
    <Needs items={[reverse.date&&lock&&reverse.date<=lock&&`التاريخ ضمن فترة مقفلة (حتى ${formatDate(lock)})`]}/>
    <div className="actions"><button className="btn primary" disabled={busy||!reverse.date||(!!lock&&reverse.date<=lock)} onClick={()=>void act(()=>booksRequest<Move>('reverse',{id:m.id,...reverse}),'أُنشئ القيد العكسي ورُحّل')}>عكس القيد</button><button className="btn" onClick={()=>setReverse(null)}>تراجع</button></div></div>}
   {history&&<ul className="books-history">{history.map((h,i)=><li key={i}><b>{({save:'حفظ',post:'ترحيل',reset_draft:'إعادة إلى مسودة',cancel:'إلغاء',reverse:'إنشاء كعكس',delete:'حذف'} as Record<string,string>)[h.action]||h.action}</b> · {h.by} · {officeTime(h.at)}</li>)}{!history.length&&<li>لا يوجد سجل بعد.</li>}</ul>}
   <div className="actions">
    {editable&&<><button className="btn primary" disabled={busy||postNeeds.some(Boolean)} onClick={()=>void post()}><Check size={15}/> ترحيل</button>
     <button className="btn" disabled={busy||needs.some(Boolean)} onClick={()=>void act(save,'حُفظت المسودة')}>حفظ كمسودة</button></>}
    {setup.canEdit&&m.state==='posted'&&!m.reversedBy&&!reverse&&<button className="btn" disabled={busy} onClick={()=>setReverse({date:todayISO(),reason:''})}><Undo2 size={15}/> عكس القيد</button>}
    {setup.canEdit&&m.id&&m.state!=='draft'&&<button className="btn" disabled={busy||!!(lock&&m.date<=lock)||!!m.reversedBy} title={m.reversedBy?'لهذا القيد قيد عكسي مرحّل':lock&&m.date<=lock?'القيد ضمن فترة مقفلة':undefined}
     onClick={()=>void act(()=>booksRequest<Move>('reset_draft',{id:m.id,revision:m.revision}),'أُعيد القيد إلى مسودة')}><RotateCcw size={15}/> إعادة إلى مسودة</button>}
    {setup.canEdit&&m.id&&m.state==='draft'&&<button className="btn" disabled={busy} onClick={()=>void act(()=>booksRequest<Move>('cancel',{id:m.id,revision:m.revision}),'أُلغي القيد')}><Ban size={15}/> إلغاء القيد</button>}
    {setup.canEdit&&m.id&&m.state==='draft'&&m.name==='/'&&<button className="btn danger" disabled={busy} onClick={()=>{if(confirm('حذف هذه المسودة نهائياً؟'))void act(async()=>{await booksRequest('delete_move',{id:m.id,revision:m.revision});return null},'حُذفت المسودة')}}><Trash2 size={15}/> حذف المسودة</button>}
    {m.id&&<button className="btn" onClick={()=>booksRequest<{action:string;at:string;by:string}[]>('history',{id:m.id}).then(setHistory,fail)}><History size={15}/> السجل</button>}
    <button className="btn" disabled={busy} onClick={onClose}>إغلاق</button>
   </div>
  </div>
 </EditorDialog>;
}

const REPORTS:[Report,string][]=[['trial','ميزان المراجعة'],['ledger','دفتر الأستاذ العام'],['pl','الأرباح والخسائر'],['bs','الميزانية العمومية']];
// A period moved back by whole years, or the period of the same length just before it.
function shiftPeriod(from:string,to:string,how:'year'|'previous'):{from:string;to:string}{
 const d=(s:string)=>new Date(s+'T00:00:00Z'),iso=(x:Date)=>x.toISOString().slice(0,10);
 if(how==='year'){const a=d(from),b=d(to);a.setUTCFullYear(a.getUTCFullYear()-1);b.setUTCFullYear(b.getUTCFullYear()-1);return{from:iso(a),to:iso(b)}}
 const days=Math.round((d(to).getTime()-d(from).getTime())/864e5),end=d(from);end.setUTCDate(end.getUTCDate()-1);const start=new Date(end);start.setUTCDate(start.getUTCDate()-days);return{from:iso(start),to:iso(end)};
}
function Reports({setup,report,onReport,account,onAccount,onOpen,canExport,version}:{setup:BooksSetup;report:Report;onReport:(r:Report)=>void;account:string;onAccount:(a:string)=>void;onOpen:(id:string)=>void;canExport:boolean;version:number}){
 const extras=('reports' in setup?EXTRA_REPORTS:[]).filter(([k])=>(k!=='taxes'||('taxesEnabled' in setup&&setup.taxesEnabled))&&(k!=='analytic'||'advanced' in setup));
 const tabs=<div className="department-tabs books-report-tabs" role="group" aria-label="التقارير المالية">{[...REPORTS,...extras].map(([k,label])=><button key={k} className={'btn '+(report===k?'primary':'')} aria-pressed={report===k} onClick={()=>onReport(k)}>{label}</button>)}</div>;
 if(EXTRA_REPORTS.some(r=>r[0]===report))return <section className="panel">{tabs}<ExtraReports key={report} setup={setup} report={report as ExtraReport} onOpen={onOpen} canExport={canExport} version={version}/></section>;
 return <StatementReports setup={setup} report={report} onReport={onReport} account={account} onAccount={onAccount} onOpen={onOpen} canExport={canExport} version={version} tabs={tabs}/>;
}
function StatementReports({setup,report,onReport,account,onAccount,onOpen,canExport,version,tabs}:{setup:BooksSetup;report:Report;onReport:(r:Report)=>void;account:string;onAccount:(a:string)=>void;onOpen:(id:string)=>void;canExport:boolean;version:number;tabs:ReactNode}){
 const today=todayISO(),yearStart=fiscalYearStart(today,setup.settings.fiscalYearEnd);
 const [from,setFrom]=useState(yearStart),[to,setTo]=useState(today),[rows,setRows]=useState<TrialRow[]|null>(null),[lines,setLines]=useState<LedgerLine[]|null>(null),[error,setError]=useState('');
 const [compare,setCompare]=useState<''|'year'|'previous'>(''),[prior,setPrior]=useState<TrialRow[]|null>(null);
 // The balance sheet is at a date: its trial balance runs from the start of that date's fiscal year.
 const rFrom=report==='bs'?fiscalYearStart(to||today,setup.settings.fiscalYearEnd):from;
 useEffect(()=>{let live=true;
  const tb=booksRequest<TrialRow[]>('trial_balance',{from:rFrom,to}),gl=report==='ledger'?booksRequest<LedgerLine[]>('general_ledger',{from:rFrom,to,accountId:account}):Promise.resolve(null);
  // A comparison: the same report for last year or the period before (a balance sheet at the same date last year).
  const cmp=compare&&(report==='pl'||report==='bs')?(report==='bs'?(()=>{const p=shiftPeriod(rFrom,to||today,'year');return{from:fiscalYearStart(p.to,setup.settings.fiscalYearEnd),to:p.to}})():shiftPeriod(rFrom,to||today,compare)):null;
  const pr=cmp?booksRequest<TrialRow[]>('trial_balance',cmp):Promise.resolve(null);
  Promise.all([tb,gl,pr]).then(([a,b,c])=>{if(live){setRows(a);setLines(b);setPrior(c);setError('')}}).catch(e=>{if(live)setError((e as Error).message)});return()=>{live=false}},[report,rFrom,to,account,version,compare,today,setup.settings.fiscalYearEnd]);
 const accountOptions=setup.accounts.map(a=>({value:a.id,label:a.code+' '+a.name}));
 const scope=report==='bs'?`في ${formatDate(to||today)}`:`من ${from?formatDate(from):'البداية'} إلى ${formatDate(to||today)}`;
 const name=REPORTS.find(r=>r[0]===report)![1];
 const table=():{headers:string[];body:string[][];totals:[string,string][]}=>{
  if(!rows)return{headers:[],body:[],totals:[]};
  if(report==='trial')return{headers:['الرمز','الحساب','رصيد افتتاحي','مدين','دائن','الرصيد'],body:rows.map(r=>[r.code,r.name,amount(r.opening),amount(r.debit),amount(r.credit),amount(r.balance)]),totals:[['إجمالي المدين',money(rows.reduce((s,r)=>s+toFils(r.debit),0))],['إجمالي الدائن',money(rows.reduce((s,r)=>s+toFils(r.credit),0))]]};
  if(report==='ledger'){const byAcc=ledgerGroups(lines||[],rows);return{headers:['الحساب','التاريخ','القيد','المرجع / البيان','مدين','دائن','الرصيد'],body:byAcc.flatMap(g=>[[g.label,'','','رصيد افتتاحي','','',money(g.opening)],...g.lines.map(l=>['',formatDate(l.date),l.name,[l.ref,l.label].filter(Boolean).join(' — '),amount(l.debit),amount(l.credit),money(l.running)])]),totals:[]}}
  const st=report==='pl'?profitAndLoss(rows):balanceSheet(rows);
  const secs:StatementSection[]='sections' in st?st.sections:[st.assets,st.liabilities,st.equity];
  const old=prior?(report==='pl'?profitAndLoss(prior).sections:(()=>{const b=balanceSheet(prior);return [b.assets,b.liabilities,b.equity]})()):null;
  const was=(key:string,id:string,name:string)=>{const sec=old?.find(x=>x.key===key);const l=sec?.lines.find(x=>id?x.accountId===id:x.name===name);return l?l.amount:0};
  const totals:[string,string][]='net' in st?[['مجمل الربح',money(st.gross)],['الربح التشغيلي',money(st.operating)],['صافي الربح',money(st.net)]]:[['إجمالي الأصول',money(st.assets.total)],['الالتزامات وحقوق الملكية',money(st.totalLiabilitiesEquity)]];
  return{headers:['البند','الحساب','المبلغ',...(old?['المقارنة','التغير']:[])],body:secs.flatMap(s=>{const o=old?.find(x=>x.key===s.key)?.total||0;
   return [[s.label,'',''],...s.lines.map(l=>['',(l.code?l.code+' ':'')+l.name,money(l.amount),...(old?[money(was(s.key,l.accountId,l.name)),money(l.amount-was(s.key,l.accountId,l.name))]:[])]),['إجمالي '+s.label,'',money(s.total),...(old?[money(o),money(s.total-o)]:[])]]}),totals};
 };
 const print=()=>{const t=table();if(!printHtml(listHtml(name,scope,t.headers,t.body,formatDate(today),'',t.totals)))popupBlocked()};
 const out=()=>{const t=table();return [[name+' '+scope],t.headers,...t.body,...t.totals.map(([k,v])=>[k,v])]};
 return <section className="panel">{tabs}
  <div className="department-filters">{report!=='bs'&&<DateField label="من تاريخ" value={from} onChange={setFrom}/>}<DateField label={report==='bs'?'في تاريخ':'إلى تاريخ'} value={to} onChange={setTo}/>
   {report==='ledger'&&<FilterSelect label="الحساب" value={account} onChange={onAccount} empty="كل الحسابات" options={accountOptions}/>}
   {(report==='pl'||report==='bs')&&<OfficeSelect label="مقارنة" value={compare} onChange={v=>setCompare(v as ''|'year'|'previous')} empty="بلا مقارنة" options={report==='pl'?[['year','الفترة نفسها من العام السابق'],['previous','الفترة السابقة مباشرة']]:[['year','التاريخ نفسه من العام السابق']]}/>}</div>
  <div className="actions books-report-actions"><button className="btn" onClick={print} disabled={!rows}><Printer size={15}/> طباعة / PDF</button>{canExport&&<><button className="btn" disabled={!rows} onClick={()=>void exportXlsx('accounting','Mawatheeq-'+report,out()).catch(fail)}><FileSpreadsheet size={15}/> Excel</button>
   <button className="btn" onClick={()=>void exportCsv('accounting','Mawatheeq-'+report,out()).catch(fail)} disabled={!rows}><Download size={15}/> CSV</button></>}</div>
  <p className="subtitle">{name} {scope}. تُحتسب القيود المرحّلة فقط.</p>
  {error&&<p className="notice" role="alert">{error}</p>}{!rows&&!error&&<p role="status">جارٍ إعداد التقرير…</p>}
  {rows&&report==='trial'&&<TrialTable rows={rows} onAccount={id=>{onAccount(id);onReport('ledger')}}/>}
  {rows&&report==='ledger'&&lines&&<LedgerTable groups={ledgerGroups(lines,rows)} onOpen={onOpen}/>}
  {rows&&(report==='pl'||report==='bs')&&<Statement rows={rows} prior={prior} kind={report} onAccount={id=>{onAccount(id);onReport('ledger')}}/>}
 </section>;
}
function TrialTable({rows,onAccount}:{rows:TrialRow[];onAccount:(id:string)=>void}){
 const total=(k:'opening'|'debit'|'credit'|'balance')=>money(rows.reduce((s,r)=>s+toFils(r[k]),0));
 if(!rows.length)return <Empty text="لا توجد قيود مرحّلة في هذه الفترة."/>;
 return <div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الحساب</th><th>النوع</th><th>رصيد افتتاحي</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
  <tbody>{rows.map(r=><tr key={r.accountId}><td><button type="button" className="link" onClick={()=>onAccount(r.accountId)}>{r.code} {r.name}</button></td><td>{ACCOUNT_TYPES[r.type]?.label}</td>{(['opening','debit','credit','balance'] as const).map(k=><td key={k} className="ledger-value" dir="ltr">{amount(r[k])}</td>)}</tr>)}</tbody>
  <tfoot><tr><th colSpan={2}>الإجمالي</th>{(['opening','debit','credit','balance'] as const).map(k=><th key={k} dir="ltr">{total(k)}</th>)}</tr></tfoot></table></div>;
}
function ledgerGroups(lines:LedgerLine[],rows:TrialRow[]){
 const by=new Map<string,LedgerLine[]>();for(const l of lines)by.set(l.accountId,[...(by.get(l.accountId)||[]),l]);
 return [...by.entries()].map(([id,ls])=>{const r=rows.find(x=>x.accountId===id),opening=r?toFils(r.opening):0;return{id,label:r?r.code+' '+r.name:'',opening,lines:runningLedger(ls,opening)}});
}
function LedgerTable({groups,onOpen}:{groups:ReturnType<typeof ledgerGroups>;onOpen:(id:string)=>void}){
 if(!groups.length)return <Empty text="لا توجد حركات مرحّلة لهذا الحساب في الفترة."/>;
 return <div className="table-wrap"><table className="office-table books-table"><thead><tr><th>التاريخ</th><th>القيد</th><th>المرجع / البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
  {groups.map(g=><tbody key={g.id}><tr className="books-group"><th colSpan={5}>{g.label}<small> · رصيد افتتاحي</small></th><th dir="ltr">{money(g.opening)}</th></tr>
   {g.lines.map((l,i)=><tr key={l.moveId+i}><td>{formatDate(l.date)}</td><td><button type="button" className="link mono" onClick={()=>onOpen(l.moveId)}>{l.name}</button></td><td>{[l.ref,l.label].filter(Boolean).join(' — ')||'—'}</td><td className="ledger-value" dir="ltr">{toFils(l.debit)?amount(l.debit):''}</td><td className="ledger-value" dir="ltr">{toFils(l.credit)?amount(l.credit):''}</td><td className="ledger-value" dir="ltr">{money(l.running)}</td></tr>)}</tbody>)}</table></div>;
}
function Statement({rows,prior,kind,onAccount}:{rows:TrialRow[];prior:TrialRow[]|null;kind:'pl'|'bs';onAccount:(id:string)=>void}){
 const pl=kind==='pl'?profitAndLoss(rows):null,bs=kind==='bs'?balanceSheet(rows):null;
 const secs=pl?pl.sections:[bs!.assets,bs!.liabilities,bs!.equity];
 const old=prior?(kind==='pl'?profitAndLoss(prior).sections:(()=>{const b=balanceSheet(prior);return [b.assets,b.liabilities,b.equity]})()):null;
 const oldPl=prior&&kind==='pl'?profitAndLoss(prior):null;
 // Lines in either period, so an account used only last year still shows.
 const merged=(key:string,lines:StatementSection['lines'])=>{const o=old?.find(x=>x.key===key)?.lines||[];return [...lines,...o.filter(x=>!lines.some(l=>x.accountId?l.accountId===x.accountId:l.name===x.name)).map(x=>({...x,amount:0}))]};
 const was=(key:string,id:string,name:string)=>old?.find(x=>x.key===key)?.lines.find(x=>id?x.accountId===id:x.name===name)?.amount||0;
 const change=(now:number,then:number)=><><td className="ledger-value" dir="ltr">{money(then)}</td><td className="ledger-value" dir="ltr">{money(now-then)}{then?<small> ({Math.round((now-then)*1000/Math.abs(then))/10}٪)</small>:null}</td></>;
 return <div className="books-statement">{secs.map(s=><section key={s.key}><h3>{s.label}</h3><table className="office-table">{old&&<thead><tr><th></th><th>الفترة</th><th>المقارنة</th><th>التغير</th></tr></thead>}<tbody>{merged(s.key,s.lines).map((l,i)=><tr key={l.accountId||i}><td>{l.accountId?<button type="button" className="link" onClick={()=>onAccount(l.accountId)}>{l.code} {l.name}</button>:l.name}</td><td className="ledger-value" dir="ltr">{money(l.amount)}</td>{old&&change(l.amount,was(s.key,l.accountId,l.name))}</tr>)}
   {!s.lines.length&&!old&&<tr><td className="muted">لا شيء</td><td></td></tr>}</tbody><tfoot><tr><th>إجمالي {s.label}</th><th dir="ltr">{money(s.total)}</th>{old&&change(s.total,old.find(x=>x.key===s.key)?.total||0)}</tr></tfoot></table></section>)}
  {oldPl&&pl&&<p className="muted">صافي الربح في فترة المقارنة: <b dir="ltr">{money(oldPl.net)}</b> · التغير <b dir="ltr">{money(pl.net-oldPl.net)}</b></p>}
  {pl&&<dl className="books-totals"><div><dt>مجمل الربح</dt><dd dir="ltr">{money(pl.gross)}</dd></div><div><dt>الربح التشغيلي</dt><dd dir="ltr">{money(pl.operating)}</dd></div><div className="net"><dt>صافي الربح</dt><dd dir="ltr">{money(pl.net)}</dd></div></dl>}
  {bs&&<dl className="books-totals"><div><dt>إجمالي الأصول</dt><dd dir="ltr">{money(bs.assets.total)}</dd></div><div><dt>الالتزامات وحقوق الملكية</dt><dd dir="ltr">{money(bs.totalLiabilitiesEquity)}</dd></div>
   <div className={bs.balanced?'net':'off'}><dt>{bs.balanced?'الميزانية متوازنة':'الميزانية غير متوازنة'}</dt><dd dir="ltr">{bs.balanced?'✓':money(bs.assets.total-bs.totalLiabilitiesEquity)}</dd></div></dl>}
 </div>;
}

function Config({setup,full,adv,onChanged}:{setup:BooksSetup;full:FullSetup|null;adv:AdvSetup|null;onChanged:()=>void}){
 const [tab,setTab]=useState<'accounts'|'journals'|'partners'|'products'|'terms'|'invoicing'|'taxes'|'currencies'|'analytic'|'locks'>('accounts'),[account,setAccount]=useState<Account|null>(null),[journal,setJournal]=useState<Journal|null>(null),[partner,setPartner]=useState<Partner|null>(null),[q,setQ]=useState('');
 const why=setup.canConfigure?undefined:'يحتاج تعديل دليل الحسابات والدفاتر والإقفال صلاحية الإعدادات';
 const groups=(Object.keys(GROUP_LABELS) as (keyof typeof GROUP_LABELS)[]);
 const shown=setup.accounts.filter(a=>!q||(a.code+' '+a.name).includes(q));
 return <section className="panel"><div className="department-toolbar"><div className="department-tabs" role="group" aria-label="إعدادات الدفاتر">{([['accounts','دليل الحسابات'],['journals','الدفاتر'],['partners','الشركاء'],...(full?[['products','الخدمات'],['terms','شروط الدفع'],['invoicing','الفوترة ونقل الدفتر القديم']] as const:[]),...(adv?[['taxes','الضرائب'],['currencies','العملات'],['analytic','مراكز التكلفة']] as const:[]),['locks','الإقفال والسنة المالية']] as const).map(([k,l])=><button key={k} className={'btn '+(tab===k?'primary':'')} aria-pressed={tab===k} onClick={()=>setTab(k)}>{l}</button>)}</div>
   <div className="actions">{tab==='accounts'&&<button className="btn primary" disabled={!setup.canConfigure} title={why} onClick={()=>setAccount({id:'',code:nextAccountCode(setup.accounts,'expense'),name:'',type:'expense',reconcile:false,deprecated:false,note:'',revision:0})}><Plus size={15}/> حساب جديد</button>}
    {tab==='journals'&&<button className="btn primary" disabled={!setup.canConfigure} title={why} onClick={()=>setJournal({id:'',code:'',name:'',type:'general',defaultAccount:'',active:true,revision:0})}><Plus size={15}/> دفتر جديد</button>}
    {tab==='partners'&&<button className="btn primary" disabled={!setup.canEdit} title={setup.canEdit?undefined:'صلاحيتك للقراءة فقط'} onClick={()=>setPartner({id:'',name:'',kind:'customer',clientEntityId:'',phone:'',email:'',reference:'',note:'',active:true,revision:0})}><Plus size={15}/> شريك جديد</button>}</div></div>
  {tab==='accounts'&&<><Field label="بحث في الحسابات" value={q} onChange={setQ} placeholder="الرمز أو الاسم"/>
   <div className="books-scroll">{groups.map(g=>{const list=shown.filter(a=>ACCOUNT_TYPES[a.type].group===g);return list.length?<div key={g} className="table-wrap"><h3>{GROUP_LABELS[g]}</h3><table className="office-table books-table"><thead><tr><th>الرمز</th><th>الحساب</th><th>النوع</th><th>للمطابقة</th><th></th></tr></thead>
    <tbody>{list.map(a=><tr key={a.id} className={a.deprecated?'ledger-void':''}><td className="mono">{a.code}</td><td>{a.name}{a.deprecated&&<small> · موقوف</small>}</td><td>{ACCOUNT_TYPES[a.type].label}</td><td>{a.reconcile?'نعم':'—'}</td><td><button className="btn" onClick={()=>setAccount(a)}>{setup.canConfigure?'تعديل':'عرض'}</button></td></tr>)}</tbody></table></div>:null})}</div></>}
  {tab==='journals'&&<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الرمز</th><th>الدفتر</th><th>النوع</th><th>الحساب الافتراضي</th><th>الحالة</th><th></th></tr></thead>
   <tbody>{setup.journals.map(j=><tr key={j.id}><td className="mono">{j.code}</td><td>{j.name}</td><td>{JOURNAL_TYPES[j.type]}</td><td>{setup.accounts.find(a=>a.id===j.defaultAccount)?.name||'—'}</td><td>{j.active?'فعّال':'موقوف'}</td><td><button className="btn" onClick={()=>setJournal(j)}>{setup.canConfigure?'تعديل':'عرض'}</button></td></tr>)}</tbody></table></div>}
  {tab==='partners'&&<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الشريك</th><th>النوع</th><th>الهاتف</th><th>المرجع</th><th></th></tr></thead>
   <tbody>{setup.partners.map(p=><tr key={p.id} className={p.active?'':'ledger-void'}><td>{p.name}</td><td>{PARTNER_KINDS[p.kind]}</td><td dir="ltr">{p.phone||'—'}</td><td>{p.reference||'—'}</td><td><button className="btn" onClick={()=>setPartner(p)}>{setup.canEdit?'تعديل':'عرض'}</button></td></tr>)}</tbody></table>{!setup.partners.length&&<Empty title="لا يوجد شركاء بعد" text="أضف الموكلين والموردين لربطهم بالقيود والتقارير."/>}</div>}
  {tab==='locks'&&<Locks setup={setup} onChanged={onChanged}/>}
  {full&&tab==='products'&&<ProductsPanel setup={full} onChanged={onChanged}/>}{full&&tab==='terms'&&<TermsPanel setup={full} onChanged={onChanged}/>}{full&&tab==='invoicing'&&<div className="books-cols"><InvoicingPanel setup={full} onChanged={onChanged}/>{'links' in setup&&<CollectionsToBooks setup={setup} onChanged={onChanged}/>}</div>}
  {adv&&tab==='taxes'&&<TaxesPanel setup={adv} onChanged={onChanged}/>}{adv&&tab==='currencies'&&<CurrenciesPanel setup={adv} onChanged={onChanged}/>}{adv&&tab==='analytic'&&<AnalyticPanel setup={adv} onChanged={onChanged}/>}
  {account&&<AccountEditor setup={setup} initial={account} onClose={()=>setAccount(null)} onSaved={()=>{setAccount(null);onChanged()}}/>}
  {journal&&<JournalEditor setup={setup} initial={journal} onClose={()=>setJournal(null)} onSaved={()=>{setJournal(null);onChanged()}}/>}
  {partner&&<PartnerEditor setup={setup} initial={partner} onClose={()=>setPartner(null)} onSaved={()=>{setPartner(null);onChanged()}}/>}
 </section>;
}
function useSave(onSaved:()=>void){const [busy,setBusy]=useState(false);return{busy,run:async(fn:()=>Promise<unknown>,done:string)=>{setBusy(true);try{await fn();toast.success(done);onSaved()}catch(e){fail(e)}finally{setBusy(false)}}}}
function AccountEditor({setup,initial,onClose,onSaved}:{setup:BooksSetup;initial:Account;onClose:()=>void;onSaved:()=>void}){
 const [a,setA]=useState(initial),{busy,run}=useSave(onSaved),ro=!setup.canConfigure;
 const needs=[!/^[0-9A-Za-z.]{1,12}$/.test(a.code.trim())&&'رمز الحساب: حتى 12 رقماً أو حرفاً لاتينياً',!a.name.trim()&&'اكتب اسم الحساب',setup.accounts.some(x=>x.code===a.code.trim()&&x.id!==a.id)&&'رمز الحساب مستخدم لحساب آخر'];
 return <EditorDialog title={a.id?'الحساب '+initial.code:'حساب جديد'} description="نوع الحساب يحدد مكانه في الميزانية العمومية أو قائمة الأرباح والخسائر." busy={busy} onClose={onClose}><div className="form-grid">
  <label className="field"><span>رمز الحساب</span><input dir="ltr" value={a.code} readOnly={ro} onChange={e=>setA({...a,code:e.target.value})}/></label><Field label="اسم الحساب" value={a.name} onChange={v=>ro||setA({...a,name:v})}/>
  <FilterSelect label="نوع الحساب" value={a.type} disabled={ro} onChange={v=>setA({...a,type:v as AccountType,code:a.id?a.code:nextAccountCode(setup.accounts,v as AccountType)})} options={(Object.entries(ACCOUNT_TYPES) as [AccountType,{label:string;group:keyof typeof GROUP_LABELS}][]).map(([k,v])=>({value:k,label:v.label,hint:GROUP_LABELS[v.group]}))}/>
  <label className="check"><input type="checkbox" checked={a.reconcile} disabled={ro} onChange={e=>setA({...a,reconcile:e.target.checked})}/> يسمح بالمطابقة (ذمم الموكلين والموردين والحسابات الوسيطة)</label>
  {a.id&&<label className="check"><input type="checkbox" checked={a.deprecated} disabled={ro} onChange={e=>setA({...a,deprecated:e.target.checked})}/> موقوف: لا يُختار في القيود الجديدة</label>}
  <Field label="ملاحظات" value={a.note} onChange={v=>ro||setA({...a,note:v})} wide multiline/></div>
  {!ro&&<Needs items={needs}/>}
  <div className="actions">{!ro&&<button className="btn primary" disabled={busy||needs.some(Boolean)} onClick={()=>void run(()=>booksRequest('save_account',{account:{...a,id:a.id||undefined}}),'حُفظ الحساب')}>حفظ الحساب</button>}<button className="btn" onClick={onClose}>إغلاق</button></div>
 </EditorDialog>;
}
function JournalEditor({setup,initial,onClose,onSaved}:{setup:BooksSetup;initial:Journal;onClose:()=>void;onSaved:()=>void}){
 const [j,setJ]=useState(initial),{busy,run}=useSave(onSaved),ro=!setup.canConfigure;
 const needs=[!/^[A-Z0-9]{1,6}$/.test(j.code)&&'رمز الدفتر: حتى 6 أحرف لاتينية كبيرة أو أرقام',!j.name.trim()&&'اكتب اسم الدفتر',(j.type==='bank'||j.type==='cash')&&!j.defaultAccount&&'اختر حساب البنك أو الصندوق',setup.journals.some(x=>x.code===j.code&&x.id!==j.id)&&'رمز الدفتر مستخدم'];
 return <EditorDialog title={j.id?'الدفتر '+initial.code:'دفتر جديد'} description="لكل دفتر ترقيم مستقل لقيوده في كل سنة، مثل BNK1/2026/0001." busy={busy} onClose={onClose}><div className="form-grid">
  <label className="field"><span>رمز الدفتر</span><input dir="ltr" value={j.code} readOnly={ro} onChange={e=>setJ({...j,code:e.target.value.toUpperCase()})} maxLength={6}/></label><Field label="اسم الدفتر" value={j.name} onChange={v=>ro||setJ({...j,name:v})}/>
  <OfficeSelect label="نوع الدفتر" value={j.type} onChange={v=>ro||setJ({...j,type:v as JournalType})} options={Object.entries(JOURNAL_TYPES) as [string,string][]}/>
  <FilterSelect label="الحساب الافتراضي" value={j.defaultAccount} disabled={ro} onChange={v=>setJ({...j,defaultAccount:v})} empty="بلا حساب افتراضي" options={setup.accounts.filter(a=>!a.deprecated).map(a=>({value:a.id,label:a.code+' '+a.name}))}/>
  {j.id&&<label className="check"><input type="checkbox" checked={j.active} disabled={ro} onChange={e=>setJ({...j,active:e.target.checked})}/> فعّال</label>}</div>
  {!ro&&<Needs items={needs}/>}
  <div className="actions">{!ro&&<button className="btn primary" disabled={busy||needs.some(Boolean)} onClick={()=>void run(()=>booksRequest('save_journal',{journal:{...j,id:j.id||undefined}}),'حُفظ الدفتر')}>حفظ الدفتر</button>}<button className="btn" onClick={onClose}>إغلاق</button></div>
 </EditorDialog>;
}
function PartnerEditor({setup,initial,onClose,onSaved}:{setup:BooksSetup;initial:Partner;onClose:()=>void;onSaved:()=>void}){
 const [p,setP]=useState(initial),{busy,run}=useSave(onSaved),ro=!setup.canEdit,set=(x:Partial<Partner>)=>ro||setP({...p,...x});
 return <EditorDialog title={p.id?initial.name:'شريك جديد'} description="الموكلون والموردون ومن تتعامل معهم الدفاتر؛ يظهر الشريك في القيود والتقارير." busy={busy} onClose={onClose}><div className="form-grid">
  <Field label="اسم الشريك" value={p.name} onChange={v=>set({name:v})}/><OfficeSelect label="النوع" value={p.kind} onChange={v=>set({kind:v as PartnerKind})} options={Object.entries(PARTNER_KINDS) as [string,string][]}/>
  <Field label="الهاتف" value={p.phone} onChange={v=>set({phone:v})} type="tel"/><Field label="البريد الإلكتروني" value={p.email} onChange={v=>set({email:v})} type="email"/>
  <Field label="المرجع" value={p.reference} onChange={v=>set({reference:v})}/>{p.id&&<label className="check"><input type="checkbox" checked={p.active} disabled={ro} onChange={e=>set({active:e.target.checked})}/> فعّال</label>}
  <Field label="ملاحظات" value={p.note} onChange={v=>set({note:v})} wide multiline/></div>
  {!ro&&<Needs items={[!p.name.trim()&&'اكتب اسم الشريك']}/>}
  <div className="actions">{!ro&&<button className="btn primary" disabled={busy||!p.name.trim()} onClick={()=>void run(()=>booksRequest('save_partner',{partner:{...p,id:p.id||undefined}}),'حُفظ الشريك')}>حفظ الشريك</button>}<button className="btn" onClick={onClose}>إغلاق</button></div>
 </EditorDialog>;
}
function Locks({setup,onChanged}:{setup:BooksSetup;onChanged:()=>void}){
 const s=setup.settings,[lock,setLock]=useState(s.lockDate||''),[fiscal,setFiscal]=useState(s.fiscalLockDate||''),[yearEnd,setYearEnd]=useState(s.fiscalYearEnd),{busy,run}=useSave(onChanged),ro=!setup.canConfigure;
 const needs=[fiscal<(s.fiscalLockDate||'')&&'لا يمكن إرجاع تاريخ إقفال السنة المالية إلى الوراء',!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(yearEnd)&&'نهاية السنة المالية بالشكل شهر-يوم، مثل 12-31'];
 return <div className="books-locks"><p className="muted">إقفال الفترة يمنع الموظفين من إضافة قيود أو تعديلها حتى تاريخه، ويبقى لصاحب صلاحية الإعدادات. إقفال السنة المالية يمنع الجميع ولا يُرجع إلى الوراء.</p>
  <div className="form-grid">{ro?<><label className="field"><span>إقفال الفترة حتى</span><input readOnly value={s.lockDate?formatDate(s.lockDate):'—'}/></label><label className="field"><span>إقفال السنة المالية حتى</span><input readOnly value={s.fiscalLockDate?formatDate(s.fiscalLockDate):'—'}/></label></>
   :<><DateField label="إقفال الفترة حتى" value={lock} onChange={setLock}/><DateField label="إقفال السنة المالية حتى" value={fiscal} onChange={setFiscal}/></>}
   <label className="field"><span>نهاية السنة المالية (شهر-يوم)</span><input dir="ltr" value={yearEnd} readOnly={ro} onChange={e=>setYearEnd(e.target.value)} placeholder="12-31"/></label>
   <label className="field"><span>العملة</span><input readOnly value={s.currency}/></label></div>
  {!ro&&<><Needs items={needs}/><div className="actions"><button className="btn primary" disabled={busy||needs.some(Boolean)} onClick={()=>void run(()=>booksRequest('save_settings',{lockDate:lock,fiscalLockDate:fiscal,taxLockDate:s.taxLockDate||'',fiscalYearEnd:yearEnd,revision:s.revision}),'حُفظت إعدادات الإقفال')}><Lock size={15}/> حفظ الإقفال</button></div></>}
 </div>;
}
