// Executes every migration in PGlite with synthetic accounts, employees, devices and punches only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

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
const local = (token, action, data = {}) => rpc('mawatheeq_local_request', [token, action, JSON.stringify(data)]);
const office = (token, action, data = {}) => rpc('mawatheeq_office_request', [token, action, JSON.stringify(data)]);
const dept = (token, workspace, action, data = {}) => rpc('mawatheeq_department_request', [token, action, JSON.stringify({ ...data, workspace })]);
const att = (token, action, data = {}) => rpc('mawatheeq_attendance_request', [token, action, JSON.stringify(data)]);
const bridge = (key, action, data = {}) => rpc('mawatheeq_bridge_request', [key, action, JSON.stringify(data)]);
const login = (username, password = 'Synthetic-password-123') => rpc('mawatheeq_local_login', [username, password]);
const denied = fn => assert.rejects(fn, e => e.code === '42501');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const owner = await login('owner');
async function staff(username, sections, canEdit = true) {
  const member = await office(owner.token, 'create_member', { username, password: 'Temporary-password-123', permissions: { sections, caseScope: 'all', caseIds: [], canEdit, canExport: false } });
  const session = await login(username, 'Temporary-password-123');
  await local(session.token, 'password', { currentPassword: 'Temporary-password-123', newPassword: 'Fixture-password-123' });
  return { ...session, member };
}
const hr = await staff('hr_staff', ['hr']);
const accountant = await staff('accountant', ['accounting']);
const hrReader = await staff('hr_reader', ['hr'], false);
const lawyer = await staff('lawyer', ['cases']);

// Synthetic employees and an approved leave through the existing HR records.
const employee = (n, name, pinless) => dept(owner.token, 'hr', 'save_record', { record: { id: uuid(n), workspace: 'hr', kind: 'employee', caseId: '', subjectId: '', revision: 0, payload: { employeeNumber: 'E-' + n, name, title: 'Synthetic', department: 'Legal', phone: '', startDate: '2025-01-01', status: 'active', notes: pinless ? 'x' : '' } } });
await employee(1, 'Employee One'); await employee(2, 'Employee Two');
await dept(owner.token, 'hr', 'save_record', { record: { id: uuid(9), workspace: 'hr', kind: 'leave', caseId: '', subjectId: uuid(1), revision: 0, payload: { type: 'سنوية', fromDate: '2026-10-12', toDate: '2026-10-13', status: 'approved', notes: '', decisionNote: 'ok' } } });

// Access: HR and accounting only; device management and imports are HR with edit permission.
await denied(() => att(lawyer.token, 'context'));
await assert.rejects(() => att('0'.repeat(64), 'context'), e => e.code === '28000');
await assert.rejects(() => db.query('select * from mawatheeq_private.att_punches'), /permission denied/);
const ctx = await att(accountant.token, 'context');
assert.equal(ctx.settings.timezone, 'Asia/Kuwait'); assert.equal(ctx.canManageDevices, false); assert.equal(ctx.canEdit, true);
assert.equal((await att(hr.token, 'context')).canManageDevices, true);
assert.equal((await att(hrReader.token, 'context')).canEdit, false);
assert.equal((await att(accountant.token, 'employees')).length, 2, 'Accounting sees the employee list needed for payroll');

// Settings with optimistic revisions and validation.
const settings = { ...ctx.settings, graceMinutes: 15, monthlyLateAllowanceMinutes: 90, holidays: [{ date: '2026-10-15', name: 'عطلة تجريبية' }] };
const saved = await att(accountant.token, 'save_settings', { settings, revision: ctx.revision });
assert.equal(saved.settings.graceMinutes, 15);
await assert.rejects(() => att(hr.token, 'save_settings', { settings, revision: ctx.revision }), e => e.code === 'PT409', 'Stale settings are rejected');
await assert.rejects(() => att(hr.token, 'save_settings', { settings: { ...settings, timezone: 'Mars/Base' }, revision: saved.revision }), /غير صالحة/);
await assert.rejects(() => att(hr.token, 'save_settings', { settings: { ...settings, start: '17:00', end: '08:00' }, revision: saved.revision }), /غير صالحة/);
await assert.rejects(() => att(hr.token, 'save_settings', { settings: { ...settings, days: { 4: { start: '14:00', end: '13:00' } } }, revision: saved.revision }), /غير صالحة/, 'A day that ends before it starts is refused');
await assert.rejects(() => att(hr.token, 'save_settings', { settings: { ...settings, days: { 9: { start: '08:00', end: '13:00' } } }, revision: saved.revision }), /غير صالحة/, 'Only weekdays 0–6');
await denied(() => att(hrReader.token, 'save_settings', { settings, revision: saved.revision }));

// Pay profiles: fingerprint PIN mapping and salary in minor units.
const p1 = await att(hr.token, 'save_profile', { employeeId: uuid(1), revision: 0, profile: { pin: '101', salaryMinor: '900000', currency: 'KWD', schedule: null } });
assert.equal(p1.salaryMinor, '900000');
await assert.rejects(() => att(accountant.token, 'save_profile', { employeeId: uuid(2), revision: 0, profile: { pin: '101', salaryMinor: '1', currency: 'KWD' } }), /مستخدم لموظف آخر/);
await att(accountant.token, 'save_profile', { employeeId: uuid(2), revision: 0, profile: { pin: '102', salaryMinor: '650500', currency: 'KWD', schedule: { start: '09:00', end: '15:00', workDays: [0, 1, 2, 3, 4] } } });
await assert.rejects(() => att(hr.token, 'save_profile', { employeeId: uuid(1), revision: 0, profile: { pin: '101', salaryMinor: '1', currency: 'KWD' } }), e => e.code === 'PT409');
await assert.rejects(() => att(hr.token, 'save_profile', { employeeId: uuid(9), revision: 0, profile: { pin: '109', salaryMinor: '1', currency: 'KWD' } }), /غير موجود/, 'Leave records are not employees');
await assert.rejects(() => att(hr.token, 'save_profile', { employeeId: uuid(1), revision: 1, profile: { pin: '1 01', salaryMinor: '-5', currency: 'KWD' } }), /غير صالحة/);

// Imports convert office wall-clock time with the configured timezone and skip duplicates.
await denied(() => att(accountant.token, 'import_punches', { punches: [{ pin: '101', wall: '2026-10-11 08:05:00' }] }));
const imported = await att(hr.token, 'import_punches', { punches: [{ pin: '101', wall: '2026-10-11 08:05:00' }, { pin: '101', wall: '2026-10-11 16:10:00' }, { pin: '102', wall: '2026-10-11T09:20:00' }] });
assert.deepEqual(imported, { inserted: 3, skipped: 0 });
assert.deepEqual(await att(hr.token, 'import_punches', { punches: [{ pin: '101', wall: '2026-10-11 08:05:00' }] }), { inserted: 0, skipped: 1 });
await assert.rejects(() => att(hr.token, 'import_punches', { punches: [{ pin: '101', wall: '11/10/2026 08:05' }] }), /غير صالحة/);
const punches = await att(accountant.token, 'punches', { from: '2026-10-11', to: '2026-10-11' });
assert.deepEqual(punches.map(p => [p.pin, p.at]), [['101', '2026-10-11T08:05:00'], ['102', '2026-10-11T09:20:00'], ['101', '2026-10-11T16:10:00']]);
assert.equal((await db.query("select to_char(punched_at at time zone 'UTC','HH24:MI') t from mawatheeq_private.att_punches where pin='101' order by punched_at limit 1").catch(() => ({ rows: [{ t: 'denied' }] }))).rows[0].t, 'denied', 'Raw table stays private');
await assert.rejects(() => att(hr.token, 'punches', { from: '2026-01-01', to: '2026-12-31' }), /شهرين/);
assert.deepEqual((await att(accountant.token, 'leaves', { from: '2026-10-01', to: '2026-10-31' })).map(l => [l.employeeId, l.from, l.to]), [[uuid(1), '2026-10-12', '2026-10-13']]);

// Adjustments with revisions and archive.
const adj = await att(hr.token, 'save_adjustment', { item: { id: uuid(20), employeeId: uuid(1), day: '2026-10-11', kind: 'excuse', time: '', note: 'مهمة خارجية', revision: 0 } });
assert.equal(adj.revision, 1);
await assert.rejects(() => att(hr.token, 'save_adjustment', { item: { id: uuid(21), employeeId: uuid(1), day: '2026-10-11', kind: 'manual_in', time: '', note: 'x', revision: 0 } }));
await att(accountant.token, 'save_adjustment', { item: { id: uuid(22), employeeId: uuid(2), day: '2026-10-11', kind: 'manual_out', time: '15:00', note: 'نسي البصمة', revision: 0 } });
assert.equal((await att(hr.token, 'adjustments', { from: '2026-10-11', to: '2026-10-11' })).length, 2);
await att(hr.token, 'archive_adjustment', { item: { id: uuid(20), revision: 1 } });
assert.equal((await att(hr.token, 'adjustments', { from: '2026-10-11', to: '2026-10-11' })).length, 1);
await denied(() => att(hrReader.token, 'save_adjustment', { item: { id: uuid(23), employeeId: uuid(1), day: '2026-10-11', kind: 'excuse', note: 'x', revision: 0 } }));

// Devices, commands and bridges are HR-only.
const device = await att(hr.token, 'save_device', { device: { id: uuid(30), name: 'الاستقبال', host: '192.168.1.201', port: 4370, location: 'المدخل', enabled: true, revision: 0 } });
assert.equal(device.name, 'الاستقبال');
await denied(() => att(accountant.token, 'devices'));
await denied(() => att(accountant.token, 'save_device', { device: { id: uuid(31), name: 'x', host: '10.0.0.1', revision: 0 } }));
await denied(() => att(hrReader.token, 'save_device', { device: { id: uuid(31), name: 'x', host: '10.0.0.1', revision: 0 } }));
await assert.rejects(() => att(hr.token, 'save_device', { device: { id: uuid(32), name: 'bad', host: 'http://x y', revision: 0 } }));
const renamed = await att(hr.token, 'save_device', { device: { ...device, name: 'بوابة المكتب', revision: device.revision } });
assert.equal(renamed.name, 'بوابة المكتب'); assert.equal(renamed.revision, 2);
const cmd = await att(hr.token, 'queue_command', { deviceId: uuid(30), kind: 'add_user', payload: { pin: '103', name: 'Employee Three' } });
assert.equal(cmd.status, 'pending');
await assert.rejects(() => att(hr.token, 'queue_command', { deviceId: uuid(30), kind: 'add_user', payload: { pin: 'abc', name: 'x' } }), /أرقاماً/);
await assert.rejects(() => att(hr.token, 'queue_command', { deviceId: uuid(30), kind: 'clear_everything' }));
const created = await att(hr.token, 'create_bridge', { name: 'حاسوب الاستقبال' });
assert.match(created.key, /^[a-f0-9]{64}$/);
assert.ok(!JSON.stringify(await att(hr.token, 'bridges')).includes(created.key), 'Bridge keys are shown once and stored hashed');

// Bridge flow: claim commands, report punches, users, status and results.
await assert.rejects(() => bridge('f'.repeat(64), 'config'), e => e.code === '28000');
await assert.rejects(() => bridge('not-a-key', 'config'), e => e.code === '28000');
const config = await bridge(created.key, 'config', { version: 'test-1' });
assert.equal(config.timezone, 'Asia/Kuwait'); assert.equal(config.devices[0].host, '192.168.1.201');
assert.deepEqual(config.commands.map(c => c.kind), ['add_user']);
assert.equal((await bridge(created.key, 'config')).commands.length, 0, 'Commands are claimed once');
const pushed = await bridge(created.key, 'punches', { deviceId: uuid(30), punches: [{ pin: '102', wall: '2026-10-12 08:59:00', verify: 1, state: 0 }, { pin: '102', wall: '2026-10-12 08:59:00' }, { pin: 'bad pin', wall: '2026-10-12 09:00:00' }] });
assert.equal(pushed.inserted, 1, 'Duplicates and invalid rows are ignored');
await bridge(created.key, 'device_users', { deviceId: uuid(30), users: [{ pin: '101', uid: 1, name: 'One', role: 0 }, { pin: '102', uid: 2, name: 'Two', role: 14 }, { pin: '103', uid: 3, name: 'Three' }] });
const users = await att(hr.token, 'device_users', { deviceId: uuid(30) });
assert.deepEqual(users.map(u => [u.pin, u.employeeId]), [['101', uuid(1)], ['102', uuid(2)], ['103', null]], 'Device users are matched to employees by PIN');
await bridge(created.key, 'device_status', { deviceId: uuid(30), status: 'online', info: { serial: 'SYN123', firmware: 'Ver 6.60', userCounts: 3 } });
await bridge(created.key, 'command_result', { id: cmd.id, ok: true, result: { added: '103' } });
const devices = await att(hr.token, 'devices');
assert.equal(devices[0].status, 'online'); assert.equal(devices[0].serial, 'SYN123'); assert.equal(devices[0].userCount, 3); assert.equal(devices[0].pendingCommands, 0);
assert.equal((await att(hr.token, 'commands', { deviceId: uuid(30) }))[0].status, 'done');
assert.equal((await att(hr.token, 'bridges'))[0].version, 'test-1');
await assert.rejects(() => bridge(created.key, 'punches', { deviceId: uuid(99), punches: [] }), /غير موجود/);
await att(hr.token, 'revoke_bridge', { id: created.id });
await assert.rejects(() => bridge(created.key, 'config'), e => e.code === '28000', 'Revoked bridges are refused');

// Door devices: type, unlock duration, remote opening only on door devices, full user options, and removal that keeps punches.
const door = await att(hr.token, 'save_device', { device: { id: uuid(40), name: 'الباب الرئيسي', host: '192.168.1.210', port: 4370, location: 'المدخل', enabled: true, kind: 'access', doorName: 'باب المكتب', unlockSeconds: 7, notes: 'يفتح بالبطاقة', revision: 0 } });
assert.deepEqual([door.kind, door.doorName, door.unlockSeconds, door.notes], ['access', 'باب المكتب', 7, 'يفتح بالبطاقة']);
await assert.rejects(() => att(hr.token, 'save_device', { device: { ...door, kind: 'gate', revision: door.revision } }), /نوع الجهاز/);
await assert.rejects(() => att(hr.token, 'save_device', { device: { ...door, unlockSeconds: 600, revision: door.revision } }));
const unlock = await att(hr.token, 'queue_command', { deviceId: uuid(40), kind: 'unlock_door', payload: { seconds: 999 } });
assert.deepEqual(unlock.payload, { seconds: 7, door: 'باب المكتب' }, 'Unlock time comes from the device settings, not the request');
await assert.rejects(() => att(hr.token, 'queue_command', { deviceId: uuid(30), kind: 'unlock_door' }), /للحضور فقط/);
await denied(() => att(accountant.token, 'queue_command', { deviceId: uuid(40), kind: 'unlock_door' }));
await denied(() => att(hrReader.token, 'queue_command', { deviceId: uuid(40), kind: 'unlock_door' }));
const upd = await att(hr.token, 'queue_command', { deviceId: uuid(40), kind: 'update_user', payload: { pin: '101', name: 'Employee One', role: 14, card: '1234567', extra: 'dropped' } });
assert.deepEqual(upd.payload, { pin: '101', name: 'Employee One', role: 14, card: '1234567' });
await assert.rejects(() => att(hr.token, 'queue_command', { deviceId: uuid(40), kind: 'update_user', payload: { pin: '101', name: 'x', role: 3 } }), /البطاقة/);
await assert.rejects(() => att(hr.token, 'queue_command', { deviceId: uuid(40), kind: 'add_user', payload: { pin: '101', name: 'x', card: '12345678901' } }), /البطاقة/);
for (const kind of ['restart', 'voice_test', 'clear_logs']) assert.equal((await att(hr.token, 'queue_command', { deviceId: uuid(40), kind })).kind, kind);
const disabled = await att(hr.token, 'save_device', { device: { ...door, enabled: false, revision: door.revision } });
await assert.rejects(() => att(hr.token, 'queue_command', { deviceId: uuid(40), kind: 'unlock_door' }), /معطل/);
await denied(() => att(accountant.token, 'delete_device', { id: uuid(30), revision: 1 }));
await denied(() => att(hrReader.token, 'delete_device', { id: uuid(30), revision: 1 }));
await assert.rejects(() => att(hr.token, 'delete_device', { id: uuid(40), revision: disabled.revision - 1 }), e => e.code === 'PT409', 'Removal checks the current revision');
const before = (await att(accountant.token, 'punches', { from: '2026-10-01', to: '2026-10-31' })).length;
const reception = (await att(hr.token, 'devices')).find(d => d.id === uuid(30));
await att(hr.token, 'delete_device', { id: uuid(30), revision: reception.revision });
await att(hr.token, 'delete_device', { id: uuid(40), revision: disabled.revision });
assert.deepEqual((await att(hr.token, 'devices')).map(d => d.id), [], 'Devices are removed with their users and commands');
const after = await att(accountant.token, 'punches', { from: '2026-10-01', to: '2026-10-31' });
assert.equal(after.length, before, 'Punches from a removed device are kept'); assert.ok(after.every(p => p.deviceId === null || p.deviceId !== uuid(30)));
await assert.rejects(() => att(hr.token, 'delete_device', { id: uuid(30), revision: 1 }), /غير موجود/);

// Hours for single weekdays are kept with the settings and on an employee's own schedule.
{const now = await att(hr.token, 'context');
 const withDays = await att(hr.token, 'save_settings', { settings: { ...now.settings, days: { 4: { start: '08:00', end: '13:00' } } }, revision: now.revision });
 assert.equal(withDays.settings.days['4'].end, '13:00', 'A short Thursday is saved');
 const prof = await att(hr.token, 'save_profile', { employeeId: uuid(1), revision: (await att(hr.token, 'employees')).find(e => e.id === uuid(1)).profileRevision,
   profile: { pin: '101', salaryMinor: '900000', currency: 'KWD', schedule: { start: '08:00', end: '16:00', workDays: [0, 1, 2, 3, 4, 6], days: { 6: { start: '09:00', end: '12:00' } } } } });
 assert.equal(prof.schedule.days['6'].start, '09:00', 'An employee\'s own Saturday hours are saved');}
// Existing APIs keep working after the migration.
assert.ok((await dept(hr.token, 'hr', 'records_page', { offset: 0 })).length >= 3);
console.log('Passed attendance: door devices with fixed unlock times, remote opening limited to HR editors and door devices, device-user cards and admin roles, device removal with revision checks that keeps punches, HR/accounting-only access, device management limited to HR editors, validated settings and revisions, unique fingerprint PINs, timezone-correct imports with duplicate skipping, leave and adjustment projections, hashed one-time bridge keys, command claiming, bridge punches/users/status/results, revocation and existing API compatibility.');
