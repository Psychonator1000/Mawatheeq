#!/usr/bin/env node
// Mawatheeq Bridge: connects ZKTeco fingerprint devices on the office network to Mawatheeq.
// Usage: node mawatheeq-bridge.mjs            (runs continuously)
//        node mawatheeq-bridge.mjs --once     (one pass, for testing the setup)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Zkteco from 'zkteco-js';
import { createBridge, supabaseApi } from './core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// Settings come from config.json next to this file, or from environment variables when running inside the office server.
const configPath = path.join(here, 'config.json'), statePath = path.join(process.env.MAWATHEEQ_STATE_DIR || here, 'bridge-state.json');
const fromEnv = process.env.MAWATHEEQ_URL && { supabaseUrl: process.env.MAWATHEEQ_URL, publishableKey: process.env.MAWATHEEQ_PUBLISHABLE_KEY || 'office-local', bridgeKey: process.env.MAWATHEEQ_BRIDGE_KEY || '',
  intervalSeconds: Number(process.env.MAWATHEEQ_INTERVAL_SECONDS) || 60, commandSeconds: Number(process.env.MAWATHEEQ_COMMAND_SECONDS) || 4, timeoutMs: Number(process.env.MAWATHEEQ_TIMEOUT_MS) || 10000 };
if (!fromEnv && !fs.existsSync(configPath)) { console.error('config.json غير موجود. انسخ config.example.json إلى config.json واملأ القيم من صفحة الأجهزة في مواثيق.'); process.exit(1); }
const config = fromEnv || JSON.parse(fs.readFileSync(configPath, 'utf8'));
for (const key of ['supabaseUrl', 'publishableKey', 'bridgeKey']) if (!config[key] || String(config[key]).includes('REPLACE')) { console.error(`اكتب ${key} في config.json (أو BRIDGE_KEY في ملف .env للخادم)`); process.exit(1); }
let state = {}; try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { /* First run uploads all stored punches; the server skips duplicates. */ }
const stamp = () => new Date().toLocaleString('en-GB');
const log = message => console.log(`[${stamp()}] ${message}`);

const bridge = createBridge({
  api: supabaseApi(config), state, log, version: '1.1.0',
  saveState: s => fs.writeFileSync(statePath, JSON.stringify(s, null, 2)),
  usersEveryCycles: Math.max(1, Math.round(3600 / (config.intervalSeconds || 60))),
  connectDevice: async device => {
    const timeout = config.timeoutMs || 10000;
    const client = new Zkteco(device.host, device.port, timeout, 4000);
    // An unplugged device must not stall the other devices or door commands: give up after a hard limit.
    let timer;
    try {
      await Promise.race([client.createSocket(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`لا يستجيب الجهاز (${device.host}:${device.port})`)), timeout + 2000); })]);
    } catch (e) { await client.disconnect?.().catch(() => {}); throw e; }
    finally { clearTimeout(timer); }
    // Door relay and restart are protocol commands without helpers in zkteco-js.
    client.unlockDoor = seconds => { const data = Buffer.alloc(4); data.writeUInt32LE(seconds * 10, 0); return client.executeCmd(31, data); };
    client.restart = () => client.executeCmd(1004, '').catch(e => { if (!/timeout|closed|reset/i.test(String(e?.message || e))) throw e; });
    return client;
  },
});

const once = process.argv.includes('--once');
const interval = (config.intervalSeconds || 60) * 1000, commandEvery = Math.max(2, config.commandSeconds || 4) * 1000;
log(`Mawatheeq Bridge 1.1.0 — مزامنة كل ${interval / 1000} ثانية، والأوامر (مثل فتح الباب) كل ${commandEvery / 1000} ثوانٍ${once ? ' (مرة واحدة)' : ''}`);
const report = e => log(`تعذر الاتصال بمواثيق: ${e.message}${e.code === '28000' ? ' — أنشئ مفتاح جسر جديداً من صفحة الأجهزة.' : ''}`);
let nextSync = 0;
for (;;) {
  const now = Date.now();
  try {
    if (now >= nextSync) { nextSync = now + interval; const r = await bridge.cycle(); if (once) log(`تم: ${r.devices} جهاز، ${r.commands} أمر`); }
    else await bridge.commands();
  } catch (e) { report(e); if (once) process.exit(1); }
  if (once) process.exit(process.exitCode || 0);
  await new Promise(r => setTimeout(r, commandEvery));
}
