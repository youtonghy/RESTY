export interface LayoutItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridMetrics {
  trackWidth: number;
  trackHeight: number;
  columnGap: number;
  rowGap: number;
  columnSpan: number;
  rowSpan: number;
}

export interface DragLayoutSnapshot {
  id: string;
  layout: LayoutItem;
}

export const DRAG_INTENT_THRESHOLD_PX = 5;
export const DRAG_REORDER_DELAY_MS = 130;

const DRAG_GRID_HYSTERESIS_RATIO = 0.62;
const DRAG_AXIS_LOCK_RATIO = 1.35;
const DRAG_AXIS_LOCK_RELEASE = 0.72;
const DRAG_TARGET_INFLUENCE_RATIO = 0.18;
const DRAG_DIRECTION_BIAS = 0.18;

const getGridStep = (delta: number, span: number) => {
  if (span <= 0) return 0;
  const raw = delta / span;
  const direction = Math.sign(raw);
  const magnitude = Math.abs(raw);
  if (magnitude < DRAG_GRID_HYSTERESIS_RATIO) {
    return 0;
  }
  return direction * Math.floor(magnitude + (1 - DRAG_GRID_HYSTERESIS_RATIO));
};

const clampCandidate = (candidate: LayoutItem) => ({
  ...candidate,
  x: Math.max(0, Math.min(candidate.x, 12 - candidate.w)),
  y: Math.max(0, candidate.y),
});

const layoutsEqual = (a: LayoutItem, b: LayoutItem) =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const getCenter = (layout: LayoutItem) => ({
  x: layout.x + layout.w / 2,
  y: layout.y + layout.h / 2,
});

const isCenterInsideInfluence = (
  center: { x: number; y: number },
  layout: LayoutItem,
) => {
  const insetX = Math.min(0.42, layout.w * DRAG_TARGET_INFLUENCE_RATIO);
  const insetY = Math.min(0.42, layout.h * DRAG_TARGET_INFLUENCE_RATIO);
  return (
    center.x >= layout.x + insetX &&
    center.x <= layout.x + layout.w - insetX &&
    center.y >= layout.y + insetY &&
    center.y <= layout.y + layout.h - insetY
  );
};

const getDirectionalPenalty = (
  movement: { x: number; y: number },
  targetDelta: { x: number; y: number },
) => {
  const movementLength = Math.hypot(movement.x, movement.y);
  const targetLength = Math.hypot(targetDelta.x, targetDelta.y);
  if (movementLength <= 0 || targetLength <= 0) return 0;

  const dot =
    (movement.x * targetDelta.x + movement.y * targetDelta.y) /
    (movementLength * targetLength);
  return dot < 0 ? Math.abs(dot) + DRAG_DIRECTION_BIAS : 0;
};

const getClosestCenterCandidate = (
  activeId: string,
  layouts: DragLayoutSnapshot[],
  original: LayoutItem,
  floatingCenter: { x: number; y: number },
  movement: { x: number; y: number },
) => {
  const originalCenter = getCenter(original);
  let best:
    | {
        layout: LayoutItem;
        score: number;
      }
    | null = null;

  for (const item of layouts) {
    if (item.id === activeId) continue;
    if (!isCenterInsideInfluence(floatingCenter, item.layout)) continue;

    const targetCenter = getCenter(item.layout);
    const distance = Math.hypot(
      floatingCenter.x - targetCenter.x,
      floatingCenter.y - targetCenter.y,
    );
    const directionalPenalty = getDirectionalPenalty(movement, {
      x: targetCenter.x - originalCenter.x,
      y: targetCenter.y - originalCenter.y,
    });
    const score = distance + directionalPenalty;

    if (!best || score < best.score) {
      best = {
        layout: item.layout,
        score,
      };
    }
  }

  return best?.layout ?? null;
};

export const getDragReorderCandidate = ({
  activeId,
  layouts,
  original,
  deltaX,
  deltaY,
  metrics,
}: {
  activeId: string;
  layouts: DragLayoutSnapshot[];
  original: LayoutItem;
  deltaX: number;
  deltaY: number;
  metrics: GridMetrics;
}): LayoutItem => {
  const horizontalTravel = Math.abs(deltaX / metrics.columnSpan);
  const verticalTravel = Math.abs(deltaY / metrics.rowSpan);
  const dominantHorizontal =
    horizontalTravel > verticalTravel * DRAG_AXIS_LOCK_RATIO;
  const dominantVertical =
    verticalTravel > horizontalTravel * DRAG_AXIS_LOCK_RATIO;

  const floatingX = original.x + deltaX / metrics.columnSpan;
  const floatingY = original.y + deltaY / metrics.rowSpan;
  const floatingCenter = {
    x: floatingX + original.w / 2,
    y: floatingY + original.h / 2,
  };

  const centerCandidate = getClosestCenterCandidate(
    activeId,
    layouts,
    original,
    floatingCenter,
    {
      x: deltaX / metrics.columnSpan,
      y: deltaY / metrics.rowSpan,
    },
  );

  if (centerCandidate) {
    return clampCandidate({
      x: centerCandidate.x,
      y: centerCandidate.y,
      w: original.w,
      h: original.h,
    });
  }

  const xStep =
    dominantVertical && horizontalTravel < DRAG_AXIS_LOCK_RELEASE
      ? 0
      : getGridStep(deltaX, metrics.columnSpan);
  const yStep =
    dominantHorizontal && verticalTravel < DRAG_AXIS_LOCK_RELEASE
      ? 0
      : getGridStep(deltaY, metrics.rowSpan);
  const candidate = clampCandidate({
    x: original.x + xStep,
    y: original.y + yStep,
    w: original.w,
    h: original.h,
  });

  return layoutsEqual(candidate, original) ? { ...original } : candidate;
};
