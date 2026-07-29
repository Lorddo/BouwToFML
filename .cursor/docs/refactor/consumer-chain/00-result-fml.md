# 00 — Result / FML: wat consumeert de eindstap?

**Datum:** 2026-07-26  
**Lens:** reverse consumer (zie [`README.md`](./README.md))  
**Bronnen:** `useWorkspaceFml.ts`, `extractionToPlan.ts`, `buildFmlV3.ts`, `merge-tab-outputs.ts`, `useWorkspaceSemanticWalls.ts`

## Verdict

FML/vector heeft een **dunne** input nodig. Bijna alles uit Stage 1–4 en L1–L9 is upstream gate of review — niet FML-JSON.

```
tabOutputs.walls ──merge──► combinedOutput ─┐
  (semanticWallGraph L10)                   ├─► extractionToPlan ─► FloorPlan ─► buildFmlV3
orientedDoors (L12) ──toLayer12DoorForFml───┤
boundWindows (L14) ──toLayer14WindowForFml──┘
+ scale px/mm + UI hoogte/dikte defaults
+ kleur-underlay (preview/download apart)
```

Deuren/ramen zitten **niet** in `tabOutputs` — aparte refs uit face-composables. Deur-swing HTML-export hergebruikt live L12 (`orientedDoors`); re-snap alleen als live L12 leeg is.

## Entry points

| Rol | Pad |
|-----|-----|
| Enter result | `useWorkspaceFlow.onEnterResultStep` → `semanticWalls.buildForResultStep` |
| Merge | `useWorkspacePipeline` → `mergeTabOutputs` |
| FML | `useWorkspaceFml` → `generatedPlan` / `previewPlan` / download |
| Result tabs | `walls` (overlays) vs `vector` (FML) |

## Wat FML wél leest (P)

### Muren (`ExtractionOutput` / `combinedOutput`)

| Veld | Rol |
|------|-----|
| `semanticWallGraph.segments[].{a,b,thicknessPxMax,balancePx}` | Topologie + dikte |
| Array-index van segment | Match met L12/L14 `segmentIndex` |
| Fallback: plain `segments` / `wallGraph` | Alleen zonder semantic |
| `meta.templateKernels` | Optionele dikte-fallback |

Gate bij build (niet door FML-code gelezen): `pipelineV3Debug.summary.fmlReady` + L10 aanwezig → `resolveFmlSourceLayer`.

### Deuren (L12 → `Layer12DoorForFml`)

| Veld | Rol |
|------|-----|
| `doorId`, `segmentIndex`, `fmlRefId`, `mirrored` | Opening-identity + attach |
| `openingStartPx` / `openingEndPx` | Breedte + `t` (herberekend) |

Gate: finite span; `widthCm > 0.5`.

### Ramen (L14 → `Layer14WindowForFml`)

| Veld | Rol |
|------|-----|
| `windowId`, `segmentIndex`, `fmlRefId` | Opening |
| `openingStartPx` / `openingEndPx` | Breedte + `t` |

Gate: finite span; `widthCm > 0.5` of `widthPx > 0`.

### Overig

| Input | Rol |
|-------|-----|
| `pixelsPerMillimeterX/Y` | cm-conversie |
| UI wall height / thickness defaults | Plan defaults + harmonize bands |
| `workingImageSrc` (kleur) | Underlay in preview/export — **niet** B/W |

## Wat Result-walls-tab nog leest (O) — niet FML

| Output | Gebruik |
|--------|---------|
| `pipelineV3Debug.layers.layer1…10` | Overlay-toggles |
| L12/L14 overlay geometry | Opening-lijnen / bbox |
| `roomWallMaskRle` | “Used wall mask” / exports |
| Layer-debug JSON/MD | Regressie |

Dus: Result ≠ alleen FML. Opruimen van debug-payload raakt walls-tab / layer-debug tenzij je die bewust afkapt.

## Orphans / ongebruikt door FML (X of D)

| Item | Tag | Notitie |
|------|-----|---------|
| Hele L11 `BoundDoor` surface | G→L12 | FML ziet alleen L12 |
| L12 `display*`, hinge, leaf/arc/arrow, framing px | O | Overlay; framing al in opening-span |
| `snappedBBox` op FML-DTO | F | Merge-helper + overlays; **niet** naar `Opening` |
| ~~`openingBBox` op FML-DTO~~ | — | **Ronde 17** weg; BoundWindow behouden |
| Precomputed `t` op Bound/Oriented | X | FML herberekent uit start/end |
| `mergeTabOutputs` → `debug*`, `pipelineV*Debug`, `candidates:[]` | D/O | Overlays; niet `extractionToPlan` |
| ~~Semantic `lengthPx`/`angleDeg`~~ | — | **Ronde 17** weg; `junctions[]` + junction ids **P** voor L14 |
| `candidates` | X | Merge forceert `[]` |

## Contract: minimale handoff naar FML

```
semanticWallGraph.segments (L10, fmlReady)
+ orientedDoors[].{segmentIndex, fmlRefId, mirrored, openingStartPx, openingEndPx}
+ boundWindows[].{segmentIndex, fmlRefId, openingStartPx, openingEndPx}
+ scale confirmed
(+ kleur-underlay voor preview)
```

## Cleanup-richting

1. ~~**Laag:** FML-DTO zonder `openingBBox`~~ **ronde 17** (`snappedBBox` blijft F)
2. **Mid:** `mergeTabOutputs` FML-slice vs debug/overlay (documenteer; runtime-strip = F) — zie ronde 6
3. **Niet:** L11/L12 overlayvelden schrappen zolang Result-walls + editor ze gebruiken.

## Volgende doc

Wat moet muren-detectie leveren zodat dit contract gevuld wordt → [`01-walls-l0-l10.md`](./01-walls-l0-l10.md).
