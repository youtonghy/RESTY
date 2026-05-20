import assert from 'node:assert/strict';
import test from 'node:test';
import { isDmgBuild, normalizeTauriArgs, shouldRetryDmgBuild } from './run-tauri.mjs';

test('normalizeTauriArgs removes package-manager argument separators', () => {
  assert.deepEqual(
    normalizeTauriArgs(['build', '--', '--bundles', 'dmg']),
    ['build', '--bundles', 'dmg'],
  );
});

test('isDmgBuild detects macOS builds that include DMG output', () => {
  assert.equal(isDmgBuild(['build'], 'darwin'), true);
  assert.equal(isDmgBuild(['build', '--bundles', 'dmg'], 'darwin'), true);
  assert.equal(isDmgBuild(['build', '--bundles', 'app,dmg'], 'darwin'), true);
  assert.equal(isDmgBuild(['build', '--bundles=all'], 'darwin'), true);
  assert.equal(isDmgBuild(['build', '--', '--bundles', 'dmg'], 'darwin'), true);
});

test('isDmgBuild ignores non-DMG and non-macOS builds', () => {
  assert.equal(isDmgBuild(['dev'], 'darwin'), false);
  assert.equal(isDmgBuild(['build', '--bundles', 'app'], 'darwin'), false);
  assert.equal(isDmgBuild(['build', '--bundles=dmg'], 'linux'), false);
});

test('shouldRetryDmgBuild only retries generated DMG script failures', () => {
  assert.equal(
    shouldRetryDmgBuild(
      ['build', '--bundles', 'dmg'],
      1,
      'failed to run /target/release/bundle/dmg/bundle_dmg.sh',
      'darwin',
    ),
    true,
  );
  assert.equal(
    shouldRetryDmgBuild(['build', '--bundles', 'dmg'], 1, 'cargo build failed', 'darwin'),
    false,
  );
  assert.equal(
    shouldRetryDmgBuild(['build', '--bundles', 'dmg'], 0, 'bundle_dmg.sh', 'darwin'),
    false,
  );
});
