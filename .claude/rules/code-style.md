# Code Style Rules — PMO Tracker

## TypeScript
- Strict mode is on. No implicit `any`.
- Use `interface` for object shapes, `type` for unions/aliases.
- External API responses (Prisma, Jira, Express `req.body`) may be cast with `as` at the boundary only.
- Prefer `const` over `let`. Never use `var`.

## React / Next.js (Frontend)
- All pages are `'use client'` components under `app/(authenticated)/`.
- Hooks live exclusively in `frontend/src/hooks/useProjects.ts` — never create separate hook files.
- State: `useState` for local UI state only. Server state via React Query (`useQuery` / `useMutation`).
- No inline `style` prop except dynamic values like `{ width: \`${pct}%\` }`.
- Tailwind class ordering: layout → sizing → spacing → color → text → border → shadow → transition.
- KPI cards follow the pattern: `bg-*-50 rounded-xl p-4 flex items-center gap-3 border border-white`.
- Collapsible sections: `useState(false)` + `ChevronRight` icon with `rotate-90` class when open.
- lucide-react icons: only use icons already present in the file's import list (OneDrive timeout risk).

## Express / Backend
- Controllers are thin: validate input → call service → send response.
- Services contain all business logic. Never import `req`/`res` in a service.
- Always use `requireAuth` middleware on protected routes.
- Log with `logger.info()` / `logger.error()` (Winston). Never use `console.log` in production code.
- Return shape: `{ success: true, data: ... }` on success, `{ success: false, error: '...' }` on error.

## Comments
- No comments unless the WHY is non-obvious (hidden constraint, workaround for a specific bug).
- No JSDoc blocks. No TODO comments in committed code.

## Naming
- Files: `camelCase.ts` for services/utils, `PascalCase.tsx` for React components.
- DB fields: `snake_case` (Prisma raw) — map to `camelCase` in TypeScript types.
- Route files: `<domain>Routes.ts`, controller files: `<domain>Controller.ts`.
