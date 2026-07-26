import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('direct execution retries DMG bundling when the script path needs URL encoding', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resty retry entrypoint '));
  const scriptsDir = path.join(tempDir, 'scripts');
  const tauriDir = path.join(tempDir, 'src-tauri');

  try {
    await fs.mkdir(scriptsDir, { recursive: true });
    await fs.mkdir(tauriDir, { recursive: true });
    await fs.copyFile(
      import.meta.filename.replace(/\.test\.mjs$/, '.mjs'),
      path.join(scriptsDir, 'retry-tauri-dmg.mjs'),
    );
    await fs.writeFile(
      path.join(tauriDir, 'tauri.conf.json'),
      `${JSON.stringify({ productName: 'resty', version: '0.1.26' }, null, 2)}\n`,
      'utf8',
    );

    const result = spawnSync(process.execPath, [path.join(scriptsDir, 'retry-tauri-dmg.mjs')], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 1, 'The directly executed script did not attempt DMG recovery.');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
