// Merging Word files from the real templates (synthetic data only): one file, valid XML, every copy present,
// unique drawing IDs, page numbers restarting per copy. When LibreOffice is installed, the merged file is
// rendered and its page count must equal the sum of the separate copies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import PizZip from 'pizzip';
import { mergeWord } from '../lib/word-merge.ts';

const templates = JSON.parse(fs.readFileSync('lib/data/templates.json', 'utf8'));
const fill = (kind, values) => {
  const zip = new PizZip(templates[kind], { base64: true });
  const xml = zip.file('word/document.xml').asText().replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? '....');
  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'uint8array' });
};
const which = cmd => { try { execFileSync('sh', ['-c', `command -v ${cmd}`]); return true; } catch { return false; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'word-merge-'));
const pages = file => { const out = execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', tmp, file], { stdio: 'pipe', timeout: 120000 }); void out; const pdf = fs.readFileSync(file.replace(/\.docx$/, '.pdf'), 'latin1'); return (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length; };

for (const kind of ['claim', 'bundle']) {
  const copies = ['أولى', 'ثانية', 'ثالثة'].map((name, i) => fill(kind, { company: 'شركة تجريبية ' + name, defendant: 'مدعى عليه تجريبي ' + (i + 1), lawsuitNumber: String(100 + i), index: '1', description: 'مستند تجريبي', pages: '1' }));
  assert.equal(mergeWord(PizZip, [copies[0]]), copies[0], 'A single file is returned unchanged');
  const merged = mergeWord(PizZip, copies);
  const xml = new PizZip(merged).file('word/document.xml').asText();
  for (const i of [1, 2, 3]) assert.ok(xml.includes('مدعى عليه تجريبي ' + i), `${kind}: copy ${i} is present`);
  assert.equal(xml.indexOf('مدعى عليه تجريبي 1') < xml.indexOf('مدعى عليه تجريبي 2') && xml.indexOf('مدعى عليه تجريبي 2') < xml.indexOf('مدعى عليه تجريبي 3'), true, 'Copies keep their order');
  assert.equal((xml.match(/<w:sectPr\b/g) || []).length, 3, 'One section per copy');
  assert.equal((xml.match(/<w:pgNumType w:start="1"/g) || []).length, 3, 'Page numbers restart for every copy');
  const drawing = [...xml.matchAll(/<wp:docPr\b[^>]*\bid="(\d+)"/g)].map(m => m[1]);
  assert.equal(new Set(drawing).size, drawing.length, 'Drawing IDs are unique');
  assert.equal(/w14:paraId/.test(xml), false);
  if (which('xmllint')) { const f = path.join(tmp, kind + '.xml'); fs.writeFileSync(f, xml); execFileSync('xmllint', ['--noout', f]); }
  if (which('soffice')) {
    const single = path.join(tmp, kind + '-single.docx'), all = path.join(tmp, kind + '-merged.docx');
    fs.writeFileSync(single, copies[0]); fs.writeFileSync(all, merged);
    const one = pages(single), three = pages(all);
    assert.ok(one >= 1); assert.equal(three, one * 3, `${kind}: merged file renders as three full copies (${one} page(s) each)`);
  }
}
assert.throws(() => mergeWord(PizZip, []), /لا توجد/);
console.log('Passed Word merge: real templates, copies in order, one section and restarted page numbers per copy, unique drawing IDs, well-formed XML' + (which('soffice') ? ', and LibreOffice renders every copy in full.' : '.'));
