from pathlib import Path
import re

root = Path(r"c:\Pranimate\BouwToFMLV3\frontend")

# ---- usePlanCanvasSurfaceEdit.ts ----
path = root / "src/ui/composables/plan-canvas/usePlanCanvasSurfaceEdit.ts"
t = path.read_text(encoding="utf-8")

if "handleTypeKey" not in t:
    t = t.replace(
        "import { ref, watch } from 'vue'\n",
        "import { computed, ref, watch } from 'vue'\n"
        "import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'\n"
        "import {\n"
        "  applyDrawTypeKey,\n"
        "  isDrawTypeLengthKey,\n"
        "  parseDrawLengthDraftToCm,\n"
        "} from '@/ui/composables/canvas-kernel/plan-canvas-draw-measure'\n",
    )

    t = t.replace(
        "  /** Nokbalk onder de klik: niet opeten, zodat de nok geopend kan worden. */\n"
        "  isRidgeHit?: (cm: Point2D) => boolean\n"
        "}) {",
        "  /** Nokbalk onder de klik: niet opeten, zodat de nok geopend kan worden. */\n"
        "  isRidgeHit?: (cm: Point2D) => boolean\n"
        "  getInputUnit?: () => ScaleInputUnit\n"
        "}) {",
    )

    t = t.replace(
        "  const draggingVertexIndex = ref<number | null>(null)\n"
        "  const selectedVertexIndex = ref<number | null>(null)\n"
        "\n"
        "  watch(\n"
        "    () => options.selection.surfaceEditId.value,\n"
        "    () => {\n"
        "      selectedVertexIndex.value = null\n"
        "    },\n"
        "  )\n",
        "  const draggingVertexIndex = ref<number | null>(null)\n"
        "  const selectedVertexIndex = ref<number | null>(null)\n"
        "  const typeText = ref('')\n"
        "  const measureLengthCm = ref(0)\n"
        "\n"
        "  function inputUnit(): ScaleInputUnit {\n"
        "    return options.getInputUnit?.() ?? 'm'\n"
        "  }\n"
        "\n"
        "  function clearTypeDraft(): void {\n"
        "    typeText.value = ''\n"
        "    syncMeasureLength()\n"
        "  }\n"
        "\n"
        "  function syncMeasureLength(): void {\n"
        "    const idx = selectedVertexIndex.value\n"
        "    const poly = currentPoly()\n"
        "    if (idx == null || !poly?.[idx]) {\n"
        "      measureLengthCm.value = 0\n"
        "      return\n"
        "    }\n"
        "    if (typeText.value) {\n"
        "      const parsed = parseDrawLengthDraftToCm(typeText.value, inputUnit())\n"
        "      measureLengthCm.value =\n"
        "        parsed != null ? Math.abs(parsed) : Math.abs(poly[idx].z ?? 0)\n"
        "      return\n"
        "    }\n"
        "    measureLengthCm.value = Math.abs(poly[idx].z ?? 0)\n"
        "  }\n"
        "\n"
        "  const vertexLabelCm = computed(() => {\n"
        "    const idx = selectedVertexIndex.value\n"
        "    const poly = currentPoly()\n"
        "    if (idx == null || !poly?.[idx]) return null\n"
        "    return { x: poly[idx].x, y: poly[idx].y }\n"
        "  })\n"
        "\n"
        "  watch(\n"
        "    () => options.selection.surfaceEditId.value,\n"
        "    () => {\n"
        "      selectedVertexIndex.value = null\n"
        "      clearTypeDraft()\n"
        "    },\n"
        "  )\n"
        "  watch(selectedVertexIndex, () => {\n"
        "    clearTypeDraft()\n"
        "  })\n",
    )

    # Fix: currentPoly is used before definition in the inserted block.
    # Move typing helpers AFTER currentPoly, or use inline surface lookup in syncMeasureLength.
    # Safer: revert the early insert and put typing after currentPoly exists.

path.write_text(t, encoding="utf-8", newline="\n")
print("pass1 done, check if broken")
# Verify currentPoly order
text = path.read_text(encoding="utf-8")
idx_sync = text.find("function syncMeasureLength")
idx_poly = text.find("function currentPoly")
print("sync at", idx_sync, "poly at", idx_poly, "order ok", idx_poly < idx_sync if idx_sync>0 and idx_poly>0 else "n/a")
