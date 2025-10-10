/**
 * Compare two semantic version strings.
 * Returns 1 if `a` is newer, -1 if `b` is newer, and 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const sanitize = (value: string) =>
    value
      .split('.')
      .map((part) => {
        const numeric = parseInt(part.replace(/[^0-9]/g, ''), 10);
        return Number.isNaN(numeric) ? 0 : numeric;
      });

  const partsA = sanitize(a);
  const partsB = sanitize(b);
  const maxLength = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLength; i += 1) {
    const segmentA = partsA[i] ?? 0;
    const segmentB = partsB[i] ?? 0;
    if (segmentA > segmentB) return 1;
    if (segmentA < segmentB) return -1;
  }

  return 0;
}

/** Convenience helper to check if `candidate` is newer than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareSemver(candidate, current) === 1;
}
