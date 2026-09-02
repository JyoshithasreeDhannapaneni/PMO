// Canonical, deliberately-curated roster of valid Account Managers for this PMO Tracker.
// Mirrors the same allow-list enforced server-side (backend/src/index.ts nulls out any
// projects.account_manager value not on this list on every boot), so project data can
// never drift from it. Account Managers here don't need a `users` login — this list,
// not the users table, is the source of truth for "who is a valid Account Manager."
export const ACCOUNT_MANAGERS = [
  'Joy Prakash',
  'Arundhati Sen',
  'Anthony Raymond',
  'Lennis Brown',
  'Deepak R J',
];
