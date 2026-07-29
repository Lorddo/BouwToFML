import { createCanvas, type CanvasLike } from '@/cv/port/canvasEnv'
import type { Segment } from '@/cv/port/wallGraph'
import type { RoomWallJunction } from './room-wall-skeleton-types'

export const ROOM_WALL_JUNCTION_COLORS: Record<RoomWallJunction['kind'], string> = {
  I: '#94a3b8',
  L: '#eab308',
  T: '#f97316',
  X: '#ef4444',
}

export function renderRoomWallSkeletonOverlay(params: {
  base: CanvasLike
  segments: Segment[]
  junctions: RoomWallJunction[]
}): CanvasLike {
  const canvas = createCanvas(params.base.width, params.base.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(params.base, 0, 0)

  ctx.strokeStyle = '#a855f7'
  ctx.lineWidth = 2
  for (const seg of params.segments) {
    ctx.beginPath()
    ctx.moveTo(seg.a.x, seg.a.y)
    ctx.lineTo(seg.b.x, seg.b.y)
    ctx.stroke()
  }

  for (const junction of params.junctions) {
    ctx.beginPath()
    ctx.fillStyle = ROOM_WALL_JUNCTION_COLORS[junction.kind] ?? '#94a3b8'
    ctx.arc(junction.x, junction.y, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }

  return canvas
}
