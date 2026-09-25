import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';
const require=createRequire(import.meta.url);const tess=path.dirname(require.resolve('tesseract.js/package.json'));const tr=createRequire(path.join(tess,'package.json'));const core=path.dirname(tr.resolve('tesseract.js-core/package.json'));fs.mkdirSync('public/ocr',{recursive:true});fs.copyFileSync(path.join(tess,'dist/worker.min.js'),'public/ocr/worker.min.js');for(const name of fs.readdirSync(core)){if(/\.wasm(\.js)?$/.test(name))fs.copyFileSync(path.join(core,name),path.join('public/ocr',name))}for(const lang of ['ara','eng']){const root=path.dirname(require.resolve('@tesseract.js-data/'+lang+'/package.json'));fs.copyFileSync(path.join(root,'4.0.0',lang+'.traineddata.gz'),`public/ocr/${lang}.traineddata.gz`)}fs.copyFileSync(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),'public/ocr/pdf.worker.min.mjs');console.log('OCR workers and language data are local.');
// Scanners commonly put the readable text in JBIG2 masks. Without these
// decoders PDF.js silently skips that layer and OCR sees only the background.
const pdfRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
for(const directory of ['wasm','cmaps','standard_fonts']){
 fs.cpSync(path.join(pdfRoot,directory),path.join('public/ocr/pdfjs',directory),{recursive:true});
}
console.log('PDF image decoders, character maps, and standard fonts are local.');
