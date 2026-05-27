import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('break reminder opening is owned by the Rust show-break-reminder path', async () => {
  const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const timerSource = await readFile(
    new URL('../src-tauri/src/services/timer.rs', import.meta.url),
    'utf8'
  );
  const commandsSource = await readFile(
    new URL('../src-tauri/src/commands/mod.rs', import.meta.url),
    'utf8'
  );
  const libSource = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');

  assert.match(appSource, /const handlePhaseSideEffects/);
  assert.match(appSource, /if \(phase === 'break'\) \{\s*void api\.closePreBreakReminderWindow\(\);\s*\}/);
  assert.match(appSource, /api\.closeReminderWindow\(\)/);
  assert.doesNotMatch(appSource, /api\s*\.\s*openReminderWindow\(/);
  assert.doesNotMatch(appSource, /api\.onPhaseChange/);
  assert.doesNotMatch(timerSource, /emit_phase_change|emit_timer_finished/);
  assert.doesNotMatch(timerSource, /"phase-change"|"timer-finished"/);
  assert.doesNotMatch(commandsSource, /pub (?:async )?fn (?:open|show)_reminder_window/);
  assert.doesNotMatch(libSource, /commands::(?:open|show)_reminder_window/);
  assert.match(timerSource, /self\.start_break\(\)\?;\s*self\.show_break_reminder\(\)\?/);
  assert.match(commandsSource, /let _ = app\.emit\("show-break-reminder", \(\)\)/);
  assert.match(libSource, /app\.listen\("show-break-reminder"/);
  assert.match(libSource, /show_break_reminder_window\(&app, is_fullscreen, floating_position\)/);
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
