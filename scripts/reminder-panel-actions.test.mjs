import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('reminder dashboard split actions reveal on hover for pointer devices', async () => {
  const source = await readFile(new URL('../src/components/Reminder/Reminder.tsx', import.meta.url), 'utf8');

  assert.match(source, /revealMode:\s*'hover'/);
  assert.match(source, /touchFallback:\s*true/);
  assert.doesNotMatch(source, /revealMode:\s*'manual'/);
});
