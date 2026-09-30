// Mon-Sun (Asia/Kolkata) calendar-week boundaries for the weekly hygiene snapshot feature.
// India has no DST, so a fixed +5:30 offset is safe here — this would NOT be safe for a
// timezone that observes DST.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface WeekBounds {
  weekStart: Date; // Monday 00:00:00.000 IST, expressed as the equivalent UTC instant
  weekEnd: Date;   // Sunday 23:59:59.999 IST, expressed as the equivalent UTC instant
}

// weeksAgo=0 -> the Mon-Sun week containing "now" (current, still in progress unless it's
// exactly Sunday night). weeksAgo=1 -> the most recently completed week. Etc.
export function getIstWeekBounds(weeksAgo = 0): WeekBounds {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const istDow = nowIst.getUTCDay(); // 0=Sun..6=Sat, read off the IST-shifted instant
  const daysSinceMonday = (istDow + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
  const istMidnightToday = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate());
  const istMondayTarget = istMidnightToday - daysSinceMonday * 86400000 - weeksAgo * 7 * 86400000;
  return {
    weekStart: new Date(istMondayTarget - IST_OFFSET_MS),
    weekEnd: new Date(istMondayTarget + 7 * 86400000 - 1 - IST_OFFSET_MS),
  };
}

// YYYY-MM-DD of the IST calendar date for a given UTC instant — for DATE columns.
export function istDateStr(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export interface DayBounds {
  dayStart: Date; // 00:00:00.000 IST, expressed as the equivalent UTC instant
  dayEnd: Date;   // 23:59:59.999 IST, expressed as the equivalent UTC instant
}

// daysAgo=0 -> today (IST, still in progress unless queried right at midnight),
// daysAgo=1 -> the most recently completed IST calendar day. Same shape as
// getIstWeekBounds/getIstMonthBounds above, just for a single day.
export function getIstDayBounds(daysAgo = 0): DayBounds {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const istMidnightToday = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate());
  const istMidnightTarget = istMidnightToday - daysAgo * 86400000;
  return {
    dayStart: new Date(istMidnightTarget - IST_OFFSET_MS),
    dayEnd: new Date(istMidnightTarget + 86400000 - 1 - IST_OFFSET_MS),
  };
}

// "Mon, Sep 22" style label for a daysAgo offset — for display, not storage.
export function istDayLabel(daysAgo = 0): string {
  const { dayStart } = getIstDayBounds(daysAgo);
  const nowIst = new Date(dayStart.getTime() + IST_OFFSET_MS);
  return nowIst.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// IST calendar-month boundaries. monthsAgo=0 -> the current month (in progress), 1 -> the
// most recently completed calendar month, etc. monthEnd is EXCLUSIVE (start of the
// following month) so callers can use it directly as an "until" bound.
export function getIstMonthBounds(monthsAgo = 0): { monthStart: Date; monthEnd: Date } {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const firstOfMonthIst = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth() - monthsAgo, 1);
  const firstOfNextMonthIst = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth() - monthsAgo + 1, 1);
  return {
    monthStart: new Date(firstOfMonthIst - IST_OFFSET_MS),
    monthEnd: new Date(firstOfNextMonthIst - IST_OFFSET_MS),
  };
}

// "August 2026" style label for a monthsAgo offset — for display, not storage.
export function istMonthLabel(monthsAgo = 0): string {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const d = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth() - monthsAgo, 1));
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// All Mondays (as IST date strings) from "Week 1" of the current IST month through today's
// week, inclusive — this is what makes the trend chart "week 1, 2, 3... of this month" and
// grow automatically as the month progresses, per the 2026-08-24 design decision.
//
// "Week 1" is the week containing the 1st of the month, even when that week's Monday falls
// in the PREVIOUS month (e.g. an Oct 1 that lands on a Thursday makes Week 1 of October run
// Mon Sep 28 - Sun Oct 4) — confirmed 2026-09-30: the new month "claims" that boundary week
// entirely rather than splitting it, so it stops appearing as the previous month's trailing
// week once the calendar turns over. The underlying pmo_hygiene_weekly row for that week is
// keyed by its Monday (week_start) regardless of month, so this is purely a read-time
// grouping choice — no backfill needed when this rule changes.
export function weeksInCurrentIstMonth(): string[] {
  const { weekStart: currentWeekStart } = getIstWeekBounds(0);
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const firstOfMonthIst = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 1);

  // Monday of the week that contains the 1st of the month -- this, not the 1st itself, is
  // the actual cutoff so a mid-week month start still pulls in the few prior-month days.
  const firstOfMonthDow = new Date(firstOfMonthIst).getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMondayForFirst = (firstOfMonthDow + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
  const week1Monday = firstOfMonthIst - daysSinceMondayForFirst * 86400000;

  const weeks: string[] = [];
  let cursor = currentWeekStart.getTime();
  // Walk backwards week by week from the current week down to (and including) Week 1's Monday.
  while (true) {
    const cursorIstMidnight = Math.round((cursor + IST_OFFSET_MS) / 86400000) * 86400000;
    if (cursorIstMidnight < week1Monday) break;
    weeks.unshift(istDateStr(new Date(cursor)));
    cursor -= 7 * 86400000;
  }
  return weeks;
}
