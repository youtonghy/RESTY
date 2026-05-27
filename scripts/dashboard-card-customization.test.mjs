import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('dashboard cards without customization do not open an empty style modal', async () => {
  const source = await readFile(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /const canOpenStyleMenu = hasStyleOptions \|\| hasCustomContent/);
  assert.match(
    source,
    /if \(!dragIntentRef\.current\) \{\s*if \(canOpenStyleMenu\) \{[\s\S]*setStyleMenuOpen\(true\)/
  );
});
