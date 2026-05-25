import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('existing reminder windows restore fullscreen presentation before showing', async () => {
  const libSource = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const commandsSource = await readFile(
    new URL('../src-tauri/src/commands/mod.rs', import.meta.url),
    'utf8'
  );

  assert.match(libSource, /fn restore_reminder_window_presentation/);
  assert.match(libSource, /window\.set_always_on_top\(true\)\?/);
  assert.match(libSource, /fn set_break_reminder_fullscreen/);
  assert.match(libSource, /set_break_reminder_fullscreen\(window, monitor\.as_ref\(\)\)\?/);
  assert.match(libSource, /restore_reminder_window_presentation\(&w, is_fullscreen, floating_position\.clone\(\)\)\?/);
  assert.match(commandsSource, /crate::show_break_reminder_window\(&app, is_fullscreen, floating_position\)/);
  assert.match(commandsSource, /#\[cfg\(not\(target_os = "macos"\)\)\]/);
  assert.match(commandsSource, /window\.is_fullscreen\(\)/);
});

test('pre-break reminder uses a dedicated large focused window', async () => {
  const libSource = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const commandsSource = await readFile(
    new URL('../src-tauri/src/commands/mod.rs', import.meta.url),
    'utf8'
  );

  assert.match(libSource, /const PRE_BREAK_REMINDER_LABEL: &str = "pre-break-reminder"/);
  assert.match(libSource, /const PRE_BREAK_WINDOW_WIDTH: f64 = 680\.0/);
  assert.match(libSource, /pub fn show_pre_break_reminder_window/);
  assert.match(libSource, /WebviewUrl::App\(PRE_BREAK_REMINDER_ROUTE\.into\(\)\)/);
  assert.match(libSource, /\.always_on_top\(true\)/);
  assert.match(libSource, /\.focused\(true\)/);
  assert.match(commandsSource, /pub fn open_pre_break_reminder_window/);
  assert.match(commandsSource, /crate::show_pre_break_reminder_window\(&app\)/);
});

test('macOS break reminder applies and releases stronger presentation lock', async () => {
  const libSource = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const commandsSource = await readFile(
    new URL('../src-tauri/src/commands/mod.rs', import.meta.url),
    'utf8'
  );

  assert.match(libSource, /fn apply_macos_break_reminder_lock/);
  assert.match(libSource, /NSApplicationPresentationDisableProcessSwitching/);
  assert.match(libSource, /NSWindowCollectionBehaviorCanJoinAllSpaces/);
  assert.match(libSource, /release_macos_break_reminder_lock/);
  assert.match(commandsSource, /crate::release_macos_break_reminder_lock\(\)/);
});
