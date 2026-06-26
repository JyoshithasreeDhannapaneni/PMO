#!/bin/bash
# block-sensitive-writes.sh — PreToolUse hook (Write tool)
# Blocks writes to sensitive files that should never be overwritten by Claude.
# Exit 0 = allow, Exit 2 = block.

FILE="$1"

# Normalize path separators
FILE_NORM="${FILE//\\//}"

# Block writes to .env files (contain secrets)
if [[ "$FILE_NORM" == */.env ]] || [[ "$FILE_NORM" == */.env.local ]]; then
  echo "BLOCKED: Writing to .env files is not allowed. Edit manually."
  exit 2
fi

# Block writes to the OAuth tokens file
if [[ "$FILE_NORM" == */.jira-oauth-tokens.json ]]; then
  echo "BLOCKED: OAuth tokens file must not be overwritten by Claude."
  exit 2
fi

# Block writes to existing settings.local.json (personal overrides)
if [[ "$FILE_NORM" == */.claude/settings.local.json ]]; then
  echo "BLOCKED: settings.local.json contains personal permissions. Edit manually."
  exit 2
fi

# Allow all other writes
exit 0
