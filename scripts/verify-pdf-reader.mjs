import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {createWorker} from 'tesseract.js';

const compile=(file,replacements={})=>{
 let code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [from,to] of Object.entries(replacements))code=code.replaceAll(from,to);
 return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
};
const fieldsURL=compile('lib/document-fields.ts');
const {extractFields,extractionSummary,parseDocumentDate,assessText,amountInWords}=await import(fieldsURL);
const {readPDFPages}=await import(compile('lib/pdf-reader.ts',{'./document-fields':fieldsURL}));
assert.equal(parseDocumentDate('٠٨/١٢/٢٠٢٤'),'2024-12-08');
assert.equal(parseDocumentDate('2024/12/8'),'2024-12-08');
assert.equal(parseDocumentDate('14 OCT 2025'),'2025-10-14');
assert.equal(parseDocumentDate('31/02/2025'),'');
assert.equal(parseDocumentDate('14 OCT 5'),'');
assert.equal(assessText('a1 , .. abc $$$ '.repeat(30)).usable,false);
assert.equal(extractionSummary(extractFields('a1 , .. abc $$$ '.repeat(30))).status,'failed');
assert.equal(extractFields('أمر أداء رقم 2026 / 12345').orderNumber,'12345/2026');
const other=extractFields('مقدمه: شركة الاختبار\nضد: محمد سالم أحمد\nالجنسية: الكويت الرقم المدني: 290010100123\nمبلغ: ٢٣٤.٥٦٧ د.ك\nأمر أداء رقم ١٢٣٤٥ / ٢٠٢٦','مرفقات كود 321.pdf');
assert.equal(other.company,'شركة الاختبار');assert.equal(other.defendant,'محمد سالم أحمد');assert.equal(other.amount,'234.567');assert.equal(other.code,'321');assert.equal(other.rejectedDate,'');
assert.equal(extractFields('ملف ليس له رقم').code,'');
assert.equal(extractFields('مبلغ: 1,770.254 د.ك').amount,'1770.254');
assert.equal(extractFields('مبلغ: 770,254 د.ك').amount,'770.254');
assert.equal(amountInWords('770.254'),'سبعمائة وسبعون ديناراً كويتياً ومائتان وأربعة وخمسون فلساً');
const cancelled=new AbortController();cancelled.abort();
await assert.rejects(()=>readPDFPages({numPages:1},()=>{},()=>{},()=>{},cancelled.signal),e=>e.name==='AbortError');
for(const name of ['jbig2.wasm','jbig2_nowasm_fallback.js','openjpeg.wasm'])assert.ok(fs.statSync('public/ocr/pdfjs/wasm/'+name).size>0);
console.log('Passed: localized labels, Arabic digits, date formats, invalid dates, empty/garbled text, filename code, cancellation, decoder assets.');

const source=process.argv[2];
if(source){
 const req=createRequire(import.meta.url),pdfreq=createRequire(req.resolve('pdfjs-dist/package.json'));
 // Use the same native canvas version as PDF.js internally.
 const {createCanvas,DOMMatrix,ImageData,Path2D}=pdfreq('@napi-rs/canvas');
 Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(source)),wasmUrl:path.resolve('public/ocr/pdfjs/wasm')+'/',stopAtErrors:true});
 const pdf=await task.promise;
 const pages=await readPDFPages(pdf,()=>createCanvas(1,1),async()=>{
  const worker=await createWorker(['ara','eng'],1,{langPath:path.resolve('public/ocr'),cachePath:'/tmp/mawatheeq-ocr'});
  return {...worker,recognize:(canvas,options)=>worker.recognize(canvas.toBuffer('image/png'),options)};
 },(p,message)=>console.log(Math.round(p),message),new AbortController().signal);
 await task.destroy();
 const text=pages.filter(p=>!p.warning).map(p=>`الصفحة ${p.page}\n${p.text}`).join('\n\n');
 const fields=extractFields(text,path.basename(source));
 fs.mkdirSync('/tmp/mawatheeq-ocr',{recursive:true});
 fs.writeFileSync('/tmp/mawatheeq-ocr/verified-pipeline.json',JSON.stringify({pages,fields,summary:extractionSummary(fields)},null,2));
 console.log(JSON.stringify({pages:pages.length,warnings:pages.filter(p=>p.warning).map(p=>p.page),fields,summary:extractionSummary(fields)},null,2));
}
