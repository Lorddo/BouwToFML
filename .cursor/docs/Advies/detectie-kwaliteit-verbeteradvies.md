# Advies: detectie­kwaliteit verbeteren (muren, deuren, ramen)

> **Datum:** 2026-06-27
> **Aanleiding:** resultaten uit `voorbeelden-rapport (8).html` (Project1 — or bg.png) en de visuele overlay zijn niet goed genoeg. Blokkige, elkaar overlappende muur­vlakken, ruis­achtige opening­detecties (35 ramen voor 1 template, `Infinity`-confidence, deuren op verkeerde locaties).
> **Scope:** V1, client-side, OpenCV-only (geen AI) — conform `project-context.mdc` en `decisions.md`.
> **Werkwijze:** per pipeline-fase → huidige techniek → geobserveerd probleem → verbetering (incl. optionele packages).

---

## TL;DR — prioriteiten

| # | Prio | Ingreep | Verwacht effect |
|---|------|--------|-----------------|
| 1 | **Hoog** | Opening­detectie **alleen accepteren op een muur** (geometrische prior) | Elimineert het gros van de 35 valse ramen en deuren-in-het-loze |
| 2 | **Hoog** | Stop met **full-window template matching**; gebruik **kozijnstijl-detectie + clustering** (google-ai Optie B) | Ramen robuuster, geen schaal-explosie, geen dunne-lijn-False-Positives |
| 3 | **Hoog** | Muurvectorisatie via **morph-close → skeleton → Hough/LSD op skelet** (i.p.v. textuur-template-boxen) | Doorlopende centerlines i.p.v. blokkige overlap­vlakken |
| 4 | **Hoog** | **Junction-first wall graph**: knooppunten vóór segmenten, expliciete L/T/X-nodes | Schone hoeken, geen jitter, geen overlappende rechte hoeken |
| 5 | **Medium** | **Cross-type NMS** + reparatie van `Infinity`-score + confidence-calibratie | Eén box per element, geen kleur-overlap |
| 6 | **Medium** | **Beeldpyramide** voor template-scan (coarse→fine) | Snelheid + minder false positives uit full-scan |
| 7 | **Medium** | **Geometrische rectificatie**: dominant-angle deskew + globale 0/90-forcering | Verwijdert resterende jitter in rechte muren |
| 8 | **Laag/V2** | ORB/AKAZE feature-matching voor deuren, contour-polygonen voor massieve muren | Robuustere deurherkenning, Scan2CAD-style solid-block |

> Belangrijkste inzicht: **de “blokkige” overlay in de afbeelding zijn ruwe template-match-boxen (`wallMatches`)**, niet de definitieve centerlines. De huidige pipeline toont te veel ruwe tussentijdse hits en te weinig schone vector-output. Daarom moet de vectorisatie **vóór** de visualisatie komen, en moeten openingen **geometrisch aan muren gekoppeld** worden.

---

## Fase 0 — Voorbewerking

### Huidige techniek
- Per-laag preprocess (`wallMat` / `doorMat` / `windowMat`) met eigen drempel (`resolveLayerPreprocess`).
- `edgeAwareBinarize`, `otsu`, `despeckle`, `cleanBinary`, helderheid/contrast.
- Rotatie/maxres/crop op stap Origineel (`OriginalSetupPanel`).

### Geobserveerd probleem
- Rapport toont 1600 Hough-lijnen met 0 segmenten op sommige vakken (memory: BouwTek11) → arcering wordt niet goed tot masker gemaakt.
- Scans met vlekken/artefacten → false positives in template-match.

### Verbetering
- **CLAHE** vóór drempel op scans met slecht contrast (`cv.createCLAHE(2.0, (8,8))`) — normaliseert lokale contrast zonder globale drempel te verpesten.
- **Adaptive threshold** (`cv.adaptiveThreshold` met `ADAPTIVE_THRESH_GAUSSIAN_C`) naast Otsu voor gearceerde muren — lokaal drempelen behoudt dunne arcering waar Otsu wegvalt.
- **Kwaliteitsgate** (zie bestaand advies `raster-naar-vector-tools-advies.md`): toon waarschuwing als gemiddelde lijndikte < 3 px of > 10 px, of als afbeelding < 150 DPI-equivalent. Voorkomt nutteloze detectie op te kleine input.
- **Morph close per laag** vóór detectie (zie Fase 2) — nu pas laat in de pipeline.

---

## Fase 1 — Deur- en raamdetectie ( openings )

> Dit is waar het rapport het hardst roept: sel-7 → **35 “ramen”** met confidence 0.92–0.98 verspreid over de hele tekening; sel-6 → openings met **`Infinity`** confidence en 14×77 boxen op een andere muur dan het voorbeeld; sel-4 → 3 deuren op y=1704 terwijl het voorbeeld op y=1256 staat.

### 1.1 Huidige techniek
- `matchOpeningsInkMasked` (`openingMatch.ts`): `TM_CCORR_NORMED` + inkt-mask op template-crop.
- Per template: 4 rotaties (0/90/180/270) × 2 spiegels × 7 schaalstappen (deur 0.75–1.25, raam 0.55–1.45).
- `findPeaksAboveThreshold` met iteratieve onderdrukking (`MAX_PEAKS = 20` per template-schaal) + NMS-radius 32.
- Deur default **pixel-only**: full-scan op `doorMat`, **geen muur nodig**.
- Raam default **hybrid**: pixel + gap/signature refine.

### 1.2 Geobserveerde problemen
1. **`Infinity`-confidence** → scoringsbug (waarschijnlijk deling door nul of leeg mask bij `TM_CCORR_NORMED` met mask van enkele pixels). Moet sowieso gerepareerd.
2. **Template rotatie + dunne-lijn template → false positives op elke dunne muurregel.** Een raamtemplate bestaat grotendeels uit dunne loodrechte kozijnstijlen; geroteerd matcht dat op élke verticale/horizontale dunne lijn in de tekening. Vandaar 14×77 boxen op de rechter muur.
3. **Geen geometrische prior**: pixel-only deuren worden in het midden van kamers geaccepteerd (sel-4 deuren op y=1704 ver van elke muur).
4. **`MAX_PEAKS = 20` per schaal × 4 rot × 2 flip × 7 schaal = 1120 ruwe hits per template** vóór NMS — NMS-radius 32 laat veel staan op een grote tekening.
5. **`cv.resize` verdikt/verdunt lijnen** bij schaal → correlatie faalt of matcht verkeerd (google-ai waarschuwt hier expliciet voor ramen).
6. **Confidence niet gecalibreerd**: 0.95 ziet er hoog uit maar is voor `TM_CCORR_NORMED` heel makkelijk te halen op willekeurige donkere pixels.

### 1.3 Verbeteringen

**A. Geometrische muur-prior (hoogste prior, kleinste ingreep, grootste winst)**
- Accepteer een opening­hit **alleen** als het centrum binnen `wallThicknessPx * 1.5` van een gedetecteerde muur-centerline ligt.
- Implementatie: in `matchOpeningsInkMasked` of in `filterOpeningMatches` een `wallSegments`-parameter meegeven; rejects hits zonder nabije muur.
- Dit had in sel-7 direct ~30 van de 35 false positives weggegooid.
- Voor schuine muren (geen 0/90): muur-prior werkt ook op scheve segmenten zolang `wallSegments` die bevat.

**B. Kozijnstijl-detectie i.p.v. heel-raam-template (raam, google-ai Optie B)**
- Match een **enkele stijl** (verticale kop of tussenstijl) — klein template, weinig schaal­variatie, lijndikte constant.
- Vind alle stijl-hits → cluster op **collineariteit** (zelfde richting + lijn) → afstand tussen stijlen bepaalt raamgrens vs pane­indeling.
- Werkt voor 1-/2-/3-delig en schuifpui zonder schaal­explosie.
- Bouw dit uit in `window-detection-strategies.ts` als `window-vector` strategie (bestaat al deels in `openingVectorMatch`); maak het **default** voor ramen zodra gevalideerd.

**C. Deur = boog + bladlijn (structureel, niet template-only)**
- Detecteer swing-boog expliciet: `HoughCircles` op `doorMat` (beperkt tot opening­grootte uit signature) → boog­centrum + straal.
- Bladlijn = loodrechte lijn vanaf boog­centrum, lengte = `symbolDepthPx`.
- Dit is een **structurele** deurherkenning robuust tegen rotatie, onafhankelijk van template-correlatie.
- `arcDetect.ts` bestaat al; koppel het sterker aan de deur-strategie in plaats van alleen als `hasArc`-flag.

**D. ORB/AKAZE feature-matching als bevestiging (optioneel, robuuster)**
- `cv.ORB` is beschikbaar in OpenCV.js. Extraheer keypoints van template + kandidaat-crop, match met BFMatcher + ratio-test (Lowe), RANSAC-homografie.
- Gebruik als **tweede filter** op template-hit-kandidaten: alleen houden als voldoende inliers.
- Voorkomt de dunne-lijn-False-Positives omdat ORB naar hoek-patronen kijkt, niet naar correlatie van donkere pixels.
- Let op: ORB op dunne lijntjes mag weinig keypoints geven — combineer met C.

**E. Confidence-calibratie + bugfix**
- Repareer `Infinity`: clamp score in `findPeaksAboveThreshold`, en bij `TM_CCORR_NORMED` met mask: check `cv.countNonZero(mask) > minInk` vóór match (bestaat als `hasEnoughInkPixels` maar alleen op template, niet op geschaalde mask).
- Normaliseer confidence tot **z-score** over alle hits van dezelfde template, of rapporteer `score - median` als “marginaliteit”.
- Verlaag default drempel ramen niet, maar gebruik **relatieve top-K per muursegment** i.p.v. globale drempel.

**F. Cross-type NMS**
- Voer NMS uit over **deur ∪ raam ∪ muur-hit** gezamenlijk; bij overlap wint hoogste gecalibreerde score, de ander wordt verworpen. Verwijdert de kleur-overlap uit de afbeelding.

---

## Fase 2 — Muurvectorisatie

> De afbeelding toont “veel overlappende, iets verspringende rechthoekige blokken” i.p.v. doorlopende lijnen. Dat zijn de `wallMatches` (template-textuur-hits) uit `segmentsToWallMasks`. De definitieve `segments` uit `buildWallGraph` zijn al schoner (sel-1/2/3 tonen enkele lange rechte segmenten), maar de **visualisatie toont het ruwe tussenresultaat** en de vector-kwaliteit bibbert nog.

### 2.1 Huidige techniek
- `detectWallsFromLbe` (`wall-layer.ts`): textuur-template matching (`matchWallTextures`, `TM_CCOEFF_NORMED`, schalen 0.9–1.1) → `clusterMatchesToSegments` → `buildWallGraph` (snap/merge/ortho) → `filterWallSegments` (dikte-filter) → `ensurePerTemplateCoverage`.
- Parallel pad (geometry-lbe): `lineDetect` (HoughLinesP + LSD) → `buildWallGraph` → `wall-geometry-layer` (renderStyle routing: solid/parallel_lines/details met skeleton-fallback).
- `alignDetections`: `mergeParallelWallSegments` + `extendWallSegmentsToIntersections` (2 passes bridging).
- `buildWallGraph`: `snapEndpoints` (O(n²)) + `mergeCollinear`, **alleen uitgevoerd als `result.length ≤ 400`**; boven 400 geen snap → jitter blijft.

### 2.2 Geobserveerde problemen
1. **Textuur-template levert boxen, geen lijnen** → de blokkige overlay. Clustering helpt, maar elk cluster is nog een as-gemiddelde van verspringende boxen → jitter.
2. **Snap/merge overgeslagen bij > 400 segmenten** (`wallGraph.ts` regel 332) → op volle tekeningen geen endpoint-snapping → rafelige hoeken.
3. **`mergeCollinear` is O(n²)** en gebruikt een harde 15 px “onLine”-drempel → op dikke muren of lage resolutie mist het collineaire stukken.
4. **Hoekreconstructie is heuristisch** (`extendWallSegmentsToIntersections`, 2 passes) → L/T-kruisingen worden niet altijd schoon; soms blijven dubbele kopse kanten staan.
5. **Dubbele randlijnen** bij dikke muren (Hough vindt links+rechts); `centerlineFromInkBand` helpt, maar alleen in fallback-pad.
6. **Arcering** (cross-hatch/diagonaal) → Hough ziet honderden arceerlijntjes; `isAxisAligned` filtert scheve, maar arcering op 45° in een 0/90 tekening overleeft soms.

### 2.3 Verbeteringen

**A. Vectorisatie via close→skeleton→lijn (maak dit hoofdlijn voor solid én hatched)**
1. `MORPH_CLOSE` met kernel ≈ muurdikte → arcering dichtgesmeerd tot massief vlak (google-ai code-voorbeeld; `morphClose.ts` bestaat al).
2. `cv.ximgproc.thinning` (Guo-Hall/Zhang-Suen) of iteratieve skeleton-loop → 1 px centerline.
3. `HoughLinesP` / `LSD` op het skelet → strakke segmenten met één lijn per muur.
4. Dikte apart bewaren (gemeten vóór skeleton) → FML `thickness`.
- Dit levert **doorlopende centerlines** i.p.v. box-clusters. Het `details` renderStyle-pad doet al iets vergelijkbaars; promoot het naar default voor solid/hatched zodra gevalideerd.

**B. Contour-polygonen voor massieve muren (Scan2CAD solid-block)**
- `findContours` + `approxPolyDP` op het massieve muurmasker → polygon-outline per muur.
- A/B naast centerline: voor dikke massieve muren kan polygon nauwkeuriger zijn; voor dunne binnenwanden blijft centerline.
- Optioneel: `cv.boxPoints` op minAreaRect per contour → gestandaardiseerde muur­as + dikte.

**C. Junction-first wall graph (Raster-to-Graph aanpak)**
- Detecteer **knooppunten vóór segmenten**:
  - Hough-lijnen → alle paarsgewijze intersecties binnen snapping-afstand → cluster → junction-nodes (L/T/X).
  - Of: `cornerHarris` / `goodFeaturesToTrack` op skelet → knooppunt-kandidaten.
- Segmenten = lijnstukken tussen twee junctions (geen vrije eindpunten in het midden van een muur).
- Bouw een **echte graph** (nodes + edges) i.p.v. losse `Segment[]`; dit maakt L/T-snapping triviaal en verwijdert de dubbele kopse kanten.
- Packages: `@turf/turf` (TS) voor robuuste `lineIntersect`, `nearestPointOnLine`, `polygonize` — vervangt handgerolde intersectie-wiskunde in `alignDetections.ts` en `wallGraph.ts`.

**D. Globale geometrische rectificatie**
- Dominante oriëntatie uit Hough-angle-histogram (gewogen op lijnlengte) → 1 of 2 hoofdassen.
- Deskew naar dichtstbijzijnde 0/90 (bestaat deels in `deskew.ts`).
- Daarna **per segment forceren** naar de dichtstbijzijnde hoofd-as (al in `snapToOrthogonal`, maar nu met de globale assen i.p.v. absolute 0/90) → verwijdert resterende jitter.
- Voor schuine buitenmuren: behoud de tweede as-cluster als extra toegestane oriëntatie.

**E. Performante snap/merge**
- Vervang O(n²) `snapEndpoints` door een **spatial hash / grid** (cell = snapRadius) → snelle nabijheids-query. Hierdoor kan snapping ook bij > 400 segmenten draaien (verwijder de cap).
- `mergeCollinear`: gebruik parameter­afhankelijke tolerantie (`snapRadiusPx` i.p.v. vaste 15 px) en verdeel muren eerst in H- en V-batches (al zo in cluster) vóór merge.

**F. Arcering-specifiek**
- Voor cross-hatch: MORPH_CLOSE met richtings­gevoelige kernel (`morphClose.ts` heeft directionele variant) loodrecht op arcering → arcering verdwijnt, muurrand blijft.
- `rejectDiagonalHatch` + `isAxisAligned` staat al; verbind dit met de skeleton-lijn i.p.v. ruwe Hough-lijnen.

---

## Fase 3 — Koppeling openingen ↔ muren

### Huidige techniek
- `alignOpeningToWallHardline`: snapt opening-bbox op dichtstbijzijnde muur-hardline (binnen 48 px).
- `opening-geometry-layer`: gaps via `findWallGaps` / `findWallGapsFromBinary` voor hybrid/vector strategieën.

### Geobserveerd probleem
- Pixel-only deuren (default) doen dit niet → openingen zweven vrij (sel-4 op y=1704).
- Gaps worden uit de **stabiele** muursegmenten berekend (`length >= 18`); als muurdetectie nog rafelig is, zijn gaps onbetrouwbaar.

### Verbetering
- **Altijd muur-koppeling**, ook in pixel-only: opening zonder nabije muur = verworpen (zie Fase 1.A).
- Openingen als `openings[]` op het wall graph projecteren met `t`, `width`, `refid` (al het FML-idee) — doe dit in de detectie-uitvoer, niet pas bij export.
- Gebruik de **junction-graph** (Fase 2.C) om opening­grenzen af te snijden op muur-eindpunten.

---

## Fase 4 — Visualisatie & UI (laag-gewicht, directe winst)

### Geobserveerd probleem
- De afbeelding toont **ruwe template-match-boxen** (muur = blokken, opening = kleurkaders) i.p.v. het definitieve vector-resultaat. Dat geeft een verkeerd “blocky” beeld en verbergt dat de achterliggende `segments` al redelijk schoon zijn.

### Verbetering
- Toon op de Resultaat-stap **uitsluitend** definitieve centerlines + opening-rects (geen `wallMatches`-boxen).
- Ruwe hits alleen in een aparte “debug”-laag (toggle), niet in de standaard preview.
- Kleur per type (muur geel, deur cyaan, raam magenta) met **transparantie** zodat overlap zichtbaar maar niet “krijgertje” is.
- Confidence als cijfer/opacity, niet alleen als kleur.

---

## Fase 5 — Cross-cutting: performance en packages

### Performance
- **Beeldpyramide** voor template-scan (`cv.pyrDown` naar 25%, coarse kandidaat-regios, full-res alleen daar) — google-ai noemt dit expliciet; code doet het nu niet. Reduceert zowel tijd als false positives (full-scan op full-res matcht te veel).
- Verlaag `MAX_PEAKS` per schaal zodra muur-prior + pyramide actief zijn (minder ruwe hits nodig).
- Web Worker voor CV (als dit nog niet zo is) → UI blijft responsive.

### Aanbevolen packages / builds
| Package / build | Doel | Waarom |
|-----------------|------|-------|
| **OpenCV.js full build met `ximgproc`** | `thinning`, `FastLineDetector`, `StructuredEdgeDetection` | Betere skeleton- en lijndetectie dan handgerolde loops |
| **`@turf/turf`** (TS) | `lineIntersect`, `nearestPointOnLine`, `polygonize`, `buffer` | Robuuste geometrie i.p.v. zelfgeschreven intersectie-wiskunde; direct in V1 client-side |
| **`polybooljs` / `martinez-polygon-clip`** | Boolean polygon-operaties (overlap, union) | Cross-type NMS op polygon-niveau, muurmasker-unions |
| **`rbush`** (TS) | Spatial index (R-tree) | Snelle nabijheids-query voor snapping, muur-prior, NMS bij > 400 elementen |
| **`d3-quadtree`** (lichter alternatief voor rbush) | 2D nabijheids-query | Zelfde doel, kleiner |
| (V2/backend) **`shapely` + `networkx` + `scikit-image`** | Wall graph, skeleton, hough | Zware processing server-side als V1 te traag blijkt |

> Alle TS-packages zijn client-side bruikbaar en breken niet met de “OpenCV-only / geen AI”-regel. `@turf/turf` en `rbush` zijn de hoogste waarde-laagste risico­keuzes.

---

## Concrete volgorde van uitvoeren

1. **Repareer `Infinity`-confidence + clamp scores** (1 dag) — bugfix, geen architectuur.
2. **Muur-prior op openingen** (Fase 1.A) (1–2 dagen) — grootste recall/precision-winst op openings.
3. **Visualisatie schoonmaken** (Fase 4) (0,5 dag) — directe zichtbare winst, vertrouwen in resultaat.
4. **Close→skeleton→Hough als muur­hoofdlijn** (Fase 2.A) (3–5 dagen + tuning) — verwijdert blokkige overlay.
5. **Spatial-hash snap/merge + verwijder 400-cap** (Fase 2.E) (1–2 dagen) — jitter weg bij volle tekeningen.
6. **Kozijnstijl-raam-default** (Fase 1.B) (3–5 dagen) — ramen robuuster zonder schaal-explosie.
7. **Junction-first wall graph** (Fase 2.C) + `@turf/turf` (3–5 dagen) — schone hoeken, fundament voor alles.
8. **Beeldpyramide + Web Worker** (Fase 5) (2–3 dagen) — performance voor live feedback.
9. **Deur = boog + bladlijn structureel** (Fase 1.C) (3–5 dagen) — rotatie-robuuste deuren.
10. **Globale rectificatie** (Fase 2.D) (1–2 dagen) — finale jitter-verwijdering.

Stap 1–3 leveren snel zichtbare verbetering; stap 4–7 zijn de structurele ingrepen die de “blocky / disconnected”-indruk uit de afbeelding wegnemen; stap 8–10 zijn afmakers en performance.

---

## Validatie (POC)

- Gebruik Kinderdijkstraat + 1–2 ZIP's uit `examples/samplessourcefiles/` (zoals in `poc-test-plan.md`).
- Metrisatie per fase:
  - **Muur recall** (centerline binnen 5 px van waarheid), **centerline-fout in cm**, **aantal junctions correct**.
  - **Deur/raam precision & recall**, **false positives per type**, **aantal tekenaar-klikken** nodig.
  - **Edit-tijd na detectie** (de 80%/50%-regel uit `project-brief.md`).
- A/B-vergelijking: huidige pipeline vs. variant na stap 4 + 7, op dezelfde tekening.

---

## Relatie met bestaand advies

Dit document is een **technische, code-gerichte aanvulling** op `raster-naar-vector-tools-advies.md` (dat het landschap en Scan2CAD-vergelijking dekt). De hoog-prio gaps daar (gap jumping, solid-block polygon, kwaliteitsgate) vallen hier onder Fase 2.A/C en Fase 0. De vector-PDF-constatering daar laat ik onveranderd (apart onderzoekspad, niet in dit document).

Zie ook:
- `google-ai-cv-consultatie.md` — kozijnstijl-aanpak (Fase 1.B) en skeleton-flow (Fase 2.A) komen daarvandaan.
- `decisions.md` — “OpenCV only, geen AI”; alle voorstellen hier respecteren dat.
- `memory.mdc` — huidige staat WERKT/NIET-WERKT; na implementatie bijwerken.
