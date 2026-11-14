// Names inside a downloaded .zip (owner, 14 November 2026: «THE NAMING IS FUCKED»): Windows' own «Extract all» reads
// them in the Arabic DOS code page (CP720), 7-Zip and WinRAR read the UTF-8 copy beside each; both must give the name back.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { zipFileName } from '../lib/zip-names.ts';
const PizZip = createRequire(import.meta.url)('pizzip');

const names = ['حافظة/محمد عبدالله الأحمد - 250254890 - حافظة.docx', 'صحيفة دعوى/آمنة إبراهيم مؤمن ئ ى ة - 243785540 - صحيفة دعوى.docx'];
// CP720 back to text, from the code page's own table (the Arabic half).
const LETTERS = 'ّْـءآأؤإئابةتثجحخدذرزسشص«»ضطظعغفقكلمنهوىيًٌٍَُِ';
const CODES = [145, 146, 149, 152, 153, 154, 155, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175,
  224, 225, 226, 227, 228, 229, 231, 232, 233, 234, 235, 236, 237, 238, 239, 241, 242, 243, 244, 245, 246];
const back = new Map(CODES.map((c, i) => [c, [...LETTERS][i]]));
const read720 = bytes => [...bytes].map(ch => ch.charCodeAt(0)).map(b => b < 128 ? String.fromCharCode(b) : back.get(b) ?? '?').join('');

for (const n of names) assert.equal(read720(zipFileName(n)), n, 'Windows reads the name back as written');
assert.equal(read720(zipFileName('رقم ٢٥٠')), 'رقم 250', 'Arabic-Indic digits become plain digits');
assert.equal(read720(zipFileName('Ahmed – ü')), 'Ahmed _ _', 'A letter CP720 cannot write becomes «_», never junk');

const zip = new PizZip();
for (const n of names) zip.file(n, 'x');
const out = new PizZip(zip.generate({ type: 'uint8array', compression: 'STORE', encodeFileName: zipFileName }));
const raw = Buffer.from(zip.generate({ type: 'uint8array', compression: 'STORE', encodeFileName: zipFileName }));
// The UTF-8 copy (the «up» extra field) is there for 7-Zip and WinRAR.
for (const n of names) assert.ok(raw.includes(Buffer.from(n, 'utf8')), 'Each name is also kept in UTF-8');
assert.ok(raw.includes(Buffer.from(zipFileName(names[0]), 'latin1')), 'The CP720 name is the one Windows reads');
// The general-purpose flag never says UTF-8 (bit 11), or Windows would be told the CP720 bytes are UTF-8.
for (let i = raw.indexOf('PK\x01\x02'); i >= 0; i = raw.indexOf('PK\x01\x02', i + 4)) assert.equal(raw.readUInt16LE(i + 8) & 0x800, 0);
assert.ok(Object.keys(out.files).length >= names.length);
console.log('Passed zip names: written in CP720 for Windows\' own «Extract all», with a UTF-8 copy for 7-Zip and WinRAR; Arabic-Indic digits plain, unknown letters «_».');
