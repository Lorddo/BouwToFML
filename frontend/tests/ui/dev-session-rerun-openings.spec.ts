import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createWorkspaceDevSessionRestoreDetection } from '@/ui/composables/workspace/workspace-dev-session-restore-detection'
import { emptyTabOutputs, type TabDetectionOutputs } from '@/cv/pipeline/merge-tab-outputs'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { WorkspaceFlowStep } from '@/ui/composables/workspace/constants'
import type { RoomPhase } from '@/ui/composables/workspace/useWorkspaceRoomFaces'

describe('rerunOpeningsAfterRestore', () => {
  it('draait deuren vóór ramen en forceert walls/review gates', async () => {
    const order: string[] = []
    const flowStep = ref<WorkspaceFlowStep>('templates')
    const templateTab = ref<TemplateTab>('ocr')
    const roomPhase = ref<RoomPhase>('review')
    let tabDuringDoor: TemplateTab | null = null
    let phaseDuringDoor: RoomPhase | null = null

    const deps = {
      flowStep,
      templateTab,
      profileConfirmed: ref(true),
      tabOutputs: ref<TabDetectionOutputs>(emptyTabOutputs()),
      roomPhase,
      wallsDetectionComplete: ref(false),
      getRoomRasterCache: () => null,
      refreshAllDetectionUnderlays: async () => undefined,
      ensureVectorCacheIfNeeded: async () => undefined,
      syncFromTabOutputs: async () => undefined,
      runOcrScan: async () => undefined,
      autoClassifyWalls: async () => true,
      finalizeWallDetection: async () => true,
      referenceWallThicknessPx: ref<number | null>(null),
      restoreWallReferenceRect: () => undefined,
      restoreOpeningReferenceRects: () => undefined,
      setRoomInkCoverageThreshold: () => undefined,
      markAutoDoorPassApplied: vi.fn(),
      markAutoWindowPassApplied: vi.fn(),
      resetAutoDoorPassGate: () => {
        order.push('reset-door')
      },
      refreshDoorSwingOverlay: async () => {
        tabDuringDoor = templateTab.value
        phaseDuringDoor = roomPhase.value
        order.push('door')
      },
      invalidateAutoWindowPass: () => {
        order.push('invalidate-window')
      },
      refreshWindowOverlay: async () => {
        order.push('window')
      },
    }

    const detection = createWorkspaceDevSessionRestoreDetection(deps)
    await detection.rerunOpeningsAfterRestore()

    expect(order).toEqual(['reset-door', 'door', 'invalidate-window', 'window'])
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

    const detection = createWorkspaceDevSessionRestoreDetection({
      flowStep,
      templateTab,
      profileConfirmed: ref(true),
      tabOutputs: ref<TabDetectionOutputs>(emptyTabOutputs()),
      roomPhase,
      wallsDetectionComplete: ref(true),
      getRoomRasterCache: () => null,
      refreshAllDetectionUnderlays: async () => undefined,
      ensureVectorCacheIfNeeded: async () => undefined,
      syncFromTabOutputs: async () => undefined,
      runOcrScan: async () => undefined,
      autoClassifyWalls: async () => true,
      finalizeWallDetection: async () => true,
      referenceWallThicknessPx: ref<number | null>(null),
      restoreWallReferenceRect: () => undefined,
      restoreOpeningReferenceRects: () => undefined,
      setRoomInkCoverageThreshold: () => undefined,
      markAutoDoorPassApplied: vi.fn(),
      markAutoWindowPassApplied: vi.fn(),
      resetAutoDoorPassGate: vi.fn(),
      refreshDoorSwingOverlay: async () => {
        expect(flowStep.value).toBe('templates')
        expect(templateTab.value).toBe('walls')
        expect(roomPhase.value).toBe('review')
        sawReview = true
      },
      invalidateAutoWindowPass: vi.fn(),
      refreshWindowOverlay: async () => undefined,
    })

    await detection.rerunOpeningsAfterRestore()

    expect(sawReview).toBe(true)
    expect(flowStep.value).toBe('result')
    expect(templateTab.value).toBe('doors')
    expect(roomPhase.value).toBe('done')
  })
})
