import {CIRCUITS} from '@/lib/choices';
import {joinCircuit,splitCircuit,type Circuit} from '@/lib/circuits';
import FilterSelect from './filter-select';
import {Field} from './shared';

const OPTIONS=CIRCUITS.map(c=>({value:c,label:c}));
/**
 * The court in parts: the court from the list (typing only narrows the list, so no abbreviation can be typed), the
 * circuit's number on its own, and — for a session — the hall and the floor.
 */
export default function CircuitField({value,onChange,label='الدائرة',kinds,short=false}:{value:string;onChange:(v:string)=>void;label?:string;kinds?:string[];short?:boolean}){
 const c=splitCircuit(value),set=(p:Partial<Circuit>)=>onChange(joinCircuit({...c,...p}));
 const options=kinds?[...new Set([...kinds,...CIRCUITS])].map(k=>({value:k,label:k})):OPTIONS;
 return <div className="circuit-group">
  <FilterSelect label={label} value={c.kind} onChange={k=>set({kind:k})} options={options} empty="غير محدد"/>
  <Field label="رقم الدائرة" value={c.number} onChange={n=>set({number:n.replace(/[^0-9٠-٩]/g,'')})} placeholder="مثل 5"/>
  {!short&&<><Field label="رقم القاعة" value={c.room} onChange={r=>set({room:r})} placeholder="مثل 30"/>
  <Field label="الدور" value={c.floor} onChange={f=>set({floor:f})} placeholder="مثل 3"/></>}
 </div>;
}
