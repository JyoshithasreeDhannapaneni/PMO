---
name: documentation
description: How to keep THIS project's own docs (CLAUDE.md, memory files, README) accurate — not general technical writing advice
---

# Skill: PMO Tracker Documentation

## Trigger Patterns
- "update the docs", "is the README accurate", "document this decision", "update CLAUDE.md"

## Known Drift to Watch For
This repo's docs have drifted from reality before — check against actual code, not just against other docs, before trusting a claim:
- `README.md` still describes a Prisma-based backend (`prisma/schema.prisma`, `db:generate`/`db:migrate`) and a `DATABASE_URL` env var. **None of this is real** — the backend uses raw `pg` (`backend/src/config/database.ts`), and env vars are `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` separately. If you touch `README.md`, fix this rather than propagate it further.
- Some `.claude/` docs (pre-scaffold) also referenced "the Prisma query" and `backend/prisma/schema.prisma` — these have been corrected as part of this scaffold pass (see `.claude/memory/decisions.md`), but re-check if you find another stale reference.
- `README.md`'s SMTP env vars (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`) don't match the actual Microsoft Graph-based email sending (`MICROSOFT_CLIENT_ID`/`SECRET`/`TENANT_ID`) — flag rather than assume SMTP is in play.

## Rules for New Documentation
- **Memory files** (`.claude/memory/*.md`) use the frontmatter + `[[links]]` convention already established — match it, don't invent a new format.
- **Don't document intended/aspirational state as if it's current.** The testing-standard.md correction (a "Current state" note added at the top) is the pattern to follow when a rules doc describes something that isn't built yet — say so explicitly rather than silently deleting the aspirational content (it's still useful as a spec for when it IS built).
- **Verify before writing.** Before adding a claim like "X uses Y library" or "Z env var controls this," grep for it. This project's docs have previously stated things that were true at some earlier point and silently stopped being true (Prisma is the clearest example) — don't add a new instance of that pattern.
- **gstack's `/document-release` and `/document-generate`** handle user-facing release notes and generated API docs respectively — this skill is for the internal `.claude/` knowledge base and `README.md`, not a replacement for those.
