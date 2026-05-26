import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..', '..');
const semverPattern =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseReleaseVersion(input) {
  const trimmedInput = input?.trim() ?? '';

  if (!trimmedInput) {
    throw new Error('Missing VERSION_TAG input.');
  }

  if (!trimmedInput.match(semverPattern)) {
    throw new Error(`Invalid version tag "${trimmedInput}". Expected semver like v1.2.3 or 1.2.3.`);
  }

  const appVersion = trimmedInput.startsWith('v') ? trimmedInput.slice(1) : trimmedInput;

  return {
    appVersion,
    releaseTag: `v${appVersion}`,
  };
}

async function updateJsonVersion(filePath, appVersion, indentation) {
  const contents = await fs.readFile(filePath, 'utf8');
  const json = JSON.parse(contents);

  json.version = appVersion;

  await fs.writeFile(filePath, `${JSON.stringify(json, null, indentation)}\n`, 'utf8');
}

async function updateCargoVersion(filePath, appVersion) {
  const contents = await fs.readFile(filePath, 'utf8');
  const nextContents = contents.replace(
    /^version = ".*"$/m,
    `version = "${appVersion}"`,
  );

  if (nextContents === contents) {
    throw new Error(`Could not find package version in ${filePath}.`);
  }

  await fs.writeFile(filePath, nextContents, 'utf8');
}

export async function updateReleaseMetadata(appVersion, rootDirectory = projectRoot) {
  const rootTauriDir = path.join(rootDirectory, 'src-tauri');

  await Promise.all([
    updateJsonVersion(path.join(rootDirectory, 'package.json'), appVersion, 4),
    updateJsonVersion(path.join(rootTauriDir, 'tauri.conf.json'), appVersion, 2),
    updateCargoVersion(path.join(rootTauriDir, 'Cargo.toml'), appVersion),
  ]);
}

export async function prepareReleaseVersion(input) {
  const { appVersion, releaseTag } = parseReleaseVersion(input);

  await updateReleaseMetadata(appVersion);

  return {
    appVersion,
    releaseTag,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { appVersion, releaseTag } = await prepareReleaseVersion(process.env.VERSION_TAG);
    const githubOutput = process.env.GITHUB_OUTPUT;

    if (githubOutput) {
      await fs.appendFile(
        githubOutput,
        [
          `app_version=${appVersion}`,
          `release_tag=${releaseTag}`,
          '',
        ].join('\n'),
        'utf8',
      );
    } else {
      console.log(`app_version=${appVersion}`);
      console.log(`release_tag=${releaseTag}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
