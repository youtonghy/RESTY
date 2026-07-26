import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const tauriDir = path.join(projectRoot, 'src-tauri');
const bundleDir = path.join(tauriDir, 'target', 'release', 'bundle');
const macosBundleDir = path.join(bundleDir, 'macos');
const dmgBundleDir = path.join(bundleDir, 'dmg');
const bundleScript = path.join(dmgBundleDir, 'bundle_dmg.sh');
const tauriConfigPath = path.join(tauriDir, 'tauri.conf.json');

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('close', (code, signal) => {
      resolve({ code: signal ? 1 : code ?? 1 });
    });
  });
}

function getArchitecture() {
  if (process.arch === 'arm64') {
    return 'aarch64';
  }

  if (process.arch === 'x64') {
    return 'x64';
  }

  return process.arch;
}

async function readTauriConfig() {
  const contents = await fs.readFile(tauriConfigPath, 'utf8');
  return JSON.parse(contents);
}

export async function retryTauriDmg() {
  if (process.platform !== 'darwin') {
    console.error('DMG retry is only available on macOS.');
    return 1;
  }

  const config = await readTauriConfig();
  const productName = config.productName;
  const version = config.version;

  if (!productName || !version) {
    console.error('Cannot retry DMG bundling because productName or version is missing.');
    return 1;
  }

  const appName = `${productName}.app`;
  const appPath = path.join(macosBundleDir, appName);
  const outputName = `${productName}_${version}_${getArchitecture()}.dmg`;
  const outputPath = path.join(dmgBundleDir, outputName);
  const volumeIconPath = path.join(dmgBundleDir, 'icon.icns');

  try {
    await fs.access(bundleScript);
    await fs.access(appPath);
  } catch (error) {
    console.error(`Cannot retry DMG bundling: ${error.message}`);
    return 1;
  }

  console.log('Retrying DMG bundling with a larger image and Finder AppleScript disabled...');

  const args = [
    '--volname',
    productName,
    '--window-size',
    '660',
    '400',
    '--icon',
    appName,
    '180',
    '170',
    '--app-drop-link',
    '480',
    '170',
    '--disk-image-size',
    '512',
    '--skip-jenkins',
  ];

  try {
    await fs.access(volumeIconPath);
    args.push('--volicon', volumeIconPath);
  } catch {
    // The volume icon is optional for a recovery build.
  }

  args.push(outputPath, macosBundleDir);

  const result = await run(bundleScript, args);
  return result.code;
}

if (import.meta.main) {
  process.exitCode = await retryTauriDmg();
}
