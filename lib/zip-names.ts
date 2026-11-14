// Windows' own «Extract all» ignores the mark that says a name inside a .zip is UTF-8 and reads it in the DOS code page
// of an Arabic Windows (CP720), which turned every Arabic name into «╪ص╪د┘…» (owner, 14 November 2026). So the names
// are written in CP720; the zip also carries each name in UTF-8 beside it, which 7-Zip and WinRAR read.
const CP720_LETTERS = 'ّْـءآأؤإئابةتثجحخدذرزسشص«»ضطظعغفقكلمنهوىيًٌٍَُِ';
const CP720_CODES = [145, 146, 149, 152, 153, 154, 155, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175,
  224, 225, 226, 227, 228, 229, 231, 232, 233, 234, 235, 236, 237, 238, 239, 241, 242, 243, 244, 245, 246];
const CP720 = new Map([...CP720_LETTERS].map((c, i) => [c, CP720_CODES[i]]));
/** A name inside a .zip as Windows reads it: CP720 bytes (as a byte string); a letter it cannot write becomes «_». */
export function zipFileName(name: string): string {
  const out: number[] = [];
  for (const c of name.normalize('NFC')) {
    const code = c.charCodeAt(0);
    if (code < 128) out.push(code);
    else if (c >= '٠' && c <= '٩') out.push(48 + code - 0x660);
    else out.push(CP720.get(c) ?? 95);
  }
  return String.fromCharCode(...out);
}
