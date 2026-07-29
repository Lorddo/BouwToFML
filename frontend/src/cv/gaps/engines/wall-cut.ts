/**
 * Wall-cut engine — muren (zwart op mask) witmaken op source.
 * Pure data-pad voor tests.
 */

import type { SolidWallCutPolicy } from '../types'

const WHITE = 255

/** Pure: kopieer source en zet muur-pixels wit waar mask ≤ wallInkMaxValue. */
export function cutWallsFromGrayData(
  source: Uint8Array,
  wallMask: Uint8Array,
  policy: Pick<SolidWallCutPolicy, 'wallInkMaxValue'>,
): Uint8Array {
  if (source.length !== wallMask.length) {
    throw new Error('cutWallsFromGrayData: source/mask length mismatch')
  }
  const out = new Uint8Array(source)
  const maxInk = policy.wallInkMaxValue
  for (let i = 0; i < out.length; i += 1) {
    if (wallMask[i] <= maxInk) out[i] = WHITE
  }
  return out
}
