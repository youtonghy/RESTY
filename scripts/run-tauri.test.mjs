import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import test from 'node:test';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  getTauriCliCommand,
  isDmgBuild,
  normalizeTauriArgs,
  shouldRetryDmgBuild,
} from './run-tauri.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('normalizeTauriArgs removes package-manager argument separators', () => {
  assert.deepEqual(
    normalizeTauriArgs(['build', '--', '--bundles', 'dmg']),
    ['build', '--bundles', 'dmg'],
  );
});

test('getTauriCliCommand invokes the cross-platform JavaScript CLI entrypoint', () => {
  const command = getTauriCliCommand('/usr/local/bin/bun');

  assert.equal(command.command, '/usr/local/bin/bun');
  assert.deepEqual(command.args, [
    path.join(projectRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
  ]);
});

test('direct execution runs the Tauri CLI when the script path needs URL encoding', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resty tauri entrypoint '));
  const scriptsDir = path.join(tempDir, 'scripts');
  const cliDir = path.join(tempDir, 'node_modules', '@tauri-apps', 'cli');
  const markerPath = path.join(tempDir, 'tauri-args.txt');

  try {
    await fs.mkdir(scriptsDir, { recursive: true });
    await fs.mkdir(cliDir, { recursive: true });
    await Promise.all([
      fs.copyFile(path.join(projectRoot, 'scripts', 'run-tauri.mjs'), path.join(scriptsDir, 'run-tauri.mjs')),
      fs.copyFile(
        path.join(projectRoot, 'scripts', 'clean-tauri-bundle-artifacts.mjs'),
        path.join(scriptsDir, 'clean-tauri-bundle-artifacts.mjs'),
      ),
      fs.copyFile(
        path.join(projectRoot, 'scripts', 'retry-tauri-dmg.mjs'),
        path.join(scriptsDir, 'retry-tauri-dmg.mjs'),
      ),
      fs.writeFile(
        path.join(cliDir, 'tauri.js'),
        [
          "import fs from 'node:fs';",
          "fs.writeFileSync(process.env.TAURI_ENTRYPOINT_MARKER, process.argv.slice(2).join(' '));",
          '',
        ].join('\n'),
        'utf8',
      ),
    ]);

    const result = spawnSync(
      process.execPath,
      [path.join(scriptsDir, 'run-tauri.mjs'), 'build', '--bundles', 'nsis'],
      {
        env: {
          ...process.env,
          TAURI_ENTRYPOINT_MARKER: markerPath,
        },
        encoding: 'utf8',
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const forwardedArgs = await fs.readFile(markerPath, 'utf8').catch(() => null);
    assert.notEqual(forwardedArgs, null, 'The directly executed script did not run the Tauri CLI.');
    assert.equal(forwardedArgs, 'build --bundles nsis');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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
