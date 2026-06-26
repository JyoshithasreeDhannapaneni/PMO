#!/bin/bash
# validate-code.sh — PreToolUse hook
# Runs TypeScript validation before committing code changes.
# Exit 0 = allow, Exit 2 = block the tool call.

FILE="$1"

# Only validate TypeScript/TSX files
if [[ "$FILE" != *.ts && "$FILE" != *.tsx ]]; then
  exit 0
fi

# Skip node_modules and build artifacts
if [[ "$FILE" == *node_modules* || "$FILE" == */.next/* || "$FILE" == */dist/* ]]; then
  exit 0
fi

# Determine which workspace the file belongs to
if [[ "$FILE" == */backend/* ]]; then
  WORKSPACE="$(dirname "$(dirname "$(dirname "$FILE")")")/backend"
elif [[ "$FILE" == */frontend/* ]]; then
  WORKSPACE="$(dirname "$(dirname "$(dirname "$FILE")")")/frontend"
else
  exit 0
fi

# Run TypeScript check (non-blocking — just warn, don't block)
cd "$WORKSPACE" && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
exit 0
