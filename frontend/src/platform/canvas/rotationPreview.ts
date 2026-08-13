/** Axis-aligned bounding box na rotatie (graden, + = klokwijs op scherm). */
export function axisAlignedBoundsForRotation(
  width: number,
  height: number,
  degrees: number,
): { width: number; height: number } {
  const rad = (degrees * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  }
}

/** Layer-coördinaat → ongeroteerde afbeeldingspixel (inverse van Konva center-rotatie). */
export function layerPointToImagePoint(
  point: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
  degrees: number,
): { x: number; y: number } {
  if (Math.abs(degrees) < 0.001) return point

  const cx = imageWidth / 2
  const cy = imageHeight / 2
  const rad = (-degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = point.x - cx
  const dy = point.y - cy
  return {
    x: cos * dx - sin * dy + cx,
    y: sin * dx + cos * dy + cy,
  }
}

export function totalInputRotationDeg(config: {
  rotate180?: boolean
  rotationDeg?: number
  autoRotationDeg?: number
}): number {
  return (config.autoRotationDeg ?? 0) + (config.rotationDeg ?? 0) + (config.rotate180 ? 180 : 0)
}

/** Live preview still needs a pixel bake (slider / 180°) — independent of scale confirm. */
export function hasPendingInputRotation(config: {
  rotate180?: boolean
  rotationDeg?: number
  autoRotationDeg?: number
}): boolean {
  return Math.abs(totalInputRotationDeg(config)) > 0.001
}
