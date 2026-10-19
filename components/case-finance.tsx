'use client';
import {lazy,Suspense,useEffect,useState} from 'react';
import {Wallet} from 'lucide-react';
import {departmentPages,ENTRY_TYPES,ledgerTotals,moneyText,type Currency,type LedgerRecord} from '@/lib/departments';
import {formatDate} from '@/lib/domain';
import {useBooksAvailable} from '@/lib/books-api';

const CaseBooks=lazy(()=>import('./departments/books-outside').then(m=>({default:m.CaseBooks})));

/**
 * Fees, payments and expenses recorded in accounting for this case. With the books, the case's invoices and the money
 * handled for it outside the office come first, with a fee invoice and an outside transaction a click away.
 */
export default function CaseFinance({caseId,caseCode='',client='',clientEntityId}:{caseId:string;caseCode?:string;client?:string;clientEntityId?:string}){
 const books=useBooksAvailable();
 const [rows,setRows]=useState<LedgerRecord[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;departmentPages<LedgerRecord>('accounting','records_page').then(r=>{if(active)setRows(r.filter(x=>x.caseId===caseId))}).catch(e=>{if(active)setError((e as Error).message)});return()=>{active=false}},[caseId]);
 if(error)return <p className="notice" role="alert">تعذر تحميل الحركات المالية: {error}</p>;
 if(!rows)return <p role="status">جارٍ تحميل الحركات المالية…</p>;
 const currencies=[...new Set(rows.map(r=>r.payload.currency))] as Currency[];
 const sorted=[...rows].sort((a,b)=>b.payload.date.localeCompare(a.payload.date));
 return <div className="case-finance">
  {books&&<Suspense fallback={null}><CaseBooks caseId={caseId} client={client} clientEntityId={clientEntityId} cases={[{id:caseId,code:caseCode,client}]}/></Suspense>}
  {!rows.length?books?null:<div className="tab-empty"><Wallet aria-hidden/><b>لا توجد حركات مالية مسجلة لهذه القضية</b><p>تُضاف الأتعاب والمقبوضات والمصروفات من «المحاسبة» مع اختيار هذه القضية.</p></div>:<>
  {currencies.map(cur=>{const t=ledgerTotals(rows,cur);return <div className="ledger-summary" key={cur}><div className="ledger-balance"><span>المتبقي من الأتعاب ({cur})</span><b dir="ltr">{moneyText(t.outstanding,cur)}</b><small>الأتعاب − المقبوضات</small></div>
   <div className="ledger-totals">{(['fee','receipt','expense'] as const).map(k=><div key={k}><span>{ENTRY_TYPES[k]}</span><b dir="ltr">{moneyText(t[k],cur)}</b></div>)}</div></div>})}
  <div className="table-wrap"><table className="office-table"><thead><tr><th>التاريخ</th><th>الحركة</th><th>المرجع</th><th>الطرف</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>{sorted.map(r=><tr key={r.id} className={r.payload.status==='void'?'ledger-void':''}><td className="mono">{formatDate(r.payload.date)}</td><td>{ENTRY_TYPES[r.payload.type]}</td><td>{r.payload.reference}</td><td>{r.payload.party}</td><td className="ledger-value" dir="ltr">{moneyText(r.payload.amountMinor,r.payload.currency)}</td><td>{r.payload.status==='void'?'ملغى':'مرحّل'}</td></tr>)}</tbody></table></div></>}
 </div>;
}
