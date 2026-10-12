'use client';
import {useState} from 'react';
import {lawyerKey} from '@/lib/lawyer-match';
import {Choice} from './shared';

const OTHER='اسم آخر…';
/** The case's lawyer: pick one of the office's lawyers as written on the cases, or type a new name. */
export default function LawyerSelect({value,onChange,options,warnOnChange}:{value:string;onChange:(v:string)=>void;options:string[];warnOnChange?:string}){
 const known=options.find(o=>lawyerKey(o)===lawyerKey(value));
 const [typing,setTyping]=useState(!!value&&!known);
 const [original]=useState(value);
 return <div className="field lawyer-select"><label className="field"><span>المحامي</span>
  <Choice label="المحامي" empty="غير محدد" value={typing?OTHER:known||''} onChange={v=>{if(v===OTHER){setTyping(true);return}setTyping(false);onChange(v)}} options={[...options,OTHER]}/></label>
  {typing&&<input aria-label="اسم المحامي" value={value} onChange={e=>onChange(e.target.value)} placeholder="اكتب اسم المحامي كما يُكتب في القضايا" autoFocus/>}
  {warnOnChange&&lawyerKey(value)!==lawyerKey(original)&&<small className="office-alert">{warnOnChange}</small>}
 </div>;
}
