// Collection files from payment-order PDFs: which fields are flagged for checking, which client an order belongs to,
// and the new file's details (amount in words, the bundle's documents, the source).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fieldsToCheck, fillEmpty, guessClient, orderPayload, pagesText } from '../lib/order-import.ts';
import { blankDocument } from '../lib/document-fields.ts';
import { isOrderList, mapOrderList } from '../lib/collections.ts';
import { companyDetails } from '../lib/company-details.ts';
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
// Ooredoo's own details are always the same on its claims (owner, 11 November 2026); other companies have none here.
for (const name of ['الشركة الوطنية للاتصالات المتنقلة', 'الشركة الوطنيه للإتصالات المتنقلة', 'Ooredoo']) assert.equal(companyDetails(name)?.companyRegister, '73211', name);
assert.equal(companyDetails('شركة الإتصالات الكويتية ( Stc)'), undefined);
{const PizZip=createRequire(import.meta.url)('pizzip');const claim=new PizZip(JSON.parse(fs.readFileSync('lib/data/templates.json','utf8')).claim,{base64:true}).file('word/document.xml').asText();
 const at=k=>claim.indexOf('{{'+k+'}}');assert.ok(at('company')<at('companyAddress')&&at('companyAddress')<at('email')&&at('email')<at('companyCivil'),'The claim states the company, its address, email, then its civil and register numbers');}
console.log('Passed order import: fields to check, client from the creditor\'s name, new file details and bundle documents, client lists of payment orders, completing files made from a list, Ooredoo\'s fixed details.');
