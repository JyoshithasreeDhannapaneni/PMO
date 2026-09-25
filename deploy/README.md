# Self-healing: process supervision

Two layers, doing two different jobs:

1. **Crash → restart** (`pmo-backend.service` / `pmo-frontend.service`, `Restart=on-failure`).
   Handles exactly what happened on 2026-09-23: the backend hit a JS heap OOM and the
   process died — and then just stayed dead, because nothing was supervising it. These
   units mean that class of crash now self-recovers within ~5 seconds, automatically, with
   no one needing to notice and restart it by hand.

2. **Hung → restart** (`pmo-healthcheck.timer`, `healthcheck.sh`). A process that's stuck
   (deadlocked, stuck event loop) never *exits*, so `Restart=on-failure` never fires for it.
   This runs every minute, hits `/health` (backend) and `/` (frontend), and restarts the
   relevant systemd unit after 3 consecutive failures (so one slow request doesn't trigger
   a needless restart).

Neither of these touches application code. For that — an AI-written diagnosis of *why*
something crashed, with a suggested fix — see `backend/src/services/selfHealService.ts`:
crashes and unexpected 5xx responses are captured into the `self_heal_incidents` table,
and (only if `ANTHROPIC_API_KEY` is set in `backend/.env`) a cron job every 30 minutes asks
Claude for a root-cause diagnosis and a suggested fix. That's a suggestion only — nothing
is ever applied automatically. View/resolve incidents via `GET /api/self-heal/incidents`
(admin-only), or trigger a diagnosis pass immediately with `POST /api/self-heal/diagnose`.

## Install (run on the VPS as root)

```bash
# 1. Build the backend once (ExecStart runs the compiled dist/, not tsx)
cd /root/PMO/backend && npm ci && npm run build

# 2. Copy the unit files into place
cp /root/PMO/deploy/systemd/pmo-backend.service /etc/systemd/system/
cp /root/PMO/deploy/systemd/pmo-frontend.service /etc/systemd/system/
cp /root/PMO/deploy/systemd/pmo-healthcheck.service /etc/systemd/system/
cp /root/PMO/deploy/systemd/pmo-healthcheck.timer /etc/systemd/system/
chmod +x /root/PMO/deploy/systemd/healthcheck.sh

# 3. Stop whatever bare `node`/`next` processes are currently running manually before
#    handing control to systemd -- otherwise you'll have two copies fighting over the
#    same port. Find them first:
ss -tlnp | grep -E ':3000 |:3001 '
#    then kill each PID shown, e.g.:
kill <backend_pid> <frontend_pid>

# 4. Enable and start everything
systemctl daemon-reload
systemctl enable --now pmo-backend pmo-frontend pmo-healthcheck.timer

# 5. Verify
systemctl status pmo-backend pmo-frontend pmo-healthcheck.timer
curl -sf http://127.0.0.1:3001/health && echo OK
```

## Redeploying after a code change

```bash
cd /root/PMO/backend && npm ci && npm run build
cd /root/PMO/frontend && npm ci && npm run build
systemctl restart pmo-backend pmo-frontend
```

## Verifying the crash-recovery actually works

```bash
# Simulate the OOM crash: kill -9 the backend and confirm systemd brings it back up on
# its own within a few seconds, with no one touching it.
systemctl status pmo-backend --no-pager | grep 'Main PID'
kill -9 <that PID>
sleep 6
systemctl status pmo-backend --no-pager | grep -E 'Active|Main PID'   # should show a NEW PID, active (running)
```
