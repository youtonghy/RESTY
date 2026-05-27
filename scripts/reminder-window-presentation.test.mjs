import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('break reminder routing restores fullscreen presentation before showing', async () => {
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
  assert.match(libSource, /app\.listen\("show-break-reminder"/);
  assert.match(libSource, /show_break_reminder_window\(&app, is_fullscreen, floating_position\)/);
  assert.doesNotMatch(commandsSource, /pub (?:async )?fn (?:open|show)_reminder_window/);
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
  assert.match(libSource, /const PRE_BREAK_WINDOW_AUTO_CLOSE_SECS: u64 = 10/);
  assert.match(libSource, /fn schedule_pre_break_window_auto_close/);
  assert.match(libSource, /tokio::time::sleep\(Duration::from_secs\(PRE_BREAK_WINDOW_AUTO_CLOSE_SECS\)\)\.await/);
  assert.match(libSource, /app\.get_webview_window\(PRE_BREAK_REMINDER_LABEL\)/);
  assert.match(commandsSource, /pub fn open_pre_break_reminder_window/);
  assert.match(commandsSource, /crate::show_pre_break_reminder_window\(&app\)/);
});

test('macOS break reminder stays on all workspaces without AppKit presentation calls', async () => {
  const libSource = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');

  assert.match(libSource, /window\.set_visible_on_all_workspaces\(true\)\?/);
  assert.match(libSource, /window\.set_position\(tauri::Position::Physical\(\*monitor\.position\(\)\)\)\?/);
  assert.match(libSource, /window\.set_size\(tauri::Size::Physical\(\*monitor\.size\(\)\)\)\?/);
  assert.match(libSource, /window\.as_ref\(\)\.window\(\)\.set_simple_fullscreen\(true\)\?/);
  assert.match(libSource, /window\.as_ref\(\)\.window\(\)\.set_simple_fullscreen\(false\)/);
  assert.match(libSource, /window\.set_visible_on_all_workspaces\(false\)/);
  assert.doesNotMatch(libSource, /NSApplicationPresentation/);
  assert.doesNotMatch(libSource, /setPresentationOptions_/);
});
