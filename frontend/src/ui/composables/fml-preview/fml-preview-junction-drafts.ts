import { ref } from 'vue'
import { DEFAULT_FML_WALL_HEIGHT_CM } from '@/core/fml/extraction-to-plan-types'
import {
  readJunctionElevation,
  wallEndpoint3D,
  wallEndpointHeightCm,
} from '@/core/fml/wall-endpoint-height'
import type { useFmlPreviewEditor } from '@/ui/composables/useFmlPreviewEditor'
import type { FmlPreviewDraftCommitScheduler } from './fml-preview-draft-commit'
import { bindScaleLengthDraftField } from './fml-preview-draft-commit'
import type { FmlPreviewSelectionRefs } from './fml-preview-selection'

type EditorApi = ReturnType<typeof useFmlPreviewEditor>

const FIELD_JUNCTION_HEIGHT = 'junction-height'
const FIELD_JUNCTION_BOTTOM_Z = 'junction-bottom-z'

export interface JunctionDraftsDeps {
  editor: EditorApi
  selection: FmlPreviewSelectionRefs
  syncPlanToParent: () => void
  draftCommit: FmlPreviewDraftCommitScheduler
  floorHeight: () => number
}

export function createJunctionDrafts(deps: JunctionDraftsDeps) {
  const { editor, selection, syncPlanToParent, draftCommit, floorHeight } = deps
  const { settingsJunctionId } = selection

  const junctionHeightDraft = ref(DEFAULT_FML_WALL_HEIGHT_CM)
  const junctionHeightMixed = ref(false)
  const junctionBottomZDraft = ref(0)
  const junctionBottomZMixed = ref(false)

  function syncJunctionHeightDraftFromSelection(): void {
    const junctionId = settingsJunctionId.value
    if (!junctionId) {
      junctionHeightMixed.value = false
      junctionBottomZMixed.value = false
      return
    }
    const junction = editor.junctions.value.find((item) => item.id === junctionId)
    if (!junction || junction.refs.length === 0) {
      junctionHeightMixed.value = false
      junctionBottomZMixed.value = false
      return
    }
    const elev = readJunctionElevation(editor.selectableWalls.value, junction.refs, floorHeight())
    if (!elev) {
      junctionHeightMixed.value = false
      junctionBottomZMixed.value = false
      return
    }
    junctionHeightMixed.value = false
    junctionHeightDraft.value = elev.heightCm
    junctionBottomZMixed.value = false
    junctionBottomZDraft.value = elev.bottomZCm
  }

  function applyHeightToJunction(
    junctionId: string | null,
    heightRaw: number,
  ): { mutated: boolean } {
    const height = Math.max(1, Math.min(1000, Math.round(heightRaw)))
    junctionHeightDraft.value = height
    junctionHeightMixed.value = false
    if (!junctionId) return { mutated: false }
    const junction = editor.junctions.value.find((item) => item.id === junctionId)
    if (!junction || junction.refs.length === 0) return { mutated: false }
    const floorH = floorHeight()
    const already = junction.refs.every((ref) => {
      const wall = editor.selectableWalls.value.find((item) => item.id === ref.wallId)
      if (!wall) return false
      return Math.round(wallEndpointHeightCm(wall, ref.end, floorH)) === height
    })
    if (already) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_JUNCTION_HEIGHT, () => editor.pushUndo())
    editor.applyJunctionHeight(junction.refs, height)
    syncJunctionHeightDraftFromSelection()
    syncPlanToParent()
    return { mutated: true }
  }

  function applyBottomZToJunction(
    junctionId: string | null,
    bottomRaw: number,
  ): { mutated: boolean } {
    const bottomZ = Math.max(0, Math.min(2000, Math.round(bottomRaw)))
    junctionBottomZDraft.value = bottomZ
    junctionBottomZMixed.value = false
    if (!junctionId) return { mutated: false }
    const junction = editor.junctions.value.find((item) => item.id === junctionId)
    if (!junction || junction.refs.length === 0) return { mutated: false }
    const floorH = floorHeight()
    const already = junction.refs.every((ref) => {
      const wall = editor.selectableWalls.value.find((item) => item.id === ref.wallId)
      if (!wall) return false
      return Math.round(wallEndpoint3D(wall, ref.end, floorH).z) === bottomZ
    })
    if (already) return { mutated: false }
    draftCommit.beginUndoGroup(FIELD_JUNCTION_BOTTOM_Z, () => editor.pushUndo())
    editor.applyJunctionBottomZ(junction.refs, bottomZ)
    syncJunctionHeightDraftFromSelection()
    syncPlanToParent()
    return { mutated: true }
  }

  const junctionHeightField = bindScaleLengthDraftField({
    fieldId: FIELD_JUNCTION_HEIGHT,
    draftCommit,
    draft: junctionHeightDraft,
    mixed: junctionHeightMixed,
    applyWithValue: (value) => {
      const junctionId = settingsJunctionId.value
      return () => applyHeightToJunction(junctionId, value)
    },
  })

  const junctionBottomZField = bindScaleLengthDraftField({
    fieldId: FIELD_JUNCTION_BOTTOM_Z,
    draftCommit,
    draft: junctionBottomZDraft,
    mixed: junctionBottomZMixed,
    applyWithValue: (value) => {
      const junctionId = settingsJunctionId.value
      return () => applyBottomZToJunction(junctionId, value)
    },
  })

  return {
    junctionHeightDraft,
    junctionHeightMixed,
    junctionBottomZDraft,
    junctionBottomZMixed,
    syncJunctionHeightDraftFromSelection,
    onJunctionHeightCm: junctionHeightField.onCm,
    commitJunctionHeight: junctionHeightField.commit,
    onJunctionBottomZCm: junctionBottomZField.onCm,
    commitJunctionBottomZ: junctionBottomZField.commit,
  }
}
