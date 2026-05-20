import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanTauriBundleArtifacts } from './clean-tauri-bundle-artifacts.mjs';
import { retryTauriDmg } from './retry-tauri-dmg.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const tauriBin = path.join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri',
);

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    const output = [];

    function record(chunk, target) {
      const text = chunk.toString();
      output.push(text);
      target.write(chunk);
    }

    child.stdout.on('data', (chunk) => record(chunk, process.stdout));
    child.stderr.on('data', (chunk) => record(chunk, process.stderr));

    child.on('close', (code, signal) => {
      resolve({
        code: signal ? 1 : code ?? 1,
        output: output.join(''),
      });
    });
  });
}

export function normalizeTauriArgs(args) {
  return args.filter((arg) => arg !== '--');
}

export function isDmgBuild(args, platform = process.platform) {
  const normalizedArgs = normalizeTauriArgs(args);

  if (platform !== 'darwin' || normalizedArgs[0] !== 'build') {
    return false;
  }

  const inlineBundlesArg = normalizedArgs.find(
    (arg) => arg.startsWith('--bundles=') || arg.startsWith('-b='),
  );

  if (inlineBundlesArg) {
    const bundleTargets = inlineBundlesArg.split('=')[1]?.split(',') ?? [];
    return bundleTargets.includes('all') || bundleTargets.includes('dmg');
  }

  const bundlesIndex = normalizedArgs.findIndex((arg) => arg === '--bundles' || arg === '-b');

  if (bundlesIndex === -1) {
    return true;
  }

  const bundleTargets = normalizedArgs[bundlesIndex + 1]?.split(',') ?? [];
  return bundleTargets.includes('all') || bundleTargets.includes('dmg');
}

export function shouldRetryDmgBuild(args, exitCode, output, platform = process.platform) {
  return exitCode !== 0 && isDmgBuild(args, platform) && output.includes('bundle_dmg.sh');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = normalizeTauriArgs(process.argv.slice(2));
  const removedArtifacts = await cleanTauriBundleArtifacts();

  if (removedArtifacts.length > 0) {
    console.log(`Removed stale Tauri DMG artifacts:\n${removedArtifacts.join('\n')}`);
  }

  const result = await run(tauriBin, args);

  if (!shouldRetryDmgBuild(args, result.code, result.output)) {
    process.exitCode = result.code;
  } else {
    const retryRemovedArtifacts = await cleanTauriBundleArtifacts();

    if (retryRemovedArtifacts.length > 0) {
      console.log(`Removed stale Tauri DMG artifacts before retry:\n${retryRemovedArtifacts.join('\n')}`);
    }

    process.exitCode = await retryTauriDmg();
  }
}
