import type { Session } from '../types';

const POWER_INTERRUPT_BREAK_NOTE = 'power-interrupt-break';
const POWER_INTERRUPT_WORK_NOTE = 'power-interrupt-work';
const MORE_REST_NOTE = 'more-rest';

const toTimestamp = (value: string) => {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : NaN;
};

const sortSessions = (sessions: Session[]) =>
  [...sessions].sort((a, b) => toTimestamp(a.startTime) - toTimestamp(b.startTime));

const buildMoreRestSessions = (sessions: Session[]) => {
  const sorted = sortSessions(sessions);
  const gaps: Session[] = [];

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const prev = sorted[i];
    const next = sorted[i + 1];
    const gapStart = toTimestamp(prev.endTime);
    const gapEnd = toTimestamp(next.startTime);
    if (!Number.isFinite(gapStart) || !Number.isFinite(gapEnd)) {
      continue;
    }
    if (gapEnd <= gapStart) {
      continue;
    }
    const shouldFill =
      (prev.type === 'work' &&
        next.type === 'work' &&
        prev.notes !== POWER_INTERRUPT_WORK_NOTE) ||
      prev.notes === POWER_INTERRUPT_BREAK_NOTE;
    if (!shouldFill) {
      continue;
    }
    const seconds = Math.floor((gapEnd - gapStart) / 1000);
    if (seconds <= 0) {
      continue;
    }
    const startTime = new Date(gapStart).toISOString();
    const endTime = new Date(gapEnd).toISOString();
    gaps.push({
      id: `more-rest-${gapStart}-${gapEnd}`,
      type: 'break',
      startTime,
      endTime,
      duration: seconds,
      plannedDuration: seconds,
      isSkipped: false,
      extendedSeconds: 0,
      notes: MORE_REST_NOTE,
    });
  }

  return gaps;
};

export const augmentSessionsWithMoreRest = (sessions: Session[], enabled: boolean) => {
  if (!enabled || sessions.length === 0) {
    return sessions;
  }
  const gaps = buildMoreRestSessions(sessions);
  if (gaps.length === 0) {
    return sortSessions(sessions);
  }
  return sortSessions([...sessions, ...gaps]);
};
