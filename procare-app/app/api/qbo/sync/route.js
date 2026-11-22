import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { hasSecondStep } from '@/lib/mfa';
import { syncBalanceSheet, syncPl } from '@/lib/qbo';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPendingDriverNotices } from '@/lib/driverNotice';
import { samsaraConfigured, syncOdometers, syncSamsara } from '@/lib/samsaraPush';
import { sendOilReminders } from '@/lib/maintenanceReminder';
import { sendInventoryReminders } from '@/lib/inventoryReminder';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Daily (Vercel cron, with CRON_SECRET): refresh the last 3 months of P&L and 13 month-ends of the balance sheet. */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 401 });
  }
  // Also the daily send for driver emails still waiting (change 78), e.g. someone the FieldRoutes sync deactivated
  let drivers = {};
  try { drivers = await sendPendingDriverNotices(createAdminClient()); } catch (e) { drivers = { driverError: String(e.message || e) }; }
  // And the truck sheet → Samsara (change 81), while it's on: picks up newly installed trucks by VIN
  try {
    const admin = createAdminClient();
    const { data: fs } = await admin.from('fleet_settings').select('samsara_auto').eq('id', 1).maybeSingle();
    if (fs?.samsara_auto && samsaraConfigured()) {
      const r = await syncSamsara(admin, { apply: true });
      drivers = { ...drivers, samsaraChanged: r.changed, samsaraProblems: r.problems.length };
    }
  } catch (e) { drivers = { ...drivers, samsaraError: String(e.message || e) }; }
  // Odometers from Samsara (read only, change 82), then Monday's oil-change reminders
  try { if (samsaraConfigured()) drivers = { ...drivers, ...(await syncOdometers(createAdminClient())) }; } catch (e) { drivers = { ...drivers, odometerError: String(e.message || e) }; }
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    if (new Date(`${today}T12:00:00Z`).getUTCDay() === 1) drivers = { ...drivers, ...(await sendOilReminders(createAdminClient(), today, new URL(request.url).origin)) };
  } catch (e) { drivers = { ...drivers, oilError: String(e.message || e) }; }
  // The monthly inventory count (change 85): reminders on the month's last 2 business days
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    drivers = { ...drivers, ...(await sendInventoryReminders(createAdminClient(), today, new URL(request.url).origin)) };
  } catch (e) { drivers = { ...drivers, inventoryError: String(e.message || e) }; }
  try {
    const pl = await syncPl(3);
    return NextResponse.json({ ok: true, ...drivers, ...pl, ...(await syncBalanceSheet(13)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}

/** Finance → Settings → Sync now (C-Suite / President): { months } 1–24, default 3. */
export async function POST(request) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me || me.rank < 4) return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 403 });
  if (!(await hasSecondStep(supabase))) return NextResponse.json({ ok: false, error: 'Enter your authenticator code first (open Finance again).' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const months = Math.min(24, Math.max(1, parseInt(body?.months, 10) || 3));
  try {
    const pl = await syncPl(months);
    return NextResponse.json({ ok: true, ...pl, ...(await syncBalanceSheet(Math.max(13, months))) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
