# Lean rapport — Windows stages + L14 — 2026-07-28

## Meta

| Veld | Waarde |
|------|--------|
| Cluster | Stap 3 raam-detectie (Stage 1–4 + L14 bind/merge) |
| Scope-paden | `run-window-stage-pipeline`, evidence-*, axel, wall-bind/merge, UI window faces |
| Status | **B1–B2 done; B3 = F** — cluster gesloten |
| Bron-refactor | [`../stap3-window-detectie-2026-07-25.md`](../stap3-window-detectie-2026-07-25.md) |
| Gerelateerde docs | window-detection-flow, consumer-chain `03-windows` |

## Samenvatting

- Dual/pipe **clean** — owners; geen lokale dual-rebuild; UI belt `resolveFloorDual` direct.
- Stage-3 retarget + stats in `window-stage3-retarget` / `buildEvidenceStats`.
- L14↔L11 segment-primitives bewust **niet** gedeeld (**F**).

## INDEX

| Pad | ~Regels | Rol | Owners |
|-----|---------|-----|--------|
| `cv/windows/run-window-stage-pipeline.ts` | ~130 | entry | `prepareOpeningPipeDual` |
| `window-stage3-retarget.ts` | ~90 | Stage 3 late retarget | door-arc predicate + evidence stats |
| `build-window-pipeline-from-workspace.ts` | ~80 | glue / UI entry | bands + `runWindowStagePipelineWithBands` |
| `window-axel-*.ts` | 209–387 | Stage 1 | `wall-ink-bridge` |
| `window-door-arc-filter.ts` | 289 | Stage 2 | policy assert |
| `window-evidence-*.ts` | 31–270 | Stage 3 | dual spaces + `buildEvidenceStats` |
| `window-resolve.ts` | 252 | Stage 4 | `unionFaceBBox` |
| `window-wall-bind.ts` / `window-wall-merge.ts` | 199 / 149 | L14 | semantic segments |
| `window-space-policy.ts` | 33 | policy | **F** vs deur |
| UI `useWorkspaceWindowFaces` + `window-faces-*` | 79–416 | UI | pipeline + bind |
| `faces-overrides-persist.ts` | ~52 | gedeelde persist (UI) | tabOutputs |

## Call-flow (kort)

- Refs → bands → `resolveFloorDual` → runner (pipeDual → S1→S2 → S3 raw ×2 → retarget → S4 ×2).
- Class push → `bindWindowsToWalls` + merge → `boundWindows` (niet `tabOutputs`).
- FML leest L14 span/`fmlRefId`.

## Findings

### I — Inline duplicaat

| Item | Locaties | Owner-voorstel | Batch | Risico |
|------|----------|----------------|-------|--------|
| `axisSpan` / `perpSpan` / gap / overlap | evidence-geom (canoniek) | importeer uit evidence-geom | 1 ✓ | Laag |
| `unionBBox` | evidence-geom / `unionFaceBBox` | prefer evidence-geom | 1 ✓ | Laag |
| Stage-3 stats-recount na retarget | `buildEvidenceStats` | evidence-filter | 2 ✓ | Laag |
| L14 clamp/round2/projectPoint | ≈ `door-wall-snap-geom` | **niet delen** | **F** | Mid |

### R — Redundant werk

| Item | Waar | Behoud-pad | Batch | Risico |
|------|------|------------|-------|--------|
| Geen lokale dual/pipe-rebuild | — | Owners OK | — | — |

### W — Wet variant

| Locatie A | Locatie B | Consolideren? | Batch | Risico |
|-----------|-----------|---------------|-------|--------|
| Stage-1 strip axis | Stage-3 evidence-geom | alleen overlap helpers | 1 ✓ | Laag |
| L14 bind vs L11 snap | ander contract (junction vs shift) | **Nee** | **F** | — |

### O — Over-abstractie

| Wrapper | Roept alleen door naar | Actie | Batch | Risico |
|---------|------------------------|-------|-------|--------|
| `resolveWindowFloorDual` | `resolveFloorDual` | **unalias** (2 callers) | 2 ✓ | Laag |
| `runWindowStagePipelineWithBands` | glue | behouden | F | — |

### C — Verkeerde home

| Logica | Nu in | Hoort in | Batch | Risico |
|--------|-------|----------|-------|--------|
| Late doorframe-retarget | `window-stage3-retarget.ts` | — | 2 ✓ | Laag–mid |
| Window persist rename | UI | → `faces-overrides-persist` | UI | **Done** |

### N — Inconsistente vorm

| Concern | Varianten | Canonieke vorm | Batch | Risico |
|---------|-----------|----------------|-------|--------|
| `unionBbox` vs `unionBBox` | strip vs evidence | andere arity — geen rename | 1/F | Laag |

### F / P — Bewust / policy

| Item | Reden |
|------|-------|
| Geen wall-rescue merge voor ramen | ≠ deur |
| `WINDOW_SPACE_POLICY` apart | contract |
| Doorframes → class, geen L14 | contract |
| L14↔L11 segment-primitives niet delen | junction-bind ≠ bbox-shift; cross-package owner = over-DRY |

## Voorgestelde batches

1. **Batch 1 — as/bbox DRY** ✓ — resolve / door-arc / merge → evidence-geom.
2. **Batch 2 — retarget/stats + alias** ✓ — `buildEvidenceStats` + `window-stage3-retarget`; unalias dual.
3. **Batch 3 — gedeelde segment-projectie** → **F / skip** — algoritmen gescheiden.
4. **Niet:** policy merge, wall-rescue, Template-ID, faces opnieuw splitten om regels.

## Niet doen

- God-split faces/axel om regels
- Deur↔raam policy of bind/snap mergen
- Detectie-tuning

## Verificatie

- [x] `vitest run tests/cv/windows` — 71 passed
- [ ] `npm run build` — pre-existing tsc-fouten buiten windows-scope (geen nieuwe in B2-files)
- [ ] UI-smoke Project4: ramen Stage 3 → afronden → L14 cyaan + FML; doorframe class (geen L14)

## Log

| Datum | Fase / Batch | Resultaat |
|-------|--------------|-----------|
| 2026-07-28 | INDEX/DOCUMENT/DISCUSS | inventaris |
| 2026-07-28 | Batch 1 | resolve/door-arc/merge → evidence-geom / `unionFaceBBox` |
| 2026-07-28 | Batch 2 | `buildEvidenceStats`; `window-stage3-retarget`; unalias `resolveWindowFloorDual` → `resolveFloorDual`; 71 window-tests groen |
| 2026-07-28 | Batch 3 | **F** — L14↔L11 segment-primitives bewust lokaal |
