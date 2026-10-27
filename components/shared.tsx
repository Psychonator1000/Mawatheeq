'use client';
import {FilterBox,useListHost} from './filter-select';
import {ChevronDown,FileSearch} from 'lucide-react';
import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {requestData} from '@/lib/client-api';
export function Choice({value,onChange,options,label,className='',empty}:{value:string;onChange:(s:string)=>void;options:string[];label?:string;className?:string;empty?:string}){return <FilterBox label={label||'اختيار'} value={value} onChange={onChange} className={className} empty={empty||'غير مسجل'} options={[...new Set(options.filter(Boolean))].map(s=>({value:s,label:s}))}/>}
/** A text field. With `suggestions`, typing offers matching values already in use (the person can still type a new one). */
export function Field({label,value,onChange,wide=false,multiline=false,placeholder='',type='text',suggestions}:{label:string;value:string;onChange:(s:string)=>void;wide?:boolean;multiline?:boolean;placeholder?:string;type?:string;suggestions?:string[]}){
 const listId=useId(),[open,setOpen]=useState(false),[active,setActive]=useState(-1);
 const box=useRef<HTMLInputElement>(null),list=useRef<HTMLUListElement>(null),{host,aim}=useListHost(open,box,list,value),openList=()=>{if(!open)aim();setOpen(true)};
 if(multiline)return <label className={'field '+(wide?'wide':'')}><span>{label}</span><textarea value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>;
 if(!suggestions?.length)return <label className={'field '+(wide?'wide':'')}><span>{label}</span><input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>;
 // Suggestions open as a list on focus or click and narrow as you type; a value not on the list can still be typed.
 const q=(value||'').trim(),all=[...new Set(suggestions)],shown=(q&&!all.includes(q)?all.filter(o=>o.includes(q)):all).slice(0,40);
 const choose=(o:string)=>{onChange(o);setOpen(false);setActive(-1)};
 return <label className={'field suggest-field '+(wide?'wide':'')}><span>{label}</span><span className="filter-select-box"><input ref={box} type={type} value={value||''} role="combobox" aria-expanded={open&&shown.length>0} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
  placeholder={placeholder||'اختر من القائمة أو اكتب'} onFocus={openList} onClick={openList} onChange={e=>{onChange(e.target.value);openList();setActive(-1)}}
  onBlur={e=>{const v=e.target.value.replace(/\s+/g,' ').trim();if(v!==e.target.value)onChange(v);setTimeout(()=>setOpen(false),120)}}
  onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();openList();setActive(a=>Math.min(a+1,shown.length-1))}else if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(a-1,0))}
   else if(e.key==='Enter'&&open&&active>=0&&shown[active]){e.preventDefault();choose(shown[active])}else if(e.key==='Escape'&&open){e.stopPropagation();setOpen(false)}}}/>
  <ChevronDown size={15} aria-hidden className="filter-select-chevron"/>
  {host&&shown.length>0&&createPortal(<ul ref={list} className="filter-select-list" dir="rtl" id={listId} role="listbox" aria-label={label}>{shown.map((o,i)=><li key={o} role="option" aria-selected={o===value} className={i===active?'active':''} onMouseEnter={()=>setActive(i)} onMouseDown={e=>{e.preventDefault();choose(o)}}><b>{o}</b></li>)}</ul>,host)}</span></label>}
const OTHER='أخرى…';
/** A fixed list with «أخرى…» for a value not on it. A saved value that is not on the list stays as typed text. */
export function PickOrType({label,value,onChange,options,wide=false,empty='غير محدد',hint}:{label:string;value:string;onChange:(s:string)=>void;options:string[];wide?:boolean;empty?:string;hint?:string}){
 // A value written elsewhere (an import, the old register) shows as written; the text box opens only from «أخرى…».
 const known=options.includes(value);const [typing,setTyping]=useState(false);
 return <div className={'field pick-or-type '+(wide?'wide':'')}><label className="field"><span>{label}</span><Choice label={label} empty={empty} value={typing?OTHER:value} onChange={v=>{if(v===OTHER){setTyping(true);onChange('');return}setTyping(false);onChange(v)}} options={[...options,...(value&&!known&&!typing?[value]:[]),OTHER]}/></label>
  {typing&&<input aria-label={label+' (كتابة)'} value={value} onChange={e=>onChange(e.target.value)} placeholder={hint||'اكتب القيمة'} autoFocus={!value}/>}</div>}
export {default as DateField} from './date-picker';
export function Badge({value}:{value:string}){const tone=['لصالحنا','جاهز للتنفيذ','لا يوجد'].includes(value)?'green':['غير صالحنا','انتهت المهلة','جنح'].includes(value)?'red':/بانتظار|غير مؤكد|بيانات|خمسة/.test(value)?'amber':'wine';return <span className={'tag '+tone}>{value||'غير محدد'}</span>}
export function Empty({title='لا توجد نتائج',text='جرّب تعديل البحث أو عوامل التصفية.'}:{title?:string;text?:string}){return <div className="empty-state"><FileSearch/><h3>{title}</h3><p>{text}</p></div>}
export function Count({value}:{value:number}){const [v,setV]=useState(0);useEffect(()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches){setV(value);return}let frame:number;const start=performance.now();const step=(now:number)=>{const t=Math.min(1,(now-start)/650);setV(Math.round(value*(1-Math.pow(1-t,3))));if(t<1)frame=requestAnimationFrame(step)};frame=requestAnimationFrame(step);return()=>cancelAnimationFrame(frame)},[value]);return <>{v.toLocaleString('en-US')}</>}
export const api=requestData;
export function saveBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
