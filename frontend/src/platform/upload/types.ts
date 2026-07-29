export type RasterMime = 'image/png' | 'image/jpeg' | 'image/jpg'
export type UploadMime = RasterMime | 'application/pdf'

export interface UploadedImage {
  src: string
  name: string
  isObjectUrl: boolean
  sourceKind?: 'raster' | 'pdf-page'
  pdfPage?: number
}
