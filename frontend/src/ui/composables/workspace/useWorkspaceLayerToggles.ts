import { ref } from 'vue'

export function useWorkspaceLayerToggles() {
  const showWallLines = ref(true)
  const showTemplates = ref(true)
  const showLines = ref(false)
  const showSkeleton = ref(false)
  const showSkeletonLayerB = ref(false)
  const showSemanticLayerC = ref(false)
  const showLayer4 = ref(false)
  const showLayer5 = ref(false)
  const showLayer6 = ref(false)
  const showLayer7 = ref(false)
  const showLayer8 = ref(false)
  const showLayer9 = ref(false)
  const showLayer10 = ref(false)
  const showLayer11 = ref(false)
  const showLayer12 = ref(false)
  const showLayer14 = ref(false)
  const showOcrText = ref(false)

  return {
    showWallLines,
    showTemplates,
    showLines,
    showSkeleton,
    showSkeletonLayerB,
    showSemanticLayerC,
    showLayer4,
    showLayer5,
    showLayer6,
    showLayer7,
    showLayer8,
    showLayer9,
    showLayer10,
    showLayer11,
    showLayer12,
    showLayer14,
    showOcrText,
  }
}
