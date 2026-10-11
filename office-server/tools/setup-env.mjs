// Creates office-server/.env with strong random secrets (never overwrites an existing file).
import fs from 'node:fs';
import crypto from 'node:crypto';
const file = new URL('../.env', import.meta.url);
if (fs.existsSync(file)) { console.log('.env already exists; keeping it.'); process.exit(0); }
const secret = (n = 24) => crypto.randomBytes(n).toString('hex');
fs.writeFileSync(file, `# Mawatheeq office server settings. Keep this file private and backed up; do not share or upload it.
POSTGRES_PASSWORD=${secret()}
AUTHENTICATOR_PASSWORD=${secret()}
FILES_SECRET=${secret(32)}
HTTP_PORT=8080
TZ=Asia/Kuwait
BACKUP_KEEP_DAYS=14
# After creating a bridge key in HR → Devices, paste it here and start with the bridge (see README.md).
BRIDGE_KEY=
# Only for the one-time import from the hosted database (see README.md). Remove after importing.
SUPABASE_DB_URL=
SUPABASE_URL=
SUPABASE_SECRET_KEY=
`, { mode: 0o600 });
console.log('Created .env with new secrets.');
