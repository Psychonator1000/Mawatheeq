/** «الأرشيف»: physical files, where each one is kept, who holds it, and the custody log behind that. */
import type {DepartmentRecord} from './departments';

export type LocationData = {code:string;name:string;cabinet:string;shelf:string;box:string;capacity:string;notes:string};
export type FileData = {number:string;title:string;type:string;volume:string;pages:string;locationId:string;originals:'yes'|'no';confidential:'yes'|'no';intakeDate:string;retentionUntil:string;notes:string;
 /** Important items, one per line (chiefly originals); checked out with the file and checked again on its return. */
 contents?:string;
 /** Set by the server: a file that cannot be found, and who last confirmed holding it. */
 lost?:''|'yes';lostAt?:string;lostNote?:string;lostBy?:string;lostHolder?:string;foundAt?:string;foundBy?:string;foundNote?:string};
export type MovementType = 'checkout'|'court'|'client'|'return'|'move'|'audit';
export type CustodyState = 'in'|'staff'|'court'|'client';
export type MovementData = {type:MovementType;date:string;holder:string;holderId:string;purpose:string;dueDate:string;locationId:string;notes:string;status:'posted'|'void';voidReason:string;fromState:CustodyState;toState:CustodyState;
 /** Set by the server on a hand-out to an account: the recipient confirms receipt, then reports the return the archive approves. */
 receipt?:''|'pending'|'received';receivedAt?:string;returnClaimedAt?:string;batchId?:string;
 unplaced?:''|'yes';contents?:string;pages?:string;receivedMissing?:string;rejections?:{at:string;by:string;reason:string;claimedAt:string}[];
 /** On a return: whether it came back whole, what was missing, and how that was settled. */
 returnCheck?:''|'complete'|'missing';missing?:string;pagesBack?:string;fromHolder?:string;fromHolderId?:string;missingResolvedAt?:string;missingResolution?:string;missingResolvedBy?:string};
export type RequestStatus = 'pending'|'ready'|'done'|'declined';
export type RequestData = {requester:string;requesterId:string;neededBy:string;purpose:string;status:RequestStatus;notes:string;decisionNote:string};
export type ArchiveLocation = DepartmentRecord<LocationData>;
export type ArchiveFile = DepartmentRecord<FileData>;
export type ArchiveMovement = DepartmentRecord<MovementData>;
export type ArchiveRequest = DepartmentRecord<RequestData>;

export const CUSTODY_STATES: Record<CustodyState,string> = {in:'في الأرشيف',staff:'مع موظف',court:'لدى جهة خارجية',client:'سُلّم للموكل'};
/** Each movement, the states it may start from, and the state it leaves the file in. */
export const MOVEMENTS: Record<MovementType,{label:string;verb:string;from:CustodyState[];to:CustodyState|null}> = {
 checkout:{label:'تسليم لموظف',verb:'سلّم الملف',from:['in'],to:'staff'},
 court:{label:'إرسال لجهة خارجية',verb:'أرسل الملف',from:['in','staff'],to:'court'},
 client:{label:'تسليم للموكل',verb:'سلّم الأصول للموكل',from:['in'],to:'client'},
 return:{label:'إعادة للأرشيف',verb:'استلم الملف',from:['staff','court','client'],to:'in'},
 move:{label:'نقل إلى موقع آخر',verb:'نقل الملف',from:['in'],to:'in'},
 audit:{label:'جرد وتأكيد الوجود',verb:'جرد الملف',from:['in'],to:'in'},
};
/** The holder is a person for hand-outs and a body (court, expert, ministry…) when sent out. */
export const needsHolder = (t:MovementType) => t==='checkout'||t==='court'||t==='client';
export const FILE_TYPES = ['ملف قضية','ملف تنفيذ','ملف تحصيل','مستندات أصلية','سندات وشيكات','وكالات','عقود','مراسلات','ملف موكل','ملف إداري'];
export const OUTSIDE_BODIES = ['المحكمة الكلية','محكمة الاستئناف','محكمة التمييز','إدارة التنفيذ','إدارة الخبراء','النيابة العامة','وزارة العدل','الموكل'];
export const PURPOSES = ['حضور جلسة','إعداد مذكرة','مراجعة المحامي','تصوير مستندات','تقديم للخبير','إجراء تنفيذ','اطلاع الموكل','توقيع'];
export const REQUEST_STATUSES: Record<RequestStatus,string> = {pending:'بانتظار التجهيز',ready:'جاهز للتسليم',done:'سُلّم',declined:'معتذر عنه'};

export type Custody = {state:CustodyState;locationId:string;holder:string;holderId:string;dueDate:string;since:string;purpose:string;lastAudit:string;last:ArchiveMovement|null};
/** Posted movements of one file in the order they were recorded (the server's own order). */
/** Server record time as a number: string comparison would depend on the browser's locale and on trimmed fractions. */
export const recordedAt=(m:{createdAt:string})=>{const t=Date.parse(m.createdAt);return Number.isNaN(t)?0:t};
export function fileMovements(fileId:string,movements:ArchiveMovement[]) {
 return movements.filter(m=>m.subjectId===fileId).sort((a,b)=>recordedAt(a)-recordedAt(b)||(a.id<b.id?-1:a.id>b.id?1:0));
}
/** Where the file is and who holds it: the latest posted movement decides, as on the server. */
export function custodyOf(file:ArchiveFile,movements:ArchiveMovement[]):Custody {
 const posted=fileMovements(file.id,movements).filter(m=>m.payload.status==='posted');
 const c:Custody={state:'in',locationId:file.payload.locationId,holder:'',holderId:'',dueDate:'',since:file.payload.intakeDate,purpose:'',lastAudit:'',last:null};
 for(const m of posted){const p=m.payload;
  c.state=p.toState;c.last=m;c.since=p.date;
  if(p.locationId)c.locationId=p.locationId;else if(p.type==='move'&&p.unplaced==='yes')c.locationId='';
  if(p.type==='audit')c.lastAudit=p.date;
  if(p.toState==='in'){c.holder='';c.holderId='';c.dueDate='';c.purpose=''}else{c.holder=p.holder;c.holderId=p.holderId;c.dueDate=p.dueDate;c.purpose=p.purpose}
 }
 return c;
}
export const isOverdue = (c:Custody,today:string) => c.state!=='in'&&!!c.dueDate&&c.dueDate<today;
/** Whole calendar days between two date-only values. */
export const daysBetween = (from:string,to:string) => /^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)?Math.round((Date.UTC(+to.slice(0,4),+to.slice(5,7)-1,+to.slice(8,10))-Date.UTC(+from.slice(0,4),+from.slice(5,7)-1,+from.slice(8,10)))/864e5):0;
/** The next free archive number, e.g. ARC-00042. */
export function nextNumber(files:ArchiveFile[],prefix='ARC-') {
 const n=Math.max(0,...files.map(f=>Number(new RegExp('^'+prefix+'(\\d+)$','i').exec(f.payload.number||'')?.[1]||0)));
 return prefix+String(n+1).padStart(5,'0');
}
export const locationLabel = (l?:ArchiveLocation) => l?[l.payload.code,l.payload.name,l.payload.cabinet&&'خزانة '+l.payload.cabinet,l.payload.shelf&&(/^\d/.test(l.payload.shelf)?'رف '+l.payload.shelf:l.payload.shelf),l.payload.box&&'صندوق '+l.payload.box].filter(Boolean).join(' · '):'';
export const retentionDue = (f:ArchiveFile,today:string) => !!f.payload.retentionUntil&&f.payload.retentionUntil<=today;

// Code 39: the barcode most handheld scanners read out of the box. Each character is 9 elements (bar, space, …),
// three of them wide; characters are separated by a narrow space and wrapped in the «*» start/stop character.
const CODE39:Record<string,string> = {
 '0':'000110100','1':'100100001','2':'001100001','3':'101100000','4':'000110001','5':'100110000','6':'001110000','7':'000100101','8':'100100100','9':'001100100',
 A:'100001001',B:'001001001',C:'101001000',D:'000011001',E:'100011000',F:'001011000',G:'000001101',H:'100001100',I:'001001100',J:'000011100',
 K:'100000011',L:'001000011',M:'101000010',N:'000010011',O:'100010010',P:'001010010',Q:'000000111',R:'100000110',S:'001000110',T:'000010110',
 U:'110000001',V:'011000001',W:'111000000',X:'010010001',Y:'110010000',Z:'011010000','-':'010000101','.':'110000100',' ':'011000100','*':'010010100',
 $:'010101000','/':'010100010','+':'010001010','%':'000101010',
};
export const code39Ready = (text:string) => [...text.toUpperCase()].every(ch=>ch in CODE39&&ch!=='*');
/** Bar widths (in narrow units) for a Code 39 symbol, bars and spaces alternating, starting with a bar. */
export function code39(text:string,wide=3):number[] {
 const chars=['*',...text.toUpperCase(),'*'],out:number[]=[];
 chars.forEach((ch,i)=>{const p=CODE39[ch];if(!p)throw new Error('رمز غير صالح للباركود: '+ch);for(const bit of p)out.push(bit==='1'?wide:1);if(i<chars.length-1)out.push(1)});
 return out;
}
/** A Code 39 barcode as an inline SVG (black bars on white), sized by height and narrow-bar width. */
export function code39Svg(text:string,height=34,unit=1.2):string {
 const widths=code39(text);let x=10*unit,bars='';
 widths.forEach((w,i)=>{if(i%2===0)bars+=`<rect x="${x.toFixed(2)}" y="0" width="${(w*unit).toFixed(2)}" height="${height}"/>`;x+=w*unit});
 const total=x+10*unit;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total.toFixed(2)} ${height}" width="${total.toFixed(2)}" height="${height}" role="img" aria-label="${text.replace(/[<>&"]/g,'')}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars}</g></svg>`;
}

/** Where a hand-out stands between the archive and its recipient: sent and not yet confirmed, or reported back. */
export type Handover = 'awaiting-receipt'|'return-reported'|null;
export function handoverOf(c:Custody):Handover {
 const p=c.state==='staff'?c.last?.payload:undefined;
 if(!p||p.type!=='checkout')return null;
 if(p.receipt==='pending')return 'awaiting-receipt';
 if(p.receipt==='received'&&p.returnClaimedAt)return 'return-reported';
 return null;
}
export const HANDOVER_LABELS: Record<'awaiting-receipt'|'return-reported',string> = {'awaiting-receipt':'بانتظار تأكيد الاستلام','return-reported':'أبلغ بإرجاعه · بانتظار تأكيدك'};

/** A file as its holder or a colleague sees it, outside the archive section. */
export type DeskFile = {fileId:string;number:string;title:string;type:string;volume:string;caseId:string;caseCode:string;client:string;opponent:string};
export type HeldFile = DeskFile & {movementId:string;date:string;dueDate:string;purpose:string;receipt:''|'pending'|'received';receivedAt:string;returnClaimedAt:string;sentBy:string;sentAt:string};
export type MyRequest = DeskFile & {id:string;neededBy:string;purpose:string;status:RequestStatus;decisionNote:string;createdAt:string;updatedAt:string};
export type MyPaperFiles = {holding:HeldFile[];requests:MyRequest[]};
export type CasePaperFile = DeskFile & {state:CustodyState;holder:string;mine:boolean;receipt:string;returnClaimedAt:string;movementId:string|null;dueDate:string;request:{id:string;status:RequestStatus;neededBy:string}|null};
/** Asking for, receiving or returning a file anywhere refreshes «ملفاتي الورقية» and the case window at once. */
export const PAPER_FILES_EVENT='mawatheeq-paper-files';

/** The contents list as items. */
export const contentItems=(text?:string)=>(text||'').split('\n').map(x=>x.trim()).filter(Boolean);
/** The latest return that came back short and is not yet settled: what is missing and who returned it. */
export function openMissing(fileId:string,movements:ArchiveMovement[]):ArchiveMovement|null {
 const back=fileMovements(fileId,movements).filter(m=>m.payload.status==='posted'&&m.payload.type==='return').at(-1);
 return back&&back.payload.returnCheck==='missing'&&!back.payload.missingResolvedAt?back:null;
}
/** Whole days since a server timestamp. */
export const daysSince=(at?:string)=>{const t=at?Date.parse(at):NaN;return Number.isNaN(t)?0:Math.floor((Date.now()-t)/864e5)};
