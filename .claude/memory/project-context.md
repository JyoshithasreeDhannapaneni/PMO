---
name: project-context
description: Core project identity, stack, and architecture decisions for PMO Tracker
metadata:
  type: project
---

PMO Tracker is CloudFuze's internal project migration tracking system. It tracks cloud migrations for ENT and SMB customers, monitoring SLA compliance, escalations, delays, phases, and case studies.

**Why:** Replaced manual SharePoint tracking with a real-time dashboard. Live since early 2026.

**How to apply:** All feature decisions should align with tracking migration projects and supporting CloudFuze's PM team (Abhishek, Chaithanya, and other managers).

## Key Users
- **Admins**: Full access — can manage all projects, users, settings
- **Project Managers**: View their own segment (ENT or SMB)
- **Engineers**: View ticket assignments in Jira SLA section

## Active Integrations
- **Jira Service Management** (`cf2020.atlassian.net`, project `L1`) — OAuth 2.0 only (API token blocked at org level)
- **Microsoft Graph API** — Email alerts via `Bharath.Tummaganti@cloudfuze.com`; also Email/Call Hygiene metrics and (since Aug 2026) call-transcript fetch for AI-graded call scorecards
- **OpenAI** — grades call transcripts (`transcriptGradingService.ts`); no longer uses the earlier Anthropic-based chatbot integration (deleted)
- **PostgreSQL** — `pmo_tracker` DB on localhost:5432
- **gstack** (Garry Tan's Claude Code toolkit) — adopted Aug 2026, installed globally per-contributor at `~/.claude/skills/gstack`, not vendored in this repo. See `CLAUDE.md` Prerequisites.

## Manager Segments
- **ENT**: Abhishek, Chaithanya (and others configured in PMO settings)
- **SMB**: Separate set of managers
- **Others**: Projects not assigned to named managers

## Known Constraints
- lucide-react icons on OneDrive may timeout during build (os error 426) — only use icons already in the import list
- Atlassian org blocks API token auth (401 on all endpoints) — OAuth is mandatory
- `manage:servicedesk-customer` OAuth scope is blocked by org admin approval — never use it
- No CI/CD (`.github/workflows/`) and no test infrastructure exist yet — see `.claude/memory/repository-map.md`

[[decisions]]
[[architecture]]
[[domain-knowledge]]
[[repository-map]]
