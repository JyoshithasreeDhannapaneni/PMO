type DelayStatus = 'NOT_DELAYED' | 'AT_RISK' | 'DELAYED';

interface DelayCalculationResult {
  delayDays: number;
  delayStatus: DelayStatus;
}

/**
 * Calculate delay days and status for a project
 * Business Logic:
 * - delay_days = actual_end - planned_end (in days)
 * - If delay_days > 0 → "DELAYED"
 * - If delay_days > -7 and delay_days <= 0 → "AT_RISK" (within 7 days of deadline)
 * - Otherwise → "NOT_DELAYED"
 */
export function calculateDelay(
  plannedEnd: Date,
  actualEnd: Date | null,
  currentDate: Date = new Date()
): DelayCalculationResult {
  // If project has actual end date, calculate based on that
  if (actualEnd) {
    const delayMs = actualEnd.getTime() - plannedEnd.getTime();
    const delayDays = Math.ceil(delayMs / (1000 * 60 * 60 * 24));
    
    return {
      delayDays: Math.max(0, delayDays),
      delayStatus: delayDays > 0 ? 'DELAYED' : 'NOT_DELAYED',
    };
  }
  
  // If project is ongoing, calculate based on current date vs planned end
  const remainingMs = plannedEnd.getTime() - currentDate.getTime();
  const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
  
  if (remainingDays < 0) {
    // Already past deadline
    return {
      delayDays: Math.abs(remainingDays),
      delayStatus: 'DELAYED',
    };
  } else if (remainingDays <= 7) {
    // Within 7 days of deadline - at risk
    return {
      delayDays: 0,
      delayStatus: 'AT_RISK',
    };
  }
  
  return {
    delayDays: 0,
    delayStatus: 'NOT_DELAYED',
  };
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
