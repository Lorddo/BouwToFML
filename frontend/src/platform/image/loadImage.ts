import { tGlobal } from '@/ui/i18n'

export function imageDimensions(img: HTMLImageElement | HTMLCanvasElement): {
  width: number
  height: number
} {
  if (img instanceof HTMLCanvasElement) {
    return { width: img.width, height: img.height }
  }
  return { width: img.naturalWidth, height: img.naturalHeight }
}

/** Load an HTMLImageElement from a URL/data-URL — no OpenCV / workspace deps. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(tGlobal('input.errors.imageLoadFailed')))
    img.src = src
  })
}
