from pathlib import Path
import re

root = Path(r"c:\Pranimate\BouwToFMLV3\frontend")

# ---- SelectionCoordinator ----
sc_path = root / "src/ui/composables/plan-canvas/usePlanCanvasSelectionCoordinator.ts"
sc = sc_path.read_text(encoding="utf-8")

if "getInputUnit?:" not in sc:
    # Add to interface — find end of SelectionCoordinatorOptions
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
        raise SystemExit("surfaceEdit call not found in SC")
    sc = sc.replace(old_call, new_call, 1)

sc_path.write_text(sc, encoding="utf-8", newline="\n")
print("SC ok")

# ---- Interaction: pass getInputUnit into selCoord ----
it_path = root / "src/ui/composables/plan-canvas/usePlanCanvasInteraction.ts"
it = it_path.read_text(encoding="utf-8")

m = re.search(
    r"const selCoord = usePlanCanvasSelectionCoordinator\(\{([\s\S]*?)\n  \}\)",
    it,
)
if not m:
    raise SystemExit("selCoord call not found")
block = m.group(0)
if "getInputUnit:" not in block:
    if "ensureRidgeZDraft," in block:
        block2 = block.replace(
            "ensureRidgeZDraft,",
            "ensureRidgeZDraft,\n    getInputUnit: options.getInputUnit,",
            1,
        )
    else:
        # append before closing
        block2 = block[:-3] + "  getInputUnit: options.getInputUnit,\n  })"
    it = it.replace(block, block2, 1)
    print("IT selCoord getInputUnit")
else:
    print("IT selCoord already has getInputUnit")

# keyboard: expand surfaceEdit pass-through
# Find createPlanCanvasEditorKeyHandlers({ ... surfaceEdit, or surfaceEdit: {
kb_start = it.find("createPlanCanvasEditorKeyHandlers({")
if kb_start < 0:
    # alternate name
    kb_start = it.find("createPlanCanvasEditorKeyHandlers")
print("keyboard at", kb_start)

# Export roof typing fields
if "roofVertexTypeText" not in it:
    for old, new in [
        (
            "    roofVertexIndex: surfaceEdit.selectedVertexIndex,\n"
            "    setRoofVertexZ: surfaceEdit.setSelectedVertexZ,",
            "    roofVertexIndex: surfaceEdit.selectedVertexIndex,\n"
            "    setRoofVertexZ: surfaceEdit.setSelectedVertexZ,\n"
            "    roofVertexTypeText: surfaceEdit.typeText,\n"
            "    roofVertexMeasureLengthCm: surfaceEdit.measureLengthCm,\n"
            "    roofVertexLabelCm: surfaceEdit.vertexLabelCm,",
        ),
        (
            "    roofVertexIndex: surfaceEdit.selectedVertexIndex,\n"
            "    setRoofVertexZ: surfaceEdit.setSelectedVertexZ,",
            "    roofVertexIndex: surfaceEdit.selectedVertexIndex,\n"
            "    setRoofVertexZ: surfaceEdit.setSelectedVertexZ,\n"
            "    roofVertexTypeText: surfaceEdit.typeText,\n"
            "    roofVertexMeasureLengthCm: surfaceEdit.measureLengthCm,\n"
            "    roofVertexLabelCm: surfaceEdit.vertexLabelCm,",
        ),
    ]:
        if old in it:
            it = it.replace(old, new, 1)
            print("IT exports")
            break
    else:
        # dump nearby
        idx = it.find("roofVertexIndex")
        print("EXPORT FAIL near", repr(it[idx : idx + 200]))

# Pass richer surfaceEdit into keyboard if it's a shorthand
snippet = it[kb_start : kb_start + 900] if kb_start >= 0 else ""
if "surfaceEdit," in snippet and "surfaceEdit: {" not in snippet:
    it = it.replace(
        "    surfaceEdit,\n",
        "    surfaceEdit: {\n"
        "      cancelDrag: surfaceEdit.cancelDrag,\n"
        "      selectedVertexIndex: surfaceEdit.selectedVertexIndex,\n"
        "      handleTypeKey: surfaceEdit.handleTypeKey,\n"
        "      commitFromMeasure: surfaceEdit.commitFromMeasure,\n"
        "      clearTypeDraft: surfaceEdit.clearTypeDraft,\n"
        "      typeText: surfaceEdit.typeText,\n"
        "    },\n",
        1,
    )
    print("IT keyboard surfaceEdit expanded")

it_path.write_text(it, encoding="utf-8", newline="\n")
print("IT ok")
