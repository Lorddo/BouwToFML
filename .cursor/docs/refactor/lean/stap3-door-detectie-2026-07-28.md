# Lean rapport — Doors stages + L11/L12 — 2026-07-28

## Meta

| Veld | Waarde |
|------|--------|
| Cluster | Stap 3 deur-detectie (Stage 1–2 + L11 snap + L12 orient) |
| Scope-paden | `run-door-stage-pipeline`, stage filters, `door-wall-snap/**`, L12, UI door faces |
| Status | **D1 af** (geom + class-lookup + BBox + L12 normalize + snap overrides + epoch); **D2 = F** |
| Bron-refactor | [`../stap3-door-detectie-2026-07-25.md`](../stap3-door-detectie-2026-07-25.md) |
| Gerelateerde docs | door-detection-flow, consumer-chain `02-doors`, audit #6 |

## Samenvatting

- Stage-1/L11 al gesplit; sterkste lean-winst: **I+N** class-lookup + geom (`clampBounds`/`round2`/`BBoxBounds`).
- Cluster-adj na detach = **F** (audit #6). Geen policy-merge deur↔raam.
- Window-sourced doorframes (`syncDoorframeFaceOverrides` → sticky class) gebruiken dezelfde `=== 'doorframe'` lookup als bridge — missing blijft `undefined` in attach/Path A.

## INDEX

| Pad | ~Regels | Rol | Owners |
|-----|---------|-----|--------|
| `cv/doors/run-door-stage-pipeline.ts` | 276 | entry Stage1–2 | `prepareOpeningPipeDual`, adjacency, policy |
| `door-swing-filter*` / cluster/seed | 203–381 | Stage 1 | ink-bridge, dual.geom |
| `door-swing-fill-stage` / fill-filter | 76–95 | Stage 2 fill | — |
| `door-room-surround.ts` | 166 | surround + wall-touch | `isWallMaskClass` |
| `door-swing-angle-rescue.ts` | 335 | angle-rescue | dual white/ink |
| `door-bridge-wall-promote.ts` | 253 | bridge | white adj |
| `door-attach-doorframes.ts` | 265 | sticky df | — |
| `door-resolve.ts` | 133 | resolve | — |
| `door-wall-snap.ts` + geom/scoring/bind/… | 60–351 | L11 | lazy adjacency |
| `door-wall-orient.ts` / `door-l12-hinge.ts` | 331 / 268 | L12 | swing-mask |
| `door-space-policy.ts` | 46 | policy | **F** vs window |
| UI `useWorkspaceDoorSwingFaces` + `door-faces-*` | 52–472 | UI orch | CV snap/orient |

## Call-flow (kort)

- Cache dual+refs → `runDoorStagePipeline` (pipeDual → **cluster adj rebuild** → filter→fill→surround→AR→wall-touch→bridge→resolve/attach).
- Push/claim → kept-mask purge → `snapDoorsToWalls` → `orientBoundDoors` → FML.
- Sticky df reattach zonder Stage-2 her-run (ook na window-pass).

## Findings

### I — Inline duplicaat

| Item | Locaties | Owner-voorstel | Batch | Risico |
|------|----------|----------------|-------|--------|
| `resolveClassForLabel` 3× (andere defaults) | attach, snap-doorframe, surround | één helper + expliciete default | 1 | Mid → **done** |
| `clampBounds` / `round2` | lokal vs snap-geom / orient / resolve | geom-utils owner | 1 | Laag → **done** |
| Local `normalize`/`magnitude` in L12 hinge | vs `normalizeVector` in geometry-utils | geometry-utils | 1 | Laag → **done** |

### R — Redundant werk

| Item | Waar (dubbel) | Behoud-pad | Batch | Risico |
|------|---------------|------------|-------|--------|
| Stage cluster `buildLabelAdjacency(ink, …)` | runner na pipeDual | **F** audit #6 | — | — |
| L11 lazy adjacency opnieuw | `door-wall-snap` | **F** — pass-through onveilig (Path A grow) | 2 / F | Mid → **F** |
| UI dual signature-cache | ComputationCache boven epoch | lean: vertrouw cache-epoch | 1 | Laag → **done** |
| Export-rapport herhaalt pipeline | export-door-swing-report | bewust offline | F | — |

### W — Wet variant

| Locatie A | Locatie B | Consolideren? | Batch | Risico |
|-----------|-----------|---------------|-------|--------|
| `BBoxBounds` types | geometry-utils / snap-tuning / attach | één type | 1 | Laag → **done** |
| Class lookup | lokale resolve vs `resolvePixelClassification` | `resolveClassAtLabel` sibling | 1 | Mid → **done** |

### O — Over-abstractie

| Wrapper | Roept alleen door naar | Actie | Batch | Risico |
|---------|------------------------|-------|--------|
| `classOfFace` → `resolveClassForLabel` | attach | inklappen | 1 | Laag → **done** |
| UI Faces na ronde 8 | orch | geen verdere laag | F | — |

### C — Verkeerde home

| Logica | Nu in | Hoort in | Batch | Risico |
|--------|-------|----------|-------|--------|
| Directional class edges + clamp in attach | `door-attach-doorframes` | geom/shared helper; attach blijft sticky API | 1–2 | Mid → skipped (niet in D1 rest) |
| Stage cluster-adj in runner | runner | **F** deur-only | — | — |

### N — Inconsistente vorm

| Concern | Varianten | Canonieke vorm | Batch | Risico |
|---------|-----------|----------------|-------|--------|
| Class-at-label | undefined vs `'surface'` vs resolvePixel | `resolveClassAtLabel` + expliciete missing | 1 | Mid → **done** |
| Effective class voor snap | handmatige override-loop vs `effectiveClassification` | altijd applyOverrides | 1 | Laag → **done** |

### F / P — Bewust / policy

| Item | Reden |
|------|-------|
| Ink-adj na white-detach (#6) | deur clusterbrug |
| Path A/B, wall-touch, sticky df, angle-rescue | G/P L12 |
| Policies deur≠raam | audit |
| L11 adj pass-through (D2) | Stage cluster-adj ≠ L11 post-claim graph; Path A grow zou breken |

## Voorgestelde batches

1. **Batch D1 — class/geom micro-DRY** — **done** (geom + class-lookup + BBox + L12 normalize + snap overrides + epoch).
2. **Batch D2 — L11 adj pass-through** — **F / skip**.
3. **Batch D3 — UI C/O** — folded into D1; geen aparte batch.

## Niet doen

- Policies mergen; Stage-2 her-run voor sticky
- Cluster-adj gelijk trekken aan windows (#6 F)
- L11/L12 tuning “opschonen”; archive openings; Faces opnieuw splitten om regels
- Missing-defaults uniformeren naar `'surface'` zonder equality-bewijs (window/bridge `=== 'doorframe'` gevoelig)

## Verificatie

- [x] `vitest run tests/cv/doors` — 17 files / 145 tests groen
- [ ] UI-smoke Project4: twin/single **na raam-pass** → `doorframeFaceIds` (window-sourced sticky) → Path A / FML; demote auto-valse deur; geen double_wide

## Log

| Datum | Fase / Batch | Resultaat |
|-------|--------------|-----------|
| 2026-07-28 | INDEX/DOCUMENT/DISCUSS | inventaris |
| 2026-07-28 | Batch D1 (geom) | `clampBounds`/`round2` → snap-geom (attach/resolve/orient) |
| 2026-07-28 | Batch D1 rest | `resolveClassAtLabel` (missing expliciet); snap `applyFaceClassificationOverrides`; `BBoxBounds` → geometry-utils; L12 `normalizeVector`; ComputationCache epoch; D2 = F |
