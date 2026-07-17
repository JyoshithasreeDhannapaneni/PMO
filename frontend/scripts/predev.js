/**
 * predev.js — runs before `next dev`
 * 1. Tears down any existing .next (plain dir or junction from prior attempts)
 * 2. Creates a fresh plain .next directory inside the project
 * 3. Marks it with the Windows SYSTEM attribute so OneDrive skips it,
 *    preventing EBUSY lock errors during webpack writes.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const nextDir = path.join(__dirname, '..', '.next');

// Step 1 — Remove whatever is at .next (junction, plain dir, broken link)
spawnSync('cmd', ['/c', 'rd', '/s', '/q', nextDir], { stdio: 'ignore' });

// Step 2 — Create a fresh plain directory (not a junction)
try {
  fs.mkdirSync(nextDir, { recursive: true });
  console.log('✓ Created clean .next directory');
} catch (e) {
  console.warn('⚠ Could not create .next directory:', e.message);
}

// Step 3 — Mark as SYSTEM so OneDrive skips syncing it
const result = spawnSync('attrib', ['+s', nextDir], { stdio: 'pipe', shell: true });
if (result.status === 0) {
  console.log('✓ .next marked as system folder (OneDrive will skip it)');
} else {
  const err = result.stderr?.toString().trim();
  console.warn('⚠ Could not set system attribute on .next' + (err ? `: ${err}` : ''));
}
