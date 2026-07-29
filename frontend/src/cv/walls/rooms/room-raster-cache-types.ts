import type { CanvasLike } from '@/cv/port/canvasEnv'
import type { RoomRasterClass } from './room-ink-classify'
import type { SerializedRoomClassifyState } from '../strategies/room-first'
import type { InkDiffBounds } from './room-ink-symmetric'
import type { FaceDualSpace } from './face-dual-space'
import type { FaceBBoxIndex } from './face-bbox-index'
import type {
  FaceOverridePinTarget,
  SyncPinnedClassOverridesParams,
  SyncPinnedClassResult,
  SyncPinnedTargetClass,
} from './face-override-sync'

export type {
  FaceOverridePinTarget,
  SyncPinnedClassOverridesParams,
  SyncPinnedClassResult,
  SyncPinnedTargetClass,
}

export interface RoomRasterCache {
  state: SerializedRoomClassifyState
  faceOverrides: Map<number, RoomRasterClass>
  pinnedRoots: Set<number>
  /** Legacy URL — live pad gebruikt previewMaskCanvas. */
  previewMaskUrl: string | null
  /** Persistente live-review overlay (geen PNG roundtrip). */
  previewMaskCanvas: CanvasLike | null
  /**
   * Opening-wit + wall-ink face-bron (lazy via ensureFaceDualSpace).
   * Alleen voor deuren/ramen/probe/export — niet voor classify toggle/box.
   */
  faceDual: FaceDualSpace | null
  /**
   * Epoch voor dual class/override/parentMap/labels invalidatie.
   * Bump i.p.v. gesorteerde class-signature string.
   */
  faceDualClassEpoch: number
  /** Epoch waarop faceDual is gebouwd; mismatch → rebuild. */
  faceDualBuiltClassEpoch: number
  /** Buffer-refs waarmee faceDual is gebouwd. */
  faceDualBuiltRaw: Int32Array | null
  faceDualBuiltInk: Int32Array | null
  /**
   * Persistente white/ink face-bboxes voor classify dirty/box.
   * Los van FaceDualSpace; class-toggle invalideert dit niet.
   */
  faceBBox: FaceBBoxIndex | null
}

export interface FaceClassChangeResult {
  changedLabels: number[]
  /** Bounds die opnieuw geschilderd moeten worden; null = full repaint. */
  dirtyBounds: InkDiffBounds | null
  didInkReresolve: boolean
}

export interface RasterBBox {
  x: number
  y: number
  width: number
  height: number
}
