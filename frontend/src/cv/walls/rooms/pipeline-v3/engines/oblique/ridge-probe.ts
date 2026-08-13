/**
 * V3 rug-sonde — loodrechte afstand van een segment tot de hartlijn van de muur.
 *
 * Gemeten op `schuine-gevel-bg`: een rechte gevellijn ligt 0,5 px van de rug,
 * echte H/V-muren 0–1,5 px, trap-treden 12–26 px, stootborden 63–70 px. Daarmee
 * is dit een lidmaatschapstest die geen topologie nodig heeft en dus ook ná
 * laag 10 nog geldig is.
 */
import type { Segment } from '@/cv/port/wallGraph'
import { median } from '@/cv/util/stats'
import { segmentLength } from '@/cv/walls/rooms/wall-segment-geometry'

/** Stap van de loodrechte klim (px). */
const RIDGE_CLIMB_STEP_PX = 0.5

/** Een DT-dip tot deze diepte geldt nog als plateau, niet als afdaling. */
const RIDGE_PLATEAU_TOLERANCE_PX = 0.5

export type RidgeField = {
  distanceMap: Float32Array
  width: number
  height: number
  /** Harde bovengrens voor de loodrechte klim (px). */
  maxSearchPx: number
  /** Stap langs het segment (px). */
  sampleStepPx: number
}

export type RidgeProbe = {
  samples: number
  offsetMedianPx: number
  offsetP90Px: number
  offsetMaxPx: number
  /** Halve muurdikte op de lijn zelf. */
  dtMedianPx: number
  /** Wat er aan DT te winnen valt door naar de rug te schuiven. */
  dtDeficitMedianPx: number
  /** Aandeel samples dat binnen de inkt valt. */
  inInkRatio: number
}

function sampleDt(field: RidgeField, x: number, y: number): number {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= field.width || yi >= field.height) return 0
  const dt = field.distanceMap[yi * field.width + xi] ?? 0
  return Number.isFinite(dt) && dt > 0 ? dt : 0
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[index] ?? 0
}

/**
 * Klim loodrecht bergopwaarts tot de DT daalt. Bewust géén maximum in een venster:
 * bergopwaarts lopen kan niet naar de rug van een buurmuur springen, want daarvoor
 * moet je eerst door de tussenruimte (DT 0) heen. Zonder die klim meet een dunne
 * binnenmuur naast een dikke gevel een valse offset ter grootte van het venster.
 */
function climbToRidge(
  field: RidgeField,
  x: number,
  y: number,
  nx: number,
  ny: number,
): { offsetPx: number; ridgeDt: number } {
  const own = sampleDt(field, x, y)
  let bestDt = own
  let bestOffset = 0
  for (const direction of [-1, 1]) {
    let peak = own
    for (let d = RIDGE_CLIMB_STEP_PX; d <= field.maxSearchPx; d += RIDGE_CLIMB_STEP_PX) {
      const offset = direction * d
      const dt = sampleDt(field, x + nx * offset, y + ny * offset)
      if (dt + RIDGE_PLATEAU_TOLERANCE_PX < peak) break
      if (dt > peak) peak = dt
      if (dt > bestDt) {
        bestDt = dt
        bestOffset = offset
      }
    }
  }
  return { offsetPx: Math.abs(bestOffset), ridgeDt: bestDt }
}

/** `null` als het segment te kort is om te sampelen. */
export function probeSegmentRidge(seg: Segment, field: RidgeField): RidgeProbe | null {
  const length = segmentLength(seg)
  if (length < 1) return null
  const ux = (seg.b.x - seg.a.x) / length
  const uy = (seg.b.y - seg.a.y) / length
  const nx = -uy
  const ny = ux
  const steps = Math.max(1, Math.floor(length / field.sampleStepPx))

  const offsets: number[] = []
  const deficits: number[] = []
  const ownDts: number[] = []
  let inInk = 0
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * length
    const x = seg.a.x + ux * t
    const y = seg.a.y + uy * t
    const own = sampleDt(field, x, y)
    if (own > 0) inInk += 1
    const ridge = climbToRidge(field, x, y, nx, ny)
    offsets.push(ridge.offsetPx)
    deficits.push(ridge.ridgeDt - own)
    ownDts.push(own)
  }

  const sortedOffsets = [...offsets].sort((a, b) => a - b)
  return {
    samples: offsets.length,
    offsetMedianPx: median(offsets),
    offsetP90Px: quantile(sortedOffsets, 0.9),
    offsetMaxPx: sortedOffsets[sortedOffsets.length - 1] ?? 0,
    dtMedianPx: median(ownDts),
    dtDeficitMedianPx: median(deficits),
    inInkRatio: offsets.length > 0 ? inInk / offsets.length : 0,
  }
}
