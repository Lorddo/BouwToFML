from pathlib import Path

path = Path(r"c:\Pranimate\BouwToFMLV3\frontend\src\ui\composables\plan-canvas\usePlanCanvasSurfaceEdit.ts")
t = path.read_text(encoding="utf-8")

# Detect actual helper names from the file itself
import re
current_surface = re.search(r"function (current\w*Surface)\(", t).group(1)
current_poly = re.search(r"function (current\w*Poly)\(", t).group(1)
print("helpers", current_surface, current_poly)

if "handleTypeKey" in t:
    print("already patched")
    raise SystemExit(0)

# 1) imports
t = t.replace(
    "import { ref, watch } from 'vue'\n",
    "import { computed, ref, watch } from 'vue'\n"
    "import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'\n"
    "import {\n"
    "  applyDrawTypeKey,\n"
    "  isDrawTypeLengthKey,\n"
    "  parseDrawLengthDraftToCm,\n"
    "} from '@/ui/composables/canvas-kernel/plan-canvas-draw-measure'\n",
    1,
)

# 2) options
t = t.replace(
    "  isRidgeHit?: (cm: Point2D) => boolean\n}) {",
    "  isRidgeHit?: (cm: Point2D) => boolean\n"
    "  getInputUnit?: () => ScaleInputUnit\n}) {",
    1,
)

# 3) state + watches — replace the selectedVertexIndex block
old_state = """  const draggingVertexIndex = ref<number | null>(null)
  const selectedVertexIndex = ref<number | null>(null)

  watch(
    () => options.selection.surfaceEditId.value,
    () => {
      selectedVertexIndex.value = null
    },
  )
"""

new_state = """  const draggingVertexIndex = ref<number | null>(null)
  const selectedVertexIndex = ref<number | null>(null)
  const typeText = ref('')
  const measureLengthCm = ref(0)

  function inputUnit(): ScaleInputUnit {
    return options.getInputUnit?.() ?? 'm'
  }

  function clearTypeDraft(): void {
    typeText.value = ''
    syncMeasureLength()
  }

  watch(
    () => options.selection.surfaceEditId.value,
    () => {
      selectedVertexIndex.value = null
      clearTypeDraft()
    },
  )
  watch(selectedVertexIndex, () => {
    clearTypeDraft()
  })
"""

if old_state not in t:
    raise SystemExit("state block not found")
t = t.replace(old_state, new_state, 1)

# 4) Replace applyVertexZ through return with extended version.
# Keep applyVertexZ body but add keepUndoOpen + typing API after setSelectedVertexZ.

old_tail = """  function applyVertexZ(index: number, zCm: number): void {
    const surface = currentSurface()
    if (!surface?.poly[index]) return
    const plan = options.editor.localPlan.value
    const z = isRoofSurface(surface)
      ? clampRoofVertexZCm(
          zCm,
          plan ? slabCmForRoofSurface(plan, surface.id) : DEFAULT_FLOOR_THICKNESS_CM,
        )
      : Math.max(0, Math.round(zCm))
    if (Math.round(surface.poly[index]?.z ?? 0) === z) return
    if (!didPushUndo) {
      options.editor.pushUndo()
      didPushUndo = true
    }
    const next = surface.poly.map((point, i) => (i === index ? { ...point, z } : point))
    options.editor.updateSurface(surface.id, { poly: next })
    if (isRoofSurface(surface)) {
      options.editor.applyWallsAfterRoofEdit(surface.id)
    }
    options.syncPlanToParent()
    didPushUndo = false
  }

  function flushPendingVertexZ(): void {
    if (!pendingZ) return
    applyVertexZ(pendingZ.index, pendingZ.z)
    pendingZ = null
  }

  function setSelectedVertexZ(zCm: number): void {
    const idx = selectedVertexIndex.value
    if (idx == null) return
    pendingZ = { index: idx, z: zCm }
    applyVertexZ(idx, pendingZ.z)
  }

  return {
    isEditing,
    onPointerDown,
    cancelDrag,
    draggingVertexIndex,
    selectedVertexIndex,
    setSelectedVertexZ,
  }
}
"""

# Extract actual tail from file (names may differ slightly)
m = re.search(
    r"  function applyVertexZ\(index: number, zCm: number\): void \{[\s\S]*\n\}\n\Z",
    t,
)
if not m:
    raise SystemExit("tail not found")
actual_tail = m.group(0)
print("tail starts:", actual_tail[:80].replace("\n", " | "))

# Build new tail from actual applyVertexZ but modify didPushUndo reset
# Parse the clamp call from actual
apply_match = re.search(
    r"  function applyVertexZ\(index: number, zCm: number\): void \{([\s\S]*?)\n  \}\n\n  function flushPendingVertexZ",
    t,
)
if not apply_match:
    raise SystemExit("apply body not found")
apply_body = apply_match.group(1)
# Change `didPushUndo = false` at end of apply to respect keepUndoOpen via signature change

new_tail = f"""  function applyVertexZ(index: number, zCm: number, keepUndoOpen = false): void {{
    const surface = {current_surface}()
    if (!surface?.poly[index]) return
""" 

# Get the z computation and rest from original apply body lines carefully by rewriting fully using detected names from file
# Re-read clamp / slab / default names from apply body
clamp_fn = re.search(r"\? (\w+)\(", apply_body).group(1)
slab_fn = re.search(r"plan \? (\w+)\(", apply_body).group(1)
default_const = re.search(r": (\w+)\s*,\s*\n\s*\)", apply_body)
# simpler extract
z_block = re.search(
    r"const z = isRoofSurface\(surface\)\s*\?([\s\S]*?): Math\.max\(0, Math\.round\(zCm\)\)",
    apply_body,
)
if not z_block:
    raise SystemExit("z block not found: " + apply_body[:200])
print("z block ok", clamp_fn, slab_fn)

new_tail = f"""  function syncMeasureLength(): void {{
    const idx = selectedVertexIndex.value
    const poly = {current_poly}()
    if (idx == null || !poly?.[idx]) {{
      measureLengthCm.value = 0
      return
    }}
    if (typeText.value) {{
      const parsed = parseDrawLengthDraftToCm(typeText.value, inputUnit())
      measureLengthCm.value =
        parsed != null ? Math.abs(parsed) : Math.abs(poly[idx].z ?? 0)
      return
    }}
    measureLengthCm.value = Math.abs(poly[idx].z ?? 0)
  }}

  const vertexLabelCm = computed(() => {{
    const idx = selectedVertexIndex.value
    const poly = {current_poly}()
    if (idx == null || !poly?.[idx]) return null
    return {{ x: poly[idx].x, y: poly[idx].y }}
  }})

  function applyVertexZ(index: number, zCm: number, keepUndoOpen = false): void {{
    const surface = {current_surface}()
    if (!surface?.poly[index]) return
    const plan = options.editor.localPlan.value
    const z = isRoofSurface(surface)
      ? {clamp_fn}(
          zCm,
          plan ? {slab_fn}(plan, surface.id) : DEFAULT_FLOOR_THICKNESS_CM,
        )
      : Math.max(0, Math.round(zCm))
    if (Math.round(surface.poly[index]?.z ?? 0) === z) {{
      syncMeasureLength()
      return
    }}
    if (!didPushUndo) {{
      options.editor.pushUndo()
      didPushUndo = true
    }}
    const next = surface.poly.map((point, i) => (i === index ? {{ ...point, z }} : point))
    options.editor.updateSurface(surface.id, {{ poly: next }})
    if (isRoofSurface(surface)) {{
      options.editor.applyWallsAfterRoofEdit(surface.id)
    }}
    options.syncPlanToParent()
    if (!keepUndoOpen) didPushUndo = false
    syncMeasureLength()
  }}

  function flushPendingVertexZ(): void {{
    if (!pendingZ) return
    applyVertexZ(pendingZ.index, pendingZ.z)
    pendingZ = null
  }}

  function setSelectedVertexZ(zCm: number): void {{
    const idx = selectedVertexIndex.value
    if (idx == null) return
    typeText.value = ''
    didPushUndo = false
    pendingZ = {{ index: idx, z: zCm }}
    applyVertexZ(idx, pendingZ.z)
  }}

  function handleTypeKey(event: KeyboardEvent): boolean {{
    if (selectedVertexIndex.value == null) return false
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) return true
    if (!isDrawTypeLengthKey(event)) return false
    const next = applyDrawTypeKey(typeText.value, event.key)
    if (next == null) return false
    typeText.value = next
    const parsed = parseDrawLengthDraftToCm(next, inputUnit())
    if (parsed != null) {{
      const idx = selectedVertexIndex.value
      pendingZ = {{ index: idx, z: parsed }}
      applyVertexZ(idx, parsed, true)
    }} else {{
      syncMeasureLength()
    }}
    return true
  }}

  function commitFromMeasure(): boolean {{
    if (selectedVertexIndex.value == null) return false
    if (!typeText.value) return false
    typeText.value = ''
    didPushUndo = false
    syncMeasureLength()
    return true
  }}

  return {{
    isEditing,
    onPointerDown,
    cancelDrag,
    draggingVertexIndex,
    selectedVertexIndex,
    setSelectedVertexZ,
    typeText,
    measureLengthCm,
    vertexLabelCm,
    handleTypeKey,
    commitFromMeasure,
    clearTypeDraft,
  }}
}}
"""

# Fix DEFAULT_FLOOR_THICKNESS_CM — use whatever constant the original apply used
default_m = re.search(r"plan \? \w+\(plan, surface\.id\) : (\w+)", apply_body)
default_name = default_m.group(1) if default_m else "DEFAULT_FLOOR_THICKNESS_CM"
new_tail = new_tail.replace("DEFAULT_FLOOR_THICKNESS_CM", default_name)

t2 = t[: m.start()] + new_tail
path.write_text(t2, encoding="utf-8", newline="\n")
print("wrote", path.stat().st_size)

# verify syntax-ish
text = path.read_text(encoding="utf-8")
assert "handleTypeKey" in text
assert "function syncMeasureLength" in text
assert text.count("function applyVertexZ") == 1
print("ok")
