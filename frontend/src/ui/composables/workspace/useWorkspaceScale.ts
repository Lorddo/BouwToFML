import { ref, computed, type Ref } from 'vue'
import type { HScaleState, useHScaleCalibration } from '@/platform/calibration'

export function useWorkspaceScale(deps: {
  scale: ReturnType<typeof useHScaleCalibration>
  originalImageEl: Ref<HTMLImageElement | null>
}) {
  const scalePanelOpen = ref(true)

  const scaleLocked = computed(() => !deps.scale.confirmed.value)

  const showScaleOverlay = computed(
    () => !!deps.scale.state.value && (!deps.scale.confirmed.value || scalePanelOpen.value),
  )

  function onMoveScaleHandle(
    handle: 'xLeft' | 'xRight' | 'xGuideY' | 'yTop' | 'yBottom' | 'yGuideX',
    value: number,
  ) {
    const img = deps.originalImageEl.value
    if (!img) return
    deps.scale.updatePartial({ [handle]: value }, img.naturalWidth, img.naturalHeight)
  }

  function updateMmX(value: number) {
    deps.scale.distanceMmX.value = Number.isFinite(value) ? value : deps.scale.distanceMmX.value
    deps.scale.recomputeConfirmedFromDistances()
  }

  function updateMmY(value: number) {
    deps.scale.distanceMmY.value = Number.isFinite(value) ? value : deps.scale.distanceMmY.value
    deps.scale.recomputeConfirmedFromDistances()
  }

  function onConfirmScale() {
    deps.scale.confirm()
    if (deps.scale.confirmed.value) {
      scalePanelOpen.value = false
    }
  }

  function onCancelScale() {
    deps.scale.cancel()
    scalePanelOpen.value = false
  }

  function toggleScalePanel() {
    scalePanelOpen.value = !scalePanelOpen.value
    if (scalePanelOpen.value) {
      const img = deps.originalImageEl.value
      // Alleen init als er nog geen linialen zijn — opnieuw openen mag bevestigde
      // schaal + mm niet wissen (anders: default 35%-span met oude mm → foute FML).
      if (img && !deps.scale.state.value) {
        deps.scale.init(img.naturalWidth, img.naturalHeight)
      }
    }
  }

  function resetScaleUi() {
    deps.scale.confirmed.value = false
    deps.scale.state.value = null
    scalePanelOpen.value = true
  }

  function resetScaleFull() {
    deps.scale.cancel()
    deps.scale.state.value = null
  }

  /** Herstel schaal + UI na dev-snapshot (linialen dicht bij bevestigde schaal). */
  function restoreFromSessionSnapshot(snapshot: {
    state?: HScaleState
    distanceMmX: number
    distanceMmY: number
    confirmed: boolean
    confirmedPixelsPerMillimeterX?: number
    confirmedPixelsPerMillimeterY?: number
  }): void {
    if (snapshot.state) {
      deps.scale.restoreFromSnapshot({
        state: snapshot.state,
        distanceMmX: snapshot.distanceMmX,
        distanceMmY: snapshot.distanceMmY,
        confirmed: snapshot.confirmed,
        confirmedPixelsPerMillimeterX: snapshot.confirmedPixelsPerMillimeterX,
        confirmedPixelsPerMillimeterY: snapshot.confirmedPixelsPerMillimeterY,
      })
    } else {
      deps.scale.distanceMmX.value = snapshot.distanceMmX
      deps.scale.distanceMmY.value = snapshot.distanceMmY
      deps.scale.confirmed.value = snapshot.confirmed
      deps.scale.state.value = null
    }
    scalePanelOpen.value = !snapshot.confirmed
  }

  return {
    scalePanelOpen,
    scaleLocked,
    showScaleOverlay,
    onMoveScaleHandle,
    updateMmX,
    updateMmY,
    onConfirmScale,
    onCancelScale,
    toggleScalePanel,
    resetScaleUi,
    resetScaleFull,
    restoreFromSessionSnapshot,
  }
}
