import {useState} from 'react';
import {Check,Copy} from 'lucide-react';
import {copyText} from '@/lib/polyfills';

/** A small chip that copies a reference number with one click and confirms it briefly. */
export default function CopyChip({label,value}:{label:string;value:string}){
 const [copied,setCopied]=useState(false);
 if(!value)return null;
 return <button type="button" className={'copy-chip'+(copied?' copied':'')} aria-label={`نسخ ${label}: ${value}`} title={`نسخ ${label}`} onClick={()=>void copyText(value).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1400)},()=>undefined)}>{copied?<Check/>:<Copy/>}{value}</button>;
}
