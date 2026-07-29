/** Muurweergave op deze tekening — bepaalt welk detectiepad loopt. */
export interface OpeningLineFingerprint {
  rawLineCount: number
  orientation: 'horizontal' | 'vertical'
  parallelPositions: number[]
  perpPositions: number[]
  medianLengthPx: number
}

export type WallRenderStyle = 'solid' | 'parallel_lines' | 'details'

export interface WallLineFingerprint {
  /** Aantal ruwe lijnsegmenten binnen voorbeeldvak. */

  rawLineCount: number

  /** Dominante richting van die ruwe lijnen. */

  dominantOrientation: 'horizontal' | 'vertical'

  /** Gemiddelde lijnlengte uit ruwe lijnset in voorbeeldvak. */

  medianLengthPx: number

  /** Typische afstand tussen parallelle lijnen in voorbeeldvak. */

  spacingPx?: number
}

export interface WallSignature {
  renderStyle: WallRenderStyle

  /** Auto-detectie of handmatig gekozen door tekenaar. */

  renderStyleSource?: 'auto' | 'manual'

  /** Betrouwbaarheid van auto-detectie (0–1); alleen bij source=auto. */

  renderStyleConfidence?: number

  /** Envelop-dikte loodrecht op muur (px, werkschaal) — ook kernel voor matching. */

  thicknessPx: number

  /** Voor parallel_lines: aantal parallelle inktlijnen in dwarsdoorsnede (2, 3, 5, …). */

  parallelLineCount?: number

  /** Voor parallel_lines: afstand tussen buitenste lijnen. */

  parallelSpacingPx?: number

  /** Toegestane hoek-tolerantie (graden). */

  angleToleranceDeg: number

  /** Minimale muurlengte (px). */

  minLengthPx: number

  /** Voor details (arcering): close-kernel + skeleton params. */

  closeKernelPx?: number

  /** Arcering-hoek filter: weggooien lijnen buiten axis-aligned band. */

  rejectDiagonalHatch: boolean

  /** Vingerafdruk van ruwe lijnen uit het voorbeeldvak. */

  lineFingerprint?: WallLineFingerprint
}

export interface DoorSignature {
  sourceExampleId?: string

  openingWidthPx: { min: number; max: number }

  hasArc: boolean

  arcRadiusPx?: { min: number; max: number }

  symbolDepthPx: number

  allowedRotationsDeg: number[]

  /** Vector-vingerafdruk (Hough-lijnen in voorbeeldvak) — primair voor matching. */
  lineFingerprint?: OpeningLineFingerprint

  /** @deprecated Afgeleid uit lineFingerprint; alleen voor oude exports. */
  innerLineCount?: number
}

export interface WindowSignature {
  sourceExampleId?: string

  /** Vector-vingerafdruk (Hough-lijnen in voorbeeldvak) — primair voor matching. */
  lineFingerprint?: OpeningLineFingerprint

  /** @deprecated Afgeleid uit lineFingerprint; alleen voor oude exports. */
  innerLineCount?: number

  insideWall: true

  openingWidthPx: { min: number; max: number }

  symbolDepthPx: number
}

export interface GeometricSignature {
  id: string

  type: 'wall' | 'door' | 'window'

  sourceExampleId: string

  wall?: WallSignature

  door?: DoorSignature

  window?: WindowSignature
}
