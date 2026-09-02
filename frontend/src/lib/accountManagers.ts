// Baseline roster of Account Managers who predate (or don't have) a PMO Tracker login --
// mirrors the same allow-list enforced server-side (backend/src/index.ts nulls out any
// projects.account_manager value not on this list OR a real ACCOUNT_MANAGER user's name).
export const ACCOUNT_MANAGERS = [
  'Joy Prakash',
  'Arundhati Sen',
  'Anthony Raymond',
  'Lennis Brown',
  'Deepak R J',
];

// Every AM dropdown should show this baseline PLUS anyone who actually holds Account
// Manager access in the app (a `users` row with role ACCOUNT_MANAGER) -- e.g. someone
// added later through user management, not just the original 5 names above. Baseline
// order is preserved (matches the existing assignment-form ordering); any additional
// real accounts are appended, alphabetically, so newly added AMs don't get lost.
export function mergeAccountManagers(users: { name?: string; role?: string; isActive?: boolean }[] = []): string[] {
  const extra = users
    .filter((u) => u.role === 'ACCOUNT_MANAGER' && u.isActive !== false && u.name && !ACCOUNT_MANAGERS.includes(u.name))
    .map((u) => u.name as string)
    .sort();
  return [...ACCOUNT_MANAGERS, ...extra];
}
