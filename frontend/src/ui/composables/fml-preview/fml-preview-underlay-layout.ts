/** Stage-px config voor Konva v-image underlay (zonder image-object). */
export type FmlUnderlayStageGeom = {
  x: number
  y: number
  width: number
  height: number
  offsetX?: number
  offsetY?: number
  rotation?: number
  scaleX?: number
}

const ROTATION_EPS_DEG = 0.001

/**
 * Plaats underlay in stage-ruimte.
 * rotationDeg ≈ 0 && !flipX → top-left (bestaand generate-pad, byte-identiek gedrag).
 * anders → midden + offset + Konva-rotatie/scaleX om midden.
 */
export function buildUnderlayStageGeom(params: {
  topLeftStage: { x: number; y: number }
  widthStage: number
  heightStage: number
  rotationDeg?: number | null
  flipX?: boolean | null
}): FmlUnderlayStageGeom {
  const { topLeftStage, widthStage, heightStage, rotationDeg, flipX } = params
  const rot = rotationDeg ?? 0
  const mirror = flipX === true
  if (Math.abs(rot) < ROTATION_EPS_DEG && !mirror) {
    return {
      x: topLeftStage.x,
      y: topLeftStage.y,
      width: widthStage,
      height: heightStage,
    }
  }
  return {
    x: topLeftStage.x + widthStage / 2,
    y: topLeftStage.y + heightStage / 2,
    width: widthStage,
    height: heightStage,
    offsetX: widthStage / 2,
    offsetY: heightStage / 2,
    ...(Math.abs(rot) >= ROTATION_EPS_DEG ? { rotation: rot } : {}),
    ...(mirror ? { scaleX: -1 } : {}),
  }
}
