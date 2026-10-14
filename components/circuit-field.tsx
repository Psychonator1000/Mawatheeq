import {CIRCUITS} from '@/lib/choices';
import {joinCircuit,splitCircuit,type Circuit} from '@/lib/circuits';
import FilterSelect from './filter-select';
import {Field} from './shared';

const OPTIONS=CIRCUITS.map(c=>({value:c,label:c}));
/** The circuit as three parts: its kind from the list (typing only narrows the list), its circuit or hall number, and the floor. */
export default function CircuitField({value,onChange,label='الدائرة'}:{value:string;onChange:(v:string)=>void;label?:string}){
 const c=splitCircuit(value),set=(p:Partial<Circuit>)=>onChange(joinCircuit({...c,...p}));
 return <div className="circuit-group">
  <FilterSelect label={label} value={c.kind} onChange={k=>set({kind:k})} options={OPTIONS} empty="غير محدد"/>
  <Field label="رقم الدائرة / القاعة" value={c.number} onChange={n=>set({number:n})} placeholder="مثل 5"/>
  <Field label="الدور" value={c.floor} onChange={f=>set({floor:f})} placeholder="مثل 3"/>
 </div>;
}
