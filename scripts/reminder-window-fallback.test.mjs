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
  assert.match(source, /const PRE_BREAK_REMINDER_WINDOW_AUTO_CLOSE_MS = 10_000/);
  assert.match(source, /supportsPreBreakActions/);
  assert.match(source, /!supportsPreBreakActions[\s\S]*api\.openPreBreakReminderWindow\(\)/);
  assert.match(source, /!supportsPreBreakActions[\s\S]*return;/);
  assert.match(source, /notifyRestStartsSoon\([\s\S]*'actions'[\s\S]*\)/);
  assert.match(source, /api\.closePreBreakReminderWindow\(\)/);
  assert.match(source, /api\.openPreBreakReminderWindow\(\)/);
  assert.match(source, /notifyRestStartsSoon\(/);
  assert.match(source, /mode=\{isPreBreakReminderWindow \? 'preBreak' : 'break'\}/);
  assert.match(apiSource, /open_pre_break_reminder_window/);
  assert.match(apiSource, /close_pre_break_reminder_window/);
});

test('pre-break fallback window is a plain auto-closing reminder without action buttons', async () => {
  const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const reminderSource = await readFile(
    new URL('../src/components/Reminder/Reminder.tsx', import.meta.url),
    'utf8'
  );
  const notificationSource = await readFile(
    new URL('../src/services/notifications.ts', import.meta.url),
    'utf8'
  );

  assert.match(appSource, /!supportsPreBreakActions[\s\S]*api\.openPreBreakReminderWindow\(\)/);
  assert.match(appSource, /!supportsPreBreakActions[\s\S]*return;/);
  assert.match(notificationSource, /type PreBreakNotificationMode = 'plain' \| 'actions'/);
  assert.doesNotMatch(notificationSource, /actionTypeId/);
  assert.doesNotMatch(notificationSource, /registerActionTypes/);
  assert.doesNotMatch(appSource, /listenPreBreakNotificationAction/);
  assert.match(reminderSource, /reminder-pre-break-panel/);
  assert.match(reminderSource, /preBreakMessage/);
  assert.doesNotMatch(reminderSource, /notifications\.restStartSoon\.dismissAction/);
  assert.doesNotMatch(reminderSource, /api\.startBreak\(\)/);
});
