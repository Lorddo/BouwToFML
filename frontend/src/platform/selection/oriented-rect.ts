/** Axis-aligned LBE (`x`/`y` = local top-left) plus optional clockwise rotation around the center. */

export const RECT_ROTATION_EPS_DEG = 0.25

export type OrientedRect = {
  x: number
  y: number
  width: number
  height: number
  rotationDeg?: number
}

export function normalizeRectRotationDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

export function rectRotationDeg(rect: OrientedRect): number {
  const deg = rect.rotationDeg ?? 0
  return Math.abs(deg) < RECT_ROTATION_EPS_DEG ? 0 : normalizeRectRotationDeg(deg)
}

export function hasRectRotation(rect: OrientedRect): boolean {
  return rectRotationDeg(rect) !== 0
}

export function compactRectRotationDeg(deg: number | undefined): number | undefined {
  if (deg == null || !Number.isFinite(deg)) return undefined
  const n = normalizeRectRotationDeg(deg)
  if (n < RECT_ROTATION_EPS_DEG || n > 360 - RECT_ROTATION_EPS_DEG) return undefined
  return n
}

export function rectCenter(rect: OrientedRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

export function orientedLocalToWorld(
  center: { x: number; y: number },
  local: { x: number; y: number },
  rotationDeg: number,
): { x: number; y: number } {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x: center.x + local.x * cos - local.y * sin,
    y: center.y + local.x * sin + local.y * cos,
  }
}

export function orientedWorldToLocal(
  center: { x: number; y: number },
  world: { x: number; y: number },
  rotationDeg: number,
): { x: number; y: number } {
  const dx = world.x - center.x
  const dy = world.y - center.y
  const rad = (-rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  }
}

/** Top-left → top-right → bottom-right → bottom-left in local space. */
export function orientedRectCorners(rect: OrientedRect): Array<{ x: number; y: number }> {
  const center = rectCenter(rect)
  const rot = rectRotationDeg(rect)
  const hx = rect.width / 2
  const hy = rect.height / 2
  return [
    orientedLocalToWorld(center, { x: -hx, y: -hy }, rot),
    orientedLocalToWorld(center, { x: hx, y: -hy }, rot),
    orientedLocalToWorld(center, { x: hx, y: hy }, rot),
    orientedLocalToWorld(center, { x: -hx, y: hy }, rot),
  ]
}

export function pointInOrientedRect(point: { x: number; y: number }, rect: OrientedRect): boolean {
  const local = orientedWorldToLocal(rectCenter(rect), point, rectRotationDeg(rect))
  const hx = rect.width / 2
  const hy = rect.height / 2
  return local.x >= -hx && local.x <= hx && local.y >= -hy && local.y <= hy
}

export function aabbOfOrientedRect(rect: OrientedRect): {
  x: number
  y: number
  width: number
  height: number
} {
  if (!hasRectRotation(rect)) {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }
  const corners = orientedRectCorners(rect)
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  return {
    x: x0,
    y: y0,
    width: Math.max(1, Math.max(...xs) - x0),
    height: Math.max(1, Math.max(...ys) - y0),
  }
}

export function recoverOrientedRectFromCorners(
  corners: ReadonlyArray<{ x: number; y: number }>,
): OrientedRect {
  const tl = corners[0]
  const tr = corners[1]
  const br = corners[2]
  const bl = corners[3]
  if (!tl || !tr || !br || !bl) {
    return { x: 0, y: 0, width: 1, height: 1 }
  }
  const width = Math.max(1, Math.hypot(tr.x - tl.x, tr.y - tl.y))
  const height = Math.max(1, Math.hypot(bl.x - tl.x, bl.y - tl.y))
  const rotationDeg = compactRectRotationDeg((Math.atan2(tr.y - tl.y, tr.x - tl.x) * 180) / Math.PI)
  const cx = (tl.x + tr.x + br.x + bl.x) / 4
  const cy = (tl.y + tr.y + br.y + bl.y) / 4
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    ...(rotationDeg != null ? { rotationDeg } : {}),
  }
}

const CARDINAL_SNAP_DEG = [0, 90, 180, 270]

export function snapRectRotationDeg(rawDeg: number, snapWindowDeg = 12): number {
  const raw = normalizeRectRotationDeg(rawDeg)
  if (snapWindowDeg <= 0) return raw
  let best = raw
  let bestDist = snapWindowDeg
  for (const candidate of CARDINAL_SNAP_DEG) {
    const d = Math.abs(raw - candidate)
    const dist = Math.min(d, 360 - d)
    if (dist >= bestDist) continue
    bestDist = dist
    best = candidate
  }
  return best
}

/**
 * Nearest-neighbour sample of an oriented box into a local width×height buffer.
 * Pixels outside the source are `outside` (default white).
 */
export function sampleOrientedRectNearest(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  rect: OrientedRect,
  outside = 255,
): { data: Uint8Array; width: number; height: number } {
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  const data = new Uint8Array(width * height)
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const rad = (rectRotationDeg(rect) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  for (let y = 0; y < height; y += 1) {
    const ly = y + 0.5 - height / 2
    for (let x = 0; x < width; x += 1) {
      const lx = x + 0.5 - width / 2
      const wx = cx + lx * cos - ly * sin
      const wy = cy + lx * sin + ly * cos
      const ix = Math.floor(wx)
      const iy = Math.floor(wy)
      data[y * width + x] =
        iy >= 0 && iy < srcH && ix >= 0 && ix < srcW ? (src[iy * srcW + ix] ?? outside) : outside
    }
  }
  return { data, width, height }
}
