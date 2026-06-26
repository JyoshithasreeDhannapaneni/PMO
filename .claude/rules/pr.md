# Pull Request Standards — PMO Tracker

## PR Title
- Under 70 characters.
- Format: `<type>: <what changed>` — e.g. `feat: add Escalations card to manager dashboard`
- Types: `feat` | `fix` | `refactor` | `chore` | `docs`

## PR Body Template
```markdown
## Summary
- <bullet 1>
- <bullet 2>
- <bullet 3 max>

## Test plan
- [ ] Backend: npm run dev starts without errors
- [ ] Frontend: npm run build completes without TypeScript errors
- [ ] <feature-specific manual test step>
- [ ] No regressions on existing pages

## Screenshots
<!-- Add before/after screenshots for UI changes -->
```

## Branch Naming
`<type>/<short-slug>` — e.g. `feat/manager-dashboard-escalations`

## Merge Rules
- Squash merge to `main`.
- Never force-push to `main`.
- Resolve all conflicts — never discard incoming changes without reviewing.
- Do not merge with TypeScript compile errors (`npx tsc --noEmit` must pass).

## What Goes in One PR
- One feature or one fix per PR.
- For large refactors touching many files, one bundled PR is preferred over many small ones (confirmed preference).
- Never mix feature work with unrelated cleanup in the same PR.
