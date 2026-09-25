#!/bin/bash
# Runs every minute via pmo-healthcheck.timer. Restart=on-failure in pmo-backend.service
# only fires when the process actually EXITS -- a hung-but-still-running process (stuck
# event loop, deadlocked DB pool, etc.) never exits, so nothing would restart it without
# this. Keeps a small state file per service to require 3 consecutive failures before
# restarting, so one slow request doesn't trigger a needless restart.
set -euo pipefail

STATE_DIR="/tmp/pmo-healthcheck"
mkdir -p "$STATE_DIR"
FAIL_THRESHOLD=3

check_and_maybe_restart() {
  local name="$1" url="$2" service="$3"
  local state_file="$STATE_DIR/$name.fails"
  local fails
  fails=$(cat "$state_file" 2>/dev/null || echo 0)

  if curl -fsS --max-time 10 "$url" > /dev/null 2>&1; then
    echo 0 > "$state_file"
    return
  fi

  fails=$((fails + 1))
  echo "$fails" > "$state_file"
  echo "$(date -Iseconds) [pmo-healthcheck] $name failed ($fails/$FAIL_THRESHOLD): $url"

  if [ "$fails" -ge "$FAIL_THRESHOLD" ]; then
    echo "$(date -Iseconds) [pmo-healthcheck] $name unresponsive $FAIL_THRESHOLD times in a row -- restarting $service"
    systemctl restart "$service"
    echo 0 > "$state_file"
  fi
}

check_and_maybe_restart backend  "http://127.0.0.1:3001/health" pmo-backend.service
check_and_maybe_restart frontend "http://127.0.0.1:3000/"       pmo-frontend.service
