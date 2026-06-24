type DelayStatus = 'NOT_DELAYED' | 'AT_RISK' | 'DELAYED';

interface DelayCalculationResult {
  delayDays: number;
  delayStatus: DelayStatus;
}

/**
 * Calculate delay days and status for a project.
 *
 * Expected-end formula (kickoff-adjusted):
 *   sow_duration  = plannedEnd − plannedStart
 *   expected_end  = actualStart + sow_duration   (if kickoff has happened)
 *                 = plannedEnd                    (fallback when no kickoff yet)
 *
 * Example: SOW Apr 1 → Jun 1 (61 days), kickoff Apr 10 → expected end Jun 11.
 */
export function calculateDelay(
  plannedStart: Date,
  plannedEnd: Date,
  actualStart: Date | null,
  actualEnd: Date | null,
  currentDate: Date = new Date(),
  extendedEndDate?: Date | null
): DelayCalculationResult {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  // Effective deadline: the extended end date (if PM approved overage extension),
  // otherwise the contractual SOW end date. Delay is always measured against the
  // contractual deadline so results are consistent across all pages.
  const expectedEnd = extendedEndDate || plannedEnd;

  // Project already completed
  if (actualEnd) {
    const delayDays = Math.ceil((actualEnd.getTime() - expectedEnd.getTime()) / MS_PER_DAY);
    return {
      delayDays: Math.max(0, delayDays),
      delayStatus: delayDays > 0 ? 'DELAYED' : 'NOT_DELAYED',
    };
  }

  // Ongoing project — compare today against expected end
  const rawDiffMs = expectedEnd.getTime() - currentDate.getTime();
  const remainingDays = Math.ceil(rawDiffMs / MS_PER_DAY);

  if (rawDiffMs < 0) {
    // Past the expected end — use floor so we show complete days of delay
    const delayDays = Math.floor(-rawDiffMs / MS_PER_DAY);
    return { delayDays, delayStatus: 'DELAYED' };
  }
  if (remainingDays <= 7) {
    return { delayDays: 0, delayStatus: 'AT_RISK' };
  }
  return { delayDays: 0, delayStatus: 'NOT_DELAYED' };
}

/**
 * Calculate the number of business days between two dates
 * Excludes weekends (Saturday and Sunday)
 */
export function calculateBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

/**
 * Get delay severity level for UI display
 */
export function getDelaySeverity(delayDays: number): 'low' | 'medium' | 'high' | 'critical' {
  if (delayDays === 0) return 'low';
  if (delayDays <= 7) return 'medium';
  if (delayDays <= 30) return 'high';
  return 'critical';
}
