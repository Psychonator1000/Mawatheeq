import {useEffect,useState} from 'react';
import {Eraser} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {formatDate} from '@/lib/domain';
import {officeTime} from '../office-shared';
import {DateField} from '../shared';
import {EditorDialog} from './shared';

export type LogClear = {id:string;from:string;to:string;removed:number;kept:number;at:string;by:string};
type Clears = {canClear:boolean;clears:LogClear[]};

/** Who may clear the movement log (the office owner) and every clearing so far. */
export function useLogClears(revision:number){
 const [state,setState]=useState<Clears>({canClear:false,clears:[]});
 useEffect(()=>{let live=true;departmentRequest<Clears>('log_clears',{workspace:'archive'}).then(r=>{if(live)setState(r)}).catch(()=>{});return()=>{live=false}},[revision]);
 return state;
}

/** The last clearing, under the log, so everyone sees that older movements were removed and by whom. */
export function LastClear({clears}:{clears:LogClear[]}){
 const c=clears[0];if(!c)return null;
 return <p className="log-cleared"><Eraser size={14} aria-hidden/> مُسحت حركات {formatDate(c.from)} إلى {formatDate(c.to)} ({c.removed} حركة) · {c.by} · {officeTime(c.at)}{clears.length>1?` · ${clears.length} عمليات مسح`:''}</p>;
}

/**
 * Clearing a date range from the movement log. What a file's custody stands on is kept whatever its date: its latest
 * movement and placement, a hand-out still running, and a short return not yet settled.
 */
export default function ClearLog({first,onClose,onDone}:{first:string;onClose:()=>void;onDone:()=>void}){
 const [from,setFrom]=useState(first),[to,setTo]=useState(''),[sure,setSure]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function run(){setBusy(true);setError('');
  try{const r=await departmentRequest<{removed:number;kept:number}>('clear_log',{workspace:'archive',from,to});
   toast.success(r.removed?`مُسحت ${r.removed} حركة${r.kept?`، وبقيت ${r.kept} لأنها تثبت مكان الملفات الآن`:''}.`:'لا توجد في هذه الفترة حركات يمكن مسحها.');onDone()}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <EditorDialog title="مسح سجل الحركة" description="تُحذف حركات الفترة المختارة نهائياً. لمسؤول المكتب فقط." busy={busy} onClose={onClose}>
  <div className="form-grid"><DateField label="من تاريخ" value={from} onChange={v=>{setFrom(v);setSure(false)}}/><DateField label="إلى تاريخ" value={to} onChange={v=>{setTo(v);setSure(false)}}/></div>
  <p className="notice">تبقى دائماً، مهما كان تاريخها: آخر حركة لكل ملف ومكان حفظه، وحركات الملف الموجود الآن خارج الأرشيف، والإرجاع الناقص الذي لم يُسوَّ. ويُسجَّل المسح باسمك وتاريخه.</p>
  <label className="checkbox-line"><input type="checkbox" checked={sure} disabled={!from||!to} onChange={e=>setSure(e.target.checked)}/> أفهم أن الحركات الممسوحة لا تعود</label>
  {error&&<p className="notice" role="alert">{error}</p>}
  <div className="actions"><button type="button" className="btn primary danger" disabled={busy||!sure||!from||!to} onClick={()=>void run()}><Eraser size={15}/> مسح حركات {from&&to?`${formatDate(from)} إلى ${formatDate(to)}`:'الفترة'}</button>
   <button type="button" className="btn" onClick={onClose}>إلغاء</button></div>
 </EditorDialog>;
}
