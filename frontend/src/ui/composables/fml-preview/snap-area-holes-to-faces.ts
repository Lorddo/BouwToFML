import { wallFaces, type WallFaceSegment } from '@/core/fml/fml-wall-geom'
import type { Point2D, Wall } from '@/core/fml/types'

/**
 * Clipper-union kan hoekvertices een fractie van de face af zetten.
 * Loodrechte snap blijft krap (buitenface mag niet winnen).
 * Langs de face moet de buitenmiter mee (± dikte voorbij het as-eind).
 */
export const AREA_HOLE_FACE_SNAP_CM = 2

type FaceLine = {
  a: Point2D
  ux: number
  uy: number
  nx: number
  ny: number
  len: number
  thickness: number
}

function toFaceLine(seg: WallFaceSegment, thickness: number): FaceLine | null {
  const dx = seg.b.x - seg.a.x
  const dy = seg.b.y - seg.a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return null
  const ux = dx / len
  const uy = dy / len
  return { a: seg.a, ux, uy, nx: -uy, ny: ux, len, thickness }
}

function collectFaces(walls: readonly Wall[]): FaceLine[] {
  const out: FaceLine[] = []
  for (const wall of walls) {
    if (!Number.isFinite(wall.thickness) || wall.thickness <= 0) continue
    const { left, right } = wallFaces(wall)
    const a = toFaceLine(left, wall.thickness)
    const b = toFaceLine(right, wall.thickness)
    if (a) out.push(a)
    if (b) out.push(b)
  }
  return out
}

function signedDist(p: Point2D, face: FaceLine): number {
  return (p.x - face.a.x) * face.nx + (p.y - face.a.y) * face.ny
}

function alongT(p: Point2D, face: FaceLine): number {
  return (p.x - face.a.x) * face.ux + (p.y - face.a.y) * face.uy
}

function projectToLine(p: Point2D, face: FaceLine): Point2D {
  const t = alongT(p, face)
  return { x: face.a.x + face.ux * t, y: face.a.y + face.uy * t }
}

function lineIntersection(a: FaceLine, b: FaceLine): Point2D | null {
  const det = a.ux * b.uy - a.uy * b.ux
  if (Math.abs(det) < 0.15) return null
  const dx = b.a.x - a.a.x
  const dy = b.a.y - a.a.y
  const t = (dx * b.uy - dy * b.ux) / det
  return { x: a.a.x + a.ux * t, y: a.a.y + a.uy * t }
}

function nearbyFaces(p: Point2D, faces: readonly FaceLine[]): FaceLine[] {
  const pad = AREA_HOLE_FACE_SNAP_CM
  const hits: { face: FaceLine; d: number }[] = []
  for (const face of faces) {
    const d = Math.abs(signedDist(p, face))
    if (d > pad) continue
    const alongPad = pad + face.thickness
    const t = alongT(p, face)
    if (t < -alongPad || t > face.len + alongPad) continue
    hits.push({ face, d })
  }
  hits.sort((a, b) => a.d - b.d)
  return hits.map((h) => h.face)
}

function snapVertex(p: Point2D, faces: readonly FaceLine[]): Point2D {
  const hits = nearbyFaces(p, faces)
  if (hits.length === 0) return p
  if (hits.length === 1) return projectToLine(p, hits[0])
  for (let i = 1; i < hits.length; i += 1) {
    const inter = lineIntersection(hits[0], hits[i])
    if (inter) return inter
  }
  return projectToLine(p, hits[0])
}

/** Zet clipper-hole-ringen terug op muurfaces (binnenmaat = hartlijn − diktes). */
export function snapHoleRingsToWallFaces(
  holes: readonly Point2D[][],
  walls: readonly Wall[],
): Point2D[][] {
  if (holes.length === 0 || walls.length === 0) {
    return holes.map((ring) => ring.map((p) => ({ x: p.x, y: p.y })))
  }
  const faces = collectFaces(walls)
  if (faces.length === 0) {
    return holes.map((ring) => ring.map((p) => ({ x: p.x, y: p.y })))
  }
  return holes.map((ring) => ring.map((p) => snapVertex(p, faces)))
}
