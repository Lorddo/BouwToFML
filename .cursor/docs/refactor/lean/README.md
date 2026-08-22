# Lean/DRY code-review — index

**Datum:** 2026-08-22 (FML editor lean + touch)  
**Status:** Campagne **2026-08-22** (plan-canvas touch, opening-velden, slicer, elevation, viewer-shell). Product-gates / hidden meerwerk-UI **niet** verwijderd.  
**Skill:** [`.cursor/skills/lean-dry-review/SKILL.md`](../../skills/lean-dry-review/SKILL.md)  
**Voorafgaand:** [production-refactor README](../README.md)  
**Campagne-plan:** [`.cursor/plans/fml_lean_touch_e0de74d4.plan.md`](../../plans/fml_lean_touch_e0de74d4.plan.md)

## Verschil

Beoordeelt **logica** (DRY, lean, geen dubbel werk, juiste home) — niet opnieuw god-files splitten.

## Campagne 2026-08-22 — FML editor + touch

| Fase / Cluster | Rapport | Status |
|----------------|---------|--------|
| FML editor/elevation/touch | [`fml-editor-2026-08-22.md`](./fml-editor-2026-08-22.md) | B1–B8 |

Zie rapport voor snap-tabel, touch-matrix en batchlog.

## Campagne 2026-08-18 — VERBETER-log

| Fase / Cluster | Rapport | Status |
|----------------|---------|--------|
| 0 Knip baseline | [`app-cleanup-2026-08-18.md`](./app-cleanup-2026-08-18.md) | Done |
| Cleanup B1+P2 | window-dedupe / stamp / ref-door + CV orphans; dode leafs weg | **Done** |
| 1 FML editor/viewer | [`fml-editor-viewer-2026-08-18.md`](./fml-editor-viewer-2026-08-18.md) | **B1–B5 Done** (B4=F doc) |
| 2 FML core | [`stap4-fml-core-2026-08-18.md`](./stap4-fml-core-2026-08-18.md) | Batch 1+1b+2+2b+4 **done**; CRUD add/update/remove nog UI; Batch 3 fixture-symbols = **F later** |
| 3 Workspace facade | [`workspace-facade-2026-08-18.md`](./workspace-facade-2026-08-18.md) | **B1 Done** — 11 dead return keys |
| 4 UI panels | [`ui-panels-2026-08-18.md`](./ui-panels-2026-08-18.md) | Skip |
| 5 CV delta | [`cv-delta-2026-08-18.md`](./cv-delta-2026-08-18.md) | **B Done** |

### Cluster 1 batches (uitgevoerd)

1. **B1** — `useFmlPreviewInspect` + `fml-preview-editor-keyboard` + shared `HitTestApi`; default-comment area gate gefixt  
2. **B2** — `useFmlViewerSessionDefaults` / `Inspect` / `Load` uit `FmlViewerView`  
3. **B3** — `bindNumericDraftField` in wall + opening selection  
4. **B4** — pick-order **F** (gedocumenteerd in `fml-inspect.ts`)  
5. **B5** — ToolbarSettings → Wall/Opening/Area/Label children (~1117→332)

### Bewust niet

- Product-gates / verborgen meerwerk-UI (area/surface/orient/roomtag)  
- `fixture-symbols.ts` kind-split (G later)  
- Detectie-tuning / L6 / `baseline.ts`  
- Viewer-defaults mergen met workspace floor-defaults  

### Verificatie

- `npm run build` — groen  
- Gerichte vitest: fml-inspect, draft-commit, editor, toolbar, orient, roundtrip, viewer-defaults, areas — groen  

## Cluster-rapporten (2026-07-28 baseline — detectie closed)

| # | Cluster | Rapport | Status |
|---|---------|---------|--------|
| 1–8 | Stap1–UI | zie 2026-07-28 docs | closed (detectie) |

## Finding-categorieën (kort)

**I** inline duplicaat · **R** redundant werk · **W** wet variant · **O** over-abstractie · **C** verkeerde home · **N** inconsistente vorm · **D/M/H** restanten · **F/P** bewust/policy

## Niet doen (pass-breed)

- God-split om regels  
- Detectie-tuning, L6 Cat C, `baseline.ts`  
- Product-gates als “dode code” knippen  
- Deur↔raam policy mergen zonder besluit  
