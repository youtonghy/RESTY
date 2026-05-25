import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('main app opens reminder window when timer enters break', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(phase === 'break'\) \{/);
  assert.match(source, /api\.closePreBreakReminderWindow\(\)/);
  assert.match(source, /api\s*\.\s*openReminderWindow\(/);
  assert.match(source, /activeSettings\.reminderMode === 'fullscreen'/);
  assert.match(source, /activeSettings\.floatingPosition/);
});

test('main app opens a large pre-break reminder window before notification', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const apiSource = await readFile(new URL('../src/utils/api.ts', import.meta.url), 'utf8');

  assert.match(source, /const PRE_BREAK_NOTIFICATION_WINDOW_MS = 60_000/);
  assert.match(source, /api\.openPreBreakReminderWindow\(\)/);
  assert.match(source, /notifyRestStartsSoon\(/);
  assert.match(source, /mode=\{isPreBreakReminderWindow \? 'preBreak' : 'break'\}/);
  assert.match(apiSource, /open_pre_break_reminder_window/);
  assert.match(apiSource, /close_pre_break_reminder_window/);
});
