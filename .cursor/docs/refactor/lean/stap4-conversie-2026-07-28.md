# Lean rapport — Stap 4 conversie — 2026-07-28

## Meta

| Veld | Waarde |
|------|--------|
| Cluster | Stap 4 conversie (merge tabOutputs ↔ semantic ↔ FML-bron) |
| Scope-paden | `merge-tab-outputs`, `build-semantic-walls-*`, `ensureSemantic*`, pipeline UI |
| Status | **B1–B3 done**; `hasFmlSemanticSource` gate → FML lean |
| Bron-refactor | [`../stap4-conversie-2026-07-25.md`](../stap4-conversie-2026-07-25.md) |
| Gerelateerde docs | consumer-chain `00-result-fml` |

## Samenvatting

- Production Batch 1–3 gedaan (`ensureSemantic`, consts, live `orientedDoors`).
- Lean-restant: merge↔`semanticAsSegments` (**I**), discarded median (**R/D**), dubbele `buildJunctionGraph` (**R**).
- Openings buiten `tabOutputs` = correct (**F**).

## INDEX

| Pad | ~Regels | Rol | Owners |
|-----|---------|-----|--------|
| `cv/pipeline/merge-tab-outputs.ts` | 50 | merge entry | `SEMANTIC_SEGMENT_CONFIDENCE` |
| `cv/pipeline/compose-layers.ts` | 46 | geometry shell | lege segments by design |
| `cv/walls/rooms/build-semantic-walls-source.ts` | 77 | FML-bron / graph | `buildJunctionGraph` |
| `…/build-semantic-walls-output.ts` | 130 | build + ensure | source + thickness |
| `…/semantic-wall-constants.ts` | 8 | tuning | eps / confidence |
| `ui/.../useWorkspaceSemanticWalls.ts` | 26 | UI write-back | ensure helper |
| `ui/.../useWorkspacePipeline.ts` | 125 | `combinedOutput` | `mergeTabOutputs` |
| `ui/.../useWorkspaceRoomPipeline.ts` | 185 | finalize → semantic | — |
| `ui/.../workspace-fml-generate.ts` | 238 | FML generate | layer12/14 |
| `core/fml/layer-openings-to-fml.ts` | ~42 | opening DTO map | OrientedDoor / BoundWindow |

## Call-flow (kort)

```
finalize → tabOutputs.walls (+ pipelineV3Debug)
  → ensureSemanticWallsOnTabOutputs (fmlReady + L10)
  → orientedDoors / boundWindows (parallel)
  → mergeTabOutputs → extractionToPlan → FML
```

## Findings

### I — Inline duplicaat

| Item | Locaties | Owner-voorstel | Batch | Risico |
|------|----------|----------------|-------|--------|
| Semantic → `SegmentCandidate[]` | `semanticAsSegments` + zelfde map in `mergeTabOutputs` | merge roept `semanticAsSegments` | 1 | Laag |

### R — Redundant werk

| Item | Waar (dubbel) | Behoud-pad | Batch | Risico |
|------|---------------|------------|-------|--------|
| `estimateMedianThicknessPx` return genegeerd | `build-semantic-walls-output` | knip call | 1 | Laag |
| `buildJunctionGraph` 2× | source graph + wallGraph fallback | hergebruik edges/nodes | 2 ✓ | Mid |
| `orientedDoorsForFml` mirror-copy | `useWorkspace` watch | directe refs + late-bind FML | 3 ✓ | Mid |

### W — Wet variant

| Locatie A | Locatie B | Consolideren? | Batch | Risico |
|-----------|-----------|---------------|-------|--------|
| `hasFmlSemanticSource` | `generatedPlan` check alleen segments.length | align gate | **defer → FML lean** | Laag–mid |

### O — Over-abstractie

| Wrapper | Roept alleen door naar | Actie | Batch | Risico |
|---------|------------------------|-------|-------|--------|
| `useWorkspaceSemanticWalls` | ensure + ref write | behouden (UI-seam) | F | — |

### C — Verkeerde home

| Logica | Nu in | Hoort in | Batch | Risico |
|--------|-------|----------|-------|--------|
| Geen zware C na Batch 2 | — | — | — | — |

### N — Inconsistente vorm

| Concern | Varianten | Canonieke vorm | Batch | Risico |
|---------|-----------|----------------|-------|--------|
| Comment “legacy V2 L9/L8” | output JSDoc | V3-only tekst | 1 | Laag |
| `usedLayerBFallback` altijd false | veld | later knip / F | later | Laag |

### D / M / H — Restanten

| Cat | Item | Actie | Batch | Risico |
|-----|------|-------|-------|--------|
| D | discarded median call | knip | 1 | Laag |

### F / P — Bewust / policy

| Item | Reden |
|------|-------|
| Openings niet in `tabOutputs` / compose | parallel L12/L14 |
| `fmlReady`-gate; geen L8/L9 fallback | incomplete V3 ≠ FML |
| Debug passthrough in merge | Result overlays |

## Voorgestelde batches

1. **Batch 1 — merge DRY + dode median + comment** (laag) — `merge-tab-outputs`, `build-semantic-walls-output` — tests: build-semantic-walls-output, layer-flow — niet: debug strippen.
2. **Batch 2 — junction graph één keer** (mid) — hergebruik graph voor `wallGraph` — niet: FML `resolveGraph` hier.
3. **Batch 3 — FML openings refs zonder mirror** (mid) — `useWorkspace` init-order — smoke: Project4 → vector — niet: openings in geometry-pipeline.

## Niet doen

- Openings via compose/geometry-pipeline
- FML uit incomplete V3
- God-splits (map al klein)

## Verificatie

- [x] B2: `vitest run tests/cv/walls/build-semantic-walls-output.spec.ts tests/cv/layer-flow.spec.ts` (11 groen)
- [x] B3: `vitest run tests/ui/use-workspace-fml.spec.ts` (2 groen)
- [ ] UI-smoke Project4 afronden → FML (muurcount/dikte; L12-deuren + L14-ramen)

## Log

| Datum | Fase / Batch | Resultaat |
|-------|--------------|-----------|
| 2026-07-28 | INDEX/DOCUMENT/DISCUSS | inventaris |
| 2026-07-28 | Batch 1 | merge → `semanticAsSegments`; dode median weg; V3 JSDoc |
| 2026-07-28 | Batch 2 | `buildSemanticGraphFromFmlLayer` → `{ semantic, wallGraph }`; 2e `buildJunctionGraph` weg; wallGraph↔semantic edges/nodes-spec |
| 2026-07-28 | Batch 3 | FML late-bind na windowFaces; directe `orientedDoors`/`boundWindows`; knip `*ForFml` + watches |
| 2026-07-28 | W-gate | `hasFmlSemanticSource` ↔ `generatedPlan` **defer → FML lean** |
