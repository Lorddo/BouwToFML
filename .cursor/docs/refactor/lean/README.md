# Lean/DRY code-review — index

**Datum:** 2026-07-29  
**Status:** skill + 8× inventaris + cross B1 + Stap1–2 + Doors D1 + Windows B1–B2 + Stap4 conversie B1–B3 + **FML B1–B4** + **UI B1–B2 (B3=F)** + **Walls L0–L4 closed** (W1–W3) + **Walls L5–L6 structural closed** (A–E; **Cat C = product-F**) + **Walls L7–L10 closed** (B1–B4 + dist-map pass-through).  
**Skill:** [`.cursor/skills/lean-dry-review/SKILL.md`](../../skills/lean-dry-review/SKILL.md)  
**Voorafgaand:** [production-refactor README](../README.md) — bron, niet vervangen.

## Verschil

Beoordeelt **logica** (DRY, lean, geen dubbel werk, juiste home) — niet opnieuw god-files splitten.

## Cluster-rapporten

| # | Cluster | Rapport | Status |
|---|---------|---------|--------|
| 1 | Stap 1 Onderlegger | [`stap1-onderlegger-2026-07-28.md`](./stap1-onderlegger-2026-07-28.md) | B1–B3 done |
| 2 | Stap 2 Voorbewerking | [`stap2-voorbewerking-2026-07-28.md`](./stap2-voorbewerking-2026-07-28.md) | B1–B4 done |
| 3 | Walls L0–L10 | [`stap3-wall-detectie-2026-07-28.md`](./stap3-wall-detectie-2026-07-28.md) | **L0–L4** (W1–W3) + **L5–L6 structure** + **L7–L10** (B1–B4 + dist-map) closed; Cat C = product-F |
| 4 | Doors + L11/L12 | [`stap3-door-detectie-2026-07-28.md`](./stap3-door-detectie-2026-07-28.md) | **D1 af**; D2 = F |
| 5 | Windows + L14 | [`stap3-window-detectie-2026-07-28.md`](./stap3-window-detectie-2026-07-28.md) | **B1–B2 done; B3 = F** |
| 6 | Stap 4 Conversie | [`stap4-conversie-2026-07-28.md`](./stap4-conversie-2026-07-28.md) | **B1–B3 done**; W-gate → FML |
| 7 | Stap 4 FML | [`stap4-fml-2026-07-28.md`](./stap4-fml-2026-07-28.md) | **B1–B4 done**; hasFmlSemanticSource = F |
| 8 | UI / UX workspace | [`ui-ux-workspace-2026-07-28.md`](./ui-ux-workspace-2026-07-28.md) | **B1–B2 done; B3 = F** |

## Finding-categorieën (kort)

**I** inline duplicaat · **R** redundant werk · **W** wet variant · **O** over-abstractie · **C** verkeerde home · **N** inconsistente vorm · **D/M/H** restanten · **F/P** bewust/policy

## Batch-log

| Datum | Cluster | Batch | Resultaat |
|-------|---------|-------|-----------|
| 2026-07-28 | — | setup | Skill + index + 8 inventaris-rapporten |
| 2026-07-28 | cross | B1 lean | merge/`semanticAsSegments`; dode median; unused deps; `buildCombinedPreview` weg; labels/`mapFromEntries`; door `round2`/`clampBounds`; window evidence-geom; `recalculateWorkspaceFaces` inklap — 317 vitest groen |
| 2026-07-28 | Stap1 | B2–B3 | `mapPointAfterUiRotation` + `ROTATION_EPS_DEG`; `createByteArrayHistory` (mask+ink); `isUndoKey`; `resolveDisplayImageSrc`; knip ink history uit compose |
| 2026-07-28 | Doors | D1 rest | `resolveClassAtLabel` + expliciete missing; snap applyOverrides; BBoxBounds DRY; L12 normalizeVector; dual epoch-cache; D2 = F — 145 door-tests groen |
| 2026-07-28 | Stap2 | B2–B4 | publish/masks/debounce DRY; shared `buildWallLayerBwMat` + `bwBytesToCanvas`; dikte/style/REF op post-bake `baseBw` (nooit effectiveBw) — 14 compose/ref tests groen |
| 2026-07-28 | Windows | B2 + B3=F | `buildEvidenceStats` + `window-stage3-retarget`; unalias dual → `resolveFloorDual`; L14↔L11 segment-geom = F — 71 window-tests groen |
| 2026-07-28 | Stap4 conversie | B2–B3 | junction graph 1× (`{ semantic, wallGraph }`); FML late-bind directe openings-refs; W-gate → FML lean — 13 vitest groen |
| 2026-07-28 | UI/UX | B1 rest + B2; B3=F | `faces-overrides-persist` + `faces-effective-classification`; window stats `{active,stats}`; generic filter + auto-pass shell = F — 12 prune/demote specs groen |
| 2026-07-28 | Stap4 FML | B1–B4 | DEFAULT_FML_*/clamps; `computeOpeningDraftState`; 1× graph/origin bundle; `filterOpeningsForEdge`; hasFmlSemanticSource = F — 53 vitest groen |
| 2026-07-29 | Walls L0–L4 | W1b+W2; W3 later | deserialize 1× paint + stats; `claimWallishAfterInherit`; slice eerst sans W3 |
| 2026-07-29 | Walls L7–L10 | B1–B3; B4 later | distanceMap 1× L7/9/10; `baseCollapsePolicy`; adjacency helpers; pass-through |
| 2026-07-29 | Walls L5–L6 | A–E; Cat C=F | cleanup 4-split + `segmentSetSignature`; junction/detect/apply/chamfer seam-splits; dead-export knip; **Cat C apart product-F** — 50 L5/L6+invariance groen |
| 2026-07-29 | Walls dist-map | pass-through | `distanceMap?` L2/L4/L7–L10; orchestrator 1×; UI-smoke user-OK; scaffold v2/arm stubs |
| 2026-07-29 | Walls finish | W3+B4 | `rebuildFaceJunctionsOnly` L2/L3; `withTopologyGuard` L7/L9/L10; Cat C skip; 122 pipeline-v3 groen |

## Open (na go)

- Walls lean structure **closed**; open product (geen lean-batch): **L6 Cat C** (apart product-go)
- FML: `hasFmlSemanticSource` ↔ `generatedPlan` gate (product-F)
- Doors: UI-smoke Project4 window-sourced doorframes (na raam-pass)
- UI-smoke: Project4 face demote + Deuren/Ramen stats
- Stap2 UI-smoke: Project4 inkt in LBE → Volgende dikte+style; REF-export toont inkt
- Windows UI-smoke: Project4 Stage 3 → L14 cyaan + FML; doorframe class
- Stap4 FML UI-smoke: Project4 select/move/spiegel/copy + underlay + twin double_wide + download
- Stap4 conversie UI-smoke: Project4 afronden → FML muren/openings
## Niet doen (pass-breed)

- God-split om regels
- Detectie-tuning, L6 Cat C, `baseline.ts`
- Deur↔raam policy mergen zonder besluit
