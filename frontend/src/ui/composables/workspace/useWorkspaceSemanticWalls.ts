import type { Ref } from 'vue'
import type { TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import { ensureSemanticWallsOnTabOutputs } from '@/cv/walls/rooms/build-semantic-walls-output'

export function useWorkspaceSemanticWalls(deps: {
  tabOutputs: Ref<TabDetectionOutputs>
}) {
  async function applySemanticBuild(force = false): Promise<boolean> {
    const { outputs, built } = await ensureSemanticWallsOnTabOutputs(deps.tabOutputs.value, {
      force,
    })
    if (!built) return false
    deps.tabOutputs.value = outputs
    return true
  }

  async function buildForResultStep(): Promise<void> {
    await applySemanticBuild(false)
  }

  /** Direct na «Afronden detectie» — FML/vector-tab hoeft niet opnieuw bezocht te worden. */
  async function buildAfterFinalize(): Promise<void> {
    await applySemanticBuild(true)
  }

  return {
    buildForResultStep,
    buildAfterFinalize,
  }
}
