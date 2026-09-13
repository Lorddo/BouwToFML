import type { Point2D, Wall } from '@/core/fml/types'
import {
  fixtureObbHalfAlongNormal,
  WALL_FACE_SNAP_CM,
} from '@/ui/components/plan-canvas-fixture-face-snap'
import { wallFaceSegments } from '@/ui/components/plan-canvas-wall-face-snap'
import { itemLocalToWorld, worldToItemLocal } from './item-resize-handles'

export type ItemRotateCorner = 'ne' | 'se' | 'sw' | 'nw'

const CORNERS: readonly ItemRotateCorner[] = ['ne', 'se', 'sw', 'nw']

/** Magnet for 90°/180° and nearby wall angles while dragging a rotate handle. */
export const ITEM_ROTATE_SNAP_DEG = 12

export function normalizeItemRotationDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

export function angularDistanceDeg(a: number, b: number): number {
  const d = Math.abs(normalizeItemRotationDeg(a) - normalizeItemRotationDeg(b))
  return Math.min(d, 360 - d)
}

export function pointerAngleDeg(center: Point2D, pointer: Point2D): number {
  return (Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI
}

export function rotationFromGrab(
  startRotationDeg: number,
  startPointerDeg: number,
  pointerDeg: number,
): number {
  let delta = pointerDeg - startPointerDeg
  while (delta > 180) delta -= 360
  while (delta < -180) delta += 360
  return normalizeItemRotationDeg(startRotationDeg + delta)
}

export function itemLocalCorner(width: number, height: number, corner: ItemRotateCorner): Point2D {
  const hx = width / 2
  const hy = height / 2
  if (corner === 'ne') return { x: hx, y: -hy }
  if (corner === 'se') return { x: hx, y: hy }
  if (corner === 'sw') return { x: -hx, y: hy }
  return { x: -hx, y: -hy }
}

export function itemRotateHandleWorlds(item: {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  mirrored?: readonly [number, number]
}): { corner: ItemRotateCorner; x: number; y: number; arrowDeg: number }[] {
  const rotation = item.rotation ?? 0
  return CORNERS.map((corner) => {
    const local = itemLocalCorner(item.width, item.height, corner)
    const world = itemLocalToWorld({ x: item.x, y: item.y }, local, rotation, item.mirrored)
    const localAngle = (Math.atan2(local.y, local.x) * 180) / Math.PI
    return { corner, x: world.x, y: world.y, arrowDeg: rotation + localAngle + 90 }
  })
}

export function hitItemRotateHandle(
  local: Point2D,
  width: number,
  height: number,
  tol: number,
): ItemRotateCorner | null {
  let best: ItemRotateCorner | null = null
  let bestDist = tol
  for (const corner of CORNERS) {
    const pt = itemLocalCorner(width, height, corner)
    const dist = Math.hypot(local.x - pt.x, local.y - pt.y)
    if (dist <= bestDist) {
      best = corner
      bestDist = dist
    }
  }
  return best
}

export function hitItemRotateHandleAtCm(
  item: {
    x: number
    y: number
    width: number
    height: number
    rotation?: number
    mirrored?: readonly [number, number]
  },
  cm: Point2D,
  tol: number,
): ItemRotateCorner | null {
  const local = worldToItemLocal({ x: item.x, y: item.y }, cm, item.rotation ?? 0, item.mirrored)
  return hitItemRotateHandle(local, item.width, item.height, tol)
}

function wallAngleDeg(a: Point2D, b: Point2D): number {
  return normalizeItemRotationDeg((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI)
}

/**
 * Cardinals plus 90°-offsets of nearby wall faces, so a diagonal wall can lock
 * the fixture parallel (width or depth against the face).
 */
export function itemRotationSnapCandidatesDeg(
  walls: ReadonlyArray<Pick<Wall, 'a' | 'b' | 'thickness' | 'balance'>>,
  center: Point2D,
  size: { width: number; height: number; rotationDeg?: number },
  radiusCm = WALL_FACE_SNAP_CM,
): number[] {
  const candidates = [0, 90, 180, 270]
  if (walls.length === 0 || radiusCm <= 0) return candidates
  const rot = size.rotationDeg ?? 0
  const seen = new Set(candidates.map((deg) => deg.toFixed(3)))
  const add = (deg: number): void => {
    const n = normalizeItemRotationDeg(deg)
    const key = n.toFixed(3)
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(n)
  }
  for (const wall of walls) {
    const pad = radiusCm + Math.max(0, wall.thickness)
    for (const face of wallFaceSegments(wall)) {
      const along = { x: face.b.x - face.a.x, y: face.b.y - face.a.y }
      const len = Math.hypot(along.x, along.y)
      if (len < 1e-9) continue
      const nx = -along.y / len
      const ny = along.x / len
      const half = fixtureObbHalfAlongNormal(size.width, size.height, rot, nx, ny)
      const signed = (center.x - face.a.x) * nx + (center.y - face.a.y) * ny
      const gap = Math.abs(signed) - half
      if (gap > radiusCm) continue
      const t = ((center.x - face.a.x) * along.x + (center.y - face.a.y) * along.y) / (len * len)
      const padT = (pad + Math.max(size.width, size.height) / 2) / len
      if (t < -padT || t > 1 + padT) continue
      const faceDeg = wallAngleDeg(face.a, face.b)
      add(faceDeg)
      add(faceDeg + 90)
      add(faceDeg + 180)
      add(faceDeg + 270)
    }
  }
  return candidates
}

export function snapItemRotationDeg(
  rawDeg: number,
  candidates: readonly number[],
  snapDeg = ITEM_ROTATE_SNAP_DEG,
): number {
  const raw = normalizeItemRotationDeg(rawDeg)
  if (snapDeg <= 0 || candidates.length === 0) return raw
  let best = raw
  let bestDist = snapDeg
  for (const candidate of candidates) {
    const dist = angularDistanceDeg(raw, candidate)
    if (dist >= bestDist) continue
    bestDist = dist
    best = normalizeItemRotationDeg(candidate)
  }
  return best
}
