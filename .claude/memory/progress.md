---
name: progress
description: Current feature status and in-progress work for PMO Tracker
metadata:
  type: project
---

## Completed Features
- Dashboard with KPI cards, charts (Recharts), activity feed
- Project CRUD with filtering, sorting, pagination
- Phase management (Kickoff → Migration → Validation → Closure → Completed)
- Delay tracking with automatic delay_days calculation
- Case studies with generation workflow
- Email notifications via Microsoft Graph API
- Archive / unarchive projects
- Escalations tracking (`/escalation-projects`)
- Audit dashboard
- Migration runbooks
- RACI/RAID/RAG tracking
- POC projects
- Account manager tracking
- Customer success tracking
- Server alerts
- Manager Dashboard (`/manager-dashboard`) with ENT/SMB/Engineers tabs (admin-only)
  - KPI cards per manager (Active, On Hold, Completed, Delayed, At Risk)
  - On Time %, Avg Delay, Escalations card
  - Active Projects collapsible dropdown
  - Jira SLA section with 3 KPI cards + collapsible per-customer breakdown
- Jira Excel upload with column auto-detection and SLA computation
- Jira OAuth 2.0 (3LO) connection flow (built, pending admin account setup)

## In Progress / Pending
- **Jira OAuth connection**: User needs to create OAuth app using admin Atlassian account, paste new credentials in `.env`, restart backend. Current credentials (`PH0Bm4gdA6VYJNcviejjqTklxDWvO1i3`) are from a non-admin account.
- **Upload correct Jira file**: User has TSV export of CFITS tickets — needs to save as CSV and upload via manager dashboard.

## Known Issues
- lucide-react build errors (os error 426) when OneDrive hasn't synced icon files locally. Fix: use only already-imported icons.

[[decisions]]
[[project-context]]
