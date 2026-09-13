import type { Point2D } from '@/core/fml/types'

export type ItemResizeSide = 'n' | 'e' | 's' | 'w'

const SIDES: readonly ItemResizeSide[] = ['n', 'e', 's', 'w']

export function itemLocalSide(width: number, height: number, side: ItemResizeSide): Point2D {
  const hx = width / 2
  const hy = height / 2
  if (side === 'n') return { x: 0, y: -hy }
  if (side === 'e') return { x: hx, y: 0 }
  if (side === 's') return { x: 0, y: hy }
  return { x: -hx, y: 0 }
}

export function itemLocalToWorld(
  center: Point2D,
  local: Point2D,
  rotationDeg: number,
  mirrored: readonly [number, number] | undefined,
): Point2D {
  const lx = mirrored?.[0] === 1 ? -local.x : local.x
  const ly = mirrored?.[1] === 1 ? -local.y : local.y
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x: center.x + lx * cos - ly * sin,
    y: center.y + lx * sin + ly * cos,
  }
}

export function worldToItemLocal(
  center: Point2D,
  world: Point2D,
  rotationDeg: number,
  mirrored: readonly [number, number] | undefined,
): Point2D {
  const dx = world.x - center.x
  const dy = world.y - center.y
  const rad = (-rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  let lx = dx * cos - dy * sin
  let ly = dx * sin + dy * cos
  if (mirrored?.[0] === 1) lx = -lx
  if (mirrored?.[1] === 1) ly = -ly
  return { x: lx, y: ly }
}

/** One side moves; the opposite edge stays. Center shifts on that axis only. */
export function resizeFromSide(
  item: {
    x: number
    y: number
    width: number
    height: number
    rotation?: number
    mirrored?: readonly [number, number]
  },
  side: ItemResizeSide,
  local: Point2D,
  minCm = 1,
): { x: number; y: number; width: number; height: number } {
  const width0 = item.width
  const height0 = item.height
  const hx = width0 / 2
  const hy = height0 / 2
  let width = width0
  let height = height0
  let localDx = 0
  let localDy = 0
  if (side === 'e') {
    width = Math.max(minCm, local.x + hx)
    localDx = (width - width0) / 2
  } else if (side === 'w') {
    width = Math.max(minCm, hx - local.x)
    localDx = (width0 - width) / 2
  } else if (side === 's') {
    height = Math.max(minCm, local.y + hy)
    localDy = (height - height0) / 2
  } else {
    height = Math.max(minCm, hy - local.y)
    localDy = (height0 - height) / 2
  }
  const center = itemLocalToWorld(
    { x: item.x, y: item.y },
    { x: localDx, y: localDy },
    item.rotation ?? 0,
    item.mirrored,
  )
  return { x: center.x, y: center.y, width, height }
}

export function itemResizeHandleWorlds(item: {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  mirrored?: readonly [number, number]
}): { side: ItemResizeSide; x: number; y: number }[] {
  return SIDES.map((side) => {
    const world = itemLocalToWorld(
      { x: item.x, y: item.y },
      itemLocalSide(item.width, item.height, side),
      item.rotation ?? 0,
      item.mirrored,
    )
    return { side, x: world.x, y: world.y }
  })
}

export function hitItemResizeHandle(
  local: Point2D,
  width: number,
  height: number,
  tol: number,
): ItemResizeSide | null {
  let best: ItemResizeSide | null = null
  let bestDist = tol
  for (const side of SIDES) {
    const pt = itemLocalSide(width, height, side)
    const dist = Math.hypot(local.x - pt.x, local.y - pt.y)
    if (dist <= bestDist) {
      best = side
      bestDist = dist
    }
  }
  return best
}
