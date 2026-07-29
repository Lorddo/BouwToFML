import type { WallRenderStyle } from '@/core/extraction/geometric-signature'
import type { RefFaceDualSpace } from './ref-face-dual-space'

export type RefRect = {
  id?: string
  x: number
  y: number
  width: number
  height: number
}

export type RefBBox = {
  x: number
  y: number
  width: number
  height: number
}

export type RefPoint = { x: number; y: number }

export type RefFaceRole = 'interior' | 'outside' | 'head' | 'unknown'

export type RefLine = {
  a: RefPoint
  b: RefPoint
  lengthPx: number
  angleDeg: number
  /** Relatief t.o.v. opening-/muuras: parallel | perp | other */
  relation: 'parallel' | 'perp' | 'arc' | 'other'
}

/** Eén label per wit vlak (gescheiden door inkt); pixels binnen een vlak delen dat label. */
export type RefFace = {
  label: number
  areaPx: number
  /** BBox binnen de (sub)crop */
  bbox: RefBBox
  centroid: RefPoint
  /** Relatieve positie in crop 0..1 */
  relativeCentroid: RefPoint
  inkRatio: number
  aspectRatio: number
  compactness: number
  touchesBorder: boolean
  role: RefFaceRole
  /** Geapproximeerde gesloten contour op rechte face-crop. */
  approxPolygon?: RefPoint[]
}

/**
 * Individuele opening-unit.
 * bbox = kozijn→kozijn wanneer koppen gedetecteerd zijn (beide kozijnen mee), anders ink-component.
 */
export type RefBlobUnit = {
  index: number
  areaPx: number
  bbox: RefBBox
  centroid: RefPoint
  /** true als dit de grootste ink-component is */
  isPrimary: boolean
  source: 'component' | 'projection_split' | 'kozijn_span'
  /** Of beide kopeinden in de unit-bbox zitten */
  includesBothHeads?: boolean
}

export type KozijnFaceMetrics = {
  /** Breedte wit vlak (bbox) op rechte face-crop */
  widthPx: number
  /** Hoogte wit vlak (bbox) op rechte face-crop */
  heightPx: number
  /** Pixeloppervlak wit vlak */
  areaPx: number
  /** Hart van het vlak (centroid) op rechte face-crop */
  centroidX: number
  centroidY: number
}

export type OpeningRefPrimitives = {
  kopeinde: boolean
  /** Meest linkse vlak op rechte face-crop — alleen bij kopeinde */
  kozijnLinks: KozijnFaceMetrics | null
  /** Meest rechtse vlak op rechte face-crop — alleen bij kopeinde */
  kozijnRechts: KozijnFaceMetrics | null
  /** Som oppervlak links + rechts kozijn */
  kozijnTotaalOppervlakPx: number | null
  /** Alleen relevant voor deuren */
  draaicirkel?: boolean
  /** Snijpunt van de 2 best-ondersteunde assen in de draaicirkel (rechte face-crop). */
  scharnierPunt?: RefPoint | null
  /** Bonus: hoek tussen die 2 assen in graden. */
  scharnierGraden?: number | null
  /** Horizontale deurlijn in het midden — alleen bij draaicirkel=false */
  middenlijn?: boolean
  middenlijnSpanPx?: number | null
}

export type RefImageBundle = {
  originalCropPng: string
  bwCropPng: string
  /** Faces op volledige ref-crop (outside grijs) */
  faceOverlayPng: string
  /** Face-gedreven crop (voor vectorisatie) */
  faceCropPng: string
  /** Raw contour-vectors (alle inkt) */
  lineOverlayPng: string
  /** Eindresultaat na straighten-last */
  straightenedPng: string
  /** Polygon-overlay van alle relevante faces op rechte face-crop. */
  facePolygonOverlayPng?: string
  /** Gegroepeerde contouren op face-kleuren (cyaan=as, oranje=boven, roze=onder). */
  combinedPolygonOverlayPng?: string
  /** Gegroepeerde kopeinde-as-contouren op wit (los, goed leesbaar). */
  groupedPolygonCleanPng?: string
  /** Draaicirkel: 2 assen + groen scharnierpunt op rechte face-crop. */
  swingHingeOverlayPng?: string
}

export type RefLineProfile = {
  lines: RefLine[]
  parallelCount: number
  perpCount: number
  arcCount: number
  otherCount: number
}

export type RefFaceProfile = {
  faces: RefFace[]
  totalAreaPx: number
  faceCount: number
  /** Label-mat (crop-lokaal), 0 = inkt/geen face. */
  labelsData?: Int32Array
  /** White + ink-inclusieve geom (zelfde labels); faces blijven white-default. */
  dual?: RefFaceDualSpace
}

export type RefUnitFacePolygon = {
  label: number
  role: RefFaceRole
  areaPx: number
  approxPolygon: RefPoint[]
}

/** Zone t.o.v. kopeinde-as (hoogteband van eindkozijnen). */
export type CombinedFacePolygonZone = 'on_axis' | 'above' | 'below'

export type CombinedFacePolygonPart = {
  zone: CombinedFacePolygonZone
  polygon: RefPoint[]
}

export type OpeningRefUnitProfile = {
  unit: RefBlobUnit
  lineProfile: RefLineProfile
  faceProfile: RefFaceProfile
  facePolygons: RefUnitFacePolygon[]
  primitives: OpeningRefPrimitives
}

export type OpeningRefProfile = {
  kind: 'door' | 'window'
  rect: RefRect
  /** Rechte face-crop (na straighten) */
  cropWidth: number
  cropHeight: number
  /** Originele LBE-selectie vóór face-trim/straighten — px voor algemene categorieën */
  sourceCropWidth: number
  sourceCropHeight: number
  orientation: 'horizontal' | 'vertical'
  /** otsu | adaptive — wat echt gebruikt is */
  bwMode: 'otsu' | 'adaptive' | 'wallLayer'
  /** As-align correctie in UI-graden (0 = geen) */
  skewCorrectedDeg: number
  primaryBlob: RefBlobUnit | null
  /** Primaire contour: grootste on_axis (kopeinde-as), anders grootste overall. */
  combinedFacePolygon: RefPoint[]
  /**
   * Contouren gesplitst op kopeinde-as:
   * on_axis = velden in hoogteband van de koppen; above/below = erbuiten.
   * Zonder kopeinde: één union zoals voorheen (zone on_axis).
   */
  combinedFacePolygons?: RefPoint[][]
  combinedFacePolygonParts?: CombinedFacePolygonPart[]
  units: OpeningRefUnitProfile[]
  images: RefImageBundle
}

export type WallRefProfile = {
  kind: 'wall'
  rect: RefRect
  cropWidth: number
  cropHeight: number
  orientation: 'horizontal' | 'vertical'
  bwMode: 'otsu' | 'adaptive' | 'wallLayer'
  skewCorrectedDeg: number
  thicknessPx: number | null
  renderStyle: WallRenderStyle
  renderStyleLabel: string
  renderStyleConfidence: number
  renderStyleScores: Record<WallRenderStyle, number>
  parallelLineCount?: number
  primaryBlob: RefBlobUnit | null
  units: RefBlobUnit[]
  lineProfile: RefLineProfile
  faceProfile: RefFaceProfile
  images: RefImageBundle
}

export type ReferenceAnalysisReport = {
  exportedAt: string
  drawing: string | null
  wall: WallRefProfile | null
  openings: OpeningRefProfile[]
}

export function wallRenderStyleLabel(style: WallRenderStyle): string {
  if (style === 'solid') return 'Solid'
  if (style === 'parallel_lines') return 'Parallelle lijnen'
  return 'Arcering'
}
