import { computed, ref } from 'vue'

export interface HScaleState {
  xLeft: number
  xRight: number
  xGuideY: number
  yTop: number
  yBottom: number
  yGuideX: number
}

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
    canConfirm,
    confirmed,
    init,
    updatePartial,
    confirm,
    cancel,
    applyUpscaleToConfirmedScale,
    restoreFromSnapshot,
    confirmedPixelsPerMillimeterX,
    confirmedPixelsPerMillimeterY,
  }
}
