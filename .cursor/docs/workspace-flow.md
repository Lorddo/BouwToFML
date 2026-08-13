# Workspace-flow (vast contract)

**Elke wijziging hoort in precies één stap.** Hergebruik `layer-flow.ts` + `layer-preprocess.ts` — geen per-element copy-paste.

Project-container: `frontend/src/ui/composables/project/` — `ProjectState` + per-floor blobs; CV blijft single-floor op de actieve verdieping.

**Stap-navigatie (terug/vooruit):** afgeronde stap-state (refs, dikte, inkt, `tabOutputs`, FML) blijft bewaard. Alleen expliciete her-autoclassify / her-finalize wist het resultaat. Opnieuw enter stap 3 met bestaande detectie → geen OCR/classify-bootstrap. Floor-switch/resume op result → volledige session-restore (geen «fast» wipe van LBE-refs).

## Stap 0 — Project (`flowStep: project`)

| Actie | Waar |
|--------|------|
| Naam, adres | `ProjectSetupPanel` |
| Verdiepingen toevoegen/hernoemen/ordenen | `ProjectSetupPanel` + `WorkspaceFloorRail` |
| FML-hoogtes per verdieping | `ProjectSetupPanel` → `FloorMeta.defaults` (`ProjectFmlDefaults`) |

**Gate naar stap 1:** naam + adres + ≥1 verdieping + activeFloor. Bij «Volgende»: hydrate actieve floor (lege floor → upload).

## Overname tussen verdiepingen (expliciete knoppen)

| Stap | Knop | Wat |
|------|------|-----|
| 1 | «Onderlegger overnemen» | Donor-keuze: bronscan + schaal van gekozen verdieping (geen crop; laatste schaal-bevestiging per floor); daarna per-floor crop → `transformHScaleState` |
| 2 | «B/W overnemen» | Donor-keuze: alleen preprocess-tune (+ optioneel gemeten dikte); geen LBE-rects (crop-coords) |
| 2 | «Muurstempel» | FML-muren van donor-floor → canvas-align (REF-handles) + gum → bake: adaptive `stampBw` in `effectiveBw` + pure zwarte `stampMask` OR in Otsu |
| 3 | — | Solo: geen detectie-state delen |
| 4 | «Download .fml (project)» | `mergeFloorPlans` met floor-namen/`level` |

## Stap 1 — Onderlegger (`flowStep: input`)

| Actie | Waar |
|--------|------|
| Upload tekening | `DrawingUploadPanel` |
| Onderlegger overnemen (donor-keuze) | `reuseUnderlayFromProject(donorFloorId)` |
| Schaal (mm) | `ScaleConfirmBar`, `useWorkspaceScale` |
| Rotatie (native resolutie, min 3000px) | `OriginalSetupPanel` — niet geblokkeerd door onbevestigde schaal |
| Rotatie vastzetten (optioneel) | `bakeInputRotation` → zelfde pad als `commitInputStepImage`; auto bij «Volgende» |
| Gum / crop / polygon | `InputMaskPanel`, `useWorkspaceInputMask` → `eraserMask` |
| Download onderlegger PNG | `downloadUnderlay` |

**PDF-crop:** bij «Volgende» met in-memory PDF-bron + meaningful crop → ROI her-raster uit PDF (≥4000px langste zijde) i.p.v. blur-upscale van het full-page PNG-crop. PNG/JPG-crops ongewijzigd; PDF-bytes niet in IndexedDB.

**Output:** `originalImageEl` + optioneel `maskedWorkingCanvas` (gum/crop). Geen referentievakken.

**Gate naar stap 2:** schaal bevestigd (+ image). Rotatie-bake is niet verplicht op stap 1.

Bij «Volgende»: `commitInputStepImage` bakt rotatie/crop (PDF: optioneel ROI re-render), transformeert schaallinialen. Optionele knop «Rotatie vastzetten» doet hetzelfde pad eerder, zodat H/V-linialen op een rechtgetrokken beeld gezet kunnen worden (scheve scans). Onbevestigde schaal → verse linialen na rotatie-bake (mm blijft).

## Stap 2 — Voorbewerking (`flowStep: preprocess`)

Canvas-tab: alleen **Voorbewerking** (`walls`, via `visiblePreprocessLayerTabs`). **Int muur** + **Gaten** UI-verborgen (`INK_WALL_TAB_VISIBLE` / `GAPS_TAB_VISIBLE = false`); Int muur bereikbaar via Dev-view switcher (zet intern `preprocessTab`). OCR deelt muur-tune (geen aparte tab).

| Per tab | Opslag | Pipeline |
|---------|--------|----------|
| Muren (canvas) | `preprocess.wallLayer` | `resolveLayerPreprocess(..., 'walls')` — baseBw-recipe; OCR-scan én (via `baseBw`) **ref-crops** |
| Int muur (Dev) | — (read-only) | `buildRoomReferenceMat` (Otsu-inkt voor classify) |
| Gaten (hidden) | `preprocess.gapsLayer` | `resolveLayerPreprocess(..., 'gaps')` |

| Actie | Waar |
|--------|------|
| B/W tunen | `PreprocessPanel` |
| Reset naar fabriekswaarden | `PreprocessPanel` — B/W-tune van de actieve laag (`defaultLayerTune`); refs, inkt, OCR en stempel blijven |
| B/W overnemen (donor-keuze) | `copyPreprocessAndRefsFromDonor(donorFloorId)` |
| Muurstempel (keuze) | Sidebar + canvas: `useWallStamp` — donor FML-muren, band min/mid/max, REF-handles, penseel/polygoon-gum, bake |
| Inkt-tools (penseel/gum/lijn/rect) | `inkOverlay` via `useWorkspaceInkEdit` + `composeWallBw` — **niet** op kleur-onderlegger |
| Referentievakken muur/deur/raam | `InputReferencePanel` + LBE op canvas (`useExampleSelection`); tekenen uitzetten via opnieuw klikken of Escape |
| OCR aan/uit | `preprocess.ocrEnabled` in Referenties-panel (**default uit**) — auto-scan op Muren in stap 3 |
| Deur FML Template ID | per deur-ref dropdown (`fmlRefId`) |
| Muurdikte + muurstijl | bij afronden: bake ink→`baseBw`, daarna `measureReferenceWallThicknessPx` + `classifyWallRefStyleFromBw` op **baseBw** (wall + gebakken ink; geen OCR) |
| Download B/W | `downloadPreprocessedUnderlay` → `effectiveBw` (base ⊕ OCR ⊕ ink ⊕ stampBw) |

**Wall-B/W compose (stap 2+3):** `effectiveBw = baseBw → forceWhite(ocrMask) → OR stampBw → apply(inkOverlay)` (inkt boven stamp). Module: `cv/preprocess/compose-wall-bw.ts` + `wall-stamp-raster.ts`. Stempel-bake schrijft ook pure zwarte `stampMask` die na Otsu in classify wordt ge-OR'd (`geometry-pipeline` / `room-recalculate-local`).

**Bij afronden stap 2 («Volgende»):** live `inkOverlay` wordt **gebakken in `baseBw`** (+ bewaard in `bakedInkOverlay` voor retune); live overlay leeg; daarna muurdikte meten op die `baseBw`. Geen bake naar kleur-onderlegger. Stap-3 first-pass classify ziet de inkt dus als vaste muur-B/W (aparte vlakken).

**Gate naar stap 3:** ≥1 muurvak; bij afronden moet muurdikte meetbaar zijn (zelfde harde eis als vroeger op 1→2). Ref-crops = post-bake **`baseBw`** (gebakken inkt mee; nooit `effectiveBw`); fallback `buildWallLayerBwMat` alleen zonder UI-`baseBw`.

## Stap 3 — Detectie (`flowStep: templates`)

Canvas-tabs: alleen **Muren** (`visibleTemplateLayerTabs`). **OCR / Deuren / Ramen / Gaten** UI-verborgen (`OCR_TAB_VISIBLE` / `DOORS_TAB_VISIBLE` / `WINDOWS_TAB_VISIBLE` / `GAPS_TAB_VISIBLE = false`); OCR/Deuren/Ramen via Dev-view switcher (zet intern `templateTab`). Start altijd op Muren.

| Tab | UI-actie | Output |
|-----|----------|--------|
| OCR (Dev) | Scan + mask (`useWorkspaceOcr`) op **baseBw** (zonder ink/OCR); hitlist | `ocrMask` + `ocrMaskedRegions` → compose-laag (niet merge in eraser voor wall-B/W) |
| Muren (canvas) | Bij `ocrEnabled`: auto-OCR in initial flow (highlights, niet gebakken) → **Auto-classify** op `effectiveBw` → face-klik → **Afronden**. Sidebar: confidence-slider, Wis OCR, Bake OCR. Bij review: deur- én raam-detectie mee | `tabOutputs.walls` |
| Gaten (hidden) | Solid face-demote: Muren-vlakken + `gapsLayer` → muurvlakken = outside | geen `tabOutputs` (`detectTargetsForTab('gaps')` → `{}`) |
| Deuren (Dev) | Stage-2 swing-filter (ook al gestart vanaf Muren-tab) | geen `tabOutputs` |
| Ramen (Dev) | Stage 1–3 axel/evidence (ook al gestart vanaf Muren-tab); eigen overlay | geen `tabOutputs` |

**Initial detection (spinner):** bij OCR-aan: OCR → Muren → Deuren → Ramen; anders Muren → Deuren → Ramen.

**OCR op Muren:** na auto-scan zichtbaar als highlights + compose force-white. **Bake OCR** = `ocrMask` → `inkOverlay` WHITE → clear OCR → `recalculateFaces` (zelfde pad als Verwerk inkt). **Wis OCR** = clear mask/hits; in review ook faces herberekenen.

**Verwerk inkt:** diff op `effectiveBw` vs `baselineWallBwData` — **geen** kleur-rethreshold, **geen** OCR-scan. Inkt-edits bakken **niet** in de kleur-onderlegger (FML-underlay blijft kleur).

**Muren subflow (room-first classify):** CC op wit → `resolveInkBetweenFaces` (inkt tussen vlakken) → enclosed merge → Otsu-referentie → inkt-classificatie. Finalize: topology-refine op huidige overrides → inkt-first muurmasker (`wallPreMat` + corridor/wall-guard) → conservatieve morph-close (pinholes) → **V3 pipeline** (`pipeline-v3/`).

- Muurdetectie gebruikt `preprocess.wallLayer` (stap 2) en strategie `room_first` via `cv/walls/rooms/*`.
- Muren-tab: **geen** LBE-tekenen; classificatie start automatisch na profielkeuze als `referenceWallThicknessPx` al gezet is.
- Deur/raam-referentievakken (stap 2) voeden Stage-2 deuren + Stage-1–3 ramen (starten mee vanaf Muren-tab in review); ref-B/W = post-bake `baseBw` (zelfde pixels als dikte).
- **FaceDualSpace:** zodra Muren-classify klaar is, `RoomRasterCache.ensureFaceDualSpace` — opening-wit + wall-ink voor muren/deuren/ramen/probe. Stage 1 openings meten op wit; zie `.cursor/docs/window-detection-flow.md`, `door-detection-flow.md`, `archive/wall-face-class-flow.md` § Dual-space. REF: `RefFaceDualSpace` op wallLayer-crop.
- Gaten-tab: Solid face-demote — canvas-onderlegger = **muur-B/W** (zelfde als Muren); `gapsLayer` alleen tegenaan gehouden voor demote (zoals Int muur/Otsu bij classify). Vlakken met hoge dekking → `outside`; floors/gaten blijven gekleurd. Vereist Muren-classify (geen L10).
- Deuren/Ramen (Dev-view): Stage-2 swing-overlay / Stage-1–3 axel; face-class `door` (amber) / `window` (cyaan). Deur-flow: `.cursor/docs/door-detection-flow.md`. Raam-flow: `.cursor/docs/window-detection-flow.md`. Face-class: `.cursor/docs/archive/wall-face-class-flow.md`.
- Handmatige face-overrides worden niet overschreven door `refineWallClassificationByKeptMask`.
- Detectieprofiel geldt voor muren (`DetectionProfileDialog`).
- **Geen OCR in geometry-pipeline** — tekst is al gemaskeerd via `ocrMask` uit stap 3.
- Worker: `registerAllExtractors` + `canvasEnv` (geen DOM).
- Per tab aparte pipeline-run: `detectTargetsForTab()` in `layer-flow.ts`.

## Stap 4 — Resultaat (`flowStep: result`)

Canvas-tab: alleen **Vector / FML** (`visibleResultLayerTabs`). **Muren** UI-verborgen (`RESULT_WALLS_TAB_VISIBLE = false`); bereikbaar via Dev-view (zet intern `resultTab`). Enter result default = `vector`.

| Tab | Bron |
|-----|------|
| vector / FML (canvas) | `useWorkspaceFml` ← `combinedOutput` (`mergeTabOutputs`); muren via semantic post-finalize — zie [`fml-layer8-conversion-plan.md`](./fml-layer8-conversion-plan.md) |
| walls (Dev) | `tabOutputs.walls` + layer overlays (`ResultWallsLayerPanel` / Layer Debug) |

**Project-export:** «Download .fml (project)» (footer op stap 4) → `mergeFloorPlans` over alle floors met preview/generated FML (namen/`level` uit `FloorMeta`). Geen per-verdieping download in de productie-UI.

**Verdiepingsnaam:** bewerkbaar bovenaan `FmlPanel` (actieve floor → `renameFloor`); zelfde bron als stap 0 / floor-rail.

**Dev-view:** `WorkspaceDevViewPanel` in de debug-sidebar schakelt intern `preprocessTab` / `templateTab` / `resultTab` (geen sticky-redirect voor inkWall/doors/windows/ocr/result-walls — anders kan Dev niet blijven). Gaps blijft sticky → walls.

## Architectuur (DRY)

```
compose-wall-bw.ts    → effectiveBw = baseBw ⊕ ocrMask ⊕ inkOverlay
layer-preprocess.ts   → per-laag B/W-tuning (resolveLayerPreprocess) = baseBw
layer-flow.ts         → tab-volgorde, detectTargets, validatie output
merge-tab-outputs.ts  → muur-output voor vector/FML
project/*             → ProjectState, floor-blobs, mergeFloorPlans
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
