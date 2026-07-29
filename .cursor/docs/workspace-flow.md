# Workspace-flow (vast contract)

**Elke wijziging hoort in precies één stap.** Hergebruik `layer-flow.ts` + `layer-preprocess.ts` — geen per-element copy-paste.

## Stap 1 — Onderlegger (`flowStep: input`)

| Actie | Waar |
|--------|------|
| Upload tekening | `DrawingUploadPanel` |
| Schaal (mm) | `ScaleConfirmBar`, `useWorkspaceScale` |
| Rotatie (native resolutie, min 3000px) | `OriginalSetupPanel` |
| Gum / crop / polygon | `InputMaskPanel`, `useWorkspaceInputMask` → `eraserMask` |
| Download onderlegger PNG | `downloadUnderlay` |

**Output:** `originalImageEl` + optioneel `maskedWorkingCanvas` (gum/crop). Geen referentievakken.

**Gate naar stap 2:** schaal bevestigd (+ image).

Bij «Volgende»: `commitInputStepImage` bakt rotatie/crop, transformeert schaallinialen.

## Stap 2 — Voorbewerking (`flowStep: preprocess`)

Tabs: **Muren → Int muur** (`visiblePreprocessLayerTabs`) — Gaten in order maar UI-verborgen (`GAPS_TAB_VISIBLE = false`). OCR deelt muur-tune (geen aparte tab).

| Per tab | Opslag | Pipeline |
|---------|--------|----------|
| Muren | `preprocess.wallLayer` | `resolveLayerPreprocess(..., 'walls')` — baseBw-recipe; OCR-scan én (via `baseBw`) **ref-crops** |
| Int muur | — (read-only) | `buildRoomReferenceMat` (Otsu-inkt voor classify) |
| Gaten (hidden) | `preprocess.gapsLayer` | `resolveLayerPreprocess(..., 'gaps')` |

| Actie | Waar |
|--------|------|
| B/W tunen | `PreprocessPanel` |
| Inkt-tools (penseel/gum/lijn/rect) | `inkOverlay` via `useWorkspaceInkEdit` + `composeWallBw` — **niet** op kleur-onderlegger |
| Referentievakken muur/deur/raam | `InputReferencePanel` + LBE op canvas (`useExampleSelection`); tekenen uitzetten via opnieuw klikken of Escape |
| OCR aan/uit | `preprocess.ocrEnabled` in Referenties-panel (**default uit**) |
| Deur FML Template ID | per deur-ref dropdown (`fmlRefId`) |
| Muurdikte + muurstijl | bij afronden: bake ink→`baseBw`, daarna `measureReferenceWallThicknessPx` + `classifyWallRefStyleFromBw` op **baseBw** (wall + gebakken ink; geen OCR) |
| Download B/W | `downloadPreprocessedUnderlay` → `effectiveBw` (base ⊕ OCR ⊕ ink) |

**Wall-B/W compose (stap 2+3):** `effectiveBw = baseBw → forceWhite(ocrMask) → apply(inkOverlay)` met inkt boven OCR. Module: `cv/preprocess/compose-wall-bw.ts`, state: `useWorkspaceWallBwCompose`. Retune herbouwt alleen `baseBw` en zet `bakedInkOverlay` opnieuw op base; live overlay blijft. Terug naar stap 1 wist ink + baked.

**Bij afronden stap 2 («Volgende»):** live `inkOverlay` wordt **gebakken in `baseBw`** (+ bewaard in `bakedInkOverlay` voor retune); live overlay leeg; daarna muurdikte meten op die `baseBw`. Geen bake naar kleur-onderlegger. Stap-3 first-pass classify ziet de inkt dus als vaste muur-B/W (aparte vlakken).

**Gate naar stap 3:** ≥1 muurvak; bij afronden moet muurdikte meetbaar zijn (zelfde harde eis als vroeger op 1→2). Ref-crops = post-bake **`baseBw`** (gebakken inkt mee; nooit `effectiveBw`); fallback `buildWallLayerBwMat` alleen zonder UI-`baseBw`.

## Stap 3 — Detectie (`flowStep: templates`)

Tabs: **Muren → Deuren → Ramen** (`visibleTemplateLayerTabs`); met OCR aan: **OCR → Muren → Deuren → Ramen**. Gaten UI-verborgen. Zonder OCR (default) start de flow op Muren.

| Tab | UI-actie | Output |
|-----|----------|--------|
| OCR | Scan + mask (`useWorkspaceOcr`) op **baseBw** (zonder ink/OCR) | `ocrMask` + `ocrMaskedRegions` → compose-laag (niet merge in eraser voor wall-B/W) |
| Muren | **Auto-classify** op `effectiveBw` (precomposed) → face-klik → **Afronden**. Bij review: deur- én raam-detectie mee | `tabOutputs.walls` |
| Gaten (hidden) | Solid face-demote: Muren-vlakken + `gapsLayer` → muurvlakken = outside | geen `tabOutputs` (`detectTargetsForTab('gaps')` → `{}`) |
| Deuren | Stage-2 swing-filter (ook al gestart vanaf Muren-tab) | geen `tabOutputs` |
| Ramen | Stage 1–3 axel/evidence (ook al gestart vanaf Muren-tab); eigen overlay | geen `tabOutputs` |

**Verwerk inkt:** diff op `effectiveBw` vs `baselineWallBwData` — **geen** kleur-rethreshold, **geen** OCR-scan. Inkt-edits bakken **niet** in de kleur-onderlegger (FML-underlay blijft kleur).

**Muren subflow (room-first classify):** CC op wit → `resolveInkBetweenFaces` (inkt tussen vlakken) → enclosed merge → Otsu-referentie → inkt-classificatie. Finalize: topology-refine op huidige overrides → inkt-first muurmasker (`wallPreMat` + corridor/wall-guard) → conservatieve morph-close (pinholes) → **V3 pipeline** (`pipeline-v3/`).

- Muurdetectie gebruikt `preprocess.wallLayer` (stap 2) en strategie `room_first` via `cv/walls/rooms/*`.
- Muren-tab: **geen** LBE-tekenen; classificatie start automatisch na profielkeuze als `referenceWallThicknessPx` al gezet is.
- Deur/raam-referentievakken (stap 2) voeden Stage-2 deuren + Stage-1–3 ramen (starten mee vanaf Muren-tab in review); ref-B/W = post-bake `baseBw` (zelfde pixels als dikte).
- **FaceDualSpace:** zodra Muren-classify klaar is, `RoomRasterCache.ensureFaceDualSpace` — opening-wit + wall-ink voor muren/deuren/ramen/probe. Stage 1 openings meten op wit; zie `.cursor/docs/window-detection-flow.md`, `door-detection-flow.md`, `archive/wall-face-class-flow.md` § Dual-space. REF: `RefFaceDualSpace` op wallLayer-crop.
- Gaten-tab: Solid face-demote — canvas-onderlegger = **muur-B/W** (zelfde als Muren); `gapsLayer` alleen tegenaan gehouden voor demote (zoals Int muur/Otsu bij classify). Vlakken met hoge dekking → `outside`; floors/gaten blijven gekleurd. Vereist Muren-classify (geen L10).
- Deuren-tab: Stage-2 swing-overlay; face-class `door` (amber). Ramen-tab: Stage-1–3 overlay; face-class `window` (cyaan). Deur-flow: `.cursor/docs/door-detection-flow.md`. Raam-flow: `.cursor/docs/window-detection-flow.md`. Face-class: `.cursor/docs/archive/wall-face-class-flow.md`.
- Handmatige face-overrides worden niet overschreven door `refineWallClassificationByKeptMask`.
- Detectieprofiel geldt voor muren (`DetectionProfileDialog`).
- **Geen OCR in geometry-pipeline** — tekst is al gemaskeerd via `ocrMask` uit stap 3.
- Worker: `registerAllExtractors` + `canvasEnv` (geen DOM).
- Per tab aparte pipeline-run: `detectTargetsForTab()` in `layer-flow.ts`.

## Stap 4 — Resultaat (`flowStep: result`)

Tabs: **Muren** / Vector-FML.

| Tab | Bron |
|-----|------|
| walls | `tabOutputs.walls` |
| vector / FML | `useWorkspaceFml` ← `combinedOutput` (`mergeTabOutputs`); muren via semantic post-finalize — zie [`fml-layer8-conversion-plan.md`](./fml-layer8-conversion-plan.md) |

## Architectuur (DRY)

```
compose-wall-bw.ts    → effectiveBw = baseBw ⊕ ocrMask ⊕ inkOverlay
layer-preprocess.ts   → per-laag B/W-tuning (resolveLayerPreprocess) = baseBw
layer-flow.ts         → tab-volgorde, detectTargets, validatie output
merge-tab-outputs.ts  → muur-output voor vector/FML
useWorkspace*.ts      → één composable per flow-stap
geometry-pipeline.ts  → room-first CV; precomposedWallBw skip rethreshold; geen OCR-scan
```

## Anti-patterns (niet doen)

- OCR opnieuw in `geometry-pipeline` draaien
- Oude openings-/muurpipelines terugzetten vanuit `src/archive/**` (parking lot; leeg tenzij bewust geparkeerd)
- `tabOutputs` vullen buiten stap 3
- noop/lege output als “✓ gedetecteerd” tonen
- Worker zonder extractor-registratie of DOM-polyfills
- Referentievakken tekenen op stap 3 (hoort op stap 1)
