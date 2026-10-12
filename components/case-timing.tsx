import {remainingDaysLabel} from '@/lib/domain';

/** `calm` (lists): deadlines that ended more than 30 days ago turn grey so recent and upcoming ones stand out. */
export function RemainingDays({days,final=false,warning=5,calm=false}:{days:number|null;final?:boolean;warning?:number;calm?:boolean}){
 const color=final||days===null?'':days<0?(calm&&days< -30?'faded':'red'):days<=warning?'amber':'green';
 return <span className={'tag '+color}>{remainingDaysLabel(days,final)}</span>;
}
