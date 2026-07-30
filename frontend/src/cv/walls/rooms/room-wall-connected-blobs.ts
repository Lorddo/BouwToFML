import type { OpenCV } from '@/cv/loadOpenCV'
import type { RasterBBox } from './room-raster-merge'

const ROOM_WALL_CONNECTED_BLOB_PADDING_PX = 2

export interface ConnectedWallBlob {
  /** 1-based connected-component label op het gesloten mask. */
  componentId: number
  bbox: RasterBBox
  areaPx: number
  /** Lokale ROI (wit = blob), incl. padding. */
  maskMat: OpenCV['Mat']
  originX: number
  originY: number
}

export interface SplitConnectedWallBlobsResult {
  /** Behouden blob(s) na keepLargest — enige input voor skeleton-tracing. */
  blobs: ConnectedWallBlob[]
  /** Gesloten mask: alleen behouden blob(s) (standaard grootste). */
  filteredMask: OpenCV['Mat']
  /** Uint8Array-view van filteredMask — zelfde pixels als skeleton-input. */
  keptWallMaskData: Uint8Array
  removedBlobCount: number
  componentCount: number
}

interface WallComponentCandidate {
  componentId: number
  bbox: RasterBBox
  areaPx: number
}

function extractBlobMaskMat(params: {
  cv: OpenCV
  labels: OpenCV['Mat']
  componentId: number
  bbox: RasterBBox
  imageWidth: number
  imageHeight: number
  paddingPx: number
}): { mat: OpenCV['Mat']; originX: number; originY: number } {
  const { cv, labels, componentId, bbox, imageWidth, imageHeight } = params
  const pad = Math.max(0, Math.round(params.paddingPx))
  const leftPad = Math.min(pad, bbox.x)
  const topPad = Math.min(pad, bbox.y)
  const rightPad = Math.min(pad, Math.max(0, imageWidth - (bbox.x + bbox.width)))
  const bottomPad = Math.min(pad, Math.max(0, imageHeight - (bbox.y + bbox.height)))

  const paddedWidth = Math.max(1, bbox.width + leftPad + rightPad)
  const paddedHeight = Math.max(1, bbox.height + topPad + bottomPad)
  const originX = bbox.x - leftPad
  const originY = bbox.y - topPad
  const maskData = new Uint8Array(paddedWidth * paddedHeight)

  for (let localY = 0; localY < paddedHeight; localY += 1) {
    const globalY = originY + localY
    for (let localX = 0; localX < paddedWidth; localX += 1) {
      const globalX = originX + localX
      if (globalX < 0 || globalY < 0 || globalX >= imageWidth || globalY >= imageHeight) continue
      if (labels.intAt(globalY, globalX) !== componentId) continue
      maskData[localY * paddedWidth + localX] = 255
    }
  }

  return {
    mat: cv.matFromArray(paddedHeight, paddedWidth, cv.CV_8UC1, maskData),
    originX,
    originY,
  }
}

function paintComponentToMask(params: {
  labels: OpenCV['Mat']
  componentId: number
  bbox: RasterBBox
  imageWidth: number
  filteredData: Uint8Array
}): void {
  const { labels, componentId, bbox, imageWidth, filteredData } = params
  for (let y = bbox.y; y < bbox.y + bbox.height; y += 1) {
    for (let x = bbox.x; x < bbox.x + bbox.width; x += 1) {
      if (labels.intAt(y, x) !== componentId) continue
      filteredData[y * imageWidth + x] = 255
    }
  }
}

function buildBlobFromCandidate(params: {
  cv: OpenCV
  labels: OpenCV['Mat']
  candidate: WallComponentCandidate
  imageWidth: number
  imageHeight: number
  paddingPx: number
}): ConnectedWallBlob {
  const extracted = extractBlobMaskMat({
    cv: params.cv,
    labels: params.labels,
    componentId: params.candidate.componentId,
    bbox: params.candidate.bbox,
    imageWidth: params.imageWidth,
    imageHeight: params.imageHeight,
    paddingPx: params.paddingPx,
  })
  return {
    componentId: params.candidate.componentId,
    bbox: params.candidate.bbox,
    areaPx: params.candidate.areaPx,
    maskMat: extracted.mat,
    originX: extracted.originX,
    originY: extracted.originY,
  }
}

/**
 * Na merge + morph close: connected components → keep largest (default).
 * minBlobAreaPx geldt alleen bij keepLargestOnly=false; bij true altijd één grootste blob.
 */
export function splitConnectedWallBlobs(params: {
  cv: OpenCV
  closedMask: OpenCV['Mat']
  imageWidth: number
  imageHeight: number
  paddingPx?: number
  keepLargestOnly?: boolean
  minBlobAreaPx?: number
}): SplitConnectedWallBlobsResult {
  const { cv } = params
  const paddingPx = params.paddingPx ?? ROOM_WALL_CONNECTED_BLOB_PADDING_PX
  const keepLargestOnly = params.keepLargestOnly ?? true
  const minBlobAreaPx = Math.max(0, Math.round(params.minBlobAreaPx ?? 0))

  const labels = new cv.Mat()
  const stats = new cv.Mat()
  const centroids = new cv.Mat()
  const count = cv.connectedComponentsWithStats(
    params.closedMask,
    labels,
    stats,
    centroids,
    8,
    cv.CV_32S,
  )

  const candidates: WallComponentCandidate[] = []
  for (let componentId = 1; componentId < count; componentId += 1) {
    candidates.push({
      componentId,
      areaPx: stats.intAt(componentId, cv.CC_STAT_AREA),
      bbox: {
        x: stats.intAt(componentId, cv.CC_STAT_LEFT),
        y: stats.intAt(componentId, cv.CC_STAT_TOP),
        width: stats.intAt(componentId, cv.CC_STAT_WIDTH),
        height: stats.intAt(componentId, cv.CC_STAT_HEIGHT),
      },
    })
  }

  // ESC:W-01 (E)
  const keptCandidates = keepLargestOnly
    ? candidates.length > 0
      ? [candidates.reduce((best, next) => (next.areaPx > best.areaPx ? next : best))]
      : []
    : minBlobAreaPx > 0
      ? candidates.filter((candidate) => candidate.areaPx >= minBlobAreaPx)
      : candidates

  const keptWallMaskData = new Uint8Array(params.imageWidth * params.imageHeight)
  const blobs: ConnectedWallBlob[] = []

  for (const candidate of keptCandidates) {
    paintComponentToMask({
      labels,
      componentId: candidate.componentId,
      bbox: candidate.bbox,
      imageWidth: params.imageWidth,
      filteredData: keptWallMaskData,
    })
    blobs.push(
      buildBlobFromCandidate({
        cv,
        labels,
        candidate,
        imageWidth: params.imageWidth,
        imageHeight: params.imageHeight,
        paddingPx,
      }),
    )
  }

  centroids.delete()
  stats.delete()
  labels.delete()

  const filteredMask = cv.matFromArray(
    params.imageHeight,
    params.imageWidth,
    cv.CV_8UC1,
    keptWallMaskData,
  )

  return {
    blobs,
    filteredMask,
    keptWallMaskData,
    removedBlobCount: Math.max(0, candidates.length - keptCandidates.length),
    componentCount: candidates.length,
  }
}

export function releaseConnectedWallBlobs(blobs: ConnectedWallBlob[]): void {
  for (const blob of blobs) {
    blob.maskMat.delete()
  }
}
