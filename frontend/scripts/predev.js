/**
 * predev.js — runs before `next dev`
 * On Windows, .next becomes a junction to a folder under %LOCALAPPDATA%, outside
 * OneDrive. Marking .next SYSTEM was not enough: OneDrive still tagged it as a
 * cloud-files folder and briefly locked files mid-upload, causing EBUSY on
 * .next/types writes and ChunkLoadError timeouts in the browser.
 *
 * Node resolves require() from a file's real path, so server bundles living in
 * %LOCALAPPDATA% would not find frontend/node_modules. A node_modules junction
 * beside the external .next makes that walk-up land on the same single copy.
 *
 * Elsewhere (Linux/macOS/Docker) .next stays a plain directory.
 */
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectDir = path.join(__dirname, '..');
const nextDir = path.join(projectDir, '.next');
const nodeModulesDir = path.join(projectDir, 'node_modules');

function removeDir(dir) {
  // rd removes a junction itself without touching its target.
  spawnSync('cmd', ['/c', 'rd', '/s', '/q', dir], { stdio: 'ignore' });
}

function makeJunction(link, target) {
  const result = spawnSync('cmd', ['/c', 'mklink', '/J', link, target], { stdio: 'pipe' });
  return result.status === 0;
}

function setupPlainDir() {
  fs.mkdirSync(nextDir, { recursive: true });
  console.log('✓ Created clean .next directory');
}

function setupExternalJunction() {
  // One external folder per checkout path so two clones never share a build cache.
  const key = crypto.createHash('sha1').update(projectDir.toLowerCase()).digest('hex').slice(0, 10);
  const baseDir = path.join(process.env.LOCALAPPDATA, 'pmo-next', key);
  const externalNext = path.join(baseDir, '.next');
  const externalNodeModules = path.join(baseDir, 'node_modules');

  removeDir(externalNext);
  fs.mkdirSync(externalNext, { recursive: true });

  if (!fs.existsSync(externalNodeModules) && !makeJunction(externalNodeModules, nodeModulesDir)) {
    return false;
  }
  if (!makeJunction(nextDir, externalNext)) return false;

  console.log(`✓ .next linked outside OneDrive -> ${externalNext}`);
  return true;
}

removeDir(nextDir);

if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
  if (!setupExternalJunction()) {
    console.warn('⚠ Could not link .next outside OneDrive; falling back to a plain .next (EBUSY errors may return)');
    removeDir(nextDir);
    setupPlainDir();
    spawnSync('attrib', ['+s', nextDir], { stdio: 'pipe' });
  }
} else {
  setupPlainDir();
}
