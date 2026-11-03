import {CIRCUITS} from '@/lib/choices';
import {joinCircuit,splitCircuit,type Circuit} from '@/lib/circuits';
import {courtPart,joinCourt,COURT_PLACES} from '@/lib/court-names';
import FilterSelect from './filter-select';
import {Field} from './shared';

const OPTIONS=CIRCUITS.map(c=>({value:c,label:c}));
const opts=(list:string[])=>[...new Set(list.filter(Boolean))].map(v=>({value:v,label:v}));
/**
 * The court in parts, each picked from a list (typing only narrows the list, so no abbreviation can be typed):
 * the court itself, the circuit's type and its number — and, for a session, the hall and the floor.
 * Stored together as «المحكمة - نوع الدائرة / الرقم · قاعة · الدور».
 */
export default function CircuitField({value,onChange,label='الدائرة',kinds,short=false}:{value:string;onChange:(v:string)=>void;label?:string;kinds?:string[];short?:boolean}){
 const c=splitCircuit(value),set=(p:Partial<Circuit>)=>onChange(joinCircuit({...c,...p}));
 if(!kinds)return <div className="circuit-group">
  <FilterSelect label={label} value={c.kind} onChange={k=>set({kind:k})} options={OPTIONS} empty="غير محدد"/>
  <Field label="رقم الدائرة" value={c.number} onChange={n=>set({number:n})} placeholder="مثل 5"/>
  <Field label="رقم القاعة" value={c.room} onChange={r=>set({room:r})} placeholder="مثل 30"/>
  <Field label="الدور" value={c.floor} onChange={f=>set({floor:f})} placeholder="مثل 3"/>
 </div>;
 const part=courtPart(c.kind),parts=kinds.map(courtPart);
 return <div className="circuit-group">
  <FilterSelect label="المحكمة" value={part.place} onChange={p=>set({kind:joinCourt(p,part.type)})} options={opts([...COURT_PLACES,...parts.map(x=>x.place),part.place])} empty="غير محدد"/>
  <FilterSelect label="نوع الدائرة" value={part.type} onChange={t=>set({kind:joinCourt(part.place,t)})} options={opts([...parts.map(x=>x.type),...CIRCUITS,part.type])} empty="غير محدد"/>
  <Field label="رقم الدائرة" value={c.number} onChange={n=>set({number:n.replace(/[^0-9٠-٩]/g,'')})} placeholder="مثل 5"/>
  {!short&&<><Field label="رقم القاعة" value={c.room} onChange={r=>set({room:r})} placeholder="مثل 30"/>
  <Field label="الدور" value={c.floor} onChange={f=>set({floor:f})} placeholder="مثل 3"/></>}
 </div>;
}
