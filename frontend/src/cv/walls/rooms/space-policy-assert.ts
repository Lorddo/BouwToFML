/**
 * Runtime guard voor dual-space policy constants (`DOOR_*` / `WINDOW_*`).
 * Gedeelde throw-vorm; policies blijven per domain.
 */
export function assertSpacePolicy<T>(
  label: string,
  actual: unknown,
  expected: T,
): asserts actual is T {
  if (actual !== expected) {
    throw new Error(
      `${label}: unsupported policy "${String(actual)}" (verwacht "${String(expected)}")`,
    )
  }
}
