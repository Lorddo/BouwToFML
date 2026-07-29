import TraceSkeleton from 'skeleton-tracing-wasm'
import type { OpenCV } from '@/cv/loadOpenCV'
import type { Segment } from './wallGraph'

interface SkeletonTracer {
  fromBoolArray(data: ArrayLike<number | boolean>, w: number, h: number): {
    polylines: number[][][]
  }
}

let tracerPromise: Promise<SkeletonTracer> | null = null

async function getTracer(): Promise<SkeletonTracer> {
  if (!tracerPromise) {
    tracerPromise = (TraceSkeleton as unknown as { load: () => Promise<SkeletonTracer> }).load()
  }
  return tracerPromise
}

function toBinaryArray(mat: OpenCV['Mat'], threshold = 245): Uint8Array {
  const values = new Uint8Array(mat.cols * mat.rows)
  let i = 0
  for (let y = 0; y < mat.rows; y += 1) {
    for (let x = 0; x < mat.cols; x += 1) {
      values[i] = mat.ucharPtr(y, x)[0] < threshold ? 1 : 0
      i += 1
    }
  }
  return values
}

type PolylinePoint = [number, number]

function stepDirection(from: PolylinePoint, to: PolylinePoint): [number, number] {
  return [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1])]
}

/**
 * Reduceer pixel-ketens tot hoekpunten: opeenvolgende stappen in dezelfde richting
 * worden één rechte tak. Elke richtingswissel (L/T/hoek op de polyline) blijft behouden.
 */
export function compressPolylinePoints(points: number[][]): PolylinePoint[] {
  if (points.length <= 2) {
    return points.map((p) => [p[0]!, p[1]!] as PolylinePoint)
  }

  const compressed: PolylinePoint[] = [[points[0]![0]!, points[0]![1]!]]
  let runDir: [number, number] | null = null

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!
    const cur = points[i]!
    const dir = stepDirection([prev[0]!, prev[1]!], [cur[0]!, cur[1]!])
    if (dir[0] === 0 && dir[1] === 0) continue

    if (runDir === null) {
      runDir = dir
      continue
    }

    if (dir[0] !== runDir[0] || dir[1] !== runDir[1]) {
      compressed.push([prev[0]!, prev[1]!])
      runDir = dir
    }
  }

  const last = points[points.length - 1]!
  compressed.push([last[0]!, last[1]!])
  return compressed
}

function polylineToSegments(points: number[][]): Segment[] {
  const compressed = compressPolylinePoints(points)
  if (compressed.length < 2) return []
  const out: Segment[] = []
  for (let i = 0; i < compressed.length - 1; i += 1) {
    const a = compressed[i]!
    const b = compressed[i + 1]!
    out.push({
      a: { x: a[0], y: a[1] },
      b: { x: b[0], y: b[1] },
    })
  }
  return out
}

export async function traceSkeletonSegments(mat: OpenCV['Mat']): Promise<Segment[]> {
  const tracer = await getTracer()
  const binary = toBinaryArray(mat)
  const traced = tracer.fromBoolArray(binary, mat.cols, mat.rows)
  const segments: Segment[] = []
  for (const polyline of traced.polylines ?? []) {
    segments.push(...polylineToSegments(polyline))
  }
  return segments
}
