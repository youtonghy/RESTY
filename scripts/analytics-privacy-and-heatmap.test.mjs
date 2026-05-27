import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('analytics disable is enforced before session persistence and reads', async () => {
  const databaseSource = await readFile(
    new URL('../src-tauri/src/services/database.rs', import.meta.url),
    'utf8'
  );

  assert.match(databaseSource, /async fn analytics_disabled\(&self\) -> bool/);
  assert.match(
    databaseSource,
    /pub async fn save_or_update_session[\s\S]*if self\.analytics_disabled\(\)\.await \{[\s\S]*remove_session_by_id\(&session\.id\)/
  );
  assert.match(
    databaseSource,
    /pub async fn get_analytics[\s\S]*if self\.analytics_disabled\(\)\.await \{[\s\S]*sessions: Vec::new\(\)/
  );
  assert.match(
    databaseSource,
    /pub async fn get_sessions_bounds[\s\S]*if self\.analytics_disabled\(\)\.await \{[\s\S]*earliest_start: None/
  );
});

test('analytics heatmap uses local date keys and preserves in-flight request sequence', async () => {
  const analyticsSource = await readFile(
    new URL('../src/pages/Analytics.tsx', import.meta.url),
    'utf8'
  );

  assert.match(analyticsSource, /const formatLocalDateKey = formatDateInputValue/);
  assert.match(analyticsSource, /dates\.push\(formatLocalDateKey\(current\)\)/);
  assert.match(
    analyticsSource,
    /const date = formatLocalDateKey\(new Date\(session\.startTime\)\)/
  );

  const duplicateCheckIndex = analyticsSource.indexOf(
    "if (!force && heatmapRequestKeyRef.current === requestKey)"
  );
  const sequenceIncrementIndex = analyticsSource.indexOf(
    'const requestSeq = ++heatmapRequestSeqRef.current'
  );
  assert.ok(duplicateCheckIndex >= 0, 'duplicate heatmap request guard is missing');
  assert.ok(sequenceIncrementIndex >= 0, 'heatmap request sequence increment is missing');
  assert.ok(
    duplicateCheckIndex < sequenceIncrementIndex,
    'duplicate heatmap requests must not invalidate the in-flight request sequence'
  );
});
