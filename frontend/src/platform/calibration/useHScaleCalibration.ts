import { computed, ref } from 'vue'

export interface HScaleState {
  xLeft: number
  xRight: number
  xGuideY: number
  yTop: number
  yBottom: number
  yGuideX: number
}

/**
 * Een scan heeft in x en y dezelfde pixeldichtheid, dus beide linialen horen op dezelfde
 * px/mm uit te komen. Meer verschil dan dit is een meetfout die nergens opvalt: de detectie
 * rekent in pixels en blijft goed, pas de FML komt platgeknepen uit de omrekening naar cm.
 * Gemeten geval: 2,359 tegen 0,229 px/mm gaf een plan van 1,1 bij 10,5 m.
 */
export const SCALE_AXIS_MISMATCH_WARN_PCT = 2

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function useHScaleCalibration() {
  const state = ref<HScaleState | null>(null)
  const distanceMmX = ref(3000)
  const distanceMmY = ref(3000)
  const confirmed = ref(false)
  /** Vastgezet bij bevestigen — crop/rotatie/upscale op stap 1 wijzigt mm niet; export (stap 4) past px/mm aan. */
  const confirmedPixelsPerMillimeterX = ref<number | null>(null)
  const confirmedPixelsPerMillimeterY = ref<number | null>(null)

  function init(width: number, height: number): void {
    const centerX = width / 2
    const centerY = height / 2
    const spanX = width * 0.35
    const spanY = height * 0.35
    state.value = {
      xLeft: Math.round(centerX - spanX / 2),
      xRight: Math.round(centerX + spanX / 2),
      xGuideY: Math.round(centerY),
      yTop: Math.round(centerY - spanY / 2),
      yBottom: Math.round(centerY + spanY / 2),
      yGuideX: Math.round(centerX),
    }
    confirmed.value = false
    confirmedPixelsPerMillimeterX.value = null
    confirmedPixelsPerMillimeterY.value = null
  }

  const pxDistanceX = computed(() => {
    if (!state.value) return 0
    return Math.abs(state.value.xRight - state.value.xLeft)
  })

  const pxDistanceY = computed(() => {
    if (!state.value) return 0
    return Math.abs(state.value.yBottom - state.value.yTop)
  })

  const pixelsPerMillimeterX = computed(() => {
    if (confirmed.value && confirmedPixelsPerMillimeterX.value != null) {
      return confirmedPixelsPerMillimeterX.value
    }
    if (distanceMmX.value <= 0 || pxDistanceX.value <= 0) return 0
    return pxDistanceX.value / distanceMmX.value
  })

  const pixelsPerMillimeterY = computed(() => {
    if (confirmed.value && confirmedPixelsPerMillimeterY.value != null) {
      return confirmedPixelsPerMillimeterY.value
    }
    if (distanceMmY.value <= 0 || pxDistanceY.value <= 0) return 0
    return pxDistanceY.value / distanceMmY.value
  })

  /** Verschil tussen de twee assen in procent; 0 als er nog geen schaal is. */
  const axisMismatchPct = computed(() => {
    const x = pixelsPerMillimeterX.value
    const y = pixelsPerMillimeterY.value
    if (!(x > 0) || !(y > 0)) return 0
    return (Math.abs(x - y) / Math.min(x, y)) * 100
  })

  const canConfirm = computed(
    () =>
      !!state.value &&
      distanceMmX.value > 0 &&
      distanceMmY.value > 0 &&
      pxDistanceX.value > 3 &&
      pxDistanceY.value > 3,
  )

  function updatePartial(partial: Partial<HScaleState>, width: number, height: number): void {
    if (!state.value) return
    state.value = {
      xLeft: clamp(partial.xLeft ?? state.value.xLeft, 0, width),
      xRight: clamp(partial.xRight ?? state.value.xRight, 0, width),
      xGuideY: clamp(partial.xGuideY ?? state.value.xGuideY, 0, height),
      yTop: clamp(partial.yTop ?? state.value.yTop, 0, height),
      yBottom: clamp(partial.yBottom ?? state.value.yBottom, 0, height),
      yGuideX: clamp(partial.yGuideX ?? state.value.yGuideX, 0, width),
    }
    confirmed.value = false
    confirmedPixelsPerMillimeterX.value = null
    confirmedPixelsPerMillimeterY.value = null
  }

  function confirm(): void {
    if (!canConfirm.value) return
    confirmed.value = true
    confirmedPixelsPerMillimeterX.value = pxDistanceX.value / distanceMmX.value
    confirmedPixelsPerMillimeterY.value = pxDistanceY.value / distanceMmY.value
  }

  function cancel(): void {
    confirmed.value = false
    confirmedPixelsPerMillimeterX.value = null
    confirmedPixelsPerMillimeterY.value = null
  }

  /** Na upscale op stap 1→2: px/mm in finale beeldruimte (alleen export). */
  function applyUpscaleToConfirmedScale(factor: number): void {
    if (!confirmed.value || factor === 1) return
    if (confirmedPixelsPerMillimeterX.value != null) {
      confirmedPixelsPerMillimeterX.value *= factor
    }
    if (confirmedPixelsPerMillimeterY.value != null) {
      confirmedPixelsPerMillimeterY.value *= factor
    }
  }

  /**
   * Na 90°/270° bake: beeld-X/Y wisselen van rol — bevestigde px/mm (en mm-labels) meenemen.
   * Rotatie verandert geen pixeldichtheid; alleen as-uitlijning bij kardinale hoeken.
   */
  function applyCardinalAxisSwapToConfirmedScale(totalRotationDeg: number): void {
    if (!confirmed.value) return
    const normalized = ((totalRotationDeg % 360) + 360) % 360
    const nearest = Math.round(normalized / 90) * 90
    const delta = Math.min(
      Math.abs(normalized - nearest),
      Math.abs(normalized - nearest + 360),
      Math.abs(normalized - nearest - 360),
    )
    if (delta > 0.5) return
    const quad = ((nearest % 360) + 360) % 360
    if (quad !== 90 && quad !== 270) return

    const ppmX = confirmedPixelsPerMillimeterX.value
    const ppmY = confirmedPixelsPerMillimeterY.value
    confirmedPixelsPerMillimeterX.value = ppmY
    confirmedPixelsPerMillimeterY.value = ppmX

    const mmX = distanceMmX.value
    distanceMmX.value = distanceMmY.value
    distanceMmY.value = mmX
  }

  /** Mm-wijziging na bevestigen: herbereken locked px/mm van dezelfde liniaalspan. */
  function recomputeConfirmedFromDistances(): void {
    if (!confirmed.value || !state.value) return
    if (distanceMmX.value > 0 && pxDistanceX.value > 0) {
      confirmedPixelsPerMillimeterX.value = pxDistanceX.value / distanceMmX.value
    }
    if (distanceMmY.value > 0 && pxDistanceY.value > 0) {
      confirmedPixelsPerMillimeterY.value = pxDistanceY.value / distanceMmY.value
    }
  }

  function restoreFromSnapshot(snapshot: {
    state: HScaleState
    distanceMmX: number
    distanceMmY: number
    confirmed: boolean
    confirmedPixelsPerMillimeterX?: number | null
    confirmedPixelsPerMillimeterY?: number | null
  }): void {
    state.value = { ...snapshot.state }
    distanceMmX.value = snapshot.distanceMmX
    distanceMmY.value = snapshot.distanceMmY
    confirmed.value = snapshot.confirmed
    confirmedPixelsPerMillimeterX.value = snapshot.confirmedPixelsPerMillimeterX ?? null
    confirmedPixelsPerMillimeterY.value = snapshot.confirmedPixelsPerMillimeterY ?? null
    if (snapshot.confirmed && confirmedPixelsPerMillimeterX.value == null && state.value) {
      const pxX = Math.abs(state.value.xRight - state.value.xLeft)
      const pxY = Math.abs(state.value.yBottom - state.value.yTop)
      if (distanceMmX.value > 0 && pxX > 0) {
        confirmedPixelsPerMillimeterX.value = pxX / distanceMmX.value
      }
      if (distanceMmY.value > 0 && pxY > 0) {
        confirmedPixelsPerMillimeterY.value = pxY / distanceMmY.value
      }
    }
  }

  return {
    state,
    distanceMmX,
    distanceMmY,
    pxDistanceX,
    pxDistanceY,
    pixelsPerMillimeterX,
    pixelsPerMillimeterY,
    axisMismatchPct,
    canConfirm,
    confirmed,
    init,
    updatePartial,
    confirm,
    cancel,
    applyUpscaleToConfirmedScale,
    applyCardinalAxisSwapToConfirmedScale,
    recomputeConfirmedFromDistances,
    restoreFromSnapshot,
    confirmedPixelsPerMillimeterX,
    confirmedPixelsPerMillimeterY,
  }
}
