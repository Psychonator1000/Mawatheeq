import {useEffect,useState,type ReactNode} from 'react';
import {departmentRequest} from '@/lib/local-auth';
import {departmentPages,type Department,type DepartmentRecord,type CaseSummary} from '@/lib/departments';
import type {Change} from '@/lib/office';
import {clientName} from '@/lib/clients';
import {Field,saveBlob} from '../shared';
import {OfficeSelect,RecordHistory} from '../office-shared';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../ui/dialog';
import {normalizeSearch} from '@/lib/case-browse';
export function useRecords<P>(workspace:Department) {
 const [rows,setRows]=useState<DepartmentRecord<P>[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setError('');departmentPages<DepartmentRecord<P>>(workspace,'records_page').then(r=>{if(active)setRows(r)}).catch(e=>{if(active){setRows([]);setError(e.message)}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[workspace,version]);
 return {rows,loading,error,reload:()=>setVersion(v=>v+1)};
}
export function StatusMessage({loading,error}:{loading:boolean;error:string}) {return <>{loading&&<p role="status">جارٍ تحميل السجلات…</p>}{error&&<p className="notice" role="alert">{error}</p>}</>}
export function EditorDialog({title,description,children,busy,onClose}:{title:string;description:string;children:ReactNode;busy:boolean;onClose:()=>void}) {
 return <Dialog open onOpenChange={open=>!open&&!busy&&onClose()}><DialogContent dir="rtl" className="office-dialog department-dialog"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>;
}
export function CasePicker({value,onChange,cases,optional=false,disabled=false}:{value:string;onChange:(v:string)=>void;cases:CaseSummary[];optional?:boolean;disabled?:boolean}) {
 const [search,setSearch]=useState('');
 const filtered=cases.filter(c=>c.id===value||!c.archived&&normalizeSearch([c.code,c.autoNumber,clientName(c),c.opponent].join(' ')).includes(normalizeSearch(search)));
 return <fieldset className="case-picker" disabled={disabled}><Field label="البحث عن القضية" value={search} onChange={setSearch}/><OfficeSelect label="القضية المرتبطة" value={value} onChange={onChange} empty={optional?'قيد مكتبي غير مرتبط بقضية':'اختر قضية'} options={filtered.map(c=>[c.id,`${c.code||c.autoNumber||'بلا كود'} · ${clientName(c)} / ${c.opponent}`])}/></fieldset>;
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
