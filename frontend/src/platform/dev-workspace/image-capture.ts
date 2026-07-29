export function imageElementToPngDataUrl(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Kon canvas niet aanmaken voor snapshot.')
  }
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png')
}
