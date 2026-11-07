import fs from 'node:fs';
import { extractFields } from '../lib/document-fields.ts';
const S=process.argv[2];const T=JSON.parse(fs.readFileSync(S+'/amr/truth.json','utf8'));const keys=Object.keys(T.order1);let ok=0,tot=0;const score={};
const norm=(k,v)=>{v=String(v||'').trim();if(['amount','receiptFee'].includes(k))return v?String(+v):'';return v.replace(/\s+/g,' ')};
for(const f of Object.keys(T)){const j=JSON.parse(fs.readFileSync(S+'/amr/'+f+'.json','utf8'));const text=j.pages.filter(p=>!p.warning).map(p=>`الصفحة ${p.page}\n${p.text}`).join('\n\n');const d=extractFields(text,f+'.pdf');const bad=[];
 for(const k of keys){tot++;const a=norm(k,d[k]),b=norm(k,T[f][k]);if(a===b){ok++;score[k]=(score[k]||0)+1}else bad.push(k+'='+JSON.stringify(d[k]))}console.log(f,'wrong:',bad.join(' | '))}
console.log('TOTAL',ok+'/'+tot);console.log(keys.map(k=>k+':'+(score[k]||0)+'/5').join('  '));
