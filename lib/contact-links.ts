const arabicDigits = /[٠-٩۰-۹]/g;

/** International form of a stored phone number; 8-digit numbers are treated as Kuwaiti. */
export function normalizePhone(value: string, countryCode = '965'): string | null {
  const ascii = String(value || '').replace(arabicDigits, d => String(d.charCodeAt(0) & 0xf));
  let digits = ascii.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = '+' + digits.slice(2);
  if (/^\d{8}$/.test(digits)) digits = '+' + countryCode + digits;
  else if (/^\d{9,15}$/.test(digits)) digits = '+' + digits;
  return /^\+\d{9,15}$/.test(digits) ? digits : null;
}

/** Call and WhatsApp links, or null when the number is not usable. */
export function phoneLinks(value: string) {
  const phone = normalizePhone(value);
  return phone ? { phone, tel: 'tel:' + phone, whatsapp: 'https://wa.me/' + phone.slice(1) } : null;
}
