import type { RasterRoomComponent } from './room-raster'
import { resolveMergedLabel } from './room-raster-merge'

export type RoomRasterClass =
  | 'wall'
  | 'surface'
  | 'unknown'
  | 'outside'
  | 'door'
  | 'window'
  | 'doorframe'

export type RoomClassificationGroupBy = 'merged' | 'component'

/**
 * Tot L11/L12 is `door` alleen UI/Stage-2-metadata → unknown in muurmasker.
 * `window` / `doorframe` tellen als muur in L0-mask (L1–L10 zien binary mask);
 * window-geometrie → L14; doorframe blijft mask-only (geen FML-opening).
 * Zie `.cursor/docs/archive/wall-face-class-flow.md` + `.cursor/docs/door-detection-flow.md`.
 */
export function toWallPipelineClass(cls: RoomRasterClass): RoomRasterClass {
  if (cls === 'door') return 'unknown'
  if (cls === 'window' || cls === 'doorframe') return 'wall'
  return cls
}

/**
 * Faces die in het ink-muurmasker horen.
 * `window` / `doorframe` meenemen; `door` niet (alleen bogen → later L11/L12).
 */
export function isWallMaskClass(cls: RoomRasterClass): boolean {
  return cls === 'wall' || cls === 'window' || cls === 'doorframe'
}

/** Ink-eater-rol voor resolve-boost/rank — niet de UI-kleur. */
export type InkTopologyBucket = 'wallish' | 'outside' | 'other'

export function inkTopologyBucket(cls: RoomRasterClass): InkTopologyBucket {
  if (cls === 'wall' || cls === 'window' || cls === 'doorframe') return 'wallish'
  if (cls === 'outside') return 'outside'
  return 'other'
}

/** True als class-wissel ink-toewijzing kan veranderen (wall-boost/rank). */
export function needsInkReresolve(prev: RoomRasterClass, next: RoomRasterClass): boolean {
  return inkTopologyBucket(prev) !== inkTopologyBucket(next)
}

/** Map classificatie voor muur-pipeline (door → unknown, window → wall); keys blijven. */
export function mapClassesForWallPipeline(
  classification: Map<number, RoomRasterClass>,
): Map<number, RoomRasterClass> {
  const out = new Map<number, RoomRasterClass>()
  for (const [label, cls] of classification) {
    out.set(label, toWallPipelineClass(cls))
  }
  return out
}

function pickOverridesForClass(
  overrides: Map<number, RoomRasterClass>,
  cls: RoomRasterClass,
): Map<number, RoomRasterClass> {
  const out = new Map<number, RoomRasterClass>()
  for (const [label, value] of overrides) {
    if (value === cls) out.set(label, cls)
  }
  return out
}

/** Alleen `door`-overrides (voor terugzetten op locked display-classificatie). */
export function pickDoorOverrides(
  overrides: Map<number, RoomRasterClass>,
): Map<number, RoomRasterClass> {
  return pickOverridesForClass(overrides, 'door')
}

/** Alleen `window`-overrides (voor terugzetten op locked display-classificatie). */
export function pickWindowOverrides(
  overrides: Map<number, RoomRasterClass>,
): Map<number, RoomRasterClass> {
  return pickOverridesForClass(overrides, 'window')
}

/** Alleen `doorframe`-overrides (voor terugzetten op locked display-classificatie). */
export function pickDoorframeOverrides(
  overrides: Map<number, RoomRasterClass>,
): Map<number, RoomRasterClass> {
  return pickOverridesForClass(overrides, 'doorframe')
}

/** Sleutel voor classificatie-lookup: merged root of ruw component-label. */
export function resolveClassificationKey(
  rawLabel: number,
  parentMap: Map<number, number>,
  groupBy: RoomClassificationGroupBy,
): number {
  if (rawLabel <= 0) return 0
  return groupBy === 'component' ? rawLabel : resolveMergedLabel(rawLabel, parentMap)
}

/** Classificatie per pixel — component-label heeft voorrang op merged parent. */
export function resolvePixelClassification(
  rawLabel: number,
  parentMap: Map<number, number>,
  classificationByLabel: Map<number, RoomRasterClass>,
  groupBy: RoomClassificationGroupBy = 'merged',
): RoomRasterClass {
  if (rawLabel <= 0) return 'outside'
  if (groupBy === 'component') {
    const direct = classificationByLabel.get(rawLabel)
    if (direct !== undefined) return direct
    const merged = resolveMergedLabel(rawLabel, parentMap)
    return classificationByLabel.get(merged) ?? 'surface'
  }
  const root = resolveMergedLabel(rawLabel, parentMap)
  return classificationByLabel.get(root) ?? 'surface'
}

/**
 * Class-at-label voor deur-stages (attach / snap-doorframe / surround).
 * Component-first: raw → merged → `missing`. `label <= 0` → `missing`.
 *
 * Callers moeten `missing` expliciet kiezen (`undefined` vs `'surface'`) —
 * niet verbreden van `resolvePixelClassification` (die `'outside'` bij ≤0 geeft).
 */
export function resolveClassAtLabel(
  label: number,
  parentMap: Map<number, number>,
  classificationByLabel: Map<number, RoomRasterClass>,
  missing: RoomRasterClass | undefined,
): RoomRasterClass | undefined {
  if (label <= 0) return missing
  return (
    classificationByLabel.get(label) ??
    classificationByLabel.get(resolveMergedLabel(label, parentMap)) ??
    missing
  )
}

const CLASSIFICATION_PRIORITY: Record<RoomRasterClass, number> = {
  wall: 5,
  window: 5,
  doorframe: 5,
  door: 4,
  unknown: 3,
  surface: 2,
  outside: 1,
}

function pickDominantRoomClass(classes: RoomRasterClass[]): RoomRasterClass {
  let best: RoomRasterClass = 'surface'
  let bestScore = 0
  for (const cls of classes) {
    const score = CLASSIFICATION_PRIORITY[cls] ?? 0
    if (score > bestScore) {
      bestScore = score
      best = cls
    }
  }
  return best
}

/** Heraan classificatie-keys na parentMap-wijziging door ink-resolve. */
export function remapClassificationForParentMap(params: {
  classificationByLabel: Map<number, RoomRasterClass>
  components: RasterRoomComponent[]
  priorParentMap: Map<number, number>
  parentMap: Map<number, number>
}): Map<number, RoomRasterClass> {
  const { classificationByLabel, components, priorParentMap, parentMap } = params
  const roots = new Set(components.map((c) => resolveMergedLabel(c.label, parentMap)))
  const result = new Map<number, RoomRasterClass>()

  for (const root of roots) {
    const members = components.filter((c) => resolveMergedLabel(c.label, parentMap) === root)
    if (members.some((c) => c.touchesBorder)) {
      result.set(root, 'outside')
      continue
    }
    const classes = members
      .map((c) => {
        const oldRoot = resolveMergedLabel(c.label, priorParentMap)
        return classificationByLabel.get(oldRoot) ?? classificationByLabel.get(c.label)
      })
      .filter((cls): cls is RoomRasterClass => cls !== undefined)
    result.set(root, classes.length > 0 ? pickDominantRoomClass(classes) : 'surface')
  }
  return result
}

/**
 * Handmatige face-class cyclus (Shift-klik controlefase):
 * - door → unknown → wall ↔ unknown
 * - window → wall ↔ unknown
 * - surface → wall ↔ unknown
 * - doorframe → wall (wallish framing)
 * - outside blijft buiten cyclus
 */
export function cycleFaceClassification(current: RoomRasterClass): RoomRasterClass {
  if (current === 'outside') return 'outside'
  if (current === 'door') return 'unknown'
  if (current === 'window' || current === 'doorframe' || current === 'surface') return 'wall'
  if (current === 'wall') return 'unknown'
  if (current === 'unknown') return 'wall'
  return 'wall'
}

export function applyFaceClassificationOverrides(
  classificationByLabel: Map<number, RoomRasterClass>,
  overrides: Map<number, RoomRasterClass>,
): Map<number, RoomRasterClass> {
  if (overrides.size === 0) return new Map(classificationByLabel)
  const merged = new Map(classificationByLabel)
  for (const [root, cls] of overrides.entries()) {
    merged.set(root, cls)
  }
  return merged
}
