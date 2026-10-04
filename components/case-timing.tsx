import {remainingDaysLabel} from '@/lib/domain';

export function RemainingDays({days,final=false,warning=5}:{days:number|null;final?:boolean;warning?:number}){
 const color=final||days===null?'':days<0?'red':days<=warning?'amber':'green';
 return <span className={'tag '+color}>{remainingDaysLabel(days,final)}</span>;
}
