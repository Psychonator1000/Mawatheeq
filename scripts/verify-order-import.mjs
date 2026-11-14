// Collection files from payment-order PDFs: which fields are flagged for checking, which client an order belongs to,
// and the new file's details (amount in words, the bundle's documents, the source).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { clientNameOnFiles, fallbackClient, fieldsToCheck, filesPerClient, fillEmpty, guessClient, orderPayload, pagesText } from '../lib/order-import.ts';
import { blankDocument } from '../lib/document-fields.ts';
import { isOrderList, mapOrderList } from '../lib/collections.ts';
const good = { ...blankDocument(), orderAuto: '251234567', orderNumber: '612345/2025', company: 'شركة الاختبار', defendant: 'خالد سالم عبدالله', civilId: '290010100123',
  address: 'حولي - ق 1', amount: '512.25', account: '1234567890', demandDate: '2024-11-06', statementDate: '2024-04-08', receiptNumber: 'F0123456', receiptFee: '12.806', receiptDate: '2025-04-23', court: 'جزئي العاصمة' };
assert.deepEqual(fieldsToCheck(good), [], 'A complete order needs no checking');
assert.deepEqual(fieldsToCheck({ ...good, receiptDate: '2025-04-3', amount: '0', receiptNumber: '', defendant: 'خالد aml' }), ['defendant', 'amount', 'receiptNumber', 'receiptDate'], 'Missing, zero, malformed and garbled fields are flagged');
const clients = [{ id: 'stc', name: 'STC' }, { id: 'zain', name: 'Zain' }, { id: 'oo', name: 'Ooredoo' }, { id: 'x', name: 'شركة الاختبار' }];
assert.equal(guessClient('شركة الاتصالات الكويتية', clients), 'stc', 'The Arabic name of a telecom company finds its English-named client');
assert.equal(guessClient('شركة الاتصالات المتنقلة', clients), 'zain');
assert.equal(guessClient('الشركة الوطنية للاتصالات المتنقلة', clients), 'oo');
assert.equal(guessClient('شركة الاختبار', clients), 'x', 'The same name');
assert.equal(guessClient('شركة أخرى', clients), '', 'No guess for an unknown creditor');
// One client, never two (owner, 14 November 2026): two client files fit the creditor → the one holding the files; an
// unreadable creditor → the client of the rest of the reading, else the client nearly all files belong to; the creditor
// written as that client's files write it.
{const two = [{ id: 'main', name: 'شركة الاتصالات الكويتية' }, { id: 'old', name: 'شركة الاتصالات الكويتية STC' }, { id: 'zain', name: 'Zain' }];
 const files = [...Array(9)].map(() => ({ payload: { clientEntityId: 'main', company: 'شركة الإتصالات الكويتية ( Stc)' } })).concat([{ payload: { clientEntityId: 'main', company: 'شركة الاتصالات الكويتية' } }, { payload: { clientEntityId: 'old', company: 'شركة الاتصالات الكويتية' } }, { archived: true, payload: { clientEntityId: 'old', company: 'x' } }]);
 const held = filesPerClient(files);
 assert.deepEqual([...held.entries()].sort(), [['main', 10], ['old', 1]], 'Archived files are not counted');
 assert.equal(guessClient('شركة الإتصالات الكويتية', two, held), 'main', 'Two client files fit: the one holding the files');
 assert.equal(guessClient('شركة الاتصالات الكويتية', two), 'main', 'The same name still wins outright');
 assert.equal(guessClient('شركة الكويتية للاتصالات STC', two, new Map()), '', 'Two fit and neither holds more: no guess');
 assert.equal(fallbackClient(['', 'zain', 'zain', 'main'], held), 'zain', 'The client most of the reading was read for');
 assert.equal(fallbackClient(['', ''], held), 'main', 'Nothing read: the client nearly all files belong to');
 assert.equal(fallbackClient([], new Map([['a', 5], ['b', 4]])), '', 'No clear client: nobody');
 assert.equal(clientNameOnFiles('main', files, two), 'شركة الإتصالات الكويتية ( Stc)', 'Written as most of its files write it');
 assert.equal(clientNameOnFiles('zain', files, two), 'Zain', 'No files yet: as its client file has it');
 assert.equal(clientNameOnFiles('', files, two), '');}
const p = orderPayload(good, { clientEntityId: 'x', source: 'أمر أداء (PDF): a.pdf' });
assert.equal(p.amountWords, 'خمسمائة واثنا عشر ديناراً كويتياً ومائتان وخمسون فلساً', 'The amount in words');
assert.equal(p.evidence.length, 6, 'The bundle lists the order\'s six documents');
assert.ok(p.evidence[0].description.includes('1234567890') && p.evidence.every(e => e.included), 'Statement number in the list, every document included');
assert.equal(p.clientEntityId, 'x'); assert.equal(p.sourceReference, 'أمر أداء (PDF): a.pdf');
assert.equal(pagesText([{ page: 1, text: 'أ' }, { page: 2, text: 'ب', warning: 'x' }]), 'الصفحة 1\nأ', 'Pages that could not be read are left out');
assert.equal(guessClient('شركة الإتصالات الكويتية ( Stc)', clients), 'stc', 'A hamza and the English name in brackets still find the client');
// A client's list of payment orders: a title row, headings on row 2, one order a row, no file number yet.
const sheet = [['2026-11-07'], ['المدعى', 'المدعى عليه', 'الرقم المدنى', 'رقم العقد', 'الرقم الالى', 'مبلغ المطالبة', 'تاريخ الحكم', 'العنوان'],
  ['شركة الاختبار', 'خالد سالم', 290010100123, 1234567890, 251234567, 512.25, '2025-11-30', 'حولي - ق 1'], ['', '', '', '', '', '', '', ''], ['شركة الاختبار', 'سالم خالد', '', '', 'بدون', 10, '', '']];
const at = sheet.findIndex(r => isOrderList(r));
assert.equal(at, 1, 'The headings are found on the second row');
const list = mapOrderList(sheet[at], sheet.slice(at + 1), v => String(v), at + 1);
assert.equal(list.length, 1, 'Blank rows and rows without an automatic number are left out');
assert.deepEqual([list[0].row, list[0].autoNumber, list[0].payload.orderAuto, list[0].payload.amount, list[0].payload.rejectedDate, list[0].payload.civilId, list[0].payload.code], [3, '251234567', '251234567', '512.25', '2025-11-30', '290010100123', ''], 'An order row becomes a file known by its automatic number');
assert.equal(isOrderList(['اسم الموكل', 'رقم الملف', 'اسم الخصم']), false, 'The office export is not an order list');
// The PDF completes a file made from the list: empty fields filled, typed ones kept, documents listed once.
const fromList = { ...blankDocument(), defendant: 'خالد سالم', address: 'العنوان المكتوب في الملف', amount: '512.25', orderAuto: '251234567', evidence: [] };
const done = fillEmpty(fromList, { ...good, address: 'عنوان آخر من الأمر' });
assert.equal(done.address, 'العنوان المكتوب في الملف', 'What is already on the file is kept');
assert.equal(done.defendant, 'خالد سالم');
assert.deepEqual([done.receiptNumber, done.orderNumber, done.receiptFee], ['F0123456', '612345/2025', '12.806'], 'Empty fields are filled from the order');
assert.equal(done.evidence.length, 6, 'The bundle documents are listed when the file had none');
assert.equal(fillEmpty({ ...fromList, evidence: [{ id: 'x', included: true, date: '', description: 'مستند', pages: 1 }] }, good).evidence.length, 1, 'A file\'s own document list is kept');
// The bundle's heading keeps the party's role at the far edge with a tab, not with spaces that wrap long names.
{const PizZip = createRequire(import.meta.url)('pizzip'), t = JSON.parse(fs.readFileSync('lib/data/templates.json', 'utf8'));
 const xml = new PizZip(t.bundle, { base64: true }).file('word/document.xml').asText();
 assert.ok(xml.includes('{{company}}</w:t><w:tab/><w:t>مدعية') && xml.includes('{{defendant}}</w:t><w:tab/><w:t>مدعى عليه'), 'The roles follow a tab');
 assert.equal(/\{\{(?:company|defendant)\}\} {5,}/.test(xml), false, 'No run of spaces after a party\'s name');}
{const PizZip=createRequire(import.meta.url)('pizzip');const claim=new PizZip(JSON.parse(fs.readFileSync('lib/data/templates.json','utf8')).claim,{base64:true}).file('word/document.xml').asText();
 const at=k=>claim.indexOf('{{'+k+'}}');assert.ok(at('company')<at('companyAddress')&&at('companyAddress')<at('email')&&at('email')<at('companyCivil'),'The claim states the company, its address, email, then its civil and register numbers');}
// The claim's page footer carries the page number only, no typist's mark (owner, 14 November 2026: «remove that footer»).
{const PizZip=createRequire(import.meta.url)('pizzip');const zip=new PizZip(JSON.parse(fs.readFileSync('lib/data/templates.json','utf8')).claim,{base64:true});
 const footer=zip.file('word/footer1.xml').asText().replace(/<[^>]+>/g,'');assert.equal(/[\u0621-\u064A]/.test(footer),false,'No Arabic mark in the claim footer');assert.ok(footer.includes('PAGE'),'The page number stays');}
console.log('Passed order import: fields to check, client from the creditor\'s name, new file details and bundle documents, client lists of payment orders, completing files made from a list, the claim\'s company lines in order.');
