import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const bundleDir = path.join(projectRoot, 'src-tauri', 'target', 'release', 'bundle');

export async function cleanTauriBundleArtifacts(rootDirectory = bundleDir) {
  const removed = [];

  async function visit(directory) {
    let entries;

    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }

      throw error;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          await visit(entryPath);
          return;
        }

        if (entry.isFile() && /^rw\..+\.dmg$/.test(entry.name)) {
          await fs.rm(entryPath, { force: true });
          removed.push(path.relative(projectRoot, entryPath));
        }
      }),
    );
  }

  await visit(rootDirectory);

  return removed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const removed = await cleanTauriBundleArtifacts();

  if (removed.length > 0) {
    console.log(`Removed stale Tauri DMG artifacts:\n${removed.join('\n')}`);
  } else {
    console.log('No stale Tauri DMG artifacts found.');
  }
}
