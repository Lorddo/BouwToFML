# Lean rapport — Stap 1 onderlegger — 2026-07-28

## Meta

| Veld | Waarde |
|------|--------|
| Cluster | Stap 1 onderlegger (`flowStep: input`) |
| Scope-paden | `useWorkspaceImage`, `imageUtils`, `useWorkspaceScale`, `useWorkspaceInputMask`, maskHistory, bake, input panels |
| Status | B1–B3 done (lean VERBETER af) |
| Bron-refactor | [`../stap1-onderlegger-2026-07-25.md`](../stap1-onderlegger-2026-07-25.md) |
| Gerelateerde docs | [`../../workspace-flow.md`](../../workspace-flow.md), consumer-chain `05-stap1` |

## Samenvatting

- ~8 lean-findings (I/R/W/O/C/N); production-knip Batch 1 al gedaan.
- Geschatte batches: ~3.
- Grootste risico’s: affine/schaal-transform in bake; `displayImageSrc` verplaatsen zonder underlay te breken.

## INDEX

| Pad | ~Regels | Rol | Owners |
|-----|---------|-----|--------|
| `ui/composables/workspace/useWorkspaceImage.ts` | 262 | entry — load/base/commit/display | `bakeUnderlayCanvas`, `imageUtils` |
| `ui/composables/workspace/imageUtils.ts` | 369 | helper — trim/upscale/HScale+rect | `OPTIMIZATION_BASE_DIMENSION`, `rotateMat` |
| `ui/composables/workspace/useWorkspaceScale.ts` | 94 | UI — schaalpanel | `platform/calibration` |
| `ui/composables/useWorkspaceInputMask.ts` | 323 | stage — eraser/crop + OCR-mask | `cv/tools/eraser`, `maskHistory` |
| `cv/tools/maskHistory.ts` | 30 | helper — undo (MAX 40) | `cloneMask` |
| `cv/tools/bakeUnderlayCanvas.ts` | 25 | helper — rotatie-bake | `rotateMat` |
| `ui/.../useWorkspacePreprocessWiring.ts` | 206 | wiring stap1↔2 | image+mask+scale |
| `ui/.../constants.ts` | 67 | gates + floor | `inputStepCanProceed`, 3000 **F/P** |
| Input panels (sidebar/upload/setup/mask/scale) | ~40–140 | UI | thin presentatie |
| `tests/ui/working-image-utils.spec.ts` | 222 | test | normalize/transform |

## Call-flow (kort)

- Upload → `buildOptimizationBase` (≥3k) → `originalImageEl` + scale init.
- Live: schaal-linialen; gum/crop → `eraserMask` + masked preview.
- Rotatie: Konva-preview tot Volgende; bake in `commitInputStepImage`.
- Commit: bake → normalize → HScale/rects → mask clear → gate `inputStepCanProceed`.
- Geen LBE-refs op stap 1.

## Findings

### I — Inline duplicaat

| Item | Locaties | Owner-voorstel | Batch | Risico |
|------|----------|----------------|-------|--------|
| Affine rotatie-matrix (cos/sin/…) 2× | `imageUtils` `transformHScaleStateRotation` + `mapPointRotation` | één `mapPointAfterUiRotation` | 2 | Laag–mid |
| Ctrl+Z gate | `useWorkspaceInputMask` ↔ `useWorkspaceInkEdit` | gedeelde `isUndoKey` | 3 / cross | Laag |
| `imageDimensions` opnieuw inline | wiring vs export in `imageUtils` | wiring → import | 1 | Laag |

### R — Redundant werk

| Item | Waar (dubbel) | Behoud-pad | Batch | Risico |
|------|---------------|------------|-------|--------|
| `refreshMaskedWorkingImage` vóór commit + bake | flow + commit | OK; geen extra OpenCV | F | — |
| Upload-upscale vs commit-normalize | beide `upscaleCanvasToMinMaxEdge` | twee entry’s; private helper **F** | — | — |

### W — Wet variant

| Locatie A | Locatie B | Consolideren? | Batch | Risico |
|-----------|-----------|---------------|-------|--------|
| `createMaskHistory` MAX 40 | `createInkOverlayHistory` MAX 30 | ja: `createByteArrayHistory({ maxSteps })` | 3 | Laag–mid |
| Stap1 binary brush | Stap2 ternary ink | **Nee** — ander contract | F | — |

### O — Over-abstractie

| Wrapper | Roept alleen door naar | Actie | Batch | Risico |
|---------|------------------------|-------|-------|--------|
| `inkEditTouched` dep op `useWorkspaceImage` | niet gelezen in body | dep verwijderen | 1 | Laag |
| `useWorkspaceScale` | calibration UI | houden | F | — |

### C — Verkeerde home

| Logica | Nu in | Hoort in | Batch | Risico |
|--------|-------|----------|-------|--------|
| Underlay-keuze stap 2/3 | `useWorkspaceImage.displayImageSrc` | `useWorkspaceDisplaySrc` / underlay-helper | 3 | Mid |
| OCR-mask state | `useWorkspaceInputMask` | blijft compose-laag | F | — |

### N — Inconsistente vorm

| Concern | Varianten | Canonieke vorm | Batch | Risico |
|---------|-----------|----------------|-------|--------|
| Rotatie-epsilon `0.001` | commit / transformSelectionRect / rotateMat | `ROTATION_EPS_DEG` | 2 | Laag |
| Undo-return | `Uint8Array\|null` vs `boolean` | één history-API | 3 | Laag |

### D / M / H — Restanten

| Cat | Item | Actie | Batch | Risico |
|-----|------|-------|-------|--------|
| M | `eraserRadius = 10` | `INPUT_ERASER_RADIUS_PX` | 1 | Laag |
| M | OCR padding `2` | named const | 1 | Laag |
| D | `editCanvasHistory` / `editWorkingCanvas` | al geknipt | — | — |

### F / P — Bewust / policy

| Item | Reden |
|------|-------|
| Bake alleen bij Volgende | workspace-flow |
| Geen LBE-refs op stap 1 | contract |
| `OPTIMIZATION_BASE_DIMENSION = 3000` | performance; niet wijzigen zonder besluit |
| `ocrMask` in inputMask-module | compose-laag; OCR-run alleen stap 3 |

## Voorgestelde batches

1. **Batch 1 — P0 wiring/knip** (laag) — drop unused `inkEditTouched`; wiring → `imageDimensions`; named eraser/OCR-pad — test: build + `working-image-utils` — niet: floor / live bake.
2. **Batch 2 — affine DRY + eps** (laag–mid) — shared point-map; `ROTATION_EPS_DEG` — test: schaal+rotatie+rect — niet: imageUtils god-split om regels.
3. **Batch 3 — history + display home** (mid) — shared byte-history (met stap2); optioneel `displayImageSrc` extract — test: upload→Volgende + stap2 underlay — niet: OCR-mask naar pipeline.

## Niet doen (deze ronde)

- Floor 3000→4k; live bake tijdens rotatie-preview; refs naar stap 1
- God-split `imageUtils` zonder I/C-actie; `baseline.ts`

## Verificatie

- [x] `vitest run tests/ui/working-image-utils.spec.ts` (12)
- [x] `vitest run tests/cv/compose-wall-bw.spec.ts` (11; history weg uit compose)
- [ ] UI-smoke: upload → schaal → rotatie → gum → Ctrl+Z → Volgende → stap 2 underlay + inkt Ctrl+Z

## Log

| Datum | Fase / Batch | Resultaat |
|-------|--------------|-----------|
| 2026-07-28 | INDEX/DOCUMENT/DISCUSS | inventaris (code-gelezen) |
| 2026-07-28 | Batch 1 | unused `inkEditTouched` weg; wiring → `imageDimensions` |
| 2026-07-28 | Batch 2 | `mapPointAfterUiRotation`; `ROTATION_EPS_DEG` in rotateMat + commit + transformSelectionRect |
| 2026-07-28 | Batch 3 | `createByteArrayHistory` (mask 40 / ink 30); `isUndoKey`; knip `createInkOverlayHistory`; `resolveDisplayImageSrc` |
