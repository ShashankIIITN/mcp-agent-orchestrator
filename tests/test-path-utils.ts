import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { expandHome, isPathInside, validateWorkspacePath } from '../src/utils/path-utils.js';
import { PolicyEngine } from '../src/orchestrator/policy-engine.js';
import { findAgyBinaryPath, isAgyAvailable } from '../src/inference/providers/agy-provider.js';

console.log('🧭 Cross-platform path utility tests (' + process.platform + ')\n');

const tmp = mkdtempSync(path.join(os.tmpdir(), 'orch-paths-'));
const work = path.join(tmp, 'work');
const sibling = path.join(tmp, 'work-secret');
mkdirSync(work);
mkdirSync(sibling);
writeFileSync(path.join(sibling, 'secret.txt'), 'nope');
writeFileSync(path.join(work, 'ok.txt'), 'ok');

try {
  // 1. ~ expansion
  assert.strictEqual(expandHome('~'), os.homedir());
  assert.strictEqual(expandHome('~/x'), path.join(os.homedir(), 'x'));
  assert.strictEqual(expandHome('/abs/path'), '/abs/path');
  console.log('1️⃣ expandHome ✅');

  // 2. containment, including sibling-prefix bypass
  assert.ok(isPathInside(path.join(work, 'ok.txt'), work));
  assert.ok(isPathInside(work, work));
  assert.ok(!isPathInside(sibling, work), 'sibling with shared prefix must be rejected');
  assert.ok(!isPathInside(path.join(work, '..', 'work-secret'), work));
  console.log('2️⃣ isPathInside (prefix bypass blocked) ✅');

  // 3. validateWorkspacePath
  assert.ok(validateWorkspacePath('ok.txt', work).endsWith('ok.txt'));
  assert.throws(() => validateWorkspacePath('../work-secret/secret.txt', work));
  assert.throws(() => validateWorkspacePath(sibling, work));
  console.log('3️⃣ validateWorkspacePath ✅');

  // 4. symlink escape (skipped where symlinks need privileges, e.g. Windows w/o dev mode)
  try {
    symlinkSync(sibling, path.join(work, 'link'), 'dir');
    assert.throws(() => validateWorkspacePath('link/secret.txt', work), 'symlink escape must be blocked');
    console.log('4️⃣ symlink escape blocked ✅');
  } catch (err: any) {
    if (err?.code === 'EPERM' || err?.code === 'EACCES') console.log('4️⃣ symlink test skipped (no privilege)');
    else throw err;
  }

  // 5. PolicyEngine: sibling rejection, and Windows drive roots must not widen access on Unix.
  // (On Windows a "C:/" entry legitimately allows everything on C:, so it's excluded there.)
  const policy = new PolicyEngine({
    default_safety_mode: 'safe',
    allowed_workspaces: process.platform === 'win32' ? [work] : [work, 'D:/', 'C:/'],
  });
  assert.ok(policy.isPathAllowed(path.join(work, 'ok.txt')));
  assert.ok(!policy.isPathAllowed(sibling));
  if (process.platform !== 'win32') {
    assert.ok(!policy.isPathAllowed('/etc'), 'D:/ and C:/ must not widen access on Unix');
  }
  console.log('5️⃣ PolicyEngine ✅');

  // 6. agy discovery never throws and returns a string
  assert.strictEqual(typeof findAgyBinaryPath(), 'string');
  assert.strictEqual(typeof isAgyAvailable(), 'boolean');
  console.log('6️⃣ agy binary discovery ✅');

  console.log('\n🎉 PATH UTILITY TESTS PASSED\n');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
