import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('reminder dashboard split actions reveal on hover for pointer devices', async () => {
  const source = await readFile(new URL('../src/components/Reminder/Reminder.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /<Dashboard/);
  assert.match(source, /reminder-pre-break-panel/);
  assert.match(source, /if \(!isPreBreak\) \{/);
  assert.match(source, /api\.closePreBreakReminderWindow\(\)/);
  assert.match(source, /api\.startBreak\(\)/);
});
