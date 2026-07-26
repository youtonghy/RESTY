import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { cleanTauriBundleArtifacts } from './clean-tauri-bundle-artifacts.mjs';

test('cleanTauriBundleArtifacts removes stale temporary DMG files only', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resty-tauri-clean-'));
  const bundleDir = path.join(tempDir, 'bundle');
  const macosDir = path.join(bundleDir, 'macos');
  const nestedDir = path.join(bundleDir, 'nested');

  await fs.mkdir(macosDir, { recursive: true });
  await fs.mkdir(nestedDir, { recursive: true });
  await fs.writeFile(path.join(macosDir, 'rw.1234.resty.dmg'), '');
  await fs.writeFile(path.join(nestedDir, 'rw.5678.resty.dmg'), '');
  await fs.writeFile(path.join(macosDir, 'resty_0.0.0-dev_aarch64.dmg'), '');
  await fs.writeFile(path.join(macosDir, 'rw.not-a-dmg.txt'), '');

  const removed = await cleanTauriBundleArtifacts(bundleDir);

  assert.equal(removed.length, 2);
  await assert.rejects(fs.access(path.join(macosDir, 'rw.1234.resty.dmg')));
  await assert.rejects(fs.access(path.join(nestedDir, 'rw.5678.resty.dmg')));
  await fs.access(path.join(macosDir, 'resty_0.0.0-dev_aarch64.dmg'));
  await fs.access(path.join(macosDir, 'rw.not-a-dmg.txt'));

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('direct execution cleans artifacts when the script path needs URL encoding', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resty clean entrypoint '));
  const scriptsDir = path.join(tempDir, 'scripts');
  const bundleDir = path.join(tempDir, 'src-tauri', 'target', 'release', 'bundle', 'dmg');
  const artifactPath = path.join(bundleDir, 'rw.1234.resty.dmg');

  try {
    await fs.mkdir(scriptsDir, { recursive: true });
    await fs.mkdir(bundleDir, { recursive: true });
    await fs.copyFile(
      import.meta.filename.replace(/\.test\.mjs$/, '.mjs'),
      path.join(scriptsDir, 'clean-tauri-bundle-artifacts.mjs'),
    );
    await fs.writeFile(artifactPath, '', 'utf8');

    const result = spawnSync(
      process.execPath,
      [path.join(scriptsDir, 'clean-tauri-bundle-artifacts.mjs')],
      { encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(fs.access(artifactPath));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
