// Mawatheeq Bridge core: device-protocol independent, so it can be tested with a simulated device.
// `api(action, data)` calls the Mawatheeq bridge RPC; `connectDevice(device)` returns a connected client.

const pad = n => String(n).padStart(2, '0');
/** Device clocks have no timezone: read the wall-clock fields exactly as the device stored them. */
export function toWall(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const pinOf = u => String(u.userId ?? u.user_id ?? '').trim();
const list = r => Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : [];

export function createBridge({ api, connectDevice, state, saveState = () => {}, log = () => {}, version = 'dev', usersEveryCycles = 60 }) {
  let cycles = 0;
  async function withDevice(device, work) {
    const client = await connectDevice(device);
    try { return await work(client); } finally { await client.disconnect?.().catch?.(() => {}); }
  }
  async function readUsers(client) {
    return list(await client.getUsers()).map(u => ({ pin: pinOf(u), uid: Number(u.uid) || null, name: String(u.name || '').replace(/\0/g, '').trim(), role: Number(u.role) || 0, card: String(u.cardno || '') }))
      .filter(u => /^[0-9A-Za-z]{1,24}$/.test(u.pin));
  }
  async function uploadLogs(device, client, full) {
    const since = full ? '' : state[device.id] || '';
    const rows = list(await client.getAttendances()).map(r => ({ pin: pinOf(r), wall: toWall(r.record_time ?? r.recordTime), verify: Number(r.type ?? 0), state: Number(r.state ?? 0) }))
      .filter(r => r.wall && /^[0-9A-Za-z]{1,24}$/.test(r.pin) && r.wall >= since).sort((a, b) => a.wall.localeCompare(b.wall));
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 5000) inserted += (await api('punches', { deviceId: device.id, punches: rows.slice(i, i + 5000) })).inserted;
    if (rows.length) { state[device.id] = rows[rows.length - 1].wall; saveState(state); }
    return { read: rows.length, inserted };
  }
  async function readInfo(client) {
    const info = {};
    for (const [key, fn] of [['serial', 'getSerialNumber'], ['firmware', 'getFirmware'], ['deviceName', 'getDeviceName'], ['platform', 'getPlatform']])
      if (client[fn]) info[key] = String(await client[fn]().catch(() => '') || '').replace(/\0/g, '').trim().slice(0, 60);
    const sizes = await client.getInfo?.().catch(() => null);
    if (sizes) Object.assign(info, { users: sizes.userCounts, logs: sizes.logCounts, capacity: sizes.logCapacity });
    const clock = await client.getTime?.().catch(() => null);
    if (clock) info.deviceTime = toWall(clock);
    return info;
  }
  async function runCommand(device, cmd) {
    return withDevice(device, async client => {
      switch (cmd.kind) {
        case 'sync_logs': return uploadLogs(device, client, true);
        case 'read_info': { const info = await readInfo(client); await api('device_status', { deviceId: device.id, status: 'online', info }); return info; }
        case 'set_time': { await client.setTime(new Date()); return { deviceTime: toWall(await client.getTime?.().catch(() => new Date())) }; }
        case 'fetch_users': { const users = await readUsers(client); await api('device_users', { deviceId: device.id, users }); return { users: users.length }; }
        case 'add_user': {
          const users = await readUsers(client), pin = String(cmd.payload.pin);
          if (users.some(u => u.pin === pin)) throw new Error('رقم البصمة مسجل مسبقاً على الجهاز');
          const uid = Math.max(0, ...users.map(u => u.uid || 0)) + 1;
          await client.setUser(uid, pin, String(cmd.payload.name || '').slice(0, 24), '', 0, 0);
          await api('device_users', { deviceId: device.id, users: await readUsers(client) });
          return { added: pin, uid };
        }
        case 'delete_user': {
          const users = await readUsers(client), target = users.find(u => u.pin === String(cmd.payload.pin));
          if (!target?.uid) throw new Error('المستخدم غير موجود على الجهاز');
          await client.deleteUser(target.uid);
          await api('device_users', { deviceId: device.id, users: await readUsers(client) });
          return { deleted: target.pin };
        }
        default: throw new Error('أمر غير مدعوم');
      }
    });
  }
  /** One pass: run queued commands, then pull new punches from every enabled device. */
  async function cycle() {
    cycles++;
    const config = await api('config', { version });
    const devices = new Map(config.devices.map(d => [d.id, d]));
    for (const cmd of config.commands) {
      const device = devices.get(cmd.deviceId);
      try {
        if (!device) throw new Error('الجهاز غير موجود');
        const result = await runCommand(device, cmd);
        await api('command_result', { id: cmd.id, ok: true, result });
        log(`✓ ${device.name}: ${cmd.kind}`);
      } catch (e) {
        await api('command_result', { id: cmd.id, ok: false, error: String(e?.message || e) });
        log(`✗ ${device?.name || cmd.deviceId}: ${cmd.kind} — ${e?.message || e}`);
      }
    }
    for (const device of config.devices.filter(d => d.enabled)) {
      try {
        const summary = await withDevice(device, async client => {
          const result = await uploadLogs(device, client, false);
          if (cycles === 1 || cycles % usersEveryCycles === 0) {
            await api('device_users', { deviceId: device.id, users: await readUsers(client) });
            await api('device_status', { deviceId: device.id, status: 'online', info: await readInfo(client) });
          } else await api('device_status', { deviceId: device.id, status: 'online' });
          return result;
        });
        if (summary.inserted) log(`↓ ${device.name}: ${summary.inserted} بصمة جديدة`);
      } catch (e) {
        await api('device_status', { deviceId: device.id, status: 'offline', error: String(e?.message || e) }).catch(() => {});
        log(`! ${device.name} (${device.host}): ${e?.message || e}`);
      }
    }
    return { devices: config.devices.length, commands: config.commands.length };
  }
  return { cycle };
}

/** Supabase RPC client for the bridge: the publishable key plus this bridge's own key. */
export function supabaseApi({ supabaseUrl, publishableKey, bridgeKey, fetchImpl = fetch }) {
  return async (action, data = {}) => {
    const response = await fetchImpl(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/mawatheeq_bridge_request`, {
      method: 'POST', headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: bridgeKey, p_action: action, p_data: data }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body.message || `HTTP ${response.status}`), { code: body.code });
    return body;
  };
}
