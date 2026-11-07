// Collection files from payment-order PDFs: which fields are flagged for checking, which client an order belongs to,
// and the new file's details (amount in words, the bundle's documents, the source).
import assert from 'node:assert/strict';
import { fieldsToCheck, guessClient, orderPayload, pagesText } from '../lib/order-import.ts';
import { blankDocument } from '../lib/document-fields.ts';
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
console.log('Passed order import: fields to check, client from the creditor\'s name, new file details and bundle documents.');
