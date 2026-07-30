import type { OpenCV } from '@/cv/loadOpenCV'
import type { PreprocessConfig } from '@/core/extraction/types'
import { createCanvas, readRgbaMatFromCanvas, type CanvasLike } from '@/cv/port/canvasEnv'
import { measureInkBandInBox } from '@/cv/port/wallKernel'
import { bwDataToCanvas, canvasToPngDataUrl } from './ref-crop-bw'
import { extractCombinedFacePolygonParts, extractFacePolygons } from './ref-face-contour'
import { pickExtremeKozijnFaces } from './ref-general-categories'
import { renderFaceOverlayRgba } from './ref-face-profile'
import {
  renderCombinedFacePolygonOverlayRgba,
  renderFacePolygonOverlayRgba,
  renderGroupedFacePolygonsCleanRgba,
} from './ref-face-polygon-render'
import { buildLineProfile } from './ref-line-profile'
import { deriveOpeningPrimitives } from './ref-opening-primitives'
import { detectDoorSwingSector } from './ref-swing-arc'
import {
  computeSwingHinge,
  renderSwingHingeOverlayRgba,
  type SwingHingeResult,
} from './ref-swing-hinge'
import { runRefStages } from './ref-stages'
import { resolveUnitBBoxForFaces, resolveUnitFacePolygons } from './ref-unit-faces'
import { classifyWallRenderStyleFromFaceCount } from './ref-wall-render-style'
import type {
  OpeningRefProfile,
  OpeningRefUnitProfile,
  RefImageBundle,
  CombinedFacePolygonPart,
  RefPoint,
  RefRect,
  WallRefProfile,
} from './types'

type DrawLine = { a: { x: number; y: number }; b: { x: number; y: number } }

function rgbaToCanvas(rgba: Uint8ClampedArray, width: number, height: number) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const image = ctx.createImageData(width, height)
  image.data.set(rgba)
  ctx.putImageData(image, 0, 0)
  return canvas
}

function cloneRgba(data: Uint8ClampedArray): Uint8ClampedArray {
  const copy = new Uint8ClampedArray(data.length)
  copy.set(data)
  return copy
}

function drawPoint(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  rgb: [number, number, number],
  thickness = 1,
) {
  const radius = Math.max(0, Math.floor(thickness / 2))
  for (let yy = y - radius; yy <= y + radius; yy += 1) {
    for (let xx = x - radius; xx <= x + radius; xx += 1) {
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
      const o = (yy * width + xx) * 4
      out[o] = rgb[0]
      out[o + 1] = rgb[1]
      out[o + 2] = rgb[2]
      out[o + 3] = 255
    }
  }
}

function drawLinesOnRgba(
  base: Uint8ClampedArray,
  width: number,
  height: number,
  lines: DrawLine[],
  rgb: [number, number, number],
  thickness = 1,
): Uint8ClampedArray {
  const out = cloneRgba(base)
  for (const line of lines) {
    const dx = line.b.x - line.a.x
    const dy = line.b.y - line.a.y
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)))
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps
      const x = Math.round(line.a.x + dx * t)
      const y = Math.round(line.a.y + dy * t)
      drawPoint(out, width, height, x, y, rgb, thickness)
    }
  }
  return out
}

async function buildImages(params: {
  selectedCanvas: CanvasLike
  selectedBwData: Uint8Array
  selectedWidth: number
  selectedHeight: number
  faceCroppedBwData: Uint8Array
  faceCroppedWidth: number
  faceCroppedHeight: number
  preRawSegments: DrawLine[]
  straightenedBwData: Uint8Array
  straightenedWidth: number
  straightenedHeight: number
  facePolygons?: Array<{ label: number; points: RefPoint[] }>
  combinedFacePolygons?: RefPoint[][]
  combinedFacePolygonParts?: CombinedFacePolygonPart[]
  swingHinges?: SwingHingeResult[]
  /** Muur: toon faces met border-seal (zelfde als classificatie). */
  sealBorders?: boolean
}): Promise<RefImageBundle> {
  const seal = params.sealBorders === true
  const bwCanvas = bwDataToCanvas(
    params.selectedBwData,
    params.selectedWidth,
    params.selectedHeight,
  )
  const fullFaces = renderFaceOverlayRgba(
    params.selectedBwData,
    params.selectedWidth,
    params.selectedHeight,
    undefined,
    { shadeOutside: true, sealBorders: seal },
  )
  const faceCropFaces = renderFaceOverlayRgba(
    params.faceCroppedBwData,
    params.faceCroppedWidth,
    params.faceCroppedHeight,
    undefined,
    { shadeOutside: false, sealBorders: seal },
  )
  const rawVectors = drawLinesOnRgba(
    faceCropFaces,
    params.faceCroppedWidth,
    params.faceCroppedHeight,
    params.preRawSegments,
    [245, 158, 11],
    1,
  )
  const straightFaces = renderFaceOverlayRgba(
    params.straightenedBwData,
    params.straightenedWidth,
    params.straightenedHeight,
    undefined,
    { shadeOutside: false, sealBorders: seal },
  )
  const facePolygonOverlay =
    params.facePolygons && params.facePolygons.length > 0
      ? renderFacePolygonOverlayRgba({
          data: params.straightenedBwData,
          width: params.straightenedWidth,
          height: params.straightenedHeight,
          polygons: params.facePolygons,
        })
      : null
  const hasGroupedParts =
    !!params.combinedFacePolygonParts &&
    params.combinedFacePolygonParts.some((part) => part.polygon.length >= 3)
  const combinedPolygonOverlay =
    hasGroupedParts ||
    (params.combinedFacePolygons &&
      params.combinedFacePolygons.some((polygon) => polygon.length >= 3))
      ? renderCombinedFacePolygonOverlayRgba({
          data: params.straightenedBwData,
          width: params.straightenedWidth,
          height: params.straightenedHeight,
          polygons: params.combinedFacePolygons ?? [],
          parts: params.combinedFacePolygonParts,
        })
      : null
  const groupedPolygonClean =
    hasGroupedParts && params.combinedFacePolygonParts
      ? renderGroupedFacePolygonsCleanRgba({
          width: params.straightenedWidth,
          height: params.straightenedHeight,
          parts: params.combinedFacePolygonParts,
        })
      : null
  const swingHingeOverlay =
    params.swingHinges && params.swingHinges.length > 0
      ? renderSwingHingeOverlayRgba({
          data: params.straightenedBwData,
          width: params.straightenedWidth,
          height: params.straightenedHeight,
          hinges: params.swingHinges,
        })
      : null
  return {
    originalCropPng: await canvasToPngDataUrl(params.selectedCanvas),
    bwCropPng: await canvasToPngDataUrl(bwCanvas),
    faceOverlayPng: await canvasToPngDataUrl(
      rgbaToCanvas(fullFaces, params.selectedWidth, params.selectedHeight),
    ),
    faceCropPng: await canvasToPngDataUrl(
      rgbaToCanvas(faceCropFaces, params.faceCroppedWidth, params.faceCroppedHeight),
    ),
    lineOverlayPng: await canvasToPngDataUrl(
      rgbaToCanvas(rawVectors, params.faceCroppedWidth, params.faceCroppedHeight),
    ),
    straightenedPng: await canvasToPngDataUrl(
      rgbaToCanvas(straightFaces, params.straightenedWidth, params.straightenedHeight),
    ),
    facePolygonOverlayPng: facePolygonOverlay
      ? await canvasToPngDataUrl(
          rgbaToCanvas(facePolygonOverlay, params.straightenedWidth, params.straightenedHeight),
        )
      : undefined,
    combinedPolygonOverlayPng: combinedPolygonOverlay
      ? await canvasToPngDataUrl(
          rgbaToCanvas(combinedPolygonOverlay, params.straightenedWidth, params.straightenedHeight),
        )
      : undefined,
    groupedPolygonCleanPng: groupedPolygonClean
      ? await canvasToPngDataUrl(
          rgbaToCanvas(groupedPolygonClean, params.straightenedWidth, params.straightenedHeight),
        )
      : undefined,
    swingHingeOverlayPng: swingHingeOverlay
      ? await canvasToPngDataUrl(
          rgbaToCanvas(swingHingeOverlay, params.straightenedWidth, params.straightenedHeight),
        )
      : undefined,
  }
}

function isInteriorLikeFace(face: { role: string }): boolean {
  return face.role === 'interior' || face.role === 'head'
}

// ESC:REF-09 (A)
function dropSmallWindowInteriorFaces(params: {
  kind: 'door' | 'window'
  faceProfile: OpeningRefUnitProfile['faceProfile']
  cropWidth: number
}): OpeningRefUnitProfile['faceProfile'] {
  if (params.kind !== 'window') return params.faceProfile
  const extreme = pickExtremeKozijnFaces(params.faceProfile.faces, params.cropWidth)
  if (!extreme) return params.faceProfile
  const keepLabels = new Set<number>([extreme.left.label, extreme.right.label])
  const avgFrameAreaPx = (extreme.left.areaPx + extreme.right.areaPx) / 2
  const minInteriorFaceAreaPx = Math.max(1, avgFrameAreaPx * 0.75)
  let changed = false
  const faces = params.faceProfile.faces.map((face) => {
    if (face.role !== 'interior') return face
    if (keepLabels.has(face.label)) return face
    if (face.areaPx >= minInteriorFaceAreaPx) return face
    changed = true
    return { ...face, role: 'outside' as const }
  })
  if (!changed) return params.faceProfile
  return {
    ...params.faceProfile,
    faces,
  }
}

function toBwMat(cv: OpenCV, bwData: Uint8Array, width: number, height: number) {
  const canvas = bwDataToCanvas(bwData, width, height)
  const rgba = readRgbaMatFromCanvas(cv, canvas)
  const mat = new cv.Mat()
  cv.cvtColor(rgba, mat, cv.COLOR_RGBA2GRAY, 0)
  rgba.delete()
  return mat
}

export async function runWallRefPipeline(params: {
  cv: OpenCV
  image: HTMLImageElement | HTMLCanvasElement
  rect: RefRect
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  sharedWallBwMat?: OpenCV['Mat']
}): Promise<WallRefProfile> {
  const stages = await runRefStages({
    cv: params.cv,
    image: params.image,
    rect: params.rect,
    kind: 'wall',
    preprocess: params.preprocess,
    eraserMask: params.eraserMask,
    sharedWallBwMat: params.sharedWallBwMat,
  })
  const bwMat = toBwMat(
    params.cv,
    stages.straightened.bwData,
    stages.straightened.width,
    stages.straightened.height,
  )
  try {
    const localRect = {
      x: 0,
      y: 0,
      width: stages.straightened.width,
      height: stages.straightened.height,
    }
    const measure = measureInkBandInBox(bwMat, localRect, 'horizontal')
    let thicknessPx =
      measure && measure.thicknessPx > 0 ? Math.max(1, Math.round(measure.thicknessPx)) : null
    const inference = classifyWallRenderStyleFromFaceCount(stages.finalFaceProfile.faceCount)
    const lineProfile = stages.finalLineProfile
    const parallelN = inference.parallelLineCount ?? lineProfile.parallelCount
    if (inference.renderStyle === 'solid' && parallelN === 2) {
      const parallels = lineProfile.lines.filter((line) => line.relation === 'parallel')
      let gap: number | null = null
      if (parallels.length >= 2) {
        const ys = parallels.map((line) => (line.a.y + line.b.y) / 2).sort((a, b) => a - b)
        gap = Math.abs((ys[ys.length - 1] ?? 0) - (ys[0] ?? 0))
      }
      if (gap != null && gap >= 2) thicknessPx = Math.max(1, Math.round(gap))
      else if (measure && measure.thicknessPx > 0)
        thicknessPx = Math.max(1, Math.round(measure.thicknessPx))
    } else if (measure && measure.thicknessPx > 0) {
      thicknessPx = Math.max(1, Math.round(measure.thicknessPx))
    }

    const images = await buildImages({
      selectedCanvas: stages.selected.originalCanvas,
      selectedBwData: stages.selected.bwData,
      selectedWidth: stages.selected.width,
      selectedHeight: stages.selected.height,
      faceCroppedBwData: stages.faceCropped.bwData,
      faceCroppedWidth: stages.faceCropped.width,
      faceCroppedHeight: stages.faceCropped.height,
      preRawSegments: stages.preStraightRawSegments,
      straightenedBwData: stages.straightened.bwData,
      straightenedWidth: stages.straightened.width,
      straightenedHeight: stages.straightened.height,
      sealBorders: true,
    })

    return {
      kind: 'wall',
      rect: params.rect,
      cropWidth: stages.straightened.width,
      cropHeight: stages.straightened.height,
      orientation: 'horizontal',
      bwMode: stages.bwMode,
      skewCorrectedDeg: stages.skewCorrectedDeg,
      thicknessPx,
      renderStyle: inference.renderStyle,
      renderStyleLabel:
        inference.renderStyle === 'solid'
          ? 'Solid'
          : inference.renderStyle === 'parallel_lines'
            ? 'Parallelle lijnen'
            : 'Arcering / details',
      renderStyleConfidence: inference.confidence,
      renderStyleScores: inference.scores,
      parallelLineCount: inference.parallelLineCount ?? lineProfile.parallelCount,
      primaryBlob: stages.primaryBlob,
      units: stages.units,
      lineProfile,
      faceProfile: stages.finalFaceProfile,
      images,
    }
  } finally {
    bwMat.delete()
  }
}

export async function runOpeningRefPipeline(params: {
  cv: OpenCV
  image: HTMLImageElement | HTMLCanvasElement
  rect: RefRect
  kind: 'door' | 'window'
  preprocess: PreprocessConfig
  eraserMask?: Uint8Array
  sharedWallBwMat?: OpenCV['Mat']
}): Promise<OpeningRefProfile> {
  const stages = await runRefStages({
    cv: params.cv,
    image: params.image,
    rect: params.rect,
    kind: params.kind,
    preprocess: params.preprocess,
    eraserMask: params.eraserMask,
    sharedWallBwMat: params.sharedWallBwMat,
  })
  const filteredFaceProfile = dropSmallWindowInteriorFaces({
    kind: params.kind,
    faceProfile: stages.finalFaceProfile,
    cropWidth: stages.straightened.width,
  })

  const polygonsByLabel = extractFacePolygons({
    cv: params.cv,
    data: stages.straightened.bwData,
    width: stages.straightened.width,
    height: stages.straightened.height,
    faceProfile: filteredFaceProfile,
  })
  const combinedFacePolygonParts = extractCombinedFacePolygonParts({
    cv: params.cv,
    data: stages.straightened.bwData,
    width: stages.straightened.width,
    height: stages.straightened.height,
    faceProfile: filteredFaceProfile,
  })
  const combinedFacePolygons = combinedFacePolygonParts.map((part) => part.polygon)
  const onAxisParts = combinedFacePolygonParts.filter((part) => part.zone === 'on_axis')
  // ESC:REF-10 (E)
  const primaryPool = onAxisParts.length > 0 ? onAxisParts : combinedFacePolygonParts
  const combinedFacePolygon = primaryPool[0]?.polygon ?? []
  const facesWithPolygons = filteredFaceProfile.faces.map((face) => ({
    ...face,
    approxPolygon: polygonsByLabel.get(face.label),
  }))
  const finalFaceProfile = { ...stages.finalFaceProfile, faces: facesWithPolygons }
  const allFacePolygons = facesWithPolygons
    .filter(
      (face) => isInteriorLikeFace(face) && face.approxPolygon && face.approxPolygon.length >= 3,
    )
    .map((face) => ({ label: face.label, points: face.approxPolygon! }))
  const swingHinges: SwingHingeResult[] = []

  const singleUnit = stages.units.length === 1
  const unitProfiles: OpeningRefUnitProfile[] = stages.units.map((unit) => {
    const faceBBox = resolveUnitBBoxForFaces({
      unit,
      faces: facesWithPolygons,
      cropWidth: stages.straightened.width,
      cropHeight: stages.straightened.height,
      singleUnit,
    })
    const facePolygons = resolveUnitFacePolygons(faceBBox, facesWithPolygons)
    const resolvedUnit = {
      ...unit,
      bbox: faceBBox,
    }
    const lineProfile = buildLineProfile({
      orientation: 'horizontal',
      bbox: faceBBox,
      segments: [],
      minLengthPx: 3,
      preclassified: stages.finalLineProfile.lines,
    })

    const metricsBw = stages.straightened.bwData
    const metricsW = stages.straightened.width
    const metricsH = stages.straightened.height
    const metricsBBox = faceBBox

    const draaicirkel =
      params.kind === 'door'
        ? detectDoorSwingSector({
            data: metricsBw,
            width: metricsW,
            height: metricsH,
            bbox: metricsBBox,
          })
        : undefined

    const primitives = deriveOpeningPrimitives({
      kind: params.kind,
      data: metricsBw,
      width: metricsW,
      height: metricsH,
      metricsBBox,
      orientation: 'horizontal',
      faceProfile: finalFaceProfile,
      draaicirkel,
    })
    const swingHinge =
      params.kind === 'door' && draaicirkel
        ? computeSwingHinge({
            cv: params.cv,
            bwData: metricsBw,
            width: metricsW,
            height: metricsH,
            unitBBox: metricsBBox,
          })
        : null
    if (swingHinge) swingHinges.push(swingHinge)
    const resolvedPrimitives =
      params.kind === 'door' && draaicirkel
        ? {
            ...primitives,
            scharnierPunt: swingHinge?.hinge ?? null,
            scharnierGraden: swingHinge?.angleDeg ?? null,
          }
        : primitives
    return {
      unit: resolvedUnit,
      lineProfile,
      faceProfile: finalFaceProfile,
      facePolygons,
      primitives: resolvedPrimitives,
    }
  })

  const images = await buildImages({
    selectedCanvas: stages.selected.originalCanvas,
    selectedBwData: stages.selected.bwData,
    selectedWidth: stages.selected.width,
    selectedHeight: stages.selected.height,
    faceCroppedBwData: stages.faceCropped.bwData,
    faceCroppedWidth: stages.faceCropped.width,
    faceCroppedHeight: stages.faceCropped.height,
    preRawSegments: stages.preStraightRawSegments,
    straightenedBwData: stages.straightened.bwData,
    straightenedWidth: stages.straightened.width,
    straightenedHeight: stages.straightened.height,
    facePolygons: allFacePolygons,
    combinedFacePolygons,
    combinedFacePolygonParts,
    swingHinges,
  })

  return {
    kind: params.kind,
    rect: params.rect,
    cropWidth: stages.straightened.width,
    cropHeight: stages.straightened.height,
    sourceCropWidth: stages.selected.width,
    sourceCropHeight: stages.selected.height,
    orientation: 'horizontal',
    bwMode: stages.bwMode,
    skewCorrectedDeg: stages.skewCorrectedDeg,
    primaryBlob: stages.primaryBlob,
    combinedFacePolygon,
    combinedFacePolygons,
    combinedFacePolygonParts,
    units: unitProfiles,
    images,
  }
}
