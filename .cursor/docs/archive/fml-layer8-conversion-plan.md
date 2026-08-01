# Muren → FML conversie (compose ↔ semantic)

**Status:** actuele seam (V3). Historische titel “layer8” blijft in het pad voor bestaande links; productiebron is **L10 + `fmlReady`**, niet L8/L9.

Gerelateerd: [`workspace-flow.md`](./workspace-flow.md) stap 4, [`refactor/stap4-conversie-2026-07-25.md`](./refactor/stap4-conversie-2026-07-25.md), [`refactor/consumer-chain/00-result-fml.md`](./refactor/consumer-chain/00-result-fml.md).

## Seam (kort)

```
finalize (stap 3)
  → geometry-pipeline → composeLayers  → tabOutputs.walls
       (compose: lege segments by design; géén wall/wallGraph inject)
  → pipelineV3Debug L1–L10 + roomWallMaskRle + fmlReady-gate
  → buildSemanticWallsForOutput / ensureSemanticWallsOnTabOutputs
       (alleen als resolveFmlSourceLayer = L10 bij fmlReady)
  → tabOutputs.walls.semanticWallGraph (+ segments/wallGraph write-back)
  → mergeTabOutputs → combinedOutput
  → extractionToPlan → harmonizeFmlWallThickness → buildFmlV3
```

| Stap | Rol |
|------|-----|
| `composeLayers` | Meta/extractor-shell; `segments: []` zonder `wall` param. Openings **niet** hier. |
| Semantic post-finalize | Canonieke FML-muren uit L10. Incomplete V3 → geen semantic / geen valse FML-muren. |
| `mergeTabOutputs` | Prefereert `semanticWallGraph` → `segments`; debug/`pipelineV*Debug` passthrough = Result **overlays**, niet `extractionToPlan`. |
| Openings | L12 deuren + L14 ramen via UI-refs (`orientedDoors` / `boundWindows`) — buiten `tabOutputs`. |

## Contract

- `tabOutputs` vullen in detectie-run; semantic write-back = **conversie**, geen her-detectie.
- Nooit L8/L9 fallback voor FML terwijl V3 incompleet is (`fmlReady !== true`).
- Dikte: `thicknessPxMax` op semantic segments → cm in `extractionToPlan`; daarna `harmonizeFmlWallThickness` (tier-model, zie `decisions.md`).

## Owner-modules

| Concern | Pad |
|---------|-----|
| Compose | `frontend/src/cv/pipeline/compose-layers.ts` |
| Merge | `frontend/src/cv/pipeline/merge-tab-outputs.ts` |
| Semantic build | `frontend/src/cv/walls/rooms/build-semantic-walls-output.ts` (+ `-v2` graph) |
| UI write-back | `useWorkspaceSemanticWalls` → `ensureSemanticWallsOnTabOutputs` |
| FML plan | `frontend/src/core/fml/extractionToPlan.ts` |
