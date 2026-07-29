# Lean rapport — Stap 2 voorbewerking — 2026-07-28

## Meta

| Veld | Waarde |
|------|--------|
| Cluster | Stap 2 voorbewerking (`flowStep: preprocess`) |
| Scope-paden | `layer-preprocess*`, `compose-wall-bw`, wallBw compose, ink edit, preprocess preview/wiring, refs/meetpad |
| Status | B1–B4 done (contract: dikte/style/REF = post-bake `baseBw`) |
| Bron-refactor | [`../stap2-voorbewerking-2026-07-25.md`](../stap2-voorbewerking-2026-07-25.md) |
| Gerelateerde docs | workspace-flow, consumer-chain `04-stap2` |

## Samenvatting

- ~12 lean-findings; B1–B4 uitgevoerd — dikte/style/REF op post-bake `baseBw` (gebakken inkt mee).
- Dode canvas-`inkEdit`-API’s naast live overlay-pad nog knip-kandidaat (buiten batch).
- Geschatte batches: 4 — **af**.

## INDEX

| Pad | ~Regels | Rol | Owners |
|-----|---------|-----|--------|
| `cv/preprocess/layer-preprocess.ts` | 42 | entry barrel | tabs/defaults/normalize |
| `cv/preprocess/layer-preprocess-tabs.ts` | 58 | helper — tabs | `layer-flow` |
| `cv/preprocess/layer-preprocess-defaults.ts` | 105 | tuning defaults | **F/P** |
| `cv/preprocess/layer-preprocess-normalize.ts` | 295 | resolve/normalize/fingerprint | enige flat OpenCV-config |
| `cv/preprocess/compose-wall-bw.ts` | 297 | compose/bake/ink/history | Pad B: base⊕OCR⊕ink |
| `ui/.../useWorkspaceWallBwCompose.ts` | 262 | entry state | `compose-wall-bw` |
| `ui/.../useWorkspacePreprocess.ts` | 263 | live preview/debounce | wallBw + preview |
| `ui/.../useWorkspacePreprocessWiring.ts` | 206 | wiring | mask↔ink↔image |
| `ui/composables/useWorkspaceInkEdit.ts` | 155 | ink tools + undo + bake | overlay history |
| `ui/composables/usePreprocessPreview.ts` | 261 | B/W preview builders | `runPreprocessLayer` |
| `cv/walls/measure-reference-wall.ts` | 39 | dikte op baseBw | `measureInkBandInBox` |
| `cv/refs/ref-crop-bw.ts` | 283 | wallLayer crop | `resolveLayerPreprocess` |
| `cv/refs/classify-wall-ref-style.ts` | 54 | style→gapsInkMode | `cropRectToLocalBw` |
| `cv/tools/inkEdit.ts` | 139 | legacy canvas ink | types actief; canvas: tests |
| PreprocessPanel / InputReferencePanel | 399/218 | UI | mirrorWallTuneToRoot |

## Call-flow (kort)

- Kleur → shared `buildWallLayerBwMat` → `baseBw` → `composeWallBw(base ⊕ ocr ⊕ ink)` → `effectiveBw`.
- Ink overlay; afronden → `bakeInkIntoBase`.
- LBE-refs; gate ≥1 muurvak; dikte/style/REF-crops op **baseBw ná bake** (nooit `effectiveBw`).
- OCR-toggle default uit; Gaps-tab UI uit (**F**).

## Findings

### I — Inline duplicaat

| Item | Locaties | Owner-voorstel | Batch | Risico |
|------|----------|----------------|-------|--------|
| Full wallLayer B/W build | `compose-wall-bw.buildBaseWallBw` ≈ `ref-crop-bw.buildWallLayerBwMat` | één owner; andere wrapt | 3 | Mid |
| Gray→RGBA canvas | `effectiveBwToCanvas` ≈ `bwDataToCanvas` | één `bwBytesToCanvas` | 3 | Laag–mid |
| `preparePreprocessMasks` wrappers | preview ≈ vector-cache | gedeelde helper | 2 | Laag |
| Publish effective URL | wiring ≈ preprocess publish | één functie | 2 | Laag |
| Color-threshold read | PreprocessPanel ≈ `isColorThresholdEnabled` | panel → import | 1 | Laag |
| Ctrl+Z handlers | ink ↔ mask | zie stap1 batch 3 | cross | Laag |

### R — Redundant werk

| Item | Waar (dubbel) | Behoud-pad | Batch | Risico |
|------|---------------|------------|-------|--------|
| Style-classify herbouwt wallLayer B/W | classify via `cropRectToLocalBw` terwijl dikte al `baseBw` | style vanaf `baseBw` crop | 4 | Mid |
| REF-analyse rebuild vanaf kleur (mist inkt) | `analyze-all-refs` / `runRefStages` vs post-bake `baseBw` | crops vanaf `baseBw`; nooit `effectiveBw` | 4 | Mid |
| `buildCombinedPreview` | geen callers buiten export | knip | 1 | Laag |

### W — Wet variant

| Locatie A | Locatie B | Consolideren? | Batch | Risico |
|-----------|-----------|---------------|-------|--------|
| Overlay ink | Canvas ink (`inkEdit.ts`) | productie = overlay; knip canvas of tests migreren | 1 | Laag–mid |
| Mask vs ink history | zie stap1 | shared byte-history | 2 | Laag–mid |

### O — Over-abstractie

| Wrapper | Roept alleen door naar | Actie | Batch | Risico |
|---------|------------------------|-------|-------|--------|
| `migratePreprocessConfig` | `normalizeStoredPreprocess` | houden (publieke alias) | F | — |
| `wallTuneFingerprint` thin | `layerTuneFingerprintParts` | inline of shared name | 2 | Laag |
| `ensureInkOverlaySize` ≈ baked | zelfde pattern | `ensureSizedOverlay` | 2 | Laag |
| `eraserTouched` dep preprocess | niet gelezen | drop | 1 | Laag |

### C — Verkeerde home

| Logica | Nu in | Hoort in | Batch | Risico |
|--------|-------|----------|-------|--------|
| `createInkOverlayHistory` | `compose-wall-bw.ts` | naast `maskHistory` / shared undo | 2 | Laag |

### N — Inconsistente vorm

| Concern | Varianten | Canonieke vorm | Batch | Risico |
|---------|-----------|----------------|-------|--------|
| Undo return | `null` vs `boolean` | één history-contract | 2 | Laag |
| `commitInkEdits` naam | doet `bakeInkIntoBase` | JSDoc OK; optioneel hernoem | 1 | Laag |

### D / M / H — Restanten

| Cat | Item | Actie | Batch | Risico |
|-----|------|-------|-------|--------|
| D | `inkEdit.ts` canvas apply* — alleen specs | knip of markeer legacy | 1 | Laag–mid |
| D | `buildCombinedPreview` | knip | 1 | Laag |
| M | debounce `220` | `PREPROCESS_PREVIEW_DEBOUNCE_MS` | 2 | Laag |
| H | Gaps-tab hidden | **F** tot productbesluit | — | — |

### F / P — Bewust / policy

| Item | Reden |
|------|-------|
| Compose order base→OCR→ink; geen ink→kleur | Pad B |
| Dikte / style / REF-crops op post-bake `baseBw` | contract (gebakken inkt mee; nooit `effectiveBw`) |
| OCR-scan pas stap 3; verbod = geen OCR in REF-bron | niet “refs opnieuw vanaf kleur” |
| Fallback `buildWallLayerBwMat` zonder UI-`baseBw` | tests/export |
| `WALL_LAYER_DEFAULTS` waarden | niet tunen in lean-pass |

## Voorgestelde batches

1. **Batch 1 — P0 dode preview/ink + panel DRY** (laag) — knip `buildCombinedPreview`; panel → `isColorThresholdEnabled`; drop `eraserTouched`; besluit inkEdit-canvas — tests: compose-wall-bw, migratePreprocess.
2. **Batch 2 — history + publish + masks** (laag–mid) — ~~shared byte-history~~ (**done in Stap1 B3**); één publish; DRY prepareMasks; named debounce — smoke: inkt undo + OCR toggle.
3. **Batch 3 — wall B/W build + gray canvas DRY** (mid) — `buildBaseWallBw`/`buildWallLayerBwMat` — tests: compose + ref-crop + dikte.
4. **Batch 4 — style + REF op baseBw** (mid) — dikte/style/REF-crops post-bake inkl. inkt; nooit effectiveBw — smoke: Project4 afronden + inkt in LBE.

## Niet doen (deze ronde)

- Compose-order / bake-ink-naar-kleur terugdraaien
- Gaps-tab hard deleten; wall-default thresholds wijzigen
- God-split PreprocessPanel/compose “om regels”; `baseline.ts`

**Cross:** shared undo-history met stap1 = **meegenomen in Stap1 B3** (`createByteArrayHistory` in `maskHistory.ts`; ink caller gemigreerd).

## Verificatie

- [x] build (geen nieuwe fouten in gewijzigde paden; repo heeft pre-existing tsc noise)
- [x] `vitest run tests/cv/compose-wall-bw.spec.ts` + `tests/cv/ref-base-bw-crop.spec.ts` (14 groen)
- [ ] UI-smoke Project4: B/W, inkt in LBE, OCR, refs, afronden dikte+style, FML-underlay = kleur

## Log

| Datum | Fase / Batch | Resultaat |
|-------|--------------|-----------|
| 2026-07-28 | INDEX/DOCUMENT/DISCUSS | inventaris |
| 2026-07-28 | Batch 1 | `buildCombinedPreview` weg; `eraserTouched` dep weg; panel → `isColorThresholdEnabled` |
| 2026-07-28 | (via Stap1 B3) | `createInkOverlayHistory` → `createByteArrayHistory({ maxSteps: 30 })`; undo boolean |
| 2026-07-28 | DISCUSS | contract: REF = `baseBw` (+ gebakken inkt), niet verse wallLayer; nooit `effectiveBw` — plan B4 verbreed |
| 2026-07-28 | Batch 2 | één `publishWallBwUnderlay`; preview masks 1-fn; `PREPROCESS_PREVIEW_DEBOUNCE_MS`; fingerprint inline; `ensureSizedOverlay` |
| 2026-07-28 | Batch 3 | `buildWallLayerBwMat` owner in compose; `bwBytesToCanvas` + aliases; ref-crop re-export |
| 2026-07-28 | Batch 4 | `classifyWallRefStyleFromBw` + `cropBwBytesFromRect`/`grayMatFromBwBytes`; REF/deur/raam/gaps/export op `baseBw`; 14 tests groen |
