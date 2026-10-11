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
const configPath = path.join(here, 'config.json'), statePath = path.join(here, 'bridge-state.json');
if (!fs.existsSync(configPath)) { console.error('config.json غير موجود. انسخ config.example.json إلى config.json واملأ القيم من صفحة الأجهزة في مواثيق.'); process.exit(1); }
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
for (const key of ['supabaseUrl', 'publishableKey', 'bridgeKey']) if (!config[key] || String(config[key]).includes('REPLACE')) { console.error(`اكتب ${key} في config.json`); process.exit(1); }
let state = {}; try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { /* First run uploads all stored punches; the server skips duplicates. */ }
const stamp = () => new Date().toLocaleString('en-GB');
const log = message => console.log(`[${stamp()}] ${message}`);

const bridge = createBridge({
  api: supabaseApi(config), state, log, version: '1.0.0',
  saveState: s => fs.writeFileSync(statePath, JSON.stringify(s, null, 2)),
  usersEveryCycles: Math.max(1, Math.round(3600 / (config.intervalSeconds || 60))),
  connectDevice: async device => {
    const client = new Zkteco(device.host, device.port, config.timeoutMs || 10000, 4000);
    await client.createSocket();
    return client;
  },
});

const once = process.argv.includes('--once');
log(`Mawatheeq Bridge 1.0.0 — كل ${config.intervalSeconds || 60} ثانية${once ? ' (مرة واحدة)' : ''}`);
for (;;) {
  try { const r = await bridge.cycle(); if (once) log(`تم: ${r.devices} جهاز، ${r.commands} أمر`); }
  catch (e) { log(`تعذر الاتصال بمواثيق: ${e.message}${e.code === '28000' ? ' — أنشئ مفتاح جسر جديداً من صفحة الأجهزة.' : ''}`); if (once) process.exit(1); }
  if (once) break;
  await new Promise(r => setTimeout(r, (config.intervalSeconds || 60) * 1000));
}
