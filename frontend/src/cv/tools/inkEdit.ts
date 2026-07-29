export interface InkStrokePoint {
  x: number
  y: number
}

export interface InkRectBounds {
  x: number
  y: number
  width: number
  height: number
}

function canvasDimensions(source: HTMLImageElement | HTMLCanvasElement): { width: number; height: number } {
  if (source instanceof HTMLCanvasElement || typeof (source as HTMLCanvasElement).width === 'number') {
    const canvas = source as HTMLCanvasElement
    if (canvas.width > 0 && canvas.height > 0) {
      return { width: canvas.width, height: canvas.height }
    }
  }
  const img = source as HTMLImageElement
  return { width: img.naturalWidth, height: img.naturalHeight }
}

const INK_EDIT_CONTEXT_OPTS: CanvasRenderingContext2DSettings = { willReadFrequently: true }

function getInkEditContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  return canvas.getContext('2d', INK_EDIT_CONTEXT_OPTS)
}

export function cloneSourceToEditCanvas(source: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = canvasDimensions(source)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = getInkEditContext(canvas)
  if (ctx) {
    ctx.drawImage(source, 0, 0)
  }
  return canvas
}

function snapPoint(point: InkStrokePoint): InkStrokePoint {
  return { x: Math.round(point.x), y: Math.round(point.y) }
}

function withInkContext(
  canvas: HTMLCanvasElement,
  run: (ctx: CanvasRenderingContext2D) => void,
): void {
  const ctx = getInkEditContext(canvas)
  if (!ctx) return
  const smoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  run(ctx)
  ctx.imageSmoothingEnabled = smoothing
}

function strokeInkPolyline(
  ctx: CanvasRenderingContext2D,
  points: InkStrokePoint[],
  lineWidth: number,
  color: string,
): void {
  if (points.length === 0) return
  const width = Math.max(1, Math.round(lineWidth))
  const snapped = points.map(snapPoint)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(snapped[0].x, snapped[0].y)
  for (let i = 1; i < snapped.length; i += 1) {
    ctx.lineTo(snapped[i].x, snapped[i].y)
  }
  if (snapped.length === 1) {
    // Enkele klik: ronde dot met dezelfde dikte als penseel.
    ctx.lineTo(snapped[0].x + 0.01, snapped[0].y)
  }
  ctx.stroke()
}

export function applyInkBrush(
  canvas: HTMLCanvasElement,
  points: InkStrokePoint[],
  radius: number,
): void {
  if (points.length === 0) return
  withInkContext(canvas, (ctx) => {
    strokeInkPolyline(ctx, points, radius * 2, '#000000')
  })
}

export function applyInkErase(
  canvas: HTMLCanvasElement,
  points: InkStrokePoint[],
  radius: number,
): void {
  if (points.length === 0) return
  withInkContext(canvas, (ctx) => {
    strokeInkPolyline(ctx, points, radius * 2, '#ffffff')
  })
}

export function applyInkLine(
  canvas: HTMLCanvasElement,
  start: InkStrokePoint,
  end: InkStrokePoint,
  lineWidth: number,
): void {
  withInkContext(canvas, (ctx) => {
    strokeInkPolyline(ctx, [start, end], lineWidth, '#000000')
  })
}

/** Rechthoek-outline met gelijke px-dikte op alle vier zijden (fill-bars i.p.v. strokeRect). */
export function applyInkRect(
  canvas: HTMLCanvasElement,
  bounds: InkRectBounds,
  lineWidth: number,
): void {
  withInkContext(canvas, (ctx) => {
    const thickness = Math.max(1, Math.round(lineWidth))
    const x0 = Math.round(Math.min(bounds.x, bounds.x + bounds.width))
    const y0 = Math.round(Math.min(bounds.y, bounds.y + bounds.height))
    const x1 = Math.round(Math.max(bounds.x, bounds.x + bounds.width))
    const y1 = Math.round(Math.max(bounds.y, bounds.y + bounds.height))
    const w = Math.max(0, x1 - x0)
    const h = Math.max(0, y1 - y0)
    if (w < 1 && h < 1) return

    ctx.fillStyle = '#000000'
    if (w <= thickness * 2 || h <= thickness * 2) {
      ctx.fillRect(x0, y0, Math.max(1, w), Math.max(1, h))
      return
    }
    ctx.fillRect(x0, y0, w, thickness)
    ctx.fillRect(x0, y1 - thickness, w, thickness)
    ctx.fillRect(x0, y0, thickness, h)
    ctx.fillRect(x1 - thickness, y0, thickness, h)
  })
}

export function snapshotEditCanvas(canvas: HTMLCanvasElement): ImageData | null {
  const ctx = getInkEditContext(canvas)
  if (!ctx) return null
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

export function restoreEditCanvasSnapshot(canvas: HTMLCanvasElement, snapshot: ImageData): void {
  const ctx = getInkEditContext(canvas)
  if (!ctx || snapshot.width !== canvas.width || snapshot.height !== canvas.height) return
  ctx.putImageData(snapshot, 0, 0)
}
