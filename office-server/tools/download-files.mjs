// Downloads the original PDFs from hosted storage into /data/files (used by import-supabase.sh).
import fs from 'node:fs/promises';
import path from 'node:path';
const [list] = process.argv.slice(2);
const base = (process.env.SUPABASE_URL || '').replace(/\/$/, ''), key = process.env.SUPABASE_SECRET_KEY || '';
const names = (await fs.readFile(list, 'utf8')).split('\n').map(s => s.trim()).filter(Boolean);
if (!names.length) { console.log('No PDF files to copy.'); process.exit(0); }
if (!base || !key) { console.error('Add SUPABASE_URL and SUPABASE_SECRET_KEY to .env to copy the PDF files.'); process.exit(1); }
// New-style secret keys go in the apikey header only; legacy service keys are also sent as a bearer token.
const headers = key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
let copied = 0;
for (const name of names) {
  if (!/^documents\/[0-9a-f-]{36}\/[^/\\]+\.pdf$/i.test(name)) { console.warn('Skipped unexpected path:', name); continue; }
  const target = path.join(process.env.DATA_DIR || '/data', 'files', name);
  const response = await fetch(`${base}/storage/v1/object/authenticated/mawatheeq-documents/${name.split('/').map(encodeURIComponent).join('/')}`, { headers });
  if (!response.ok) { console.error(`Could not copy ${name}: HTTP ${response.status}`); process.exitCode = 1; continue; }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
  copied++;
}
console.log(`Copied ${copied} of ${names.length} PDF files.`);
