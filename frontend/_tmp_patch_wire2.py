from pathlib import Path
import re

root = Path(r"c:\Pranimate\BouwToFMLV3\frontend")

# ========== 1) SelectionCoordinator ==========
sc_path = root / "src/ui/composables/plan-canvas/usePlanCanvasSelectionCoordinator.ts"
sc = sc_path.read_text(encoding="utf-8")

if "getInputUnit?:" not in sc:
    sc = sc.replace(
        "  ensureRidgeZDraft: () => number\n"
        "  thicknessPresetCms?: Ref<number[] | undefined>\n"
        "}\n",
        "  ensureRidgeZDraft: () => number\n"
        "  thicknessPresetCms?: Ref<number[] | undefined>\n"
        "  getInputUnit?: () => import('@/ui/composables/settings/scale-input-unit').ScaleInputUnit\n"
        "}\n",
        1,
    )

old_call = """const surfaceEdit = usePlanCanvasSurfaceEdit({
    selection,
    editor,
    hitTest,
    resolvePoint: options.snap.resolveSurfacePoint,
    axisLocked,
    syncPlanToParent,
    isRidgeHit: (cm) => {
      if (options.view.mode !== 'dak') return false
      const wallId = hitTest.hitTestWallAtCm(cm)
      return wallId != null && isRidgeWallId(editor.localPlan.value, wallId)
    },
  })"""

new_call = """const surfaceEdit = usePlanCanvasSurfaceEdit({
    selection,
    editor,
    hitTest,
    resolvePoint: options.snap.resolveSurfacePoint,
    axisLocked,
    syncPlanToParent,
    getInputUnit: options.getInputUnit,
    isRidgeHit: (cm) => {
      if (options.view.mode !== 'dak') return false
      const wallId = hitTest.hitTestWallAtCm(cm)
      return wallId != null && isRidgeWallId(editor.localPlan.value, wallId)
    },
  })"""

if "getInputUnit: options.getInputUnit" not in sc:
    if old_call not in sc:
        raise SystemExit("SC surfaceEdit call mismatch")
    sc = sc.replace(old_call, new_call, 1)

sc_path.write_text(sc, encoding="utf-8", newline="\n")
print("SC ok")

# ========== 2) Interaction ==========
it_path = root / "src/ui/composables/plan-canvas/usePlanCanvasInteraction.ts"
it = it_path.read_text(encoding="utf-8")

old_sel = """usePlanCanvasSelectionCoordinator({
    hitTest,
    selection,
    editor,
    snap,
    draftCommit,
    syncPlanToParent,
    flushPendingFieldCommits,
    cancelMoveDragPending: () => wallDrag.cancelMoveDragPending(),
    cancelOpeningDragPending: () => openingDrag.cancelOpeningDragPending(),
    cancelItemDragPending: () => itemDrag.cancelItemDragPending(),
    cancelDrawWallDrag: () => drawCancelsDeferred.cancelDrawWallDrag(),
    cancelMeasureDrag: () => drawCancelsDeferred.cancelMeasureDrag(),
    containerRef: options.containerRef,
    axisLocked,
    areaSurfaceEditEnabled,
    session: options.session,
    view: options.view,
    ridgeZCm,
    pendingFixture,
    ensureRidgeZDraft: () => toolCoordEnsureRidgeZDraft(),
    thicknessPresetCms: options.thicknessPresetCms,
  })"""

new_sel = old_sel.replace(
    "    thicknessPresetCms: options.thicknessPresetCms,\n  })",
    "    thicknessPresetCms: options.thicknessPresetCms,\n"
    "    getInputUnit: options.getInputUnit,\n  })",
)
if "getInputUnit: options.getInputUnit" not in it[it.find("usePlanCanvasSelectionCoordinator") : it.find("usePlanCanvasSelectionCoordinator") + 900]:
    if old_sel not in it:
        raise SystemExit("IT selCoord mismatch")
    it = it.replace(old_sel, new_sel, 1)
    print("IT selCoord")
else:
    print("IT selCoord already")

# Expand surfaceEdit in keyboard call
if "handleTypeKey: surfaceEdit.handleTypeKey" not in it:
    it = it.replace(
        "    areaSelection,\n    surfaceEdit,\n    drawWall,\n",
        "    areaSelection,\n"
        "    surfaceEdit: {\n"
        "      cancelDrag: surfaceEdit.cancelDrag,\n"
        "      selectedVertexIndex: surfaceEdit.selectedVertexIndex,\n"
        "      typeText: surfaceEdit.typeText,\n"
        "      handleTypeKey: surfaceEdit.handleTypeKey,\n"
        "      commitFromMeasure: surfaceEdit.commitFromMeasure,\n"
        "      clearTypeDraft: surfaceEdit.clearTypeDraft,\n"
        "    },\n"
        "    drawWall,\n",
        1,
    )
    print("IT keyboard surfaceEdit")

# Exports
if "roofVertexTypeText" not in it:
    it = it.replace(
        "    roofVertexIndex: surfaceEdit.selectedVertexIndex,\n"
        "    setRoofVertexZ: surfaceEdit.setSelectedVertexZ,\n",
        "    roofVertexIndex: surfaceEdit.selectedVertexIndex,\n"
        "    setRoofVertexZ: surfaceEdit.setSelectedVertexZ,\n"
        "    roofVertexTypeText: surfaceEdit.typeText,\n"
        "    roofVertexMeasureLengthCm: surfaceEdit.measureLengthCm,\n"
        "    roofVertexLabelCm: surfaceEdit.vertexLabelCm,\n",
        1,
    )
    print("IT exports")

it_path.write_text(it, encoding="utf-8", newline="\n")
print("IT ok")

# ========== 3) Keyboard ==========
kb_path = root / "src/ui/composables/plan-canvas/plan-canvas-editor-keyboard.ts"
kb = kb_path.read_text(encoding="utf-8")

old_se_type = "  surfaceEdit: { cancelDrag: () => void }"
new_se_type = """  surfaceEdit: {
    cancelDrag: () => void
    selectedVertexIndex: { value: number | null }
    typeText: { value: string }
    handleTypeKey: (event: KeyboardEvent) => boolean
    commitFromMeasure: () => boolean
    clearTypeDraft: () => void
  }"""

if "handleTypeKey: (event: KeyboardEvent) => boolean" not in kb or "surfaceEdit: {" not in kb.split("surfaceEdit:")[1][:200]:
    if old_se_type not in kb:
        raise SystemExit("KB surfaceEdit type mismatch: " + repr(re.search(r"surfaceEdit: \{[^}]+\}", kb).group(0)))
    kb = kb.replace(old_se_type, new_se_type, 1)

# After openingMove type key handling, add roof vertex typing
needle = """    if (openingMove.isDrafting() && openingMove.handleTypeKey(event)) {
      event.preventDefault()
      return
    }
"""
insert = """    if (openingMove.isDrafting() && openingMove.handleTypeKey(event)) {
      event.preventDefault()
      return
    }
    if (
      surfaceEdit.selectedVertexIndex.value != null &&
      surfaceEdit.handleTypeKey(event)
    ) {
      event.preventDefault()
      return
    }
"""
if "surfaceEdit.handleTypeKey(event)" not in kb:
    if needle not in kb:
        raise SystemExit("KB type-key needle missing")
    kb = kb.replace(needle, insert, 1)

# Enter: commit roof type before ending polygon edit
enter_needle = """      if (openingMove.isDrafting() && openingMove.commitFromMeasure()) {
        event.preventDefault()
        return
      }
      if (drawSurfaceMode.value && drawSurface.commitDrawSurface()) {
"""
enter_insert = """      if (openingMove.isDrafting() && openingMove.commitFromMeasure()) {
        event.preventDefault()
        return
      }
      if (
        surfaceEdit.selectedVertexIndex.value != null &&
        surfaceEdit.commitFromMeasure()
      ) {
        event.preventDefault()
        return
      }
      if (drawSurfaceMode.value && drawSurface.commitDrawSurface()) {
"""
if "surfaceEdit.commitFromMeasure()" not in kb:
    if enter_needle not in kb:
        raise SystemExit("KB enter needle missing")
    kb = kb.replace(enter_needle, enter_insert, 1)

# Escape: clear type draft first when typing vertex Z
esc_needle = """      if (selection.surfaceEditId.value) {
        event.preventDefault()
        areaSelection.endSurfacePolygonEdit()
        surfaceEdit.cancelDrag()
        return
      }
"""
esc_insert = """      if (
        surfaceEdit.selectedVertexIndex.value != null &&
        surfaceEdit.typeText.value
      ) {
        event.preventDefault()
        surfaceEdit.clearTypeDraft()
        return
      }
      if (selection.surfaceEditId.value) {
        event.preventDefault()
        areaSelection.endSurfacePolygonEdit()
        surfaceEdit.cancelDrag()
        return
      }
"""
# Only replace the Escape one — there may be two surfaceEditId Escape/Enter blocks.
# Find Escape section specifically: after openingMove.cancelOpeningMove
parts = kb.split("if (openingMove.isDrafting()) {\n        event.preventDefault()\n        openingMove.cancelOpeningMove()\n        return\n      }\n")
if len(parts) < 2:
    raise SystemExit("KB escape anchor missing")
# The Escape continuation is in parts[1] start
if "surfaceEdit.clearTypeDraft()" not in kb:
    if not parts[1].lstrip().startswith("if (drawSurface.draftPoints"):
        # try find surfaceEditId in escape part
        pass
    # Replace first occurrence of surfaceEditId escape after cancelOpeningMove
    head, _, tail = parts[1].partition(esc_needle)
    if _ != esc_needle:
        # try alternate - maybe drawSurface comes first
        alt = """      if (drawSurface.draftPoints.value?.length) {
        event.preventDefault()
        drawSurface.cancelDrawSurface()
        return
      }
      if (selection.drawLinePoints.value?.length) {
        event.preventDefault()
        drawLine.cancelDrawLine()
        return
      }
      if (selection.surfaceEditId.value) {
        event.preventDefault()
        areaSelection.endSurfacePolygonEdit()
        surfaceEdit.cancelDrag()
        return
      }
"""
        alt_ins = """      if (drawSurface.draftPoints.value?.length) {
        event.preventDefault()
        drawSurface.cancelDrawSurface()
        return
      }
      if (selection.drawLinePoints.value?.length) {
        event.preventDefault()
        drawLine.cancelDrawLine()
        return
      }
      if (
        surfaceEdit.selectedVertexIndex.value != null &&
        surfaceEdit.typeText.value
      ) {
        event.preventDefault()
        surfaceEdit.clearTypeDraft()
        return
      }
      if (selection.surfaceEditId.value) {
        event.preventDefault()
        areaSelection.endSurfacePolygonEdit()
        surfaceEdit.cancelDrag()
        return
      }
"""
        if alt not in kb:
            raise SystemExit("KB escape alt missing")
        kb = kb.replace(alt, alt_ins, 1)
    else:
        kb = parts[0] + "if (openingMove.isDrafting()) {\n        event.preventDefault()\n        openingMove.cancelOpeningMove()\n        return\n      }\n" + head + esc_insert + tail

kb_path.write_text(kb, encoding="utf-8", newline="\n")
print("KB ok", "clearTypeDraft" in kb, "handleTypeKey(event)" in kb)

# ========== 4) Keyboard test stubs ==========
spec = root / "tests/ui/plan-canvas-editor-keyboard.spec.ts"
st = spec.read_text(encoding="utf-8")
old_stub = "surfaceEdit: { cancelDrag: () => {} },"
new_stub = """surfaceEdit: {
      cancelDrag: () => {},
      selectedVertexIndex: ref(null),
      typeText: ref(''),
      handleTypeKey: () => false,
      commitFromMeasure: () => false,
      clearTypeDraft: () => {},
    },"""
if "clearTypeDraft: () => {}" not in st:
    count = st.count(old_stub)
    st = st.replace(old_stub, new_stub)
    spec.write_text(st, encoding="utf-8", newline="\n")
    print("spec stubs", count)
else:
    print("spec already")

print("ALL DONE")
