import { ref, watch, type Ref } from 'vue'
import type { WorkspaceFlowStep } from './constants'
import {
  loadWallPipelineVersion,
  storeWallPipelineVersion,
  type WallPipelineVersion,
} from '@/platform/wall-pipeline-version'

export type ActiveWallPipelineVersion = WallPipelineVersion

export function useWorkspaceWallPipeline(deps: {
  flowStep: Ref<WorkspaceFlowStep>
  showLayer7: Ref<boolean>
  showLayer8: Ref<boolean>
  showLayer9: Ref<boolean>
  showLayer10: Ref<boolean>
}) {
  // Cutover: always V3 (migrates stale localStorage).
  const wallPipelineVersion = ref<ActiveWallPipelineVersion>(loadWallPipelineVersion())
  storeWallPipelineVersion('v3')

  watch(deps.flowStep, (step, prev) => {
    if (step === 'result' && prev !== 'result') {
      deps.showLayer7.value = false
      deps.showLayer8.value = false
      deps.showLayer9.value = false
      deps.showLayer10.value = true
    }
  })

  return { wallPipelineVersion }
}
