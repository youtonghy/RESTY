import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('fullscreen panel display renders the dashboard panel actions', async () => {
  const source = await readFile(new URL('../src/components/Reminder/Reminder.tsx', import.meta.url), 'utf8');

  assert.match(source, /reminderFullscreenDisplay/);
  assert.match(source, /isPanelDisplay = !isPreBreak && isFullscreen && reminderFullscreenDisplay === 'panel'/);
  assert.match(source, /<Dashboard/);
  assert.match(source, /revealMode: 'hover'/);
  assert.match(source, /touchFallback: true/);
  assert.match(source, /panelSkipLabel/);
  assert.match(source, /panelExtendLabel/);
});

test('pre-break reminder stays separate from the dashboard panel', async () => {
  const source = await readFile(new URL('../src/components/Reminder/Reminder.tsx', import.meta.url), 'utf8');

  assert.match(source, /reminder-pre-break-panel/);
  assert.match(source, /if \(!isPreBreak\) \{/);
  assert.match(source, /preBreakCountdownLabel/);
  assert.match(source, /preBreakMessage/);
  assert.doesNotMatch(source, /notifications\.restStartSoon\.dismissAction/);
  assert.doesNotMatch(source, /api\.startBreak\(\)/);
});
