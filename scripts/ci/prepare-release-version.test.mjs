import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parseReleaseVersion, updateReleaseMetadata } from './prepare-release-version.mjs';

test('parseReleaseVersion accepts tags with or without v prefix', () => {
  assert.deepEqual(parseReleaseVersion('v1.2.3'), {
    appVersion: '1.2.3',
    releaseTag: 'v1.2.3',
  });

  assert.deepEqual(parseReleaseVersion('1.2.3-beta.1'), {
    appVersion: '1.2.3-beta.1',
    releaseTag: 'v1.2.3-beta.1',
  });
});

test('parseReleaseVersion rejects missing and invalid tags', () => {
  assert.throws(() => parseReleaseVersion(''), /Missing VERSION_TAG/);
  assert.throws(() => parseReleaseVersion('version-1'), /Invalid version tag/);
});

test('updateReleaseMetadata keeps CI release versions aligned', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resty-release-version-'));
  const tauriDir = path.join(tempDir, 'src-tauri');

  await fs.mkdir(tauriDir, { recursive: true });
  await fs.writeFile(
    path.join(tempDir, 'package.json'),
    `${JSON.stringify({ name: 'resty', version: '0.0.0-dev', type: 'module' }, null, 4)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(tauriDir, 'tauri.conf.json'),
    `${JSON.stringify({ productName: 'resty', version: '0.0.0-dev' }, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(tauriDir, 'Cargo.toml'),
    '[package]\nname = "resty"\nversion = "0.0.0-dev"\nedition = "2021"\n',
    'utf8',
  );

  await updateReleaseMetadata('0.1.24', tempDir);

  const packageJson = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf8'));
  const tauriConfig = JSON.parse(await fs.readFile(path.join(tauriDir, 'tauri.conf.json'), 'utf8'));
  const cargoToml = await fs.readFile(path.join(tauriDir, 'Cargo.toml'), 'utf8');

  assert.equal(packageJson.version, '0.1.24');
  assert.equal(tauriConfig.version, '0.1.24');
  assert.match(cargoToml, /^version = "0\.1\.24"$/m);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('direct execution prepares the release when the script path needs URL encoding', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resty release entrypoint '));
  const scriptDir = path.join(tempDir, 'scripts', 'ci');
  const tauriDir = path.join(tempDir, 'src-tauri');
  const outputPath = path.join(tempDir, 'github-output.txt');

  try {
    await fs.mkdir(scriptDir, { recursive: true });
    await fs.mkdir(tauriDir, { recursive: true });
    await Promise.all([
      fs.copyFile(import.meta.filename.replace(/\.test\.mjs$/, '.mjs'), path.join(scriptDir, 'prepare-release-version.mjs')),
      fs.writeFile(
        path.join(tempDir, 'package.json'),
        `${JSON.stringify({ name: 'resty', version: '0.0.0-dev', type: 'module' }, null, 4)}\n`,
        'utf8',
      ),
      fs.writeFile(
        path.join(tauriDir, 'tauri.conf.json'),
        `${JSON.stringify({ productName: 'resty', version: '0.0.0-dev' }, null, 2)}\n`,
        'utf8',
      ),
      fs.writeFile(
        path.join(tauriDir, 'Cargo.toml'),
        '[package]\nname = "resty"\nversion = "0.0.0-dev"\nedition = "2021"\n',
        'utf8',
      ),
    ]);

    const result = spawnSync(process.execPath, [path.join(scriptDir, 'prepare-release-version.mjs')], {
      env: {
        ...process.env,
        GITHUB_OUTPUT: outputPath,
        VERSION_TAG: 'v0.1.26',
      },
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const packageJson = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf8'));
    assert.equal(packageJson.version, '0.1.26');
    const githubOutput = await fs.readFile(outputPath, 'utf8');
    assert.match(githubOutput, /^release_tag=v0\.1\.26$/m);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
