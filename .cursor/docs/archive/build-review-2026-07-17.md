# Build-review — Stap 1–3 + muurdetectie

Datum: 2026-07-17
Scope: Onderlegger (stap 1) · Voorbewerking (stap 2) · Detectie (stap 3) · room-first muurdetectie + V3-pipeline.
Doel: beschrijven wat er staat, hoe het werkt, en waar flow/techniek/onderhoud beter kan. **Geen codewijzigingen** — dit is een leesronde.

---

## 1. Samenvatting

De 4-stappen-flow is conceptueel sterk en het contract (`workspace-flow.md`, `layer-flow.ts`) is goed doordacht: één verantwoordelijkheid per stap, DRY per-laag preprocess, en één echte detectie-output (`tabOutputs.walls`). De room-first muurdetectie + V3-pipeline is de meest volwassen en best geteste laag van de codebase (L2–L9 hebben dedicated specs).

De belangrijkste zorgen zijn **niet** functioneel-brekende bugs maar **onderhoudsrisico's** en **een paar flow-inconsistenties**:

- Enkele god-files blijven bestaan (`useWorkspaceRoomFaces.ts` 625, `room-ink-classify.ts` 628, `chamfer-chain.ts` 637, `room-first.ts` 499).
- Het L6-connector-subsysteem (~3.500+ regels) is probe-gedreven getuned en het grootste risicogebied.
- Honderden hardcoded pixel-drempels; policies helpen maar engines bevatten nog inline magic numbers.
- Twee kleine flow-inconsistenties: `commitInputStepImage` slaat trim/upscale over zonder rotatie/gum, en `canGoNext` laat je stap 3 verlaten zonder finalize als je van de Muren-tab weg navigeert.
- Verouderde documentatie/dead code (V2-toggle is dood, `DetectionProfileDialog` bestaat niet meer, Laag B export-tekst beschrijft oude V2).

Onder elke stap staat: **wat het doet → issues → verbetervoorstellen**.

---

## 2. Globale architectuur

```
Stap 1 Onderlegger   → originalImageEl (+ eraserMask, rects, referenceWallThicknessPx)
Stap 2 Voorbewerking → per-laag B/W-tuning (resolveLayerPreprocess): ocr/walls/inkWall/gaps
Stap 3 Detectie      → tabOutputs.walls (room-first classify → review → finalize → V3 L1–L10)
Stap 4 Resultaat     → mergeTabOutputs → FML (useWorkspaceFml)
```

DRY-bronnen (contract): `layer-flow.ts` (tab-volgorde + detect-targets), `layer-preprocess.ts` (per-laag B/W), `merge-tab-outputs.ts` (output→FML), één `useWorkspace*`-composable per stap.

**Contract-alignment:** grotendeels correct. Afwijkingen: `DetectionProfileDialog` uit `workspace-flow.md` (regel 57) bestaat niet meer (inline `DetectionProfileSwitch`), en `commitInputStepImage` bakt niet "altijd" bij Volgende zoals de doc (regel 22) suggereert.

---

## 3. Stap 1 — Onderlegger (`flowStep: 'input'`)

### Wat het doet
Upload (PNG/JPG/PDF) → stille upscale naar min 2000px (`buildOptimizationBase`) → schaal bevestigen (`useHScaleCalibration`) → rotatie/gum/crop → LBE-referentievakken muur/deur/raam (`useExampleSelection`) → lichtgewicht muurdikte meten (`measureReferenceWallThicknessPx`). Bij «Volgende» bakt `commitInputStepImage` rotatie/crop en transformeert schaallinialen + referentievakken mee.

**Gate naar stap 2:** afbeelding + schaal bevestigd + ≥1 muurvak + gemeten muurdikte > 0.

De flow is netjes opgesplitst; geen enkel component is een god-file (grootste: `FloorplanCanvas.vue` 403, `imageUtils.ts` 406). Geen TODO/FIXME.

### Issues
1. **`commitInputStepImage` slaat wit-trim/upscale over zonder rotatie of gum** (`useWorkspaceImage.ts:168-170`, geverifieerd). `needsCommit = eraserTouched || hasRotation`. Een rechte, ongecropte tekening gaat dus **ongenormaliseerd** naar stap 2, terwijl `workspace-flow.md:22` suggereert dat Volgende altijd bakt. Inconsistent en verrassend bij debuggen.
2. **Dubbel upscale-pad:** `buildOptimizationBase` bij upload + `normalizeWorkingCanvas` na commit — twee plekken met dezelfde 2000px-logica.
3. **`imageUtils.ts` (406 regels)** mengt image-IO, coördinaat-transforms en calibration-math. Rotatie-math gedupliceerd (`transformHScaleStateRotation` vs `mapPointRotation`); `imageSourceToCanvas` ≈ `imageToCanvas` (exports) ≈ `canvasLikeToHtmlCanvas`.
4. **Dead UI-bindings:** `InputMaskPanel` declareert `resetMask`/`undo` emits + `canUndo`/`maskTouched` props maar rendert **geen knoppen** (alleen Ctrl+Z werkt). `OriginalSetupPanel` declareert `resetAutoRotation` zonder knop. Shift+klik-delete van refs is geïmplementeerd maar nergens in UI zichtbaar.
5. **Muurdikte gemeten met stap-2 wall-defaults** vóór de gebruiker stap 2 heeft getuned — bewust lichtgewicht, maar kan afwijken van de finale detectie.
6. **`keepSingleWallRect` verwijdert stilletjes** oudere muurvakken (max 1 muur) zonder UI-feedback.
7. **Typo in publieke API:** `setRemasureWallAfterInputCommit`/`remasureWallAfterInputCommit` (moet "remeasure" zijn).

### Verbetervoorstellen
- Beslis expliciet of Volgende altijd normaliseert. Als "ja" (aanbevolen voor consistentie): laat de early-exit vervallen of trim/upscale altijd. Als "nee": pas de doc aan.
- Splits `imageUtils.ts` in `image-io.ts` (load/canvas) en `coordinate-transforms.ts` (schaal/rect). Centraliseer de canvas-helpers in één util.
- Verwijder of implementeer de dode mask-undo/reset-knoppen; hetzelfde voor auto-rotatie-reset. Maak shift+klik-delete zichtbaar (hint/icoon).
- Hernoem de "Remasure"-typo consequent.
- Toon een subtiele melding wanneer een tweede muurvak het vorige vervangt.

---

## 4. Stap 2 — Voorbewerking (`flowStep: 'preprocess'`)

### Wat het doet
Per-laag B/W-tuning met live preview (220ms debounce): **OCR → Muren → Int muur → Gaten**. Elke tunbare laag schrijft naar nested keys (`ocrLayer`/`wallLayer`/`gapsLayer`) via `resolveLayerPreprocess` → `runPreprocessLayer` (grijswaarden → binarisatie → speckles → holes → bridge → smooth → verdikken/afschaven → mask). "Int muur" is read-only en toont de Otsu-referentie (`buildRoomReferenceMat`) die de classify gebruikt. Geen detectie — alleen tunen.

Geen bestand > 400 regels behalve `layer-preprocess.ts` (419, grensgeval). Geen TODO/FIXME.

### Issues
1. **Legacy root-mirror naast `wallLayer`** — `mirrorWallTuneToRoot` sync't bij elke walls-patch naar dubbele opslag (`brightness`/`threshold`/… op root én in `wallLayer`). Twee bronnen van waarheid; migratie-code (`normalizeStoredPreprocess`, `applyLegacyNoiseFlags`) sleept dit mee.
2. **Gedeelde `previewUrl`** voor drie visueel verschillende tabs (Muren/Int muur/Gaten) — copy-tune kan verwarrend zijn; er is zelfs een lege noop-branch (`useWorkspacePreprocess.ts:184-186`, comment "noop — andere laag").
3. **Dead export surface:** `onBuildVectorDebug` wordt geëxporteerd maar heeft geen UI-koppeling.
4. **Referentie-module rommel** (`room-reference-preprocess.ts`): `removeSpeckles: 80` is geen bestaand veld in `PreprocessLayerTune` (waarschijnlijk dead/verkeerde key); `finalizeRoomReferenceMat` heeft een dode thicken-branch (`thickenLinesEnabled: false`).
5. **`doorLayer`/`windowLayer`** bestaan nog in `PreprocessConfig`-types maar zijn niet gekoppeld aan stap-2 UI of `resolveLayerPreprocess`.
6. **`useAdaptive` inconsistentie:** default `true` maar `resolveLayerPreprocess`-fallback `false`.
7. **Gaten Solid/Detail-modus** zit in de debug-sidebar, niet de hoofdsidebar — makkelijk te missen.

### Verbetervoorstellen
- Faseer de legacy root-velden uit: als niets buiten `mirrorWallTuneToRoot` de root nog leest, verwijder de mirror + migratie na één opruimronde (check export/refs eerst).
- Geef elke tab een eigen preview-URL (of maak expliciet dat de preview bij de actieve tab hoort), en verwijder de noop-branch.
- Verwijder `onBuildVectorDebug` of geef het een UI-knop.
- Ruim `removeSpeckles: 80` en de dode thicken-branch in de referentie-module op.
- Verwijder `doorLayer`/`windowLayer` uit types tot opening-detectie live gaat (staat toch in archive).

---

## 5. Stap 3 — Detectie (`flowStep: 'templates'`)

### Wat het doet
Tabs: **OCR → Muren → Gaten → Deuren → Ramen**. Alleen **Muren** produceert echte pipeline-output (`tabOutputs.walls`); de rest zijn side-paths.

- **OCR:** scan (Tesseract) → tekst-regio's → `ocrMask` (via `applyOcrTextMask`), later gemerged met `eraserMask` in `preparePreprocessMasks(includeOcrMask:true)` voor de geometry-run. Geen dubbele OCR in de pipeline ✓.
- **Muren:** room-first state machine `idle → awaiting_reference → classifying → review → finalizing → done`. Auto-classify start bij tab-enter als profiel + dikte OK; face-klik-correctie in review; «Afronden» draait de volledige V3-finalize. Na succes springt de UI automatisch naar `result`/`vector`.
- **Gaten:** Solid face-demote (`cv/gaps`) — muurvlakken → outside; **geen** `tabOutputs`, alleen preview.
- **Deuren/Ramen:** UI-shell, geen detectielogica.
- **Profiel:** inline `DetectionProfileSwitch` (Solid/Open) past alleen `wallStyle` + `lineDetectorMode` + `roomInkCoverageThreshold` toe.

### Issues
1. **`useWorkspaceRoomFaces.ts` is een god-file (625 regels)** — state machine + preview + recalculate + finalize + snapshot-sync in één module. Grootste onderhoudsrisico van stap 3.
2. **Finalize-gate alleen op de Muren-tab** (`useWorkspaceFlow.ts:73-77`, geverifieerd). Op Gaten/Deuren/Ramen geeft `canGoNext` altijd `true`, dus je kunt stap 3 verlaten zonder finalize als je eerst van Muren wegnavigeert terwijl `roomPhase === 'review'`. `combinedOutput` is dan classify-only.
3. **Auto-navigatie na finalize** (`useWorkspaceRoomPipeline.ts`) springt naar `result`/`vector` zonder expliciete gebruikersstap — kan verwarrend zijn.
4. **Dead paths:** `onDetectTemplateTab` (legacy "genereer per tab"), `clearTemplateTypeRects`/non-wall `elementClassToDetectionLayer`-branches (throwen in walls-only flow), `onReferenceWallRectReady` (gedefinieerd maar niet gewired), `profileConfirmed` altijd `true`.
5. **Dubbele finalize-validatie:** in `useWorkspaceDetection` én `useWorkspaceRoomFaces`.
6. **`isValidTabOutput` gebruikt `elapsedMs > 0.5`** als heuristiek — fragiel (een snelle stub kan net boven/onder de drempel vallen).
7. **`roomInkCoverageThreshold` heeft geen UI** — alleen profiel-default + dev-snapshot.
8. **Gaten-output is preview-only** — niet in `tabOutputs`/export; opening-detectie later moet beslissen of demote-state bewaard moet worden.
9. **Verouderde docs:** `workspace-flow.md` + `memory.mdc` verwijzen nog naar `DetectionProfileDialog`/popup bij stap 2→3.

### Verbetervoorstellen
- Splits `useWorkspaceRoomFaces.ts`: (a) `useRoomPhaseMachine` (state + transitions), (b) `useRoomFinalize` (finalize + validatie), (c) `useRoomRecalculate` (ink-edit path). Snapshot-sync als aparte helper.
- Maak de finalize-gate consistent: blokkeer Volgende op stap 3 tot walls `done` zijn, ongeacht actieve tab (of toon expliciete waarschuwing).
- Overweeg de auto-jump naar result te vervangen door een duidelijke "→ Bekijk FML"-actie, of maak hem minstens zichtbaar aangekondigd.
- Verwijder de dead paths (`onDetectTemplateTab`, non-wall rect-branches, `onReferenceWallRectReady`, `profileConfirmed`).
- Vervang `elapsedMs > 0.5` door een expliciete "ran"-flag uit de worker.
- Werk `workspace-flow.md` + `memory.mdc` bij (DetectionProfileDialog → DetectionProfileSwitch).

---

## 6. Muurdetectie — room-first + V3-pipeline

### Wat het doet
Actief pad is **room-first only**: `geometry-pipeline.ts` → `junction-strategy.ts` → `room-first.ts`. Twee fasen:

**Fase 1 — Classify** (geen skeleton): CC op wit (`buildFaceLabelsFromBw`) → inkt-BFS naar dichtstbijzijnde vlak (`resolveInkBetweenFaces`) → enclosed merge → Otsu-referentie → coverage-classify (wall/surface/unknown/outside) → exterior-pockets demoten. Serialiseert state voor UI-review.

**Fase 2 — Finalize** (volledige V3): inkt-muurmasker (`room-ink-wall-mask`) → morph-close (geschaald op referentiedikte) → blob-split → per blob WASM-skeleton (L1) → **V3 L1–L10**:

| L | Rol |
|---|-----|
| L1 | WASM-skeleton per muur-blob + junction-graph |
| L2 | degree-2 jitter-merge (Laag B) |
| L3 | I-spur prune (Laag C) |
| L4 | bare H/V reposition op distance-map |
| L5 | cleanup/weld (same-line, tx-micro, LL-stairs, micro-loops) |
| L6 | chamfer-groep connector-repair (L/T/X) |
| L7 | inter-junction chain collapse |
| L8 | tweede H/V + I-prune + dedupe |
| L9 | dissolve (chain + ortho stubs + parallel-cover absorb) |
| L10 | FML-polish (axis-straighten + micro corner-jog) → **FML-ready** |

Daarna: `buildSemanticGraphFromFmlLayer` (Laag D, alleen uit L10 als `fmlReady`) → thickness → FML. Default pipeline: **V3-only** (`wall-pipeline-version.ts` retourneert altijd `v3`, geverifieerd).

**Omvang:** `pipeline-v3/` = 61 bestanden (~9.700 regels). Best geteste deel van de codebase.

### Issues
1. **God-files:** `chamfer-chain.ts` (637), `room-ink-classify.ts` (628), `chamfer-group-geometry.ts` (554), `room-wall-segment-thickness.ts` (500), `room-first.ts` (499), `junction-repair.ts` (443), `connector-detect.ts` (438), `wall-segment-geometry.ts` (436), `cleanup/index.ts` (401).
2. **L6-connector is het grootste risico** (~3.500+ regels over 15 bestanden). Probe-gedreven getuned: comments verwijzen naar specifieke coördinaten van specifieke tekeningen (BouwTek11 @645,243; 2D_3E top-chamfers). Kwetsbaar voor regressie bij nieuwe tekeningen.
3. **Honderden hardcoded pixel-drempels.** Policies vangen veel af, maar engines bevatten nog inline literals (bv. `Math.min(maxConnectorPx, 12)` in `chamfer-chain.ts`). Tunen vereist zoeken over meerdere lagen. Patroon: ref-scaling + vaste fallbacks (16/30/10px) + globale ortho-band (8px/8°) + vaste caps (48/12/5px).
4. **Duplicatie:** `buildJunctionsFromGraph` in L1/L2/L3; H/V-positionering in L4 én L8; I-prune in L3 én L8; chain-collapse in L7/L9/L10.
5. **Dode V2-koppeling:** `room-first.ts:29-30,454-503` importeert en wired nog het V2-finalize-pad, maar de toggle staat vast op v3 (`loadWallPipelineVersion` retourneert altijd v3). De hele V2-branch is onbereikbaar dead code (rollback zit al veilig in `src/archive`).
6. **Laag B export-tekst verouderd:** beschrijft oude V2-polish ("collinear merge, parallel/T-resolve") terwijl V3 L2 alleen jitter-merge is.
7. **Testgaten:** geen dedicated `layer-1` en `layer-10` spec; geen actieve E2E room-first finalize test (alleen in archive); V3 L6 heeft 2 specs vs ~15 gearchiveerde V2 L6-probes.
8. **Topology-preserve guards** (L7/L9/L10) slaan collapse over als junction-kind-tellingen veranderen — kan per-face inconsistente staat achterlaten (`facesSkippedTopology`).

### Verbetervoorstellen
- **Verwijder het V2-finalize-pad uit `room-first.ts`** (branch + import). Rollback blijft via `src/archive`. Dit haalt direct ~50 regels dead code + een conditionele afsplitsing weg uit een god-file.
- **Centraliseer de resterende magic numbers** in de policy-objecten; laat engines geen kale literals meer bevatten. Documenteer per drempel of hij ref-geschaald of vast is.
- **Voeg `layer-10-fml.spec.ts` en een L1-integratietest toe**, plus minstens één actieve E2E finalize-test (verplaats/herbouw de gearchiveerde). L10 is FML-bron — daar wil je regressiedekking.
- Werk de Laag B export-beschrijving bij naar "jitter-merge".
- Overweeg `room-ink-classify.ts` (628) en `chamfer-chain.ts` (637) op te splitsen langs duidelijke sub-verantwoordelijkheden; dit zijn de twee hotspots.
- Als de L6-tuning stabiliseert: overweeg de probe-coördinaat-comments te vervangen door benoemde regressietests met fixtures i.p.v. inline magic-coördinaten.

---

## 7. Cross-cutting observaties

- **God-files (top, niet-archive):** `ref-blob.ts` (844), `chamfer-chain.ts` (637), `room-ink-classify.ts` (628), `useWorkspaceRoomFaces.ts` (625), `fml-preview-junctions.ts` (559), `chamfer-group-geometry.ts` (554), `useWorkspace.ts` (507), `WorkspaceView.vue` (507), `useWorkspaceDevSession.ts` (501). Eerdere split-rondes hielpen maar de orchestrator (`useWorkspace.ts`) blijft zwaar.
- **Late-binding wiring** (`let cb = async () => {}` + `setCb(...)`) in `useWorkspacePreprocessWiring` en de `roomFacesRef` forward-ref pattern lossen circulaire deps op maar maken de dependency-graph moeilijk te volgen. Werkt, maar fragiel bij snapshot-restore.
- **Dead code / verouderde docs** consistent thema: V2-toggle, `DetectionProfileDialog`, `onDetectTemplateTab`, `onBuildVectorDebug`, non-wall detection-branches, `doorLayer`/`windowLayer`.
- **Geen TODO/FIXME/HACK** in de onderzochte bronbestanden — wel `@deprecated`-markers die opgeruimd kunnen worden.
- **Testcultuur is goed** voor CV (per-laag specs, probe-fixtures) maar dun voor UI-composables en E2E.

---

## 8. Aanbevelingen op prioriteit

**Hoog (weinig risico, direct nut)**
1. Verwijder het onbereikbare V2-finalize-pad uit `room-first.ts` (rollback blijft in archive).
2. Maak de stap-3 finalize-gate consistent (Volgende blokkeren tot walls `done`, ongeacht tab).
3. Beslis + fix de `commitInputStepImage` normalize-inconsistentie; werk anders de doc bij.
4. Werk `workspace-flow.md` + `memory.mdc` bij (DetectionProfileDialog → Switch).

**Midden (onderhoud)**
5. Splits `useWorkspaceRoomFaces.ts` (625) in phase-machine / finalize / recalculate.
6. Faseer de legacy preprocess root-mirror uit.
7. Ruim dead exports/paths op (`onDetectTemplateTab`, `onBuildVectorDebug`, non-wall branches, `profileConfirmed`, dode UI-emits stap 1).
8. Voeg `layer-10` + L1 + E2E finalize tests toe.

**Laag (langere termijn)**
9. Centraliseer V3 magic numbers volledig in policies; documenteer ref-scaled vs vast.
10. Splits `imageUtils.ts`, `room-ink-classify.ts`, `chamfer-chain.ts`.
11. Vervang L6 probe-coördinaat-comments door benoemde fixture-tests.
12. Verwijder `doorLayer`/`windowLayer` uit types tot opening-detectie live is.

---

## 9. Wat vooral goed is (behouden)

- Duidelijk stap-contract met één verantwoordelijkheid per stap.
- DRY per-laag preprocess (`layer-preprocess.ts`) — uitbreidbaar zonder copy-paste.
- Room-first als enige muurpad; oude varianten netjes in archive.
- V3-pipeline is modulair (runner/engine/policy-scheiding) en goed getest op de kern-lagen.
- Strikte scheiding OCR (alleen stap 3 UI, via mask) vs geometry-pipeline.
