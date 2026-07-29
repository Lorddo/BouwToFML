export interface WorkImage {
  canvas: HTMLCanvasElement
  scale: number
  originalWidth: number
  originalHeight: number
  workWidth: number
  workHeight: number
}

export type WorkCanvasSource = HTMLImageElement | HTMLCanvasElement

export function createWorkCanvas(image: WorkCanvasSource): WorkImage {
  const ow = image instanceof HTMLCanvasElement ? image.width : image.naturalWidth || image.width
  const oh = image instanceof HTMLCanvasElement ? image.height : image.naturalHeight || image.height
  const scale = 1
  const ww = Math.max(1, Math.round(ow * scale))
  const wh = Math.max(1, Math.round(oh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = ww
  canvas.height = wh
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, 0, 0, ww, wh)

  return {
    canvas,
    scale,
    originalWidth: ow,
    originalHeight: oh,
    workWidth: ww,
    workHeight: wh,
  }
}

export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
