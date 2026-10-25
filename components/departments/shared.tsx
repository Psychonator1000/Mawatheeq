import FilterSelect from '../filter-select';
import {useEffect,useState,type ReactNode,useCallback} from 'react';
import {departmentRequest} from '@/lib/local-auth';
import {departmentPages,type Department,type DepartmentRecord,type CaseSummary} from '@/lib/departments';
import type {Change} from '@/lib/office';
import {clientName} from '@/lib/clients';
import {saveBlob} from '../shared';
import {RecordHistory} from '../office-shared';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../ui/dialog';
import {readSnapshot,writeSnapshot} from '@/lib/boot-cache';
export function useRecords<P>(workspace:Department) {
 const [rows,setRows]=useState<DepartmentRecord<P>[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{let active=true,fresh=false;setLoading(true);setError('');
  // Show the last copy at once while the server's copy loads.
  void readSnapshot<DepartmentRecord<P>[]>('dept:'+workspace).then(r=>{if(active&&r&&!fresh){setRows(r);setLoading(false)}});
  departmentPages<DepartmentRecord<P>>(workspace,'records_page').then(r=>{fresh=true;if(active){setRows(r);void writeSnapshot('dept:'+workspace,r)}}).catch(e=>{if(active){setRows([]);setError(e.message)}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[workspace,version]);
 // A quiet refresh keeps the page as it is while it fetches, for changes made elsewhere (a colleague confirming a receipt).
 const refresh=useCallback(()=>departmentPages<DepartmentRecord<P>>(workspace,'records_page').then(r=>{setRows(r);void writeSnapshot('dept:'+workspace,r)}).catch(()=>undefined),[workspace]);
 return {rows,loading,error,reload:()=>setVersion(v=>v+1),refresh};
}
export function StatusMessage({loading,error}:{loading:boolean;error:string}) {return <>{loading&&<p role="status">جارٍ تحميل السجلات…</p>}{error&&<p className="notice" role="alert">{error}</p>}</>}
export function EditorDialog({title,description,children,busy,onClose}:{title:string;description:string;children:ReactNode;busy:boolean;onClose:()=>void}) {
 return <Dialog open onOpenChange={open=>!open&&!busy&&onClose()}><DialogContent dir="rtl" className="office-dialog department-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>;
}
/** The linked case: one list you can type into to narrow it down (code, automatic number, client or opponent). */
export function CasePicker({value,onChange,cases,optional=false,disabled=false}:{value:string;onChange:(v:string)=>void;cases:CaseSummary[];optional?:boolean;disabled?:boolean}) {
 const options=cases.filter(c=>c.id===value||!c.archived).map(c=>({value:c.id,label:`${c.code?'كود '+c.code:'بلا كود'} · ${clientName(c)} / ${c.opponent}`,hint:c.autoNumber?'الرقم الآلي للقضية '+c.autoNumber:undefined}));
 return <FilterSelect label="القضية المرتبطة" value={value} onChange={onChange} options={options} disabled={disabled} empty={optional?'قيد مكتبي غير مرتبط بقضية':'اختر قضية'} className="case-picker"/>;
}
export function DepartmentHistory({workspace,id,revision}:{workspace:Department;id:string;revision:number}) {
 const [rows,setRows]=useState<Change[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;departmentRequest<Change[]>('history',{workspace,id}).then(r=>{if(active)setRows(r)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[workspace,id,revision]);
 return <>{error&&<p role="alert">{error}</p>}{rows?<RecordHistory key={revision} initial={rows} action="history" data={{workspace,id}} request={departmentRequest}/>:<p role="status">جارٍ تحميل سجل التغييرات…</p>}</>;
}
export async function exportCsv(workspace:Department,name:string,rows:unknown[][]) {
 await departmentRequest('check_export',{workspace});
 const cell=(v:unknown)=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
 saveBlob(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),name+'.csv');
}
/** The same rows as an Excel workbook (one sheet), after the same export permission check. */
export async function exportXlsx(workspace:Department,name:string,rows:unknown[][]) {
 await departmentRequest('check_export',{workspace});
 const xlsx=await import('xlsx');const X=(xlsx as unknown as {default?:typeof xlsx}).default||xlsx;
 const book=X.utils.book_new(),sheet=X.utils.aoa_to_sheet(rows.map(r=>r.map(v=>typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v.replace(/,/g,''))&&v.length<16?Number(v.replace(/,/g,'')):v)));
 sheet['!views']=[{RTL:true}] as never;X.utils.book_append_sheet(book,sheet,'Report');
 saveBlob(new Blob([X.write(book,{type:'array',bookType:'xlsx'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name+'.xlsx');
}
