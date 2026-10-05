import {officeRequest} from './local-auth';
import type {OfficeContext,OfficeData,Review,WorkItem} from './office';

export async function officePages<T>(action:string,data:Record<string,unknown>={},size=500):Promise<T[]> {
 const result:T[]=[];
 for(let offset=0;;offset+=size){const rows=await officeRequest<T[]>(action,{...data,offset});result.push(...rows);if(rows.length<size)return result;}
}
export async function loadOffice():Promise<OfficeData> {
 const [context,reviews,work]=await Promise.all([officeRequest<OfficeContext>('context'),officePages<Review>('reviews_page'),officePages<WorkItem>('work_page')]);
 return {context,reviews,work,loadedAt:new Date().toISOString()};
}
export async function exportOfficeData() {
 const names=['case_reviews','case_evidence','case_changes','work_items','work_changes'];
 return Object.fromEntries(await Promise.all(names.map(async kind=>[kind,await officePages('export_page',{kind},100)])));
}
