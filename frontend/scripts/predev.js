/**
 * predev.js — runs before `next dev`
 * Deletes the .next folder so OneDrive-corrupted symlinks never block startup.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const nextDir = path.join(__dirname, '..', '.next');

try {
  if (fs.existsSync(nextDir)) {
    // Use cmd /c rd to handle junctions, symlinks, and plain dirs on Windows
    spawnSync('cmd', ['/c', 'rd', '/s', '/q', nextDir], { stdio: 'ignore' });
    console.log('✓ Cleaned .next');
  }
} catch {
  // Non-fatal — Next.js will overwrite it anyway
}
