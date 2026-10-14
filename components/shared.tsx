'use client';
import {FilterBox} from './filter-select';
import {FileSearch} from 'lucide-react';
import {useEffect,useId,useState} from 'react';
import {requestData} from '@/lib/client-api';
export function Choice({value,onChange,options,label,className='',empty}:{value:string;onChange:(s:string)=>void;options:string[];label?:string;className?:string;empty?:string}){return <FilterBox label={label||'اختيار'} value={value} onChange={onChange} className={className} empty={empty||'غير مسجل'} options={[...new Set(options.filter(Boolean))].map(s=>({value:s,label:s}))}/>}
/** A text field. With `suggestions`, typing offers matching values already in use (the person can still type a new one). */
export function Field({label,value,onChange,wide=false,multiline=false,placeholder='',type='text',suggestions}:{label:string;value:string;onChange:(s:string)=>void;wide?:boolean;multiline?:boolean;placeholder?:string;type?:string;suggestions?:string[]}){const listId=useId();const list=suggestions?.length&&!multiline?listId:undefined;return <label className={'field '+(wide?'wide':'')}><span>{label}</span>{multiline?<textarea value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>:<input type={type} value={value||''} onChange={e=>onChange(e.target.value)} onBlur={list?e=>{const v=e.target.value.replace(/\s+/g,' ').trim();if(v!==e.target.value)onChange(v)}:undefined} placeholder={placeholder||(list?'اختر من القائمة أو اكتب':'')} list={list} autoComplete={list?'off':undefined}/>}{list&&<datalist id={list}>{suggestions!.map(o=><option key={o} value={o}/>)}</datalist>}</label>}
const OTHER='أخرى…';
/** A fixed list with «أخرى…» for a value not on it. A saved value that is not on the list stays as typed text. */
export function PickOrType({label,value,onChange,options,wide=false,empty='غير محدد',hint}:{label:string;value:string;onChange:(s:string)=>void;options:string[];wide?:boolean;empty?:string;hint?:string}){
 const known=options.includes(value);const [typing,setTyping]=useState(!!value&&!known);
 return <div className={'field pick-or-type '+(wide?'wide':'')}><label className="field"><span>{label}</span><Choice label={label} empty={empty} value={typing?OTHER:known?value:''} onChange={v=>{if(v===OTHER){setTyping(true);onChange('');return}setTyping(false);onChange(v)}} options={[...options,OTHER]}/></label>
  {typing&&<input aria-label={label+' (كتابة)'} value={value} onChange={e=>onChange(e.target.value)} placeholder={hint||'اكتب القيمة'} autoFocus={!value}/>}</div>}
export {default as DateField} from './date-picker';
export function Badge({value}:{value:string}){const tone=['لصالحنا','جاهز للتنفيذ','لا يوجد'].includes(value)?'green':['غير صالحنا','انتهت المهلة','جنح'].includes(value)?'red':/بانتظار|غير مؤكد|بيانات|خمسة/.test(value)?'amber':'wine';return <span className={'tag '+tone}>{value||'غير محدد'}</span>}
export function Empty({title='لا توجد نتائج',text='جرّب تعديل البحث أو عوامل التصفية.'}:{title?:string;text?:string}){return <div className="empty-state"><FileSearch/><h3>{title}</h3><p>{text}</p></div>}
export function Count({value}:{value:number}){const [v,setV]=useState(0);useEffect(()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches){setV(value);return}let frame:number;const start=performance.now();const step=(now:number)=>{const t=Math.min(1,(now-start)/650);setV(Math.round(value*(1-Math.pow(1-t,3))));if(t<1)frame=requestAnimationFrame(step)};frame=requestAnimationFrame(step);return()=>cancelAnimationFrame(frame)},[value]);return <>{v.toLocaleString('en-US')}</>}
export const api=requestData;
export function saveBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
