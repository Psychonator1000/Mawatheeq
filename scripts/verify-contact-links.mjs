import assert from 'node:assert/strict';
import { normalizePhone, phoneLinks } from '../lib/contact-links.ts';

assert.equal(normalizePhone('9999 1234'), '+96599991234', 'Kuwaiti local numbers gain the country code');
assert.equal(normalizePhone('٩٩٩٩١٢٣٤'), '+96599991234', 'Arabic-Indic digits');
assert.equal(normalizePhone('۹۹۹۹-۱۲۳۴'), '+96599991234', 'Extended Arabic-Indic digits');
assert.equal(normalizePhone('+965 9999-1234'), '+96599991234');
assert.equal(normalizePhone('00965 9999 1234'), '+96599991234');
assert.equal(normalizePhone('(966) 50 123 4567'), '+966501234567', 'Other international numbers are kept');
for (const bad of ['', 'لا يوجد', '12345', '+12', '1234567890123456', 'abc99991234def0000000000']) assert.equal(normalizePhone(bad), null, 'Rejects ' + bad);
assert.deepEqual(phoneLinks('99991234'), { phone: '+96599991234', tel: 'tel:+96599991234', whatsapp: 'https://wa.me/96599991234' });
assert.equal(phoneLinks('غير معروف'), null);
console.log('Passed contact links: Kuwaiti local numbers, Arabic digits, international prefixes, invalid input and call/WhatsApp URLs.');
