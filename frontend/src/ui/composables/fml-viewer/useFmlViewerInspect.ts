import { computed, ref } from 'vue'
import { cycleInspectColor, type FmlInspectHit } from '@/ui/composables/fml-preview/fml-inspect'

/**
 * Thin inspect-sidebar state for the standalone FML viewer.
 * Color cycle uses existing fml-inspect helpers; pick/hit-test stays in the canvas.
 */
export function useFmlViewerInspect() {
  const viewerMode = ref<'edit' | 'inspect'>('edit')
  const inspectColors = ref<Record<string, string>>({})
  const lastInspectHit = ref<FmlInspectHit | null>(null)
  const inspectMode = computed(() => viewerMode.value === 'inspect')

  function onInspectSelect(hit: FmlInspectHit | null): void {
    lastInspectHit.value = hit
    if (!hit) return
    const next = cycleInspectColor(inspectColors.value[hit.id])
    const copy = { ...inspectColors.value }
    if (next) copy[hit.id] = next
    else delete copy[hit.id]
    inspectColors.value = copy
  }

  function resetInspectState(): void {
    inspectColors.value = {}
    lastInspectHit.value = null
    viewerMode.value = 'edit'
  }

  return {
    viewerMode,
    inspectColors,
    lastInspectHit,
    inspectMode,
    onInspectSelect,
    resetInspectState,
  }
}
