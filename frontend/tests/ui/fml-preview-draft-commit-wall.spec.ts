import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import { createFmlPreviewSelection } from '@/ui/composables/fml-preview/fml-preview-selection'
import { createFmlPreviewDraftCommitScheduler } from '@/ui/composables/fml-preview/fml-preview-draft-commit'
import { useFmlPreviewWallSelection } from '@/ui/composables/fml-preview/useFmlPreviewWallSelection'
import { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'

function samplePlan(): FloorPlan {
  return {
    name: 'Test',
    floors: [
      {
        name: 'BG',
        level: 0,
        height: 280,
        walls: [
          {
            id: 'w1',
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            thickness: 10,
            openings: [],
          },
        ],
      },
    ],
  }
}

describe('FML wall thickness draft commit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('flush on clearSelection applies typed thickness without Enter', () => {
    const scope = effectScope()
    scope.run(() => {
      const plan = ref(samplePlan())
      const floorIndex = ref(0)
      const editor = useFmlPreviewEditor(plan, floorIndex)
      const selection = createFmlPreviewSelection()
      const draftCommit = createFmlPreviewDraftCommitScheduler()
      const syncPlanToParent = vi.fn()
      const wallSelection = useFmlPreviewWallSelection({
        editor,
        hitTest: {
          containerRectToCmBBox: () => null,
        },
        selection,
        syncPlanToParent,
        draftCommit,
        flushPendingFieldCommits: () => draftCommit.flushAll(),
        containerRef: ref(null),
        cancelMoveDragPending: () => {},
        cancelDrawWallDrag: () => {},
        cancelMeasureDrag: () => {},
      })

      selection.settingsWallIds.value = ['w1']
      wallSelection.syncWallThicknessDraftFromSelection()
      expect(wallSelection.wallThicknessDraft.value).toBe(10)

      wallSelection.onWallThicknessCm(18)
      expect(editor.walls.value[0].thickness).toBe(10)

      wallSelection.clearSelection()
      expect(editor.walls.value[0].thickness).toBe(18)
      expect(syncPlanToParent).toHaveBeenCalled()
    })
    scope.stop()
  })

  it('debounce applies after pause; second flush is no-op for undo', () => {
    const scope = effectScope()
    scope.run(() => {
      const plan = ref(samplePlan())
      const floorIndex = ref(0)
      const editor = useFmlPreviewEditor(plan, floorIndex)
      const selection = createFmlPreviewSelection()
      const draftCommit = createFmlPreviewDraftCommitScheduler()
      const pushUndoSpy = vi.spyOn(editor, 'pushUndo')
      const wallSelection = useFmlPreviewWallSelection({
        editor,
        hitTest: {
          containerRectToCmBBox: () => null,
        },
        selection,
        syncPlanToParent: () => {},
        draftCommit,
        flushPendingFieldCommits: () => draftCommit.flushAll(),
        containerRef: ref(null),
        cancelMoveDragPending: () => {},
        cancelDrawWallDrag: () => {},
        cancelMeasureDrag: () => {},
      })

      selection.settingsWallIds.value = ['w1']
      wallSelection.syncWallThicknessDraftFromSelection()

      wallSelection.onWallThicknessCm(25)
      expect(editor.walls.value[0].thickness).toBe(10)

      vi.advanceTimersByTime(700)
      expect(editor.walls.value[0].thickness).toBe(25)
      expect(pushUndoSpy).toHaveBeenCalledTimes(1)

      wallSelection.commitWallThickness()
      expect(pushUndoSpy).toHaveBeenCalledTimes(1)
    })
    scope.stop()
  })
})

describe('FML junction height settings', () => {
  it('toont knoophoogte als aangesloten muren verschillende hoogtes hebben', () => {
    const scope = effectScope()
    scope.run(() => {
      const plan = ref<FloorPlan>({
        name: 'Test',
        floors: [
          {
            name: 'BG',
            level: 0,
            height: 280,
            walls: [
              {
                id: 'w1',
                a: { x: 0, y: 0 },
                b: { x: 100, y: 0 },
                thickness: 20,
                openings: [],
                extras: { az: { z: 0, h: 250 }, bz: { z: 0, h: 250 } },
              },
              {
                id: 'w2',
                a: { x: 100, y: 0 },
                b: { x: 100, y: 80 },
                thickness: 20,
                openings: [],
                extras: { az: { z: 0, h: 300 }, bz: { z: 0, h: 300 } },
              },
            ],
          },
        ],
      })
      const floorIndex = ref(0)
      const editor = useFmlPreviewEditor(plan, floorIndex)
      const selection = createFmlPreviewSelection()
      const draftCommit = createFmlPreviewDraftCommitScheduler()
      const wallSelection = useFmlPreviewWallSelection({
        editor,
        hitTest: {
          containerRectToCmBBox: () => null,
        },
        selection,
        syncPlanToParent: vi.fn(),
        draftCommit,
        flushPendingFieldCommits: () => draftCommit.flushAll(),
        containerRef: ref(null),
        cancelMoveDragPending: () => {},
        cancelDrawWallDrag: () => {},
        cancelMeasureDrag: () => {},
      })

      const junction = editor.junctions.value.find((item) => item.refs.length >= 2)
      expect(junction).toBeTruthy()
      wallSelection.toggleSettingsJunction(junction!.id)
      expect(wallSelection.junctionHeightMixed.value).toBe(false)
      expect(wallSelection.junctionHeightDraft.value).toBe(250)
      expect(wallSelection.junctionBottomZMixed.value).toBe(false)
      expect(wallSelection.junctionBottomZDraft.value).toBe(0)
    })
    scope.stop()
  })
})
