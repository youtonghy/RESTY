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
  assert.match(libSource, /window\.set_fullscreen\(true\)\?/);
  assert.match(libSource, /restore_reminder_window_presentation\(&w, is_fullscreen, floating_position\.clone\(\)\)\?/);
  assert.match(commandsSource, /crate::show_break_reminder_window\(&app, is_fullscreen, floating_position\)/);
  assert.match(commandsSource, /window\.is_fullscreen\(\)/);
});

