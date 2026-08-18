# /feature — Build a New Feature

Runs the project's feature-build blueprint end to end for a new domain feature.

## What it does
Follows `.claude/workflows/feature-build.md` step by step: understand → backend (migration → service → controller → route → mount) → frontend (hook → page) → verify → cleanup. If `.claude/commands/scaffold.md`'s boilerplate generator fits the feature, run that first for the file skeletons, then fill them in per the workflow.

If gstack is installed (see CLAUDE.md Pre-flight), this command is the "implement" step of the larger `/office-hours → /autoplan → implement → /review → /qa → /cso → /ship` flow — run `/office-hours` and `/autoplan` first for anything non-trivial, then use `/feature` for the implementation step itself.

## Usage
`/feature <short description of what you're building>`

## Arguments
`$ARGUMENTS` — a short description of the feature (e.g. "add a weekly digest email of overaged projects").

## Notes
- For anything touching more than 2-3 files, consider invoking the `architect` agent first (`.claude/agents/architect.md`) to plan the file list before writing code.
- Always ends with `npx tsc --noEmit` passing in both `backend/` and `frontend/` — this is the only pre-merge gate that exists today (no CI, no test suite).
