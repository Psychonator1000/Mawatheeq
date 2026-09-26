import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync('public/app-config.json', 'utf8'));
let validUrl = false;
try { validUrl = new URL(config.supabaseUrl).protocol === 'https:'; } catch {}
if (!validUrl || !String(config.supabasePublishableKey).startsWith('sb_publishable_')) {
  console.error('GitHub Pages deployment is waiting for the shared backend. Configure public/app-config.json with the Supabase project URL and sb_publishable_ key after applying and verifying the migration. Never use a service-role or secret key.');
  process.exit(1);
}
console.log('Public backend configuration is present.');
