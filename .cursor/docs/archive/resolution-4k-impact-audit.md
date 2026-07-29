# Audit: onderlegger-resolutie 2k → 4k

**Datum:** 2026-07-21  
**Scope:** research + cutover-status. Inventaris blijft geldig; zie § Follow-up voor wat al is doorgevoerd.  
**Ankers:** [`workspace-flow.md`](workspace-flow.md), [`ref-size-normalization-audit.md`](ref-size-normalization-audit.md), codepaden hieronder.

---

## Follow-up (2026-07-21 cutover preprocess)

Doorgevoerd (lokale POC / preprocess-only):

| Item | Status |
|------|--------|
| `OPTIMIZATION_BASE_DIMENSION` **3000** (was 4000; canvas te zwaar) | gedaan |
| Upscale `imageSmoothingQuality = 'high'` (geen NN) | gedaan |
| Muur-defaults: adaptive, despeckle 32 aan, thicken 1 aan | gedaan |
| Detectie abs px / L6 / ink-eat caps → ref | **nog open** — bespreeklijst: [`detection-abs-px-inventory.md`](detection-abs-px-inventory.md) |

Handmatige check: lage JPG (BouwTek11) + PDF De Roemer; refs opnieuw; despeckle effectief ≈ `32 × (maxEdge/1000)²`.

---

## 0. Verdict (kort)

1. **Er is geen downscale.** `OPTIMIZATION_BASE_DIMENSION` is een **upscale-floor** (nu **3000**). Native ≥ floor blijft ongewijzigd; CV werkt 1:1 (`createWorkCanvas` scale=1).
2. **PDF blijft target 4000** (cap 8192). PNG/JPG-floor is 3000 (compromis performance).
3. **POC-bronnen in `examples/Bouwtekeningen` zijn grotendeels &lt;2000px** (BouwTek11 ≈1387, Project6 ≈1050). Die worden opgeschaald; met **high-quality** i.p.v. nearest-neighbor.
4. **Refs + `pxPerMm` → FML cm** zijn schaalbaar **als** schaal en refs op dezelfde resolutie opnieuw worden gezet. Absolute px (preprocess kernels deels; ink/morph caps, L6 floors, OCR area-caps) schalen **niet** mee.
5. **Rest-aanbeveling:** detectie abs caps nog aan `referenceWallThicknessPx` koppelen (P0/P1 uit §7).

---

## 1. Fase A — Resolutiebeleid & dimensie-flow

### 1.1 Huidig beleid

| Stap | Bestand | Gedrag |
|------|---------|--------|
| Constante | [`frontend/src/ui/composables/workspace/constants.ts`](../frontend/src/ui/composables/workspace/constants.ts) | `OPTIMIZATION_BASE_DIMENSION = 3000` |
| Upload PNG/JPG | [`imageUtils.ts`](../frontend/src/ui/composables/workspace/imageUtils.ts) `buildOptimizationBase` | max-edge ≥3000 → scale 1; anders upscale naar 3000 (`imageSmoothingQuality = 'high'`) |
| Upload PDF | [`pdfUploadUtils.ts`](../frontend/src/platform/upload/pdfUploadUtils.ts) | target langste zijde **4000**, hard cap **8192**; preview max 800 |
| Commit stap 1 | `normalizeWorkingCanvas` via [`useWorkspaceImage.ts`](../frontend/src/ui/composables/workspace/useWorkspaceImage.ts) | alleen bij rotatie/gum: trim witruimte → opnieuw min-3000 upscale; schaal via `applyUpscaleToConfirmedScale` of `transformHScaleState` |
| CV work | [`workImage.ts`](../frontend/src/platform/image/workImage.ts) | altijd `scale = 1` |

```
PNG/JPG ──► buildOptimizationBase (floor 2000)
PDF     ──► raster ≥4000 (≤8192) ──► zelfde buildOptimizationBase (meestal scale 1)
        ──► stap 1 schaal/refs
        ──► [opt] commit: trim + floor-upscale
        ──► createWorkCanvas 1:1 ──► preprocess / detectie / FML
```

### 1.2 Schaal-kalibratie bij upscale

[`useHScaleCalibration.ts`](../frontend/src/platform/calibration/useHScaleCalibration.ts) `applyUpscaleToConfirmedScale(factor)`: `confirmedPixelsPerMillimeterX/Y *= factor`.  
Upload-pad: [`applyPixelScaleFactorToCalibration`](../frontend/src/ui/composables/workspace/imageUtils.ts) doet hetzelfde of transformeert liniaal-state als nog niet bevestigd.

**Contract:** fysieke maten in FML blijven kloppen zolang `pxPerMm` op de **eindresolutie** staat. Trim vóór upscale wijzigt content-bounds → andere upscale-factor (bekend fragiliteitspunt; zie L6/pipeline fragility audits).

### 1.3 Voorbeeldbronnen → factoren (gemeten 2026-07-21)

| Bestand | Native W×H | max-edge | Floor 2k factor | Floor 4k factor |
|---------|------------|----------|-----------------|-----------------|
| `BouwTek11.jpg` | 1387×1020 | 1387 | **1.44** | **2.88** |
| `Project6/1e origineel.png` | 1034×794 | 1034 | 1.93 | **3.87** |
| `Project6/bg origineel.png` | 1052×786 | 1052 | 1.90 | 3.80 |
| `Project2/...large-2.jpg` | 1125×675 | 1125 | 1.78 | 3.56 |
| `Project4/bg.jpg` | 1500×1000 | 1500 | 1.33 | 2.67 |
| `Project5/bg.png` | 340×907 | 907 | 2.21 | **4.41** |
| `Project1/or bg.png` | 505×1024 | 1024 | 1.95 | 3.91 |
| De Roemer e.d. (PDF) | — | raster ~4000 | 1 (na PDF) | 1 |

**Gevolg:** “2k→4k” voor typische JPG/PNG = **~2× lineair t.o.v. huidige floor**, maar t.o.v. native vaak **~3–4× NN-upscale**. PDF-pad verandert nauwelijks.

### 1.4 PDF vs PNG-floor na cutover

Als PNG-floor = 4000:

| Pad | Effect |
|-----|--------|
| PDF | Al ~4000 → geen extra upscale; beleid consistent |
| PNG ≥4000 native | Ongewijzigd |
| PNG 2000–3999 | Nieuw: upscale naar 4000 (nu: behouden) |
| PNG &lt;2000 | Sterkere upscale dan nu |

Dubbel pad blijft: upload-floor + commit-`normalizeWorkingCanvas` (zelfde constante).

---

## 2. Fase B — Preprocess (dunne inkt / “wegpoetsen”)

### 2.1 Hypothese

Bij hogere resolutie (of sterkere upscale) worden dunne lijnen **meer pixels breed**. Vaste px morph/despeckle/blur worden **relatief milder** → minder “wegpoetsen”, meer overlevende inkt → stabielere faces.  
Tegengesteld risico: adaptive block / bridge te klein t.o.v. gaten → fragmentatie; of te milde despeckle → noise-faces.

### 2.2 Absolute / slecht meeschalende parameters

| Item | Waarde / gedrag | Bestand | Bij 2× lineair |
|------|-----------------|---------|----------------|
| GaussianBlur | default `blurSize: 3` | [`preprocess.ts`](../frontend/src/cv/port/preprocess.ts) | Relatief fijner → minder smoothing |
| Adaptive block | default `11`, UI 3–51 oneven (`adaptiveBlockSize`) | [`preprocess.ts`](../frontend/src/cv/port/preprocess.ts) + PreprocessPanel | Instelbaar; op 4k vaak groter proberen (21–31) |
| Edge-aware Sobel | kernel `3`, boost 0–12 | idem | Spatiaal vast; boost intensiteit onduidelijk |
| Wall/gaps morph defaults | thicken/bridge/erode **1 px**, despeckle default **uit** | [`layer-preprocess.ts`](../frontend/src/cv/preprocess/layer-preprocess.ts) | UI-sliders in abs px; schalen niet mee |
| Despeckle min-area | `despeckleMinPx` (gebruiker) | [`preprocess-layer.ts`](../frontend/src/cv/layers/preprocess-layer.ts) | Zelfde px-drempel op 4× area → relatief strenger of milder afhankelijk van stroke |
| Int-muur (Otsu) ref-tune | `bridgeGaps: 8`, `removeSpeckles: 80`, thicken 5 | [`room-reference-preprocess.ts`](../frontend/src/cv/walls/rooms/room-reference-preprocess.ts) | Deels capped ref-scaling voor holes; bridge **8** abs |
| Ink-eat radii | wall clamp **5–10**, outside **1–5** | [`room-ink-resolve.ts`](../frontend/src/cv/walls/rooms/room-ink-resolve.ts) | Cap blijft bij dikkere ref → **relatief te klein** |
| Wall ink reach bonus | **2 px** vast | idem | Relatief kleiner |
| Merged wall close | clamp **1–5** (`×0.03/0.04`) | [`room-wall-close-radius.ts`](../frontend/src/cv/walls/rooms/room-wall-close-radius.ts) | Cap **5** bij 2× dikte te krap voor pinholes |

### 2.3 Meetprotocol preprocess (POC)

Op dezelfde crop / zelfde user-tunes:

| Metric | Hoe |
|--------|-----|
| Inkt-area% | zwarte pixels / totaal na B/W |
| CC-count (inkt + wit) | connected components vóór face-classify |
| Median stroke-width | distancetransform of lokale dikte langs skeleton-sample |
| Visueel | zones die nu “vaag” verdwijnen bij despeckle/bridge |

Vergelijk Run A (floor 2000) vs B (floor 4000) vs C (native ≥4k indien beschikbaar). Edge-aware vs adaptive apart noteren.

### 2.4 Verwachte richting

| Situatie | Verwacht |
|----------|----------|
| Lage native + NN→4k | Blokkige dikkere strokes; despeckle minder destructief; **geen** echte scherpte |
| Echte high-res scan/PDF | Meer detail; adaptive/blur mogelijk te fijn → meer ruis-CC’s |
| Handmatige despeckleMinPx hoog | Op 4k relatief agressiever t.o.v. dunne echte lijnen als gebruiker niet herschaalt |

---

## 3. Fase C — Detectie SAFE / RISK / UNKNOWN

Anker: [`ref-size-normalization-audit.md`](ref-size-normalization-audit.md).  
**Legenda:** SAFE = ratio / `refPx×ratio` / mm→px via ppm (oké als refs+schaal opnieuw). RISK = vaste px of harde caps. UNKNOWN = gedrag empirisch.

### 3.1 Faces / room-first

| Item | Status | Notitie |
|------|--------|---------|
| Face-CC op wit na preprocess | UNKNOWN | Baat bij overlevende inkt; meer noise als despeckle te mild |
| Ink-between-faces | SAFE-ish | Logica topologisch; radii zie ink-eat RISK |
| `EXTERIOR_POCKET_MAX_BBOX_PX = 50` | **RISK** | [`room-exterior-pocket.ts`](../frontend/src/cv/walls/rooms/room-exterior-pocket.ts) — bij 2× te klein voor echte pockets |
| keepLargest `max(24, th²)` | SAFE-ish | schaalt met th²; floor 24 wordt relatief milder |
| Ink margins `max(32, th×2)`, `max(8, th)` | RISK-floor | [`room-ink-process.ts`](../frontend/src/cv/walls/rooms/room-ink-process.ts) |

### 3.2 Muren V3 L1–L10

| Item | Status | Notitie |
|------|--------|---------|
| `resolvePipelineScale` / L1–L5,L7–L10 | **SAFE** | [`scale.ts`](../frontend/src/cv/walls/rooms/pipeline-v3/engines/scale.ts) `ref × (n/30)` |
| `PIPELINE_*_EPS_PX = 1` | RISK (bewust) | Subpixel; bij 2× relatief strakker |
| L6 connector/arm/chain ratios | SAFE-kern | [`connector/constants.ts`](../frontend/src/cv/walls/rooms/pipeline-v3/engines/connector/constants.ts) |
| `LAYER6_ARM_DETECT_MIN_PX = 22` | **RISK** | Floor blijft 22 terwijl ref verdubbelt → arm-detect te “vroeg” t.o.v. echte armen? (min wordt minder knellend) |
| `LAYER6_ARM_DETECT_MAX_PX = 50` | **RISK** | Cap knijpt bij ref≫50 |
| `LAYER6_CONNECTOR_MAX_CAP_PX = 48` | **RISK** | Idem |
| `LAYER6_CHAMFER_L_GUARD_PX = 12` | **RISK** | Abs |
| `LAYER6_ENDPOINT_SNAP_PX = 1.25` | RISK (bewust) | |
| `nearGroupPx: CONNECTOR_MAX_CAP` | **RISK** | Niet ref-geschaald in scale-object |
| L5 `nearEndpointGapPx: 0.8` | RISK | Vast in policy |

### 3.3 Geometry / thickness helpers

| Constant | Waarde | Status |
|----------|--------|--------|
| `JUNCTION_THICKNESS_MARGIN_PX` | 30 | **RISK** |
| `WALL_LINE_SNAP_PX` / `PARALLEL_SEP` | 8 / 6 | **RISK** |
| `ORTHO_BAND_PX` | 8 | **RISK** |
| `ORTHO_COLLINEAR_MAX_OFFSET_PX` | 2 | RISK |

Bestanden: [`room-wall-segment-thickness.ts`](../frontend/src/cv/walls/rooms/room-wall-segment-thickness.ts), [`wall-segment-geometry-constants.ts`](../frontend/src/cv/walls/rooms/wall-segment-geometry-constants.ts).

### 3.4 Gaten / deuren / ramen

| Module | SAFE | RISK |
|--------|------|------|
| Gaten face-cap | `maxRefFaceArea × 3` (zelfde plan-px) | — |
| Deur mm-band | 250–1200 mm × ppm ([`door-scale-band.ts`](../frontend/src/cv/doors/door-scale-band.ts)) | — |
| Deur ratio match | wall/depth/area/clear ratios | **framing\*Px abs** in resolve ([`door-resolve.ts`](../frontend/src/cv/doors/door-resolve.ts)) — oké bij **nieuwe** refs; kapot bij restore oude abs |
| Deur wall-snap | × ref thickness | — |
| Raam Stage-1/3 | strip-ratio, `denormalizeSizeRange` | `CENTER_STRIP_BAND_WIDTH_PX=5`, `STRIP_MERGE_GAP_PX=1`, floors `max(3,…)`, `max(2,…)` |
| L14 bind | thickness/2 | floor **`max(…, 8)`** |
| L14 merge | 5% size ratio | touch eps **1.5 px** |

### 3.5 OCR

| Item | Status |
|------|--------|
| `area < 16 \|\| area > 12000` | **RISK** ([`ocrTextFilters.ts`](../frontend/src/cv/port/ocrTextFilters.ts)) — bij 2× lineair area×4 → meer hits in range of juist te veel grote boxes afgewezen |
| `width > 280 \|\| height > 120` | **RISK** |
| Line-like `long < 24`, `short ≤ 28` | **RISK** |

### 3.6 Wat “vanzelf” goed gaat bij nieuwe refs op 4k

- `referenceWallThicknessPx` verdubbelt ≈ → meeste V3 thresholds  
- Deur/raam ratio-bands opnieuw gemeten  
- `pxPerMm` ×2 → FML cm stabiel  
- Gaten face-area cap (ref opnieuw)

### 3.7 Wat code-aanpassing nodig heeft (ook met nieuwe refs)

- Preprocess adaptive/blur + UI morph defaults  
- Ink-eat / close-radius **caps**  
- L6 **MAX** caps (48/50) en vaste guards (12, nearGroup)  
- Exterior pocket 50, junction/snap bands  
- OCR area/size caps  
- Window strip band 5 + bind floor 8 + merge eps  

---

## 4. Fase D — Schaal, refs, FML

### 4.1 Contract

```
detectie-coördinaten (image-px)
    ÷ pxPerMmX/Y
    ÷ 10
  → cm in FloorPlan / FML
```

Bronnen: [`extractionToPlan.ts`](../frontend/src/core/fml/extractionToPlan.ts) `toCmX/Y`, [`useWorkspaceFml.ts`](../frontend/src/ui/composables/useWorkspaceFml.ts).  
**Geen aanname “plan ≈ 2000px”** in FML-export. Dikte-tiers/harmonize in cm.

### 4.2 Voorwaarden voor correcte FML na resolutiewissel

1. Schaallijn bevestigen **op eindbeeld** (of `applyUpscaleToConfirmedScale` na commit).  
2. Muur/deur/raam-refs **opnieuw** tekenen/meten op eindbeeld.  
3. Geen hergebruik van oude absolute ankers (`framingAlongPx`, `targetStripHeightPx` zonder ratio, snapshot bboxen) van een andere resolutie.

### 4.3 Snapshot / restore

Geen volledige workspace-snapshot-restore van detectie-refs in localStorage gevonden (alleen gaps-mode, profiles, FML thickness prefs).  
Memory noemt wel “Snapshot exact-restore” als open POC: bij toekomstige restore van abs px-refs + andere floor → **framing/strip-targets fout**. Checklist bij eventuele snapshot-feature: resolutie/hash meenemen of alleen ratios + ppm bewaren.

### 4.4 UI / Konva

Overlays werken in image-px; hit-targets schalen met stage. Risico is vooral **performance** (grote bitmap textures), niet FML-correctheid.

---

## 5. Fase E — Performance-envelope

### 5.1 Orde van grootte

| Scenario | Lineair | Pixels | Voorbeeld Mat 1-kanaal |
|----------|---------|--------|-------------------------|
| BouwTek11 @ floor 2k | ~2000 | ~2.9 Mpx | ~3 MB/Mat |
| BouwTek11 @ floor 4k | ~4000 | ~11.6 Mpx | ~12 MB/Mat |
| PDF @ 4000 (status quo) | 4000 | ~12–16 Mpx | ~12–16 MB |
| Cap 8192 | 8192 | tot ~67 Mpx | ~67 MB/Mat |

Meerdere lagen tegelijk (gray, wall B/W, gaps, labels Int32, OCR mask) → **ruwweg 5–15×** één Mat. Int32 labels ≈ 4× bytes t.o.v. 8-bit.

### 5.2 Overige

| Onderdeel | Gedrag bij 4k |
|-----------|----------------|
| Deskew sample | blijft max **1500** ([`deskew.ts`](../frontend/src/cv/port/deskew.ts)) — oké |
| Worker / main | Zwaardere mats; Layer Debug exports groter |
| Browser canvas | PDF-cap 8192 is bestaande safety; floor 4000 onder die limiet |
| Skeleton / morph | Complexiteit ~O(pixels); L6 al zwaar — verwacht merkbare runtime |

**Conclusie E:** floor 4000 is binnen bestaande PDF-envelope; geen nieuwe hard limit nodig. Wel: POC op zwaarste tekening op geheugen/runtime meten vóór default-cutover.

---

## 6. Fase F — POC-protocol (bewijs)

### 6.1 Cases

| Rol | Bron | Waarom |
|-----|------|--------|
| Probleem A | `examples/Bouwtekeningen/Project3/BouwTek11.jpg` (1387px) | Bekende L6/fixture; sterke upscale naar 4k |
| Probleem B | De Roemer PDF plattegrond (al ~4k) | Floor-change ≈ no-op; isoleert “echte 4k” vs abs-px bugs |
| Controle | Eén “goede” case (bijv. Project4 of bekende stabiele run) | Regressie-baseline |
| Optioneel C | Native scan ≥4000 indien beschikbaar | Scheidt NN-upscale-artefacten van echte resolutie |

### 6.2 Runs

| Run | Floor | Refs | Doel |
|-----|-------|------|------|
| A | 2000 (huidig) | nieuw op A | Baseline |
| B | 4000 (tijdelijke constante / flag) | **opnieuw** op B | Impact floor |
| C | native ≥4k, geen extra upscale | opnieuw | Upscale vs native |

Zelfde fysieke schaal-cm (liniaal). Preprocess-tunes: eerst defaults; tweede pass met huidige handmatige tunes (documenteer px-waarden).

### 6.3 Te loggen

- W×H na upload/commit, scale-factoren, `pxPerMm`, `referenceWallThicknessPx`
- Preprocess: inkt%, CC-count, median stroke
- Faces: count per class (wall/door/window/outside/surface)
- L10: segment count, mean thickness px
- Deuren/ramen: hits vs expect
- FML: steekproef muurlengtes cm (delta vs A; tolerantie bijv. ≤2%)
- Runtime + piekgeheugen (DevTools)

### 6.4 Succescriteria (richting)

- Meer bruikbare faces op “vage” zones **of** aantoonbaar minder despeckle-verlies  
- FML cm-delta binnen tolerantie  
- Geen OOM / onbruikbare UI  
- Op De Roemer (al 4k): geen regressie door alleen constante-wijziging

### 6.5 Implementatiehint voor POC (ná goedkeuring)

Alleen `OPTIMIZATION_BASE_DIMENSION` (en eventueel gedeelde helper) tijdelijk op 4000 — **geen** productie-merge tot §7 besloten.

---

## 7. Fase G — Aanbeveling & change-set

### 7.1 Gekozen richting: **hybride (optie 3)**

**Niet** blind floor 2000→4000 als default. Redenen:

1. Typische JPG/PNG-POC’s zijn **al &lt;2k**; 4k-floor = zwaardere **nearest-neighbor** interpolatie, geen echte scan-kwaliteit.  
2. PDF/De Roemer zit **al op 4k** — face-problemen daar komen van abs-px / preprocess / detectie, niet van “te weinig floor”.  
3. Kernwinst voor “vage lijnen wegpoetsen” zit waarschijnlijk in **ref-gekoppelde morph/ink** en minder agressieve vaste despeckle, niet alleen in meer upscale-pixels.

### 7.2 Change-set prioriteit (als later wél actie)

**P0 — Preprocess / ink (hoogste ROI voor faces)**

1. Adaptive block size + blur koppelen aan `referenceWallThicknessPx` (of floor-factor).  
2. Ink-eat caps (5–10) en close-radius cap (5) verhogen of cap = f(ref).  
3. Int-muur `bridgeGaps: 8` / despeckle thresholds reviewen t.o.v. ref.  
4. Documenteer: handmatige morph-sliders zijn abs px — bij andere resolutie opnieuw tunen of auto-scale UI.

**P1 — Detectie abs floors/caps**

5. `EXTERIOR_POCKET_MAX_BBOX_PX` → ref×ratio.  
6. L6 `CONNECTOR_MAX_CAP` / `ARM_DETECT_MAX` / chamfer guard / nearGroup → omhoog of ×ref.  
7. Junction/snap/ortho bands (30/8/6/8) → pipeline-scale.  
8. Window strip band 5, bind floor 8, merge eps 1.5 → ref of thickness.  
9. OCR area/size caps × resolutie of ppm.

**P2 — Floor-beleid**

10. Overweeg floor **4000 alleen** als: (a) P0/P1 gemeten stabiel, (b) POC Run B beter dan A op low-res JPG **én** Run C toont dat native high-res nog beter is, (c) PDF-pad blijft 4000 (geen dubbele betekenis).  
11. Alternatief: floor 2000 houden; upload-advies “liever PDF/native ≥3–4k”; preprocess defaults tunen.  
12. Upscale-filter: overweeg `imageSmoothingEnabled = true` (of bicubic) i.p.v. nearest-neighbor bij grote upscale-factoren — apart te POC’en (artefacten vs blockiness).

**P3 — FML / DX**

13. Geen FML-wijziging nodig voor cm-contract.  
14. Snapshot-restore: resolutie of ratios-only.  
15. Eén gedeelde constante voor PNG-floor + documentatie sync (`workspace-flow.md`, `dev-workspace/types.ts`).

### 7.3 Wat we níet doen zonder POC

- Productie-default `OPTIMIZATION_BASE_DIMENSION = 4000`  
- Grootschalige L6-refactor “voor de zekerheid”  
- Archive/AI-paden

---

## 8. Samenvattende antwoorden op de researchvragen

| Vraag | Antwoord |
|-------|----------|
| Helpt 4k faces? | **Misschien** op low-res JPG via mildere relatieve morph; **niet automatisch** op PDF die al 4k is. Echte scan &gt; NN-upscale. |
| Moeten refs mee? | Ja opnieuw meten; ratio’s + dikte-anker zijn ontworpen om mee te schalen. |
| FML last van grotere tekening? | Nee, via `pxPerMm` → cm. |
| Wat opvangen? | Absolute preprocess/ink/L6/OCR/window floors + performance; zie §3 en §7. |
| Eerste experiment? | POC §6: BouwTek11 A/B + De Roemer (controle dat floor-no-op veilig is) + preprocess metrics. |

---

## 9. Bronindex (code)

| Concern | Pad |
|---------|-----|
| Floor-constante | `frontend/src/ui/composables/workspace/constants.ts` |
| Upscale / normalize | `frontend/src/ui/composables/workspace/imageUtils.ts` |
| Upload-watch / commit | `frontend/src/ui/composables/workspace/useWorkspaceImage.ts` |
| PDF 4000/8192 | `frontend/src/platform/upload/pdfUploadUtils.ts` |
| Work canvas 1:1 | `frontend/src/platform/image/workImage.ts` |
| px/mm upscale | `frontend/src/platform/calibration/useHScaleCalibration.ts` |
| Layer preprocess | `frontend/src/cv/preprocess/layer-preprocess.ts`, `cv/layers/preprocess-layer.ts` |
| B/W kernels | `frontend/src/cv/port/preprocess.ts` |
| Ink / close | `room-ink-resolve.ts`, `room-wall-close-radius.ts` |
| V3 scale / L6 | `pipeline-v3/engines/scale.ts`, `…/connector/constants.ts` |
| FML cm | `core/fml/extractionToPlan.ts`, `useWorkspaceFml.ts` |
| Ref-normalisatie | `.cursor/docs/ref-size-normalization-audit.md` |
