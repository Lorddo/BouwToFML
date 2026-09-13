import { computed, ref } from 'vue'
import { cycleInspectColor, type InspectHit } from '@/ui/composables/plan-canvas/plan-inspect'

/**
 * Thin inspect-sidebar state for the standalone FML viewer.
 * Color cycle uses existing fml-inspect helpers; pick/hit-test stays in the canvas.
 */
export function useEditorInspect() {
  const viewerMode = ref<'edit' | 'inspect'>('edit')
  const inspectColors = ref<Record<string, string>>({})
  const lastInspectHit = ref<InspectHit | null>(null)
  const inspectMode = computed(() => viewerMode.value === 'inspect')

  function onInspectSelect(hit: InspectHit | null): void {
    lastInspectHit.value = hit
    if (!hit) return
    // Gevelgroep: zelfde kleurcyclus op alle leden op deze floor.
    const targetIds = hit.kind === 'wall' && hit.ids && hit.ids.length > 0 ? hit.ids : [hit.id]
    const next = cycleInspectColor(inspectColors.value[hit.id])
    const copy = { ...inspectColors.value }
    for (const id of targetIds) {
      if (next) copy[id] = next
      else delete copy[id]
    }
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
