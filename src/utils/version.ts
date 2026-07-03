/**
 * Compare two semantic version strings.
 * Returns 1 if `a` is newer, -1 if `b` is newer, and 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const sanitize = (value: string) => {
    const [core, prerelease] = value.trim().replace(/^v/i, '').split('-', 2);
    const parts = core
      .split('.')
      .map((part) => {
        const numeric = Number.parseInt(part.replace(/[^0-9]/g, ''), 10);
        return Number.isNaN(numeric) ? 0 : numeric;
      });
    return { parts, prerelease: prerelease ?? null };
  };

  const parsedA = sanitize(a);
  const parsedB = sanitize(b);
  const partsA = parsedA.parts;
  const partsB = parsedB.parts;
  const maxLength = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLength; i += 1) {
    const segmentA = partsA[i] ?? 0;
    const segmentB = partsB[i] ?? 0;
    if (segmentA > segmentB) return 1;
    if (segmentA < segmentB) return -1;
  }

  if (parsedA.prerelease && !parsedB.prerelease) return -1;
  if (!parsedA.prerelease && parsedB.prerelease) return 1;
  if (parsedA.prerelease && parsedB.prerelease) {
    return parsedA.prerelease.localeCompare(parsedB.prerelease, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }

  return 0;
}

/** Convenience helper to check if `candidate` is newer than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareSemver(candidate, current) === 1;
}
