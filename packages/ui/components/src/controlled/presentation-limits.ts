/** Truncate arrays to a presentation max; schema validation may allow a larger set. */
export function clampToLimit<T>(items: readonly T[], max: number): T[] {
  return items.slice(0, max);
}
