import {env} from 'cloudflare:workers';
import seedData from './data/seed.json';
import {DEFAULT_RULES,EXECUTION_NOTES,CaseRecord,normalize,validDate} from './domain';
const seed:CaseRecord[]=seedData;
export function db(){const d=(env as unknown as {DB:D1Database}).DB;if(!d)throw new Error('قاعدة البيانات غير متاحة');return d}
export function bucket(){const b=(env as unknown as {BUCKET:R2Bucket}).BUCKET;if(!b)throw new Error('حفظ الملفات غير متاح');return b}
export function authorize(req:Request){if(process.env.NODE_ENV==='production'&&!req.headers.get('oai-authenticated-user-id'))throw new Error('AUTH');if(!['GET','HEAD'].includes(req.method)&&req.headers.get('sec-fetch-site')==='cross-site')throw new Error('AUTH')}
export function jsonError(e:unknown){console.error(e);const msg=e instanceof Error?e.message:'تعذر إتمام العملية';return Response.json({error:msg==='AUTH'?'يرجى تسجيل الدخول للوصول إلى مساحة العمل.':msg},{status:msg==='AUTH'?401:400})}
export async function initialize(){const d=db();const done=await d.prepare('SELECT value FROM settings WHERE key=?').bind('seed-v1').first();if(done)return;
 const now=new Date().toISOString();const statements=[];for(let i=0;i<seed.length;i+=25){const chunk=seed.slice(i,i+25);statements.push(d.prepare('INSERT OR IGNORE INTO cases (id,payload,revision,updated_at,archived) VALUES '+chunk.map(()=>'(?,?,1,?,0)').join(',')).bind(...chunk.flatMap(c=>[c.id,JSON.stringify(c),now])))}if(statements.length)await d.batch(statements);
 await d.batch([d.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').bind('rules',JSON.stringify(DEFAULT_RULES)),d.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').bind('seed-v1','done')]);
}
export function validateCase(c:CaseRecord){if(!c.id||!c.client?.trim())throw new Error('اسم الموكل مطلوب.');if(c.executionNote&&!EXECUTION_NOTES.includes(c.executionNote))throw new Error('اختر إحدى ملاحظات التنفيذ المعتمدة.');if(c.autoNumber&&!/^\d+$/.test(c.autoNumber))throw new Error('الرقم الآلي يجب أن يحتوي على أرقام فقط.');for(const k of ['date','copyDate','notificationDate','announcementDate','originalDate']){const s=c[k];if(s&&!validDate(String(s)))throw new Error('راجع تنسيق التاريخ.')}for(const p of c.procedures||[])for(const date of [p.date,p.followup])if(date&&!validDate(date))throw new Error('راجع تواريخ الإجراءات والمتابعة.');if(JSON.stringify(c).length>150000)throw new Error('حجم السجل كبير جداً.');}
export const auditStatement=(id:string,action:string,detail:string)=>db().prepare('INSERT INTO audit (id,case_id,action,detail,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),id,action,detail,new Date().toISOString());
export const duplicateKey=(c:CaseRecord)=>[c.autoNumber||c.code,c.date,normalize(c.client),normalize(c.opponent)].join('|');
