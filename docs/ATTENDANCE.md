# Attendance, fingerprint devices and payroll estimates

HR and accounting share one attendance record built from ZKTeco fingerprint punches.

- **HR → الحضور** shows today's board and a monthly grid for every employee. Select a day to see its punches. You can add an excuse or a manual check-in/check-out with a reason. Adjustments never change the original punches.
- **HR → الأجهزة** manages the fingerprint devices:
  - add, rename or disable a device;
  - see the users registered on it and which employee each one maps to;
  - add or remove device users;
  - run a full sync, set the device clock and read device information;
  - read the command log;
  - manage office-bridge keys;
  - set the device type (attendance only, door only, or both), the door name and how long the door stays unlocked;
  - open a door remotely (confirmed first, recorded with the requester's name);
  - add or edit device users with a card number and device-admin role;
  - run a sound test or restart the device;
  - save every stored punch and then clear the device log;
  - remove a device. Its punches stay in the attendance record, and nothing is erased from the device itself.
- **HR / accounting → الرواتب والبصمات** links each employee to their fingerprint number (the device User ID). It also sets the monthly salary, its currency and an optional personal work schedule.
- **HR / accounting → إعدادات الدوام** sets:
  - working hours and work days;
  - daily grace period and monthly lateness allowance;
  - the deduction mode;
  - the day-rate basis;
  - overtime;
  - public holidays.
- **Accounting → الرواتب والحضور** estimates each employee's monthly pay from the attendance record. It shows totals per currency and can print a payroll sheet, print a warning letter and export CSV.

## Pay rules

- **Lateness.** Arriving after the grace period counts every minute from the scheduled start. Early departures add to the same monthly total.
- **Allowance.** Only minutes above the monthly allowance matter.
- **Warning mode (default).** Excess minutes and absences produce warnings and a *potential* deduction. The estimated net salary stays the full salary.
- **Deduction mode.** Excess minutes are deducted at the employee's minute rate. Absences are deducted only when that option is also enabled. The minute rate is salary ÷ day basis ÷ scheduled minutes per day.
- **Leave and excuses.** Approved HR leave and recorded excuses are never counted as absence.
- **Holidays and rest days.** Work on a holiday or rest day counts as overtime. Overtime pays only when enabled and above the minimum minutes.
- **Exact amounts.** All amounts are integer minor units. Currencies are never mixed. The estimate creates no ledger entries and should be reviewed before payment.

## Access

- Attendance is visible to accounts with the HR or accounting section.
- Editing settings, pay profiles and adjustments requires edit permission in either section.
- Devices, bridge keys and punch-file imports are HR-only and require edit permission.
- All entry points validate the local session in the database. Every settings, profile, adjustment, device, command, import and bridge change is audited.

## Connecting the devices

Browsers cannot reach devices on the office network. A small free program, **Mawatheeq Bridge** (`bridge/`), runs on an office PC that stays on during work hours. It does three things:

- pulls new punches every minute;
- runs queued commands;
- reports device status.

It authenticates with a revocable bridge key created in **الأجهزة**. The database stores only the key's SHA-256 hash. The bridge sees device addresses and nothing else. Setup steps are in `bridge/README.md`.

Without the bridge, import the device's USB `attlog.dat` or a CSV/TXT export from **الحضور → استيراد ملف بصمات**. Duplicate punches are ignored.

Punch times are the device's wall-clock time. The server interprets them in the timezone set in the settings (Asia/Kuwait by default).

## Applying the migrations (one time)

Apply them in this order, each in its own query:

1. `supabase/migrations/20261011150000_record_comments.sql` (if not applied yet);
2. `supabase/migrations/20261011180000_attendance.sql`;
3. `supabase/migrations/20261011200000_attendance_doors.sql` (door devices, device removal and device-user options).

For each one: in Supabase open **SQL Editor** → **New query**, paste the full file and select **Run**. Each file is one transaction and only adds tables, columns and functions; expect "Success. No rows returned". Reload Mawatheeq afterwards.

Door control needs the lock wired to the device's lock relay. Opening a door is limited to HR accounts with edit permission; the unlock time always comes from the device settings.

Until it is applied, HR and accounting work as before and show a short notice in place of the attendance tabs.

Verified with:

- `pnpm test:attendance`: PGlite with synthetic accounts, the calculation tests and the bridge running against a simulated device;
- the synthetic browser workflow `scripts/verify-attendance-ui.mjs`.

None of these contacts the real backend or a real device.

## Rollback

```sql
revoke execute on function public.mawatheeq_attendance_request(text,text,jsonb), mawatheeq_private.attendance_request(text,text,jsonb),
  public.mawatheeq_bridge_request(text,text,jsonb), mawatheeq_private.bridge_request(text,text,jsonb) from anon, authenticated;
notify pgrst, 'reload schema';
```

This hides the feature and stops all bridges while keeping the data.
