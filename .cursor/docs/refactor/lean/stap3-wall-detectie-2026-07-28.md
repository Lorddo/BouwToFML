# Lean rapport — Walls L0–L10 — 2026-07-28

## Meta

| Veld | Waarde |
|------|--------|
| Cluster | Stap 3 wall detectie (L0 classify → finalize → V3 L1–L10) |
| Scope-paden | `room-first`, `room-ink-classify/**`, finalize, `room-raster-cache/**`, topology, pipeline-v3 |
| Status | **L0–L4** (W1–W3) + **L5–L6 structure** (A–E) + **L7–L10** (B1–B4 + dist-map) closed; **Cat C = product-F** (geen lean-batch) |
| Bron-refactor | [`../stap3-wall-detectie-2026-07-25.md`](../stap3-wall-detectie-2026-07-25.md) |
| Gerelateerde docs | consumer-chain `01-walls`, centralization-audit |

## Samenvatting

- Post-split: `pipelineV2Debug` **weg**; classify + raster-cache al barrels.
- Sterkste lean-winst: micro-DRY L0 + deserialize dubbel-canvas (**R**); wallish-claim sequence (**I/W**); L2/L3 non-weld rebuild (**I**); L7–L10 topology-guard (**I**).
- Batches: walls lean structure closed. Owners dual/claim/adj **niet** her-centraliseren. Cat C blijft product-F.

## INDEX

| Pad | ~Regels | Rol | Owners |
|-----|---------|-----|--------|
| `cv/walls/strategies/room-first.ts` | 461 | entry L0 + finalize→V3 | classify / claim / finalize / V3 |
| `cv/walls/rooms/room-ink-classify.ts` | 42 | barrel | mapping/effective/autoclass/render |
| `…/room-ink-classify-*.ts` | 124–393 | helpers/stages | TUNING |
| `…/room-wall-finalize-shared.ts` | 132 | finalize mask | mapping |
| `…/room-refine-topology.ts` | 276 | ink-resolve + claim | claim |
| `…/room-ink-process.ts` | 309 | ink-recalc review | classify + topology |
| `…/room-raster-cache*.ts` | 41–277 | cache surface | dual / claim / pin |
| `…/face-dual-space.ts` e.a. | — | DRY owners | audit done |
| `…/pipeline-v3/**` | ~10.5k | L1–L10 | **F** L6 Cat C (product) |
| `…/pipeline-debug.ts` | 8 | thin V3 debug | tests |

## Call-flow (kort)

- Classify → CC → ink-resolve → wallish claim → cache.
- Review ink → `room-ink-process` (dual invalidate via cache).
- Finalize → `prepareRoomFinalizeMask` → V3 → `pipelineV3Debug` + L10 `fmlReady`.
- Openings/UI: `ensureFaceDualSpace` / `resolveFloorDual` (geen lokale dual-builder).

## Findings

### I — Inline duplicaat

| Item | Locaties | Owner-voorstel | Batch | Risico |
|------|----------|----------------|-------|--------|
| `normalizeLabelsArray` + groupBy const | `room-first` + `room-ink-process` | shared helper/const | 1 | Laag |
| `mapFromEntries` | dual export vs lokaal in `room-face-migration` | import dual-helper | 1 | Laag |
| Wallish inherit→claim | autoclass ≈ refine-topology | `claimWallishAfterInherit` | 2 | Mid |
| L2/L3 face rebuild | lokale `buildFaceFromSegments` | `rebuildFaceJunctionsOnly` | W3 | Laag |
| L7/L9/L10 topology guard | kinds→op→preserve | `withTopologyGuard` | B4 | Mid |

### R — Redundant werk

| Item | Waar (dubbel) | Behoud-pad | Batch | Risico |
|------|---------------|------------|-------|--------|
| Deserialize schildert 2× zelfde paint | `classifiedMaskCanvas` ≡ `roomReferenceCanvas` | één paint of lazy preview | 1 | Laag |
| Full dual rebuild bij class-only pin | na claim/class | bbox-pad al lean; dual-invalidate bewust | F | — |

### W — Wet variant

| Locatie A | Locatie B | Consolideren? | Batch | Risico |
|-----------|-----------|---------------|-------|--------|
| Autoclass wallish-claim | Refine wallish-claim | helper extract | 2 | Mid |
| Classification stats vs handmatige filters | deserialize | stats-helper | 1 | Laag |

### O — Over-abstractie

| Wrapper | Roept alleen door naar | Actie | Batch | Risico |
|---------|------------------------|-------|--------|
| `pipeline-debug.resolveActivePipelineDebug` | `pipelineV3Debug` | houden (tests) of inline | 1 / F | Laag |
| Sync pin wrappers ×4 | `syncPinnedClassOverrides` | **F** (API-stabiel) | — | — |

### C — Verkeerde home

| Logica | Nu in | Hoort in | Batch | Risico |
|--------|-------|----------|-------|--------|
| Geen zware C post-split | — | — | — | — |
| `refineWallClassificationByKeptMask` | autoclass + specs only | half-steen documenteer | F | — |

### N — Inconsistente vorm

| Concern | Varianten | Canonieke vorm | Batch | Risico |
|---------|-----------|----------------|-------|--------|
| Effective class | cache helper vs handmatige Map-merge in UI | altijd `applyFaceClassificationOverrides` | doors B1 | Laag |
| Debug blob | alleen `pipelineV3Debug` | gedaan | — | — |

### D / M / H — Restanten

| Cat | Item | Actie | Batch | Risico |
|-----|------|-------|--------|--------|
| H/F | refine-by-kept-mask niet in finalize | documenteer F | — | — |
| M | abs-px / L6 | **F** | — | — |

### F / P — Bewust / policy

| Item | Reden |
|------|-------|
| L6 Cat C | productbesluit — **niet** in L5–L6 A–E; track F later (geen lean-batch) |
| Face-class niet in V3 | wall-face-class-flow |
| Dual invalidate bij topology/class | openings-correctheid |
| `baseline.ts` | harde regel |
| `layer6ConnectorPolicy` deprecated stub | scaffold assert static=15; live arm = `resolveLayer6Scale().armDetectPx` |

## Voorgestelde batches

1. **Batch W1 — micro-DRY L0** (laag) — shared normalizeLabels/groupBy; `mapFromEntries` import; deserialize één canvas — tests: classify/cache/process — niet: dual-lifecycle, V3.
2. **Batch W2 — wallish-claim helper** (mid) — extract inherit+claim; callers room-first + refine — smoke: Project4 classify→refine→afronden.
3. **NO-GO** — L6 Cat C; thickness god; abs-px retune; cache opnieuw splitsen om regels.

## Niet doen

- God-split pipeline-v3 / L6; face-class in V3
- Opnieuw centraliseren dual/claim/adjacency
- `pipelineV2Debug` “terug”

## Verificatie

- [x] gerichte walls/classify/cache specs
- [x] volle `tests/cv/walls/pipeline-v3` (122 groen, 2026-07-29)
- [x] UI-smoke Project4 (user, pre-W3/B4; behavior freeze)

## Log

| Datum | Fase / Batch | Resultaat |
|-------|--------------|-----------|
| 2026-07-28 | INDEX/DOCUMENT/DISCUSS | inventaris |
| 2026-07-28 | Batch W1 | `normalizeLabelsArray` shared; migration → `mapFromEntries` |
| 2026-07-29 | Batch W1b | deserialize 1× `renderClassifiedFaceMask` + `countClassificationStats`; 62 classify/cache/process groen |
| 2026-07-29 | Batch W2 | `claimWallishAfterInherit` in face-parent-claim; room-first + refine-topology wired; 74 specs groen |
| 2026-07-29 | L0–L4 close (sans W3) | Slice eerst closed zonder W3; later W3 alsnog gedaan |
| 2026-07-29 | L7–L10 core | B1 distanceMap inject; B2 `baseCollapsePolicy`; B3 adjacency DRY; L2/L4/L8 pass-through |
| 2026-07-29 | L5–L6 A–E | cleanup 4-ops + `segmentSetSignature`/HV tol; junction/detect/apply/chamfer seams; E knip; **Cat C = product-F** |
| 2026-07-29 | dist-map pass-through | `distanceMap?` L2/L4/L7–L10; `runPipelineV3` 1× inject; UI-smoke Project4 user-OK |
| 2026-07-29 | **W3 + B4 finish** | `rebuildFaceJunctionsOnly` L2/L3; `withTopologyGuard` L7/L9/L10; Cat C skip (plan “Expliciet later”); 122 pipeline-v3 groen |
