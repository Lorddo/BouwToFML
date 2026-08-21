import type {
  DetectionOverlay,
  GapOverlay,
  JunctionOverlay,
  OcrTextOverlay,
  SegmentOverlay,
  WallMatchOverlay,
} from '@/platform/canvas'
import type { ElementClass } from '@/core/extraction/types'
import type { SelectionRect } from '@/platform/selection'
import { SELECTION_COLORS } from '@/platform/selection'
import type { HScaleState } from '@/platform/calibration'
import type { PolygonPoint, PolygonToolMode } from '@/cv/tools/polygon'
import type { DebugProbeMode } from '@/ui/composables/workspace/useWorkspaceDebugProbe'
import type { InkToolId, FaceToolId } from '@/ui/components/canvas/canvas-toolbelt.types'

export type FloorplanCanvasProps = {
  imageSrc?: string
  lbeRects?: SelectionRect[]
  previewRect?: SelectionRect | null
  /** Project min/mid/max cm — labels op muur-LBE. */
  wallThicknessLimits?: { minCm: number; midCm: number; maxCm: number } | null
  drawType?: ElementClass | null
  typeColors?: Partial<Record<ElementClass, string>>
  wallMatchOverlays?: WallMatchOverlay[]
  detectionOverlays?: DetectionOverlay[]
  segmentOverlays?: SegmentOverlay[]
  junctionOverlays?: JunctionOverlay[]
  gapOverlays?: GapOverlay[]
  ocrTextOverlays?: OcrTextOverlay[]
  /** Volledige-plaat overlay (bv. room face-kleuren): canvas of legacy URL. */
  rasterOverlaySrc?: CanvasImageSource | string | null
  /** Ophogen na in-place canvas-paint zodat Konva opnieuw tekent. */
  rasterOverlayRevision?: number
  showRasterOverlay?: boolean
  faceSelectEnabled?: boolean
  lbeEnabled?: boolean
  imageDimmed?: boolean
  eraserEnabled?: boolean
  eraserRadius?: number
  polygonToolMode?: PolygonToolMode
  polygonDraftPoints?: PolygonPoint[]
  showScaleOverlay?: boolean
  scaleState?: HScaleState | null
  selectedRectId?: string | null
  /** Live preview op onderlegger-stap: + klokwijs (graden). */
  rotationPreviewDeg?: number
  /** Debug-probe: pixel-coördinaten ophalen voor AI-gesprekken. */
  probeEnabled?: boolean
  probeMode?: DebugProbeMode
  /** Shift+klik op OCR-vak → verwijderen uit masker. */
  ocrHitRemoveEnabled?: boolean
  /** Inkt-bewerking op stap 2/3. */
  inkTool?: InkToolId | null
  inkBrushSize?: number
  /** Vlak-classificatie via box-selectie op stap 3. */
  faceTool?: FaceToolId | null
  /** Tool-instructie in balk boven canvas (stap 2/3 toolbelt). */
  wallStampBounds?: { x: number; y: number; width: number; height: number } | null
  wallStampInteractive?: boolean
  /** Ghost PNG (baseBounds) — live stretch naar wallStampBounds. */
  wallStampGhostSrc?: string | null
  /** false = stempelset (alleen sleep); default true. */
  wallStampAllowResize?: boolean
  /** Huidige tool-hint voor topbar i-modal. */
  instructionHint?: string
  canUndo?: boolean
  canRedo?: boolean
  canvasFullscreen?: boolean
  helpKeys?: readonly string[]
}

export const FLOORPLAN_CANVAS_PROP_DEFAULTS = {
  imageSrc: '',
  lbeRects: () => [] as SelectionRect[],
  previewRect: null,
  drawType: null,
  typeColors: () => SELECTION_COLORS,
  wallMatchOverlays: () => [] as WallMatchOverlay[],
  detectionOverlays: () => [] as DetectionOverlay[],
  segmentOverlays: () => [] as SegmentOverlay[],
  junctionOverlays: () => [] as JunctionOverlay[],
  gapOverlays: () => [] as GapOverlay[],
  ocrTextOverlays: () => [] as OcrTextOverlay[],
  rasterOverlaySrc: null,
  rasterOverlayRevision: 0,
  showRasterOverlay: false,
  faceSelectEnabled: false,
  lbeEnabled: false,
  imageDimmed: false,
  eraserEnabled: false,
  eraserRadius: 10,
  polygonToolMode: null,
  polygonDraftPoints: () => [] as PolygonPoint[],
  showScaleOverlay: false,
  scaleState: null,
  selectedRectId: null,
  rotationPreviewDeg: 0,
  probeEnabled: false,
  probeMode: 'region' as DebugProbeMode,
  ocrHitRemoveEnabled: false,
  inkTool: null,
  inkBrushSize: 4,
  faceTool: null,
  instructionHint: '',
  canUndo: false,
  canRedo: false,
  canvasFullscreen: false,
  helpKeys: () => [] as string[],
  wallStampBounds: null,
  wallStampInteractive: false,
  wallStampGhostSrc: null,
  wallStampAllowResize: true,
}

export type FloorplanCanvasEmits = {
  lbeStart: [x: number, y: number]
  lbeMove: [x: number, y: number]
  lbeEnd: []
  lbeCancel: []
  imageLoaded: [width: number, height: number]
  eraseStroke: [points: Array<{ x: number; y: number }>, radius: number]
  polygonPoint: [x: number, y: number]
  polygonComplete: [points: PolygonPoint[]]
  polygonCancel: []
  polygonUndoPoint: []
  moveScaleHandle: [handle: keyof HScaleState, value: number]
  selectRect: [id: string | null]
  rectUpdate: [id: string, bounds: { x: number; y: number; width: number; height: number }]
  rectDelete: [id: string]
  faceClick: [x: number, y: number]
  faceBoxSelect: [bounds: { x: number; y: number; width: number; height: number }]
  probeSample: [
    sample: {
      kind: 'point' | 'region'
      point: { x: number; y: number }
      region?: { x: number; y: number; width: number; height: number }
    },
  ]
  ocrHitRemove: [key: string]
  inkBrushStroke: [points: Array<{ x: number; y: number }>, radius: number]
  inkEraseStroke: [points: Array<{ x: number; y: number }>, radius: number]
  inkLine: [start: { x: number; y: number }, end: { x: number; y: number }, lineWidth: number]
  inkRect: [bounds: { x: number; y: number; width: number; height: number }, lineWidth: number]
  wallStampBoundsChange: [bounds: { x: number; y: number; width: number; height: number }]
  undo: []
  redo: []
  'update:canvasFullscreen': [value: boolean]
}
