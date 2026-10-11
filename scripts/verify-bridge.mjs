// Runs the bridge core against the real migrations in PGlite with a simulated ZKTeco device (synthetic data only).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { createBridge, toWall, supabaseApi } from '../bridge/core.mjs';

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects to anon,authenticated;
`);
for (const file of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql')).sort()) await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
await db.query("insert into mawatheeq_private.accounts(username,password_hash,must_change_password) values('owner',extensions.crypt($1,extensions.gen_salt('bf',4)),false)", ['Synthetic-password-123']);
await db.exec("insert into public.mawatheeq_members(user_id,role) select id,'owner' from mawatheeq_private.accounts;set role anon");
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)).rows[0].result;
const owner = await rpc('mawatheeq_local_login', ['owner', 'Synthetic-password-123']);
const att = (action, data = {}) => rpc('mawatheeq_attendance_request', [owner.token, action, JSON.stringify(data)]);
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await att('save_device', { device: { id: uuid(1), name: 'Reception', host: '192.168.1.201', port: 4370, location: '', enabled: true, revision: 0 } });
await att('save_device', { device: { id: uuid(2), name: 'Back office', host: '192.168.1.202', port: 4370, location: '', enabled: true, revision: 0 } });
await att('save_device', { device: { id: uuid(3), name: 'Old unit', host: '192.168.1.203', port: 4370, location: '', enabled: false, revision: 0 } });
const { key } = await att('create_bridge', { name: 'Reception PC' });

// The simulated device mirrors zkteco-js: {data:[…]} results and local-time Date objects for punches.
const device = {
  users: [{ uid: 1, userId: '101', name: 'One\0\0', role: 0, cardno: 0 }, { uid: 2, userId: '102', name: 'Two', role: 14, cardno: 555 }],
  logs: [{ user_id: '101', record_time: new Date(2026, 9, 11, 8, 5, 0).toString(), type: 1, state: 0 }, { user_id: '102', record_time: new Date(2026, 9, 11, 9, 20, 0).toString(), type: 1, state: 0 }],
  time: new Date(2026, 9, 11, 7, 0, 0), connects: 0, unlocked: [], restarts: 0, voice: 0,
};
const client = {
  getUsers: async () => ({ data: device.users }), getAttendances: async () => ({ data: device.logs }),
  setUser: async (uid, userId, name, password, role, cardno) => { device.users = device.users.filter(u => u.uid !== uid); device.users.push({ uid, userId, name, role, cardno }); device.users.sort((a, b) => a.uid - b.uid); },
  unlockDoor: async seconds => { device.unlocked.push(seconds); }, restart: async () => { device.restarts++; }, voiceTest: async () => { device.voice++; },
  clearAttendanceLog: async () => { device.logs = []; },
  deleteUser: async uid => { device.users = device.users.filter(u => u.uid !== uid); },
  setTime: async t => { device.time = t; }, getTime: async () => device.time,
  getInfo: async () => ({ userCounts: device.users.length, logCounts: device.logs.length, logCapacity: 100000 }),
  getSerialNumber: async () => 'SYN-001\0', getFirmware: async () => 'Ver 6.60', disconnect: async () => {},
};
const logs = [], state = {};
const api = (action, data) => rpc('mawatheeq_bridge_request', [key, action, JSON.stringify(data)]);
const bridge = createBridge({ api, state, log: m => logs.push(m), version: 'test', usersEveryCycles: 3,
  connectDevice: async d => { if (d.host === '192.168.1.202') throw new Error('connect ETIMEDOUT'); device.connects++; return client; } });

assert.equal(toWall(new Date(2026, 9, 11, 8, 5, 9)), '2026-10-11 08:05:09', 'Wall clock is read exactly as the device stored it');
assert.equal(toWall('not a date'), null);

// First pass: punches, users and device info; the unreachable device is reported offline; disabled devices are skipped.
await bridge.cycle();
let punches = await att('punches', { from: '2026-10-11', to: '2026-10-11' });
assert.deepEqual(punches.map(p => [p.pin, p.at, p.source]), [['101', '2026-10-11T08:05:00', 'device'], ['102', '2026-10-11T09:20:00', 'device']]);
let devices = Object.fromEntries((await att('devices')).map(d => [d.name, d]));
assert.equal(devices.Reception.status, 'online'); assert.equal(devices.Reception.serial, 'SYN-001'); assert.equal(devices.Reception.userCount, 2);
assert.equal(devices['Back office'].status, 'offline'); assert.match(devices['Back office'].lastError, /ETIMEDOUT/);
assert.equal(devices['Old unit'].status, 'unknown');
assert.equal(device.connects, 1, 'Disabled devices are not contacted');
assert.equal((await att('device_users', { deviceId: uuid(1) })).find(u => u.pin === '101').name, 'One', 'Padding is removed from names');

// Later passes upload only new punches.
device.logs.push({ user_id: '101', record_time: new Date(2026, 9, 11, 16, 10, 0).toString(), type: 1, state: 1 });
await bridge.cycle();
punches = await att('punches', { from: '2026-10-11', to: '2026-10-11' });
assert.equal(punches.length, 3); assert.equal(state[uuid(1)], '2026-10-11 16:10:00');

// Commands queued from the app run on the device and report back.
await att('queue_command', { deviceId: uuid(1), kind: 'add_user', payload: { pin: '103', name: 'Three' } });
await att('queue_command', { deviceId: uuid(1), kind: 'delete_user', payload: { pin: '102' } });
await att('queue_command', { deviceId: uuid(1), kind: 'set_time' });
await att('queue_command', { deviceId: uuid(1), kind: 'add_user', payload: { pin: '101', name: 'Duplicate' } });
await att('queue_command', { deviceId: uuid(2), kind: 'fetch_users' });
await bridge.cycle();
assert.deepEqual(device.users.map(u => [u.uid, u.userId]), [[1, '101'], [3, '103']], 'Added with the next free slot; deleted by its slot');
assert.ok(Math.abs(device.time - Date.now()) < 60000, 'Device clock set from the office PC');
const commands = await att('commands', {});
const status = kind => commands.filter(c => c.kind === kind).map(c => c.status);
assert.deepEqual(status('add_user').sort(), ['done', 'failed']);
assert.match(commands.find(c => c.kind === 'add_user' && c.status === 'failed').error, /مسجل مسبقاً/);
assert.deepEqual(status('delete_user'), ['done']); assert.deepEqual(status('set_time'), ['done']);
assert.match(commands.find(c => c.kind === 'fetch_users').error, /ETIMEDOUT/, 'Unreachable device commands fail with the reason');
assert.deepEqual((await att('device_users', { deviceId: uuid(1) })).map(u => u.pin), ['101', '103']);

// A full re-sync re-sends everything without creating duplicates.
await att('queue_command', { deviceId: uuid(1), kind: 'sync_logs' });
await bridge.cycle();
assert.equal((await att('punches', { from: '2026-10-11', to: '2026-10-11' })).length, 3);
assert.deepEqual((await att('commands', { deviceId: uuid(1) }))[0].result, { read: 3, inserted: 0 });

// Door devices: remote opening uses the device's unlock time and runs on the quick command check, without a full sync.
await att('save_device', { device: { ...(await att('devices')).find(d => d.id === uuid(1)), kind: 'both', doorName: 'Front door', unlockSeconds: 6 } });
const connectsBefore = device.connects;
await att('queue_command', { deviceId: uuid(1), kind: 'unlock_door' });
assert.deepEqual(await bridge.commands(), { commands: 1 });
assert.deepEqual(device.unlocked, [6]); assert.equal(device.connects, connectsBefore + 1, 'The quick check contacts only the device with a command');
await att('queue_command', { deviceId: uuid(1), kind: 'update_user', payload: { pin: '103', name: 'Three Admin', role: 14, card: '998877' } });
await att('queue_command', { deviceId: uuid(1), kind: 'voice_test' });
await att('queue_command', { deviceId: uuid(1), kind: 'restart' });
await bridge.commands();
assert.deepEqual(device.users.find(u => u.userId === '103'), { uid: 3, userId: '103', name: 'Three Admin', role: 14, cardno: 998877 }, 'Users are edited in their own slot');
assert.equal(device.voice, 1); assert.equal(device.restarts, 1);
device.logs.push({ user_id: '103', record_time: new Date(2026, 9, 11, 17, 0, 0).toString(), type: 1, state: 1 });
await att('queue_command', { deviceId: uuid(1), kind: 'clear_logs' });
await bridge.commands();
assert.equal(device.logs.length, 0, 'Logs are cleared from the device');
assert.equal((await att('punches', { from: '2026-10-11', to: '2026-10-11' })).length, 4, 'Every punch was saved before the device was cleared');
const doorCommands = await att('commands', { deviceId: uuid(1) });
assert.ok(['unlock_door', 'update_user', 'voice_test', 'restart', 'clear_logs'].every(k => doorCommands.find(c => c.kind === k)?.status === 'done'));
assert.deepEqual(doorCommands.find(c => c.kind === 'unlock_door').result, { opened: true, seconds: 6 });

// The HTTP client sends the publishable key and the bridge key; a revoked key stops the bridge.
const sent = [];
const http = supabaseApi({ supabaseUrl: 'https://example.supabase.co/', publishableKey: 'sb_publishable_x', bridgeKey: key, fetchImpl: async (url, init) => { sent.push([url, init]); return { ok: false, status: 401, json: async () => ({ message: 'مفتاح الجسر غير صالح', code: '28000' }) }; } });
await assert.rejects(() => http('config'), e => e.code === '28000');
assert.equal(sent[0][0], 'https://example.supabase.co/rest/v1/rpc/mawatheeq_bridge_request');
assert.equal(sent[0][1].headers.apikey, 'sb_publishable_x'); assert.equal(JSON.parse(sent[0][1].body).p_key, key);
const bridges = await att('bridges'); await att('revoke_bridge', { id: bridges[0].id });
await assert.rejects(() => bridge.cycle(), e => e.code === '28000');
assert.equal(bridges[0].version, 'test');
console.log('Passed bridge: door opening with the device unlock time on the quick command check, user edits with cards and admin role, sound test, restart, clearing logs only after saving them, wall-clock punches, incremental and full sync without duplicates, users and device info, offline reporting, disabled devices skipped, add/delete user by device slot, duplicate add refused, clock sync, failed commands with reasons, HTTP client headers and key revocation.');
