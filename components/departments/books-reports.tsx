import {Fragment,useEffect,useState} from 'react';
import {Printer,Download,FileSpreadsheet} from 'lucide-react';
import {toast} from 'sonner';
import {booksRequest} from '@/lib/local-auth';
import {money,toFils,type BooksSetup} from '@/lib/books';
import {todayISO,formatDate} from '@/lib/domain';
import {listHtml,printHtml} from '@/lib/print';
import {DateField,Empty} from '../shared';
import FilterSelect from '../filter-select';
import {exportCsv,exportXlsx} from './shared';

export type ExtraReport='partners'|'aged_in'|'aged_out'|'cash'|'summary'|'cases'|'journal'|'taxes'|'analytic';
export const EXTRA_REPORTS:[ExtraReport,string][]=[['summary','الملخص التنفيذي'],['partners','دفتر الشركاء'],['aged_in','أعمار ديون الموكلين'],['aged_out','أعمار ديون الموردين'],['cash','التدفقات النقدية'],['cases','ربحية القضايا'],['journal','تقرير الدفتر'],['taxes','تقرير الضريبة'],['analytic','مراكز التكلفة']];
const amount=(v:string)=>money(toFils(v));
// A request sent for approval was announced already; it is not an error.
const fail=(e:unknown)=>{if(!(e as {handled?:boolean}).handled)toast.error((e as Error).message)};
type Table={headers:string[];body:string[][];totals:[string,string][]};
type PartnerRow={partnerId:string;name:string;opening:string;debit:string;credit:string;closing:string;lines:{moveId:string;name:string;date:string;ref:string;label:string;dateMaturity:string|null;debit:string;credit:string;residual:string}[]};
type AgedRow={partnerId:string;name:string;total:string;current:string;d30:string;d60:string;d90:string;d120:string;older:string;lines:{moveId:string;name:string;date:string;due:string;days:number;amount:string}[]};
type CashFlow={opening:string;closing:string;inflow:string;outflow:string;sections:{section:'operating'|'investing'|'financing';accountId:string;code:string;name:string;amount:string}[]};
type Summary={income:string;expenses:string;cash:string;receivable:string;payable:string;overdueReceivable:string;overduePayable:string;invoiced:string;invoices:number;collected:string;bills:string;drafts:number};
type CaseRow={caseId:string;code:string;autoNumber:string;client:string;income:string;expenses:string;recharged:string;open:string;net:string};
type TaxRow={taxId:string;name:string;typeUse:'sale'|'purchase';base:string;tax:string};
type AnalyticRow={analyticId:string;name:string;plan:string;income:string;expenses:string;net:string};
type JournalMove={moveId:string;name:string;date:string;ref:string;partner:string;lines:{code:string;account:string;label:string;debit:string;credit:string}[]};
const AGES:[keyof AgedRow,string][]=[['current','لم يستحق'],['d30','1–30 يوماً'],['d60','31–60'],['d90','61–90'],['d120','91–120'],['older','أكثر من 120']];
const SECTIONS={operating:'الأنشطة التشغيلية',investing:'الأنشطة الاستثمارية',financing:'الأنشطة التمويلية'} as const;

/** The reports beyond the statements: each loads its own data and prints or exports what it shows. */
export function ExtraReports({setup,report,onOpen,canExport,version}:{setup:BooksSetup;report:ExtraReport;onOpen:(id:string)=>void;canExport:boolean;version:number}){
 const today=todayISO(),[from,setFrom]=useState(today.slice(0,4)+'-01-01'),[to,setTo]=useState(today),[asOf,setAsOf]=useState(today),[partner,setPartner]=useState(''),[journal,setJournal]=useState(setup.journals[0]?.id||'');
 const [data,setData]=useState<unknown>(null),[error,setError]=useState(''),[open,setOpen]=useState<string>('');
 useEffect(()=>{let live=true;
  const call=report==='partners'?booksRequest('partner_ledger',{from,to,partnerId:partner,details:true}):report==='aged_in'||report==='aged_out'?booksRequest('aged',{side:report==='aged_in'?'receivable':'payable',asOf})
   :report==='cash'?booksRequest('cash_flow',{from,to}):report==='summary'?booksRequest('executive_summary',{from,to}):report==='cases'?booksRequest('case_report',{from,to}):report==='taxes'?booksRequest('tax_report',{from,to}):report==='analytic'?booksRequest('analytic_report',{from,to}):booksRequest('journal_report',{journalId:journal,from,to});
  call.then(r=>{if(live){setData(r);setError('')}}).catch(e=>{if(live)setError((e as Error).message)});return()=>{live=false}},[report,from,to,asOf,partner,journal,version]);
 const name=EXTRA_REPORTS.find(r=>r[0]===report)![1],scope=report.startsWith('aged')?`في ${formatDate(asOf)}`:`من ${formatDate(from)} إلى ${formatDate(to)}`;
 const table=():Table=>{
  if(!data)return{headers:[],body:[],totals:[]};
  if(report==='partners'){const rows=data as PartnerRow[];return{headers:['الشريك','التاريخ','المستند','البيان','مدين','دائن','الرصيد'],body:rows.flatMap(p=>{let run=toFils(p.opening);
   return [[p.name,'','','رصيد افتتاحي','','',amount(p.opening)],...p.lines.map(l=>{run+=toFils(l.debit)-toFils(l.credit);return ['',formatDate(l.date),l.name,[l.ref,l.label].filter(Boolean).join(' — '),amount(l.debit),amount(l.credit),money(run)]})]}),totals:[]}}
  if(report==='aged_in'||report==='aged_out'){const rows=data as AgedRow[];return{headers:['الشريك',...AGES.map(a=>a[1]),'الإجمالي'],body:rows.map(r=>[r.name,...AGES.map(([k])=>amount(r[k] as string)),amount(r.total)]),
   totals:[['الإجمالي',money(rows.reduce((t,r)=>t+toFils(r.total),0))]]}}
  if(report==='cash'){const c=data as CashFlow;return{headers:['البند','الحساب','المبلغ'],body:(Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]).flatMap(k=>{const ls=c.sections.filter(x=>x.section===k);
   return ls.length?[[SECTIONS[k],'',''],...ls.map(x=>['',x.code+' '+x.name,amount(x.amount)]),['صافي '+SECTIONS[k],'',money(ls.reduce((t,x)=>t+toFils(x.amount),0))]]:[]}),
   totals:[['النقد أول الفترة',amount(c.opening)],['الداخل',amount(c.inflow)],['الخارج',amount(c.outflow)],['النقد آخر الفترة',amount(c.closing)]]}}
  if(report==='summary'){const s=data as Summary;return{headers:['المؤشر','القيمة'],body:summaryRows(s),totals:[]}}
  if(report==='cases'){const rows=data as CaseRow[];return{headers:['القضية','الموكل','الإيرادات','المصروفات','صافي الربح','أتعاب غير محصلة'],body:rows.map(r=>[r.code||r.autoNumber||'—',r.client,amount(r.income),amount(r.expenses),amount(r.net),amount(r.open)]),
   totals:[['صافي الربح',money(rows.reduce((t,r)=>t+toFils(r.net),0))],['غير محصل',money(rows.reduce((t,r)=>t+toFils(r.open),0))]]}}
  if(report==='taxes'){const rows=data as TaxRow[];const due=rows.reduce((t,r)=>t+(r.typeUse==='sale'?1:-1)*toFils(r.tax),0);
   return{headers:['الضريبة','على','الأساس','الضريبة'],body:rows.map(r=>[r.name,r.typeUse==='sale'?'المبيعات':'المشتريات',amount(r.base),amount(r.tax)]),totals:[['ضريبة المخرجات',money(rows.filter(r=>r.typeUse==='sale').reduce((t,r)=>t+toFils(r.tax),0))],['ضريبة المدخلات',money(rows.filter(r=>r.typeUse==='purchase').reduce((t,r)=>t+toFils(r.tax),0))],[due>=0?'الصافي المستحق للسداد':'الصافي القابل للاسترداد',money(Math.abs(due))]]}}
  if(report==='analytic'){const rows=data as AnalyticRow[];return{headers:['مركز التكلفة','الخطة','الإيرادات','المصروفات','الصافي'],body:rows.map(r=>[r.name,r.plan,amount(r.income),amount(r.expenses),amount(r.net)]),totals:[['الصافي',money(rows.reduce((t,r)=>t+toFils(r.net),0))]]}}
  const moves=data as JournalMove[];return{headers:['التاريخ','القيد','الحساب','البيان','مدين','دائن'],body:moves.flatMap(m=>m.lines.map((l,i)=>[i?'':formatDate(m.date),i?'':m.name,l.code+' '+l.account,l.label,amount(l.debit),amount(l.credit)])),
   totals:[['إجمالي المدين',money(moves.reduce((t,m)=>t+m.lines.reduce((u,l)=>u+toFils(l.debit),0),0))],['إجمالي الدائن',money(moves.reduce((t,m)=>t+m.lines.reduce((u,l)=>u+toFils(l.credit),0),0))]]};
 };
 const print=()=>{const t=table();if(!printHtml(listHtml(name,scope,t.headers,t.body,formatDate(today),'',t.totals)))toast.error('اسمح بالنوافذ المنبثقة في المتصفح للطباعة.')};
 const rowsOut=()=>{const t=table();return [[name+' '+scope],t.headers,...t.body,...t.totals.map(([k,v])=>[k,v])]};
 return <>
  <div className="department-filters">{report.startsWith('aged')?<DateField label="في تاريخ" value={asOf} onChange={setAsOf}/>:<><DateField label="من تاريخ" value={from} onChange={setFrom}/><DateField label="إلى تاريخ" value={to} onChange={setTo}/></>}
   {report==='partners'&&<FilterSelect label="الشريك" value={partner} onChange={setPartner} empty="كل الشركاء" options={setup.partners.map(p=>({value:p.id,label:p.name}))}/>}
   {report==='journal'&&<FilterSelect label="الدفتر" value={journal} onChange={setJournal} options={setup.journals.map(j=>({value:j.id,label:`${j.code} · ${j.name}`}))}/>}</div>
  <div className="actions books-report-actions"><button className="btn" onClick={print} disabled={!data}><Printer size={15}/> طباعة / PDF</button>
   {canExport&&<><button className="btn" disabled={!data} onClick={()=>void exportXlsx('accounting','Mawatheeq-'+report,rowsOut()).catch(fail)}><FileSpreadsheet size={15}/> Excel</button>
    <button className="btn" disabled={!data} onClick={()=>void exportCsv('accounting','Mawatheeq-'+report,rowsOut()).catch(fail)}><Download size={15}/> CSV</button></>}</div>
  <p className="subtitle">{name} {scope}. تُحتسب القيود المرحّلة فقط.</p>
  {error&&<p className="notice" role="alert">{error}</p>}{!data&&!error&&<p role="status">جارٍ إعداد التقرير…</p>}
  {data!==null&&report==='summary'&&<SummaryCards s={data as Summary}/>}
  {data!==null&&report==='partners'&&<PartnerLedger rows={data as PartnerRow[]} onOpen={onOpen} open={open} onToggle={id=>setOpen(o=>o===id?'':id)}/>}
  {data!==null&&(report==='aged_in'||report==='aged_out')&&<Aged rows={data as AgedRow[]} onOpen={onOpen} open={open} onToggle={id=>setOpen(o=>o===id?'':id)}/>}
  {data!==null&&report==='cash'&&<Cash c={data as CashFlow}/>}
  {data!==null&&report==='cases'&&<Cases rows={data as CaseRow[]}/>}
  {data!==null&&report==='journal'&&<JournalReport moves={data as JournalMove[]} onOpen={onOpen}/>}
  {data!==null&&(report==='taxes'||report==='analytic')&&<SimpleTable t={table()}/>}
 </>;
}
function summaryRows(s:Summary):string[][]{
 const net=toFils(s.income)-toFils(s.expenses);
 return [['الإيرادات',amount(s.income)],['المصروفات',amount(s.expenses)],['صافي الربح',money(net)],['هامش الربح',toFils(s.income)?Math.round(net*1000/toFils(s.income))/10+'٪':'—'],['النقد في البنك والصندوق',amount(s.cash)],
  ['مستحق من الموكلين',amount(s.receivable)],['منه متأخر',amount(s.overdueReceivable)],['مستحق للموردين',amount(s.payable)],['منه متأخر',amount(s.overduePayable)],['المفوتر للموكلين',`${amount(s.invoiced)} (${s.invoices} فاتورة)`],
  ['المحصل من الموكلين',amount(s.collected)],['فواتير الموردين',amount(s.bills)],['قيود ومستندات بانتظار الترحيل',String(s.drafts)]];
}
function SummaryCards({s}:{s:Summary}){
 const net=toFils(s.income)-toFils(s.expenses);
 return <><dl className="books-totals books-kpis"><div><dt>الإيرادات</dt><dd dir="ltr">{amount(s.income)}</dd></div><div><dt>المصروفات</dt><dd dir="ltr">{amount(s.expenses)}</dd></div><div className={net>=0?'net':'off'}><dt>صافي الربح</dt><dd dir="ltr">{money(net)}</dd></div>
  <div><dt>النقد</dt><dd dir="ltr">{amount(s.cash)}</dd></div><div><dt>مستحق من الموكلين</dt><dd dir="ltr">{amount(s.receivable)}</dd></div><div className={toFils(s.overdueReceivable)?'off':''}><dt>متأخر التحصيل</dt><dd dir="ltr">{amount(s.overdueReceivable)}</dd></div>
  <div><dt>مستحق للموردين</dt><dd dir="ltr">{amount(s.payable)}</dd></div><div><dt>المحصل في الفترة</dt><dd dir="ltr">{amount(s.collected)}</dd></div></dl>
  <div className="table-wrap"><table className="office-table books-table"><tbody>{summaryRows(s).map(([k,v],i)=><tr key={i}><th>{k}</th><td dir="ltr">{v}</td></tr>)}</tbody></table></div></>;
}
function PartnerLedger({rows,onOpen,open,onToggle}:{rows:PartnerRow[];onOpen:(id:string)=>void;open:string;onToggle:(id:string)=>void}){
 if(!rows.length)return <Empty text="لا توجد حركات للشركاء في هذه الفترة."/>;
 return <div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الشريك</th><th>رصيد افتتاحي</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
  {rows.map(p=>{let run=toFils(p.opening);return <tbody key={p.partnerId}><tr className="books-group"><th><button type="button" className="link" aria-expanded={open===p.partnerId} onClick={()=>onToggle(p.partnerId)}>{p.name}</button></th><td dir="ltr">{amount(p.opening)}</td><td dir="ltr">{amount(p.debit)}</td><td dir="ltr">{amount(p.credit)}</td><th dir="ltr">{amount(p.closing)}</th></tr>
   {open===p.partnerId&&p.lines.map((l,i)=>{run+=toFils(l.debit)-toFils(l.credit);return <tr key={i}><td>{formatDate(l.date)} · <button type="button" className="link mono" onClick={()=>onOpen(l.moveId)}>{l.name}</button>{(l.ref||l.label)&&<small> · {l.ref||l.label}</small>}</td><td></td>
    <td dir="ltr">{toFils(l.debit)?amount(l.debit):''}</td><td dir="ltr">{toFils(l.credit)?amount(l.credit):''}</td><td dir="ltr">{money(run)}</td></tr>})}</tbody>})}</table></div>;
}
function Aged({rows,onOpen,open,onToggle}:{rows:AgedRow[];onOpen:(id:string)=>void;open:string;onToggle:(id:string)=>void}){
 if(!rows.length)return <Empty title="لا يوجد مبلغ مفتوح" text="كل الفواتير مسددة."/>;
 const total=(k:keyof AgedRow)=>money(rows.reduce((t,r)=>t+toFils(r[k] as string),0));
 return <div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الشريك</th>{AGES.map(([k,l])=><th key={k}>{l}</th>)}<th>الإجمالي</th></tr></thead>
  <tbody>{rows.map(r=><Fragment key={r.partnerId||'none'}><tr><td><button type="button" className="link" aria-expanded={open===r.partnerId} onClick={()=>onToggle(r.partnerId)}>{r.name}</button></td>{AGES.map(([k])=><td key={k} dir="ltr" className={k!=='current'&&toFils(r[k] as string)?'books-late':''}>{toFils(r[k] as string)?amount(r[k] as string):''}</td>)}<th dir="ltr">{amount(r.total)}</th></tr>
   {open===r.partnerId&&r.lines.map((l,i)=><tr key={i} className="books-sub"><td><button type="button" className="link mono" onClick={()=>onOpen(l.moveId)}>{l.name}</button> · استحقاق {formatDate(l.due)}{l.days>0&&<small className="books-late"> متأخر {l.days} يوماً</small>}</td><td colSpan={AGES.length}></td><td dir="ltr">{amount(l.amount)}</td></tr>)}</Fragment>)}</tbody>
  <tfoot><tr><th>الإجمالي</th>{AGES.map(([k])=><th key={k} dir="ltr">{total(k)}</th>)}<th dir="ltr">{total('total')}</th></tr></tfoot></table></div>;
}
function Cash({c}:{c:CashFlow}){
 const net=toFils(c.closing)-toFils(c.opening);
 return <div className="books-statement">{(Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]).map(k=>{const ls=c.sections.filter(x=>x.section===k),t=ls.reduce((s,x)=>s+toFils(x.amount),0);
   return <section key={k}><h3>{SECTIONS[k]}</h3><table className="office-table"><tbody>{ls.map(x=><tr key={x.accountId}><td>{x.code} {x.name}</td><td dir="ltr" className={toFils(x.amount)<0?'books-out':'books-in'}>{amount(x.amount)}</td></tr>)}{!ls.length&&<tr><td className="muted">لا شيء</td><td></td></tr>}</tbody>
    <tfoot><tr><th>صافي {SECTIONS[k]}</th><th dir="ltr">{money(t)}</th></tr></tfoot></table></section>})}
  <dl className="books-totals"><div><dt>النقد أول الفترة</dt><dd dir="ltr">{amount(c.opening)}</dd></div><div><dt>الداخل</dt><dd dir="ltr">{amount(c.inflow)}</dd></div><div><dt>الخارج</dt><dd dir="ltr">{amount(c.outflow)}</dd></div>
   <div className={net>=0?'net':'off'}><dt>صافي التغير</dt><dd dir="ltr">{money(net)}</dd></div><div><dt>النقد آخر الفترة</dt><dd dir="ltr">{amount(c.closing)}</dd></div></dl></div>;
}
function Cases({rows}:{rows:CaseRow[]}){
 if(!rows.length)return <Empty text="لا توجد قيود مرتبطة بقضايا في هذه الفترة. اربط الفواتير والمصروفات بالقضية لترى ربحيتها."/>;
 return <div className="table-wrap"><table className="office-table books-table"><thead><tr><th>القضية</th><th>الموكل</th><th>الإيرادات</th><th>المصروفات</th><th>صافي الربح</th><th>أتعاب غير محصلة</th></tr></thead>
  <tbody>{rows.map(r=><tr key={r.caseId}><td className="mono">{r.code||r.autoNumber||'—'}</td><td>{r.client}</td><td dir="ltr">{amount(r.income)}</td><td dir="ltr">{amount(r.expenses)}</td><td dir="ltr" className={toFils(r.net)<0?'books-late':''}>{amount(r.net)}</td><td dir="ltr">{amount(r.open)}</td></tr>)}</tbody></table></div>;
}
function JournalReport({moves,onOpen}:{moves:JournalMove[];onOpen:(id:string)=>void}){
 if(!moves.length)return <Empty text="لا توجد قيود مرحّلة في هذا الدفتر خلال الفترة."/>;
 return <div className="table-wrap"><table className="office-table books-table"><thead><tr><th>القيد</th><th>الحساب</th><th>البيان</th><th>مدين</th><th>دائن</th></tr></thead>
  {moves.map(m=><tbody key={m.moveId}><tr className="books-group"><th colSpan={5}><button type="button" className="link mono" onClick={()=>onOpen(m.moveId)}>{m.name}</button> · {formatDate(m.date)}{m.partner&&` · ${m.partner}`}{m.ref&&` · ${m.ref}`}</th></tr>
   {m.lines.map((l,i)=><tr key={i}><td></td><td>{l.code} {l.account}</td><td>{l.label}</td><td dir="ltr">{toFils(l.debit)?amount(l.debit):''}</td><td dir="ltr">{toFils(l.credit)?amount(l.credit):''}</td></tr>)}</tbody>)}</table></div>;
}
function SimpleTable({t}:{t:Table}){
 if(!t.body.length)return <Empty text="لا توجد حركات في هذه الفترة."/>;
 return <><div className="table-wrap"><table className="office-table books-table"><thead><tr>{t.headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{t.body.map((r,i)=><tr key={i}>{r.map((c,k)=><td key={k} dir={k>1?'ltr':undefined}>{c}</td>)}</tr>)}</tbody></table></div>
  {t.totals.length>0&&<dl className="books-totals">{t.totals.map(([k,v])=><div key={k}><dt>{k}</dt><dd dir="ltr">{v}</dd></div>)}</dl>}</>;
}
