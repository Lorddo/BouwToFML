import type { OcrTextOverlay } from '@/platform/canvas'

export function findOcrOverlayAt(
  point: { x: number; y: number },
  overlays: OcrTextOverlay[],
): OcrTextOverlay | null {
  for (let i = overlays.length - 1; i >= 0; i -= 1) {
    const ocr = overlays[i]
    if (
      point.x >= ocr.x &&
      point.x <= ocr.x + ocr.width &&
      point.y >= ocr.y &&
      point.y <= ocr.y + ocr.height
    ) {
      return ocr
    }
  }
  return null
}
