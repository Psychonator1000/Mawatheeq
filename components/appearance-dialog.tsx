import {useState} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {BACKDROPS,DEFAULT_APPEARANCE,MOTION_LEVELS,THEMES,loadAppearance,saveAppearance,type Appearance} from '@/lib/appearance';

/** Colour theme, background animation and motion level; saved on this device and applied instantly. */
export default function AppearanceDialog({onClose}:{onClose:()=>void}) {
 const [value,setValue]=useState<Appearance>(loadAppearance);
 const set=<K extends keyof Appearance>(key:K,next:Appearance[K])=>{const updated={...value,[key]:next};setValue(updated);saveAppearance(updated)};
 const group=<K extends keyof Appearance>(key:K,title:string,options:Record<string,{label:string;hint?:string;swatch?:string;accent?:string}>,swatches=false)=>
  <fieldset className="appearance-section"><legend><h3>{title}</h3></legend><div className={swatches?'swatches':'choice-list'}>{Object.entries(options).map(([id,o])=>
   <label key={id} className="choice"><input type="radio" name={key} value={id} checked={value[key]===id} onChange={()=>set(key,id as Appearance[K])}/>{o.swatch&&<span className="swatch-dot" style={{background:`linear-gradient(135deg,${o.accent||o.swatch} 0 38%,${o.swatch} 62%)`}}/>}<span>{o.label}{o.hint&&<small>{o.hint}</small>}</span></label>)}</div></fieldset>;
 return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent dir="rtl" className="office-dialog appearance-dialog"><DialogHeader><DialogTitle>المظهر والحركة</DialogTitle><DialogDescription>تُحفظ اختياراتك على هذا الجهاز وتطبق فوراً، ولا تؤثر على السجلات أو الزملاء.</DialogDescription></DialogHeader>
  {group('theme','لون الواجهة',THEMES,true)}
  {group('backdrop','الخلفية المتحركة',BACKDROPS)}
  {group('motion','مستوى الحركة',MOTION_LEVELS)}
  <p className="subtitle">إذا كان جهازك مضبوطاً على تقليل الحركة، تبقى الواجهة ثابتة مهما كان الاختيار.</p>
  <div className="actions"><button className="btn" onClick={()=>{setValue(DEFAULT_APPEARANCE);saveAppearance(DEFAULT_APPEARANCE)}}>استعادة الافتراضي</button><button className="btn primary" onClick={onClose}>تم</button></div>
 </DialogContent></Dialog>;
}
