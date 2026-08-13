import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createWorkspaceDevSessionRestoreDetection } from '@/ui/composables/workspace/workspace-dev-session-restore-detection'
import { emptyTabOutputs, type TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'
import type { RoomPhase } from '@/ui/composables/workspace/useWorkspaceRoomFaces'

function createBaseDeps(overrides: Record<string, unknown> = {}) {
  return {
    flowStep: ref<WorkspaceFlowStep>('templates'),
    templateTab: ref<TemplateTab>('ocr'),
    profileConfirmed: ref(true),
    tabOutputs: ref<TabDetectionOutputs>(emptyTabOutputs()),
    roomPhase: ref<RoomPhase>('review'),
    wallsDetectionComplete: ref(false),
    getRoomRasterCache: () => null,
    refreshAllDetectionUnderlays: async () => undefined,
    ensureVectorCacheIfNeeded: async () => undefined,
    syncFromTabOutputs: async () => undefined,
    runOcrScan: async () => undefined,
    autoClassifyWalls: async () => true,
    finalizeWallDetection: async () => true,
    referenceWallThicknessPx: ref<number | null>(null),
    wallRefThicknessMeasures: ref<
      Array<{ band: 'min' | 'mid' | 'max'; thicknessPx: number; rectId?: string }>
    >([]),
    restoreWallReferenceRects: () => undefined,
    restoreOpeningReferenceRects: () => undefined,
    setRoomInkCoverageThreshold: () => undefined,
    markAutoDoorPassApplied: vi.fn(),
    markAutoWindowPassApplied: vi.fn(),
    resetAutoDoorPassGate: vi.fn(),
    refreshDoorSwingOverlayExistingOnly: vi.fn(async () => undefined),
    refreshDoorSwingFromExistingDoors: vi.fn(async () => undefined),
    invalidateAutoWindowPass: vi.fn(),
    refreshWindowOverlay: vi.fn(async () => undefined),
    refreshWindowsFromExistingClasses: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('rerunOpeningsAfterRestore', () => {
  it('draait existing-doors-only vóór ramen en forceert walls/review gates', async () => {
    const order: string[] = []
    const flowStep = ref<WorkspaceFlowStep>('templates')
    const templateTab = ref<TemplateTab>('ocr')
    const roomPhase = ref<RoomPhase>('review')
    let tabDuringDoor: TemplateTab | null = null
    let phaseDuringDoor: RoomPhase | null = null

    const deps = createBaseDeps({
      flowStep,
      templateTab,
      roomPhase,
      refreshDoorSwingOverlayExistingOnly: async () => {
        tabDuringDoor = templateTab.value
        phaseDuringDoor = roomPhase.value
        order.push('door-existing')
      },
      invalidateAutoWindowPass: () => {
        order.push('invalidate-window')
      },
      refreshWindowOverlay: async () => {
        order.push('window')
      },
    })

    const detection = createWorkspaceDevSessionRestoreDetection(deps)
    await detection.rerunOpeningsAfterRestore()

    expect(order).toEqual(['door-existing', 'invalidate-window', 'window'])
    expect(tabDuringDoor).toBe('walls')
    expect(phaseDuringDoor).toBe('review')
    expect(templateTab.value).toBe('ocr')
    expect(flowStep.value).toBe('templates')
    expect(roomPhase.value).toBe('review')
  })

  it('herstelt flowStep/tab/phase na re-run (ook vanuit done)', async () => {
    const flowStep = ref<WorkspaceFlowStep>('result')
    const templateTab = ref<TemplateTab>('doors')
    const roomPhase = ref<RoomPhase>('done')
    let sawReview = false

    const detection = createWorkspaceDevSessionRestoreDetection(
      createBaseDeps({
        flowStep,
        templateTab,
        roomPhase,
        wallsDetectionComplete: ref(true),
        refreshDoorSwingOverlayExistingOnly: async () => {
          expect(flowStep.value).toBe('templates')
          expect(templateTab.value).toBe('walls')
          expect(roomPhase.value).toBe('review')
          sawReview = true
        },
      }),
    )

    await detection.rerunOpeningsAfterRestore()

    expect(sawReview).toBe(true)
    expect(flowStep.value).toBe('result')
    expect(templateTab.value).toBe('doors')
    expect(roomPhase.value).toBe('done')
  })
})
