# Workflow: Deployment

Use this blueprint when preparing or executing a deploy of PMO Tracker.

**If gstack is installed**, `/land-and-deploy` orchestrates the actual land+deploy+verify sequence — this blueprint documents PMO-Tracker-specific facts that command needs (topology, required env vars, what to check), since gstack has no built-in knowledge of this repo's deploy shape.

## Topology
Docker Compose, four services, on a single VPS behind nginx:
```
postgres (postgres:15-alpine) → backend (Express, port 3001 internal) → frontend (Next.js, port 3000 internal) → nginx (host ports 8089/8091 → 80/443)
```
No Vercel, no managed database, no CI/CD pipeline (no `.github/workflows/`) — deploys are manual `docker compose` runs on the server.

## Steps

### 1. Pre-Deploy Checklist (`.claude/commands/deploy.md`, project-specific — gstack's `/land-and-deploy` doesn't know these)
1. Confirm no `.env` file would be committed (`git status`).
2. `npx tsc --noEmit` in both `backend/` and `frontend/` — must pass (this is the only type-safety gate; there's no CI to catch it otherwise).
3. `npm run build` in `frontend/` — confirm the Next.js build succeeds.
4. Confirm `CLAUDE.local.md` and `.claude/settings.local.json` are still gitignored.
5. Confirm `backend/.jira-oauth-tokens.json` and `backend/.nta-state.json` are not tracked by git.
6. List any uncommitted changes that would be left behind.

### 2. Required Environment (root `.env`, used by `docker-compose.yml` — see `.env.example`)
```
SERVER_IP           # public domain, must match the SSL cert
DB_USER / DB_PASSWORD / DB_NAME
ENABLE_CRON_JOBS
ALERT_FROM_EMAIL
MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / MICROSOFT_TENANT_ID   # SSO + Mail.Send
EXTERNAL_API_KEY
```
`backend/.env` (loaded via `env_file` in `docker-compose.yml`) additionally carries `MS_GRAPH_*`, `OPENAI_API_KEY`, `JIRA_*`, `HUBSPOT_ACCESS_TOKEN` — anything added there is picked up automatically without editing `docker-compose.yml`.

### 3. Deploy
```bash
cp .env.example .env   # first time only — fill in every <-- REQUIRED value
docker compose up -d --build
```

### 4. Verify
- `docker compose ps` — all four containers healthy.
- Hit `https://$SERVER_IP` — frontend loads, login works.
- Check `docker compose logs backend --tail 100` for the startup sequence: schema init → migrations → default admin → template seed → delay recalculation → (if `ENABLE_CRON_JOBS=true`) cron init.
- If gstack is installed, `/qa https://$SERVER_IP` for a real-browser smoke test; `/canary` if a gradual rollout is warranted.

### 5. Rollback
`docker compose down` then redeploy the previous image/commit — there's no blue-green or automated rollback; this is a single-VPS deploy.
