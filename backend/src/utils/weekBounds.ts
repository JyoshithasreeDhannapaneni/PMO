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

// All Mondays (as IST date strings) from the 1st of the current IST month through today's
// week, inclusive — this is what makes the trend chart "week 1, 2, 3... of this month" and
// grow automatically as the month progresses, per the 2026-08-24 design decision.
export function weeksInCurrentIstMonth(): string[] {
  const { weekStart: currentWeekStart } = getIstWeekBounds(0);
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const firstOfMonthIst = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 1);

  const weeks: string[] = [];
  let cursor = currentWeekStart.getTime();
  // Walk backwards week by week from the current week while that week's Monday still
  // falls within the current IST calendar month.
  while (true) {
    const cursorIstMidnight = Math.round((cursor + IST_OFFSET_MS) / 86400000) * 86400000;
    if (cursorIstMidnight < firstOfMonthIst) break;
    weeks.unshift(istDateStr(new Date(cursor)));
    cursor -= 7 * 86400000;
  }
  return weeks;
}
