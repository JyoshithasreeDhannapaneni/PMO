#!/bin/bash
# post-edit-format.sh — PostToolUse hook
# Logs which file was edited (for audit trail). Does not block.
# Exit 0 always.

FILE="$1"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")

# Skip non-source files and node_modules
if [[ "$FILE" == *node_modules* || "$FILE" == */.next/* || "$FILE" == */dist/* ]]; then
  exit 0
fi

# Append to edit log (optional — remove if not needed)
LOG_DIR="$(dirname "$0")/../../.claude"
echo "$TIMESTAMP $FILE" >> "$LOG_DIR/.edit-log.txt" 2>/dev/null

exit 0
