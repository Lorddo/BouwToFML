import { decodeMaskRle } from '@/cv/util/binary-mask-rle'
import type { RoomWallMaskRle } from '@/core/extraction/types'
import { createCanvas } from '@/cv/port/canvasEnv'

/**
 * Binair muurmasker → PNG-blob voor menselijke inspectie.
 * De E2E-harness leest dit bestand niet; alleen `fixture.json.maskRle`.
 */
export async function binaryMaskRleToPngBlob(mask: RoomWallMaskRle): Promise<Blob> {
  const data = decodeMaskRle(mask)
  const canvas = createCanvas(mask.width, mask.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context niet beschikbaar voor mask.png')
  const image = ctx.createImageData(mask.width, mask.height)
  for (let i = 0; i < data.length; i += 1) {
    const ink = (data[i] ?? 0) >= 128
    const v = ink ? 0 : 255
    const o = i * 4
    image.data[o] = v
    image.data[o + 1] = v
    image.data[o + 2] = v
    image.data[o + 3] = 255
  }
  ctx.putImageData(image, 0, 0)

  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/png' })
  }
  const htmlCanvas = canvas as HTMLCanvasElement
  return new Promise<Blob>((resolve, reject) => {
    htmlCanvas.toBlob((blob) => {
      if (!blob) reject(new Error('mask.png toBlob mislukt'))
      else resolve(blob)
    }, 'image/png')
  })
}
