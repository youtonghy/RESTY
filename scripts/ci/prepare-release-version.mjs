import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const input = process.env.VERSION_TAG?.trim() ?? '';

if (!input) {
  console.error('Missing VERSION_TAG input.');
  process.exit(1);
}

const semverPattern =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const match = input.match(semverPattern);

if (!match) {
  console.error(`Invalid version tag "${input}". Expected semver like v1.2.3 or 1.2.3.`);
  process.exit(1);
}

const appVersion = input.startsWith('v') ? input.slice(1) : input;
const releaseTag = `v${appVersion}`;
const configPath = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'tauri.version.json');

await fs.mkdir(path.dirname(configPath), { recursive: true });
await fs.writeFile(
  configPath,
  `${JSON.stringify({ version: appVersion }, null, 2)}\n`,
  'utf8',
);

const githubOutput = process.env.GITHUB_OUTPUT;

if (githubOutput) {
  await fs.appendFile(
    githubOutput,
    [
      `app_version=${appVersion}`,
      `release_tag=${releaseTag}`,
      `config_path=${configPath}`,
      '',
    ].join('\n'),
    'utf8',
  );
} else {
  console.log(`app_version=${appVersion}`);
  console.log(`release_tag=${releaseTag}`);
  console.log(`config_path=${configPath}`);
}
