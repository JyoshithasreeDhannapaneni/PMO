export type QABucket = 'answered_well' | 'partial' | 'dodged';

// Thresholds are a starting point, not yet validated against human-reviewed calls —
// see TODOS.md ("Validate Quality bucket thresholds against human-reviewed calls").
export function bucketQAScore(score: number): QABucket {
  if (!Number.isFinite(score)) return 'dodged';
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped >= 70) return 'answered_well';
  if (clamped >= 40) return 'partial';
  return 'dodged';
}
