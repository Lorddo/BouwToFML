# Beslissingen – BouwToFML

Vastgelegde keuzes. Bij wijziging: dit bestand én relevante `.cursor/rules/` updaten.

---

## Floorplanner API & account

| Beslissing | Status |
|------------|--------|
| Enterprise API-key | **V2** — na volledige demo (hele verdieping → vector → FML) |
| Demo-eis | **Volledige verdieping** conversie, niet alleen minimal proof |
| Account-model | **Eén account**; SSO alleen bij expliciet meerwerk |
| Actueel FML-formaat | **JSON v3** (cm) — bevestigd via `examples/FML(current)/` |
| V1 export | **Download** — geen API-key nodig |
| Embedded FP-editor | **Nee** — voorkomt facturering bij foutieve renders vóór gebruiker akkoord is |

---

## Exportformaat & scope

| Beslissing | Status |
|------------|--------|
| Primair formaat | **FML JSON v3** (persistent, centimeters) |
| Bestandsextensie | `.fml` of `.json.fml` — inhoud is JSON |
| Referentiebestanden | `examples/FML(current)/` — zie `examples-inventory.md` |
| Concept-deur refid | `0434246537840a3326e305dbe7b9c355743e6e93` |
| Concept-raam refid | `b88cd3f479455fbf57205a91c613c02b7e6dc2df` |

### Export-scope

| Element | V1 | Opmerking |
|---------|:--:|-----------|
| Muren | ✓ | Kern; wall graph met knooppunten |
| Deuren | ✓ | `openings[]` op muur; **structurele types** (refid); POC start met standaard enkel |
| Ramen | ✓ | `openings[]` op muurlijn; structureel enkel/dubbel/driedelig/rond; hoogte/sill via **per-verdieping defaults** |
| Onderlegger | ✓ download | Opgepoetste tekening **apart downloaden** — niet in FML |
| Maatvoeringslijnen | ✗ | **V2** — buiten footprint |
| Aanzichten | ✗ | **V2** meten; **V3** herkenning (onzeker) |
| Trap | ○ | **Mits mogelijk** in export; **niet verplicht in V1** |
| Ruimtes (areas) | ○ | FP genereert uit muren; **roomtags** uit vaste lijst = onderzoek (klant-eisen) |
| Meubels / sanitair / keuken | ✗ | **V2** detectie; lichte V1 = icoon+plaatsen (optioneel) |
| Tekstlabels | ✗ | — |
| Muurtype (buiten / woningsscheidend / binnen) | ✓ | **Na detectie** in editor; 3 projectdefaults dikte (cm) |
| Deur-tags (voor / achter / binnen) | ✓ | Menu bij selectie; **orthogonaal** t.o.v. structureel type; maatdefaults per tag |
| Structureel openingstype | ✓ | refid per type; editor-menu + clustering-voorstel |
| FP-tag export (deuren/muren) | ○ | Roundtrip POC — veld nog niet in examples |

### FML muurdikte V2a (2026-07-10)

| Beslissing | Keuze |
|------------|-------|
| Plan | `.cursor/docs/fml-layer8-conversion-plan.md` |
| Keten | Collineair door T/X = één keten bij dezelfde slot/band, aangrenzende slots met Δcatalog ≤ 15% van catalogus-max, of 15% meet-hysterese. Echte stap (7 vs 15 vs 30, 10 vs 22) blijft gesplitst. T-arm/L daarna op ketengemiddelde. Korte dik-dun-dik brug mag mergen. |
| Aggregatie | Gemiddelde binnen keten |
| Kwantiseren | 3 absolute banden (default 1–12 / 12–22 / 23+ cm) → 3 exportmaten |
| Implementatie | `harmonizeFmlWallThickness` na `extractionToPlan` op `FloorPlan.walls` |
| `balance` | Floorplanner **hartlijn** `a`/`b` (Y-down): `0` = alles **rechts**, `1` = alles **links** (`floorplannerLeftNormal`); lichaam schuift, as blijft (keep-axis). Default export 0.5 (X-01); collineaire diktewissel flush **alleen bij face-evidence**; zonder bewijs blijft 0.5; `quantizeBalance`; shift ≤ Δt/2; jog-stubs &lt;25 cm **én near-ortho connector** (zelfde 12°-ε als collinear; geen 45–60°-chamfer); stub-bump alleen bij gemeten nabijheid. Detectie clamp 0–1; editor-invoer tot ±1000% (slider 0–100%) |
| Editor dikte | Handmatige dikte (`setWallsThickness`, ook dezelfde maat) zet `balance` terug naar 0.5 — flush-waarden horen bij de vorige uitlijning; hartlijn `a`/`b` ongewijzigd |
| Diktemeting | `thicknessPxTypical` = mediaan DT-samples (FML-export); `thicknessPxMax` blijft opening-snap bovengrens; korte stubs kern-sample t∈[0.3,0.7]; junction-marge schaalt met `referenceWallThicknessPx` |
| Keten-union | Gemeten gelijkenis + 15% hysterese over bandgrens; catalogus: ook aangrenzende slots als Δcatalog ≤ 15% van max |
| L9 stub | Bewaart cross-band + parallel CL-offset (thickness-gate + `orthoStubTierMaxPx` mid-capped) |
| L10 straighten | Geen axis-union over dikteband-wissel (thickness-gate op direct + bridge); FML balance blijft post-L10 consument |
| Legacy min/max clamp | Vervangen door tier-model |

### Gate-banden uit catalogus-extremen (2026-08-29)

L7/L9/L10 blijven 3 bakken. Drempels: **min** tot kleinste catalogus-cm × 1,2; **max** vanaf grootste × 0,8; **mid** daartussen. Voorkomt dat 10 en 20 in dezelfde bak vallen als max 51 cm is (40/80 van 51 zette 20 nét in min). Factory 10/30 blijft 12/24. Te krappe range → fallback 40/80 van de grootste. Harmonize/export-catalogus (N cms) is een andere “3”; die komt later.

### Dikte-catalogus (2026-08-29)

Eén `thicknessCms[]` (min 3, factory `[10, 20, 30]`, tot 8) is Settings, LBE-refs, harmonize/export én editor-presets. Geen parallelle min/mid/max-UI. **Geen nabij-merge** (8/9/10/11 blijven 4 maten; alleen exacte dubbelen na 0,1 cm). Pipeline-schaal blijft max-equivalent (`px × maxCm/refCm`). Gate L7/L9/L10 blijft 3-band (zie hierboven). Harmonize met catalogus ≥3: nearest slot, **of** aangrenzende slots met Δcatalog ≤ 15% van de catalogus-max, **of** 15% meet-hysterese voor collinear-union én T-arm/L. Echte stap blijft gesplitst (balance kan flushen). Korte dik-dun-dik brug mag mergen. Geen mid-span splits (T-tot-T blijft één meting). Daarna één catalogus-cm per keten. Editor-knoppen = `thicknessPresetCms` (“X cm”); draw-default = grootste cm. Stempel `filterWallsByBands` en ⊕ thickness-pick blijven 3-band. Stap 2: dikte-lijst is altijd zichtbaar; tik een rij om het vak voor die cm te tekenen (geen losse Muur-knop); groen/vinkje = getekend.

### LBE-vak draaien (2026-09-08)

Na tekenen mag het referentievak scheef (schuine muur). `rotationDeg` om het centrum; tekenen blijft as-uitgelijnd. Randen schalen langs de lokale as; hoeken = draaigrepen (zelfde pijl als fixtures); 12° magnet naar 0/90/180/270; Ctrl = vrij. Sleep overal in het vak (geen grab-icoon). Crop/meting samplet het gedraaide vak (niet de AABB).

### Harmonize collinear door T/X (2026-08-29)

Met 8 catalogus-slots werd 10 vs 15 een “echte stap” (33% > 15% hysterese). T-splits op één as kregen verschillende cm + balance-flush (Test 31: boven 15/10/15, linksonder 15/30). **Destijds:** collineair op een gedeeld knooppunt = altijd één keten (lengtegewogen). T-arm/L pas daarna op ketengemiddelde.

### Harmonize collinear dikte-guard (2026-09-08)

“Altijd één keten” veegde echte gevelstappen weg (sloped: middelste V 7/15/30 → alles 7, geen flush). **Terug:** collinear-union alleen bij dezelfde slot/band of 15% hysterese — zelfde predicaat als T-arm. Meetruis (10 vs 11, 22 vs 24) blijft één keten; 7 vs 15 vs 30 blijft gesplitst zodat `alignWallJunctionBalance` kan flushen bij face-evidence. Korte dik-dun-dik brug ongewijzigd. Geen mid-span splits (T-tot-T = één meting; dat maakte eerder te veel ruis).

### Harmonize dichte catalogus-buren (2026-09-11)

15% t.o.v. de *meting* splitst 7 vs 10 (30%). Bij catalogus `[7,10,22,30,47]` zijn dat wel dichte buren (Δ 3 cm) op één collineaire T–T-lijn. **Nu:** aangrenzende slots unieën als Δcatalog ≤ 15% van de catalogus-max (0,15×47≈7 cm). 7/10 → één keten (lengtegewogen slot); 10 vs 22 (12 cm) en 22 vs 30 (8 cm) blijven split. 7/15/30 en Test-31 10/15 blijven split. Geen N-emmers in L7/L9/L10.

### Coördinaten

- Invoer: px + mm-kalibratie (tekening)
- Vectorproces: **px/mm → cm** (conversie in vectorisatiestap)
- FML v3 export: centimeters
- API-import (V2): `cm → m` conversielaag op import-pad

---

## Input & scope

| Beslissing | Status |
|------------|--------|
| V1 input | **PNG, JPG, JPEG, PDF** per verdieping |
| PDF-upload | **V1** — paginaselectie-dialog; geen PDF via klembord |
| Klembord plakken | **Alleen afbeeldingen** (PNG/JPG) |
| Typische omvang | Per **appartement**, niet heel complex in één scan |
| Handschetsen | **Buiten scope** — ander project/tool (point clouds e.d.) |
| Bouwtekening-scans | Doel na POC; learn-by-example **per project** (één stijl per project) |

---

## Voorbewerking (vóór detectie)

| Beslissing | Status |
|------------|--------|
| Moment | **Vóór** kalibratie en detectie — opgeschoonde tekening is werkbasis |
| Doel | Altijd **zwart-wit** werken; vlekken, kleur, ruis en scan-artefacten opruimen |
| Methode | Sliders: brightness, contrast, threshold, noise reduction, **rotation** |
| Automatisch | Software mag **suggesties** doen; tekenaar beslist wanneer voldoende |
| Output | Opgeschoonde B&W-afbeelding → input kalibratie + CV-pipeline |
| Onderlegger V1 | Deze opgeschoonde versie **apart downloaden** naast FML |

### Wall-B/W overlay compose (2026-07-25)

| Beslissing | Keuze |
|------------|--------|
| Compose | `effectiveBw = baseBw → OCR force-white → inkOverlay` (inkt wint) |
| Stap 1 gum | Blijft op kleur-origineel |
| Stap 2/3 inkt-tools | Schrijven op `inkOverlay`, niet op kleur |
| Afronden stap 2 | Live ink **bakken in `baseBw`** (+ `bakedInkOverlay` voor retune); overlay leeg |
| Verwerk inkt (stap 3) | Diff op `effectiveBw`; geen kleur-rethreshold; geen OCR-scan |
| Bake kleur | Geen bake van inkt naar kleur-onderlegger; FML-underlay blijft kleur |
| Download stap 2 | `effectiveBw` PNG |
| Bewaren | Live overlay bij retune / 3→2; baked overleeft retune; reset bij 2→1 |

Zie `workspace-flow.md` + `cv/preprocess/compose-wall-bw.ts`.

### Stap-2 wall-B/W: adaptive ná morph (2026-08-29)

Detectie draait op witte velden. Hole-fill / brug / verdikken sluiten eerst inkt zodat een open muur een veld wordt; adaptive daarna kan het binnenste van een groot zwart vlak weer wit maken als de kernel past.

| Beslissing | Keuze |
|------------|--------|
| Keten (`baseBw` / `effectiveBw`) | grijs → start-B/W (vast of otsu/edgeAware) → polarity → morph → **adaptive laatst** → negatief → gum |
| Otsu / Int muur | Ongewijzigd: eigen recept (`buildRoomReferenceMat`), geen adaptive |
| Compose | Ongewijzigd: OCR / stempel / inkt ná `baseBw` |

Openingen delen nu deze wall-B/W (faces + refs). Eigen openings-laag zonder adaptive: plan [`.cursor/docs/openings-preprocess-refactor-plan.md`](openings-preprocess-refactor-plan.md) — nog niet gebouwd.

### Hole-fill / speckles: geen beeldmaat-schaal (2026-08-29)

`scaleMinPixels` (×(zijde/1000)², op 3k altijd ×9) is weg. Werkformaat is altijd 3k; Int muur schaalt holes/brug/verdikken alleen via REF. Stap-2 sliders = ruwe px (ruimere max: holes/speckles 200, brug 40, verdikken 24).

Int muur (2026-08-29): Otsu; helderheid 50 / contrast 1. Verdikken 0,1×REF (solid=open). Brug 0,15× / 0,2×. Hole-fill 0,2× / 0,3×. Geen 16–44-cap. UI (Dev Int muur) toont de berekende px.

---

## Detectie & train-by-example

| Beslissing | Status |
|------------|--------|
| Detectie-stack | **OpenCV** (client-side V1) — template matching, morphology, Hough lines |
| Pure TS-CV | **Onvoldoende** in Crosscheck — OpenCV nodig (geschikte browser-build) |
| AI fallback | **Nee** — expliciet uitgesloten |
| Train-by-example eenheid | **Per project/sessie** — één tekeningstijl per project |
| Voorbeelden per type | **3–5** per objecttype |
| Muur-voorbeelden | **Lijnpatroon/arcering** — **niet** semantisch buiten vs. woningsscheidend (classificatie **na** detectie) |
| Detectievolgorde | **1.** deuren + ramen (template matching) → **2.** muren + knooppunten |
| Rationale volgorde | Openingen maskeren stoorzenders; muurrichting/dikte deels al uit openingen; schonere basis voor lijndetectie |
| Muurdoorloop | Deuren/ramen zijn onderbrekingen op muurlijnen; na muurdetectie op muur segmenteren (`t`, `width`) |
| Schuine buitenmuren | Optionele **footprint-guide** door tekenaar |
| Deurtypes V1 | **Structurele types** in intern model + editor; POC **start** met 1 standaard enkeldeur-refid |
| Clustering openingen | **Voorstel na detectie** + batch-bevestiging; fallback handmatig menu |
| Deur-detectie geometry-lbe | **Pixel-first** (default): full-scan template op `doorMat` → vector refine (muur, signature, gap-snap); **gap-hybrid** via UI-toggle; ramen nog gap-hybrid |
| Deurstijl per makelaar | **V2** — visuele variant (andere refid, zelfde structureel type) via Makelaar Huisstijl |
| Trap | Train-by-example mogelijk; **export V1 optioneel**, V2 mits mogelijk |
| Template opslag | **V2 / meerprijs** — train-by-example data hergebruiken over projecten |
| Makelaar Huisstijl | **V2 / meerprijs** — zie `v2-roadmap.md` |

### Te testen in POC (deuren & ramen)

| Onderwerp | Varianten | Criterium |
|-----------|-----------|-----------|
| **Deur-rotatie** | A: 45°-stappen · B: 5°-stappen · **C: 90° + 2e schuin voorbeeld** | Recall (haaks + schuin), scan-tijd (< 300 ms streefwaarde), aantal klikken |
| **Raam-detectie** | A: heel raam + schaal 50–150% · **B: kozijnstijl-template + clustering** | Recall enkel/meerdelig, tussenstijlen, false positives, templates/snelheid |
| **Opening-clustering** | Deurparen / schuifparen / raamstijlen | False merge vs. handmatig opruimen; valideren fase D |

Geen vaste keuze tot metingen op Kinderdijkstraat + bouwtekeningen. Hypothese: **C voor deuren**, **B voor ramen**, **B voor muren (gearceerd)** — te valideren. Details: `google-ai-cv-consultatie.md` § Te testen.

### Te testen in POC (muren)

| Onderwerp | Varianten | Criterium |
|-----------|-----------|-----------|
| **Muur-detectie** | A: kernel + Hough · **B: textuur-match + MORPH_CLOSE + skeleton** | Recall per arceringstype (cross-hatch, diagonaal, massief), centerline-fout (cm), geen dubbele randlijnen, scan-tijd |

Close-kernel (5×5 vs 7×7) en skeleton-iteraties zijn tunables. Referentie: bouwtekening-snippet met meerdere muurtypes.

### Deur pair/demote kozijn→doorframe (2026-08-24)

Stage-2 (vóór finalize): als twee deur-hypotheses **ink-adjacent** zijn en **exact één** tussen twee muren ligt (D-62 **eigen** soft-check in `door-pair-demote.ts`), demote het kozijn naar class **`doorframe`** (blijft in het muurmasker) en houd de draaiboog als `door` + `doorframeFaceIds`. Wees-kozijn (tussen muren, geen swing) → **`wall`** (geen losse doorframe). Geen dikte-heuristiek in D-62; geen junction-in-deur in deze ronde. ESC:**D-62**. Zie `door-detection-flow.md`.

### D-40 bridge vs D-62 between-walls gescheiden (2026-08-24)

Bridge (`findDoorBridgeWallFaces`) gebruikt weer een **streng** predicaat (`cardinalNeighborRoots` + class `wall`; micro overslaan). D-62 houdt micro-acceptatie lokaal. Geen shared soft API meer (E2E-muurregressie door gedeelde micro-fix).

### Deur dun→mask + dedupe (2026-08-24)

**Per intacte hypothese** (later per face, 2026-08-25): `depth ≤ max muur-ref` → maskKeep via L1 between-walls → pair-conflict → L2 vleugel-brug → L3 polylijn (in-band/I-bridge; één meetlint). Class blijft `door` voor L11. Post-L11 1D-dedupe. ESC:**D-63**. Zie `door-thin-mask-dedupe-plan.md`.

### Deur thin-mask per face (2026-08-25)

D-63 keep-set is **per face** (eigen bbox + L1/L2/L3), niet meer de hele hyp. Cluster kozijn+swing in één Stage-2 hyp → alleen kozijn in `maskKeepDoorFaceIds`; swing blijft punch. Hyp zelf niet splitten. D-62-swing met `doorframeFaceIds` blijft skip. ESC:**D-63**.
---

## UX & schermopbouw (V1)

Zie `.cursor/docs/v1-workflow-ui.md` voor volledige flow.

| Beslissing | Status |
|------------|--------|
| Project-setup | Adres, taal, benoemde verdiepingen — **geen lege velden** |
| Crop | **Optioneel** — default volledige afbeelding |
| Onderlegger weergave | **Zwart-wit** (raster na voorbewerking) |
| Vectoroverlay | **Kleur** (muren/deuren/ramen — zoals mockups) |
| Sidebar | **Één linkse rail** die per fase verder openschuift |
| Schaal-gate | Tekening **greyed** tot schaal bevestigd (✓); **twee H-overlays** direct bij import |
| Schaal-UI | Horizontale + verticale **H** (poten over volledig scherm); mm op middelstuk; ✓/✕ rechts |
| Stap-4 rescale | «Herschalen» bij plan-met-muren (ook na heropenen + FML-viewer): H/V apart, geen muurdikte |
| Rescale kamers | Na herschalen `areas[]` opnieuw uit binnenfaces (`scaleFloorPlanAndRegenAreas`) — muurdikte blijft, dus mee-schalen van het gat geeft te korte kamermaten |
| Herschalen | Zelfde posities + mm herstellen voor mini-aanpassingen (workspace: stap-1 handles via layout; viewer: bbox) |
| Menu (rechtsboven) | **Nieuw project** (bevestiging, sessie wissen) + **Kleuren** (localStorage) |
| Kleuren local | Muurlijnen, deuren, ramen, linialen H horizontaal/verticaal — per tekenaar, geen server |
| Onderlegger toggle | Oog-icoon + **spatie vasthouden** tijdelijk verbergen |
| Hulpraster | Settings `showCanvasGrid` (default aan); viewport-vast; niet in export |

### Canvas-hulpraster (2026-08-24)

| Beslissing | Keuze |
|------------|-------|
| Doel | Licht ijkpunt om onderlegger recht te zetten / tekenen |
| Scope | Alle canvassen (stap 1–3, FML-editor, gevels) |
| Transform | Viewport-vast (geen pan/zoom/rotatie met onderlegger) |
| Z-order | Stap 1/editor/gevel: underlay → grid → tekening; stap 2/3/B/W: grid → scan → tools (`canvasGridScanSlot`) |
| Settings | `fmlViewer.showCanvasGrid` boolean; factory/missing → `true` |
| Export | Nooit in PNG/FML/detectie |

---

## Minimale editor (V1 ideaal)

| Actie | Status |
|-------|--------|
| Muurpunt verplaatsen | ✓ |
| Muur splitsen | ✓ |
| Muur toevoegen | ✓ |
| **Muurtype kiezen** (buiten / woningsscheidend / binnen) | ✓ na detectie |
| Deur draaien | ✓ |
| **Deur/raam toevoegen** (icoon + learn-by-example refresh) | ✓ |
| **Deur-tag** (voordeur / achterdeur / binnendeur; bovenlicht ○) | ✓ |
| **Structureel openingstype** (deur/raam refid) | ✓ |
| **Clustering-review** (batch-bevestiging voorstellen) | ✓ |
| Volledige FP-editor | ✗ |
| Embedded FP-editor | ✗ (facturering) |

Correcties vóór FML-download; tekenaar hoeft niet direct in Floorplanner te werken voor fixes.

**Opening-maten:** V1 = projectdefaults per **deur-tag** (voor/achter/binnen) + per-verdieping defaults voor ramen; volledige per-opening editor = **V2** (zie `klant-eisen-v1.md`).

### Keep-axis flush-connect (2026-09-08)

Alleen bij **knoop-verslepen** (niet bij segment-slide). Als de dwars-offset klein is: landing op de as van de muur die je vasthoudt; **parallelle doel-segmenten schuiven geheel mee** (geen micro-stub); orthogonale einden alleen op de junction; daarna `balance` op het kortste collineaire dikte-wissel-segment.

**Ruimtekant:** eerst area-probes links/rechts van de te balanceren muur (anders anker; anders plan-centroid). Flush-face = die ruimtekant. **Plus/minus** volgt `leftNormal(a→b)` van de muur die we tweaken (niet blind het plus/minus-label van het anker overnemen — a↔b draait links/rechts).

**Marges:** across ≤ 15 cm (parallel) of ≤ 25 cm (ortho); parallel ook ≤ Δt/2 + 1 cm. Extensie (along groot) mag. 45°-chamfer / schuine muren → klassieke merge. Ctrl = snap-uit.

Implementatie: `fml-preview-junction-flush-connect.ts`; preview+merge via `useFmlPreviewEditor` (junction-drag only, met `areas[]`).

---

## Opening-classificatie (structureel vs. semantisch)

Zie `klant-eisen-v1.md` §2 voor volledige specificatie.

| Laag | Intern veld (richting) | FML |
|------|------------------------|-----|
| Structureel type | `structuralKind` → `refid` + exportvorm | `openings[].refid`, `width`, eventueel **meerdere** openings per muur |
| Semantische tag | `doorTag` (alleen deuren met symbool) | Roundtrip POC — veld nog onbekend |

**Structurele deuren:** enkel draaideur · dubbel openslaand · schuifdeur · schuifpui · garagedeur · opening (geen deur).

**Structurele ramen:** enkel · dubbel · driedelig · rond/halfrond.

**Exportvorm (uit FML-examples):** dubbel openslaand kan **twee** `openings[]` met zelfde refid zijn; schuifpui/garage vaak **één** brede opening met ander refid. Intern model houdt `exportShape` bij (single-wide vs. paired).

**Clustering:** na template matching — automatisch voorstel, tekenaar bevestigt bulk of corrigeert per item. Bij POC-falen: losse verwerking via editor-menu blijft altijd beschikbaar.

**Refids:** placeholder-tabel in projectdefaults; invullen uit `FML(current)/` (11 deur + 3 raam uniek) + roundtrip FP. POC Kinderdijkstraat kan starten met alleen concept-enkeldeur + concept-raam.

**2026-08-22 — Editor-dropdown:** alle catalogus-kinds met bekende FP-refid, incl. garagedeur (`37bb0bbe…`), Frans balkon (`9c845cf2…`) en doorgang/archway (`047a2a4a…`). Eén lijst: `DOOR_ADD_SUBTYPES` / `WINDOW_ADD_SUBTYPES`. Subtype-resolve via catalogus-kind (ook alternatieve pocket-hash).

**2026-08-22 — FML invoer-catalogus:** deuren/ramen gelabeld in Floorplanner (`FML invoer.json.fml`). Presets dubbel + schuif blijven `9c1479d9…` / `5ae0ee3c…` / `1cdb4e60…` / `d2785cc4…`; extra hashes (`568f1c99…`, `f54db5ad…`) alleen herkennen. Entry way = rechthoekige kale opening (`181e49d1…`); archway = ronde bovenzijde zonder kozijn (`047a2a4a…`). Driehoekraam = driehoek-kozijn+glas; blind = kozijn+solid plaat. Roomtypes woning+kantoor+buiten later als aparte sets. Fixtures nog niet. Objectlabels (`name`/`showLabel`/`name_x`/`name_y`) roundtrippen + meeschalen/spiegelen/roteren; geen eigen UI. Grijs vlak in die FML = driehoekraam-mal, geen surface-type.

**2026-08-22 — Driehoekraam spiegel:** plattegrond krijgt een klein driehoek-ornament (zoals rond); glyph + baksteen-gat zijn een rechthoekige driehoek. Eén spiegelknop (`mirrored[0]`, icoon `mirror_h`) in plattegrond + aanzicht. Overige ramen blijven symmetrisch zonder knop.

**2026-08-22 — Vouwdeuren in menu:** `bifold` (`e7ef286f…`, 2-delig) en `bifold_double` (`919e3f1a…`, 4-delig) in `DOOR_ADD_SUBTYPES`. Aanzicht: 2/4 panelen + scharnier tussen de twee delen per deur. Plattegrond: V-vouw (2 of 4 bladlijnen).

---

## Verdiepingsparameters (V1)

Per verdieping **inputvelden**:

| Parameter | Default / opmerking |
|-----------|---------------------|
| Hoogte plafond | mm/cm — `settings.wallHeight` / `floors[].height` |
| **Muurdikte buiten** | cm → `settings.wallOuterThickness` + per muur `thickness` |
| **Muurdikte woningsscheidend** | cm — derde projectdefault (klanttemplate) |
| **Muurdikte binnen** | cm → `settings.wallThickness` |
| **Deurmaten per tag** | breedte + hoogte + z voor voordeur / achterdeur / binnendeur |
| Hoogte ramen + sill | Hoogte + positie t.o.v. vloer (`z` + `z_height`) — default alle ramen op verdieping |

**V2:** volledige per-opening editor (alle maten los bewerken).

---

## Onderlegger (opgepoetste bouwtekening)

| Versie | Gedrag |
|--------|--------|
| **V1** | Na voorbewerking: **apart downloaden** naast FML — niet ingebed in export |
| **V2** | Online opslaan + meenemen in FML als `floors[].drawing` (URL/base64) |
| **2026-08-23** | FML-editor: «Onderlegger hergebruiken» op het doel zonder scan. Bronnen = verdiepingen én gevels met scan (op Gevels dus ook `floors[].drawing`). Kopieert scan + schaal + positie. |
| **2026-08-26** | Stap-1 «Onderlegger overnemen»: PDF-bytes + paginanummer bewaren in het project (IndexedDB; quota-retry laat ze weg). Reuse rastert dezelfde pagina opnieuw — geen file-picker. Browser kan een pad niet opnieuw openen. |
| **2026-08-26** | pdf.js `getDocument({ data })` krijgt altijd een kopie: de worker transferred de ArrayBuffer, waardoor 1e-reuse anders op de PNG viel. Verdiepingsstrook (volle breedte) telt als meaningful crop. |

POC-input kan nog steeds `drawing.url` uit examples gebruiken; V1-export bevat geen drawing.

### Stap 1 rotatie-bake (2026-08-13)

| Beslissing | Keuze |
|------------|-------|
| Rotatie vs schaal | Onafhankelijk; rotatie-UI niet geblokkeerd door onbevestigde schaal |
| Optionele bake | Knop «Rotatie vastzetten» bakt pixels (`commitInputStepImage`) zodat H/V-linialen langs muren kunnen |
| Auto | Zelfde bake bij 1→2; niet verplicht op stap 1 |
| Onbevestigde schaal | Na rotatie-bake: verse linialen op rechtgetrokken beeld; mm blijft |

---

## Aanzichten (elevations)

| Versie | Scope |
|--------|-------|
| **2026-09-12** | FML-export: `floor.height` ≥ max muurtop **alleen zonder floor erboven** (was regressie: altijd tillen, ook nok/aanbouw op BG). `az`/`bz` serialiseren tegen de echte story-height, niet de getilde export-waarde. `.plg` was al goed. |
| **2026-08-27** | Aanzicht-dakvlak-punt: sleep **omhoog/omlaag én langs de gevel** (diepte loodrecht op de gevel blijft). Per punt, niet het hele vlak. Snap 8 cm op andere punten/muurfaces (Ctrl = uit). Veld blijft punthoogte. |
| **2026-08-27** | Aanzicht-dakvlak = **losse vlakken** (geen gegenereerde vouwen/één T-plaat). Zicht zoals nokbalken: goot/kil-raak **of** vlak aan deze zijde van het huis — T-dak op voor- én zijgevel; tegenschild en extra’s aan de andere kant niet. Painter far→near. |
| **2026-08-27** | Dakvlak-punten: eerst vlak of nokbalk openen; daarna alleen het aangeklikte handle (18 px, zelfde als knopen). Geselecteerd punt wint bij overlap — geen nearest over het vlak. Tik op het vlak houdt het open (deselecteert niet). Punten = knoopmaat (7 px, geel geselecteerd). |
| **2026-08-26** | FML-download: geen lokale onderlegger-URL's. Stript `elevationViews`/`elevationProjection`/`floorStack`; `floors[].drawing.url` alleen bij `http(s)` (data:/blob: weg, layout blijft). Cloud-storage later → dan wél meeschrijven. Export: `floor.height` ≥ max `az.h`/`bz.h` **alleen zonder floor erboven**. UI-`---` = scheve einden. |
| **2026-08-26** | **Muren aan dak binden** (expliciete knop Dak + Gevels): per verdieping knoop-`h` op dakvlak-Z (hartlijn); skip verboden gebied (floor+1) en ongedekte knopen. `floor.height` omhoog tot hoogste top **alleen op de bovenste floor**. V2: eerst knip op gedeelde nok/kil + nokbalk. Geen auto-run; geen dakkapel. |
| **2026-08-26** | Knoop-settings tonen **altijd** de hoogte/vloer van die knoop (`readJunctionElevation` = eerste wall-end op de knoop). Niet `mixed`/leeg omdat aangesloten muren een andere hoogte hebben (verre einden of ongelijke muren). Wijzigen blijft alle ends op die knoop zetten. |
| **2026-08-24** | Muur-/deur-/knoop-**lift vanaf vloer** (uitzondering, geen settings-default). FML: `az`/`bz`.z + `opening.z`. 2D tool/selectie: Vloer + Hoogte (muur én knoop); deur add/edit: Vloer zoals raam. Aanzicht: veld + 3 grepen op muur (boven=hoogte, midden=shift, onder=lift); knoop: Vloer+Hoogte (nok blijft `ridgeZ`). Stamp behoudt bron-`az`/`bz`. |
| **2026-08-23** | Hoogtetabel aanzicht: **geen noklijn-weergave** (naar Settings) en **geen nokhoogte-rij**. Groep per verdieping (hoogte + vloer). Nieuwe nokken starten op `floor.height`; afwijken via sleep/typ op de nok. `ridgeZCm` in `floorStack` blijft leesbaar (oude plannen). Dakdikte + vloerdikte defaults in Settings. |
| **2026-08-23** | Aanzicht-X = **rechts van de kijker** (staat buiten, kijkt naar de gevel). Rechtergevel: achterkant rechts; linkergevel: achterkant links. Voorheen as altijd +X/+Y op de plattegrond (beide zijgevels hadden achterkant links). Canvas-letters O/B/L/R (nl) op links/rechts + kompas. Bestaande gevel-onderleggers kunnen gespiegeld staan — flipX. |
| **2026-08-23** | Nok alleen op **Dak-tab** (niet meer overlay op plattegrond). Selectie: klik binnen de gestippelde nokbalk pakt de nok, ook als er een dakvlak onder ligt; buiten de stippellijnen blijft het vlak. |
| **2026-08-23** | Aanzicht-tool **Dakvlak**: twee klikken (goot + nok) op kopgevel. Goot → buitenface; nok → bestaande kopse nok; quad = near-edge + translate langs nok-span. Manual origin; geen overwrite. |
| **2026-08-23** | Aanzicht-tool **Nok**: één klik op kopgevel plaatst nokbalk loodrecht op de gevelas. Floor = hoogste met gevelmuur op X én basis ≤ worldZ; lengte = buitenface→buitenface van die floor, geknipt waar floor+1 het dak bedekt. Z uit klik-Y (hart); span = `nokThicknessCm`. Daarna bestaande kopse sleep/resize. |
| **2026-08-23** | Aanzicht opening-verslepen/resizen: restmaten zoals plattegrond (binnenkant-X → opening → binnenkant-X) plus **vloer→dorpel** en **latei→plafond** (muurtop op opening-midden). Overlay `FmlPreviewMeasureOverlay` + `scaleInputUnit`; alleen tonen in edit. |
| **2026-08-23** | Aanzicht: oranje **move-punt** bij klik-selectie (resize-handles alleen Ctrl/edit). Shift+klik / touch-Move = precise move voor deur, raam en nok (typ of 2e klik). Toolbalk-tools verbergen als instellingen open zijn (zelfde als plattegrond). |
| **2026-08-23** | Aanzicht opening-**verplaatsen** schrijft alleen `t`/`z`. Breedte en hoogte blijven; tegen de muur schuiven stopt de move, krimpt niet. Verticale grens = `az`/`bz` (kopgevel), niet `floor.height`. Resize blijft alleen de versleepte kant. |
| **2026-08-23** | Driehoek / rond / halfrond: verplaatsen (en N/W-resize-rand) toetst het **kozijn-silhouet**, niet de lege AABB-hoek. Overige kinds blijven bbox. Baksteen-gat volgt dezelfde vorm (geen AABB-clip vóór het gat). Oranje selectiekader blijft een rechthoek. |
| **2026-08-23** | Opening-breedte max **20 m** (`MAX_OPENING_WIDTH_CM` 2000; was 4 m). Aanzicht-resize houdt de tegenoverliggende kant vast (ook voorbij de cap); geen muur-hop tijdens resize — verschalen ≠ verslepen. |
| **2026-08-22** | Aanzicht opening-resize: `e`/`w` zijn zichtbare X. Als muur-A rechts ligt (`xa > xb`), wissel die kanten in `clampOpeningPatchKeepOppositeEdge` — anders blijft breedte-sleep een no-op. |
| **2026-08-22** | Aanzicht meerlaags: painter back→front + evenodd-gaten in de baksteen (deur/raam/bovenlicht). Geen dest-out; goedkoop. |
| **2026-08-22** | Aanzicht-deursettings: scharnier + draai-knoppen (zelfde als plattegrond) in quick- én edit-rij. Write via `updatePlanOpening` + `mirrored`. |
| **2026-08-22** | Aanzicht-deurkruk: rozet+hefboom op de sluitkant (tegenover scharnier; `mirrored[0]` + `startOnLeft`). Schuif: pocket = grijpkant; 1-schuivend = schuivend deel; 2-schuivend = beide middenstijlen. Geen kruk op passage/garage/raam. |
| **2026-08-22** | Aanzicht-nok **kopse kant**: sleep/resize zoals raam/deur. Verplaatsen: alleen het midden snapt op muurjunctions (8 cm), geen face/dak/opening-snap. N/Z-handle = dakspan; O/W-handle = `displayWidthCm`. Lange nok blijft knooplijn. |
| **2026-08-22** | Aanzicht-nokbalk: zelfde junction-handles als gevel (`az`/`bz`.z). Balk aantikken/slepen = beide uiteinden; handle = één einde. Split-tool = twee klikken: 1e kiest segment, preview-lijn volgt muis en snapt 8 cm op andere knopen, 2e snijdt. |
| **2026-08-22** | Dak/nok/aanzicht **per uitslag**: vloerband = alleen die floor; nokhoogte in de hoogtetabel per verdieping (niet world-Z over floors); Dak-tab = actieve floor + alleen onbedekte afdruk (aanbouw/voorportaal/main). Generate/tekenen weigert waar een hogere floor zit. |
| **2026-08-23** | Trapgat/`isCutout` is **geen gat** in deze tekeningen: dak-vloerplaat van de hogere floor blijft dicht; area-regen maakt er geen kamer van; dak-generate loopt alleen naar gevels (niet trapgat-wanden). Overlay op de plattegrond blijft. |
| **2026-08-23** | Dak geblokkeerd vlak (hogere floor): buitenring van de muur-union (zelfde gemiterde baksteen als de plattegrond). Convex hull van hoeken/face-einden knipt inzinkingen af of maakt een hartlijn-knikje; trapgat-lussen blijven geen tweede plaat. |
| **2026-08-22** | Dak geblokkeerd vlak (hogere floor): hoeken = snijpunt van twee buitenfaces, niet convex hull van face-einden (anders een schuin knikje op de hartlijn-hoek). |
| **2026-08-22** | Aanzicht-dakvlak: plaatdikte = nokdikte **omhoog vanaf de onderkant** (was tot 2026-09-12 om het hart). Kopgevel toont goot én kil (rand evenwijdig+dichtbij, geen Z-eis). Vul-oppervlak ná dikte — een rechte kopse projectie is anders een lijn. |
| **2026-08-22** | Aanzicht-dakvlak projecteert de **getekende XY** (buitenface/hoek), niet terug naar de muurhartlijn. Hartlijn-snap knijpt de goot als alleen die gevel een zolder-muur heeft (FIN-10508 achterkant). |
| **2026-08-22** | Aanzicht-muren = **volle baksteen** (buiten tot buiten) + binnenkant stippellijn. Alleen de **bovenkant-hoogte** volgt de hartlijn (`az`/`bz`); schuine top tussen xa/xb, oren recht omhoog. Nokbalk ongewijzigd. |
| **2026-08-21** | Gevel-aanzicht: schuine top alleen tussen hartlijn (oren recht omhoog). Gevelsprong-oor mag de daklijn niet meeslepen (anders een hoekje voorbij de knoop). Binnenkant = verticale stippellijn. Tool **splitsen** + knooplijn voor junction-hoogte. |
| **2026-08-21** | Gevel-aanzicht tekent de **volle baksteen** (buiten voorbij de hartlijn); **binnenkant** als stippellijn. Openings mogen tot de buitenkant (clamp = halve muurdikte voorbij hartlijn-einde). |
| **2026-08-21** | Openings blijven binnen de **muur** (`az`/`bz` op `t`); `floor.height` is alleen fallback zonder extras. Ctrl+klik gevel/vloer = alleen hoogte (geen breedte/sleep). |
| **2026-08-21** | Openings in aanzicht: **Ctrl+klik** = velden (breedte/hoogte/dorpel); rand-handles als fixtures; snap 8 cm op dorpel/latei/zijde van andere openingen (Ctrl tijdens sleep = uit). |
| **2026-08-21** | **Editor-only** (`/FML-editor` Bewerken): chip **Gevels** rechts op de verdiepingen-rail, alleen als er niet-stamp gevelgroepen zijn. 1 groep = 1 projectie = 1 design-slot. Hoogtes/`az`/`bz` + vloerdikte/nok gedeeld; openings uniek per GUID. Onderlegger per groep in `settings.elevationViews`. Inspect/detectie later. Dakvlakken later; nok = sibling Dak-design + optionele dikte-band. |
| **2026-08-21** | **Aanzicht-projectie:** `settings.elevationProjection` `"architect"` (default, vaste H/V-zijde) of `"projective"` (as volgt de gevel). Sidebar-keuze, geldt voor alle gevels. Schuine Amsterdamse gevel: architect = kopse nok; projectief = ware muurlengte. |
| **2026-08-22** | Dak-design altijd bij floor-create/import/generate (niet pas bij eerste nok). Dak-tab zichtbaar zonder nok (platte daken). Export stript nog steeds een leeg Dak-design; import zet het terug. |
| **2026-08-21** | **Nok-muren:** sibling design `Dak` (`source.settings.btfRole: "ridge"`), niet in de plattegrond-graaf. Geen weld/T/X/cover tussen nok en gevel/binnenmuur. Overlay-tekenen via Muur/Nok-dropdown. `thickness: 0`, identity in `settings.ridgeWalls`. Aanzicht = gevelgroep + alle nokken (geen `ELEVATION_RETURN_MAX_DOT` op nok). Gevelmuren blijven in design 0. |
| **2026-08-22** | Dak-tekenen tot de gevel: hogere floor dekt alleen het **interieur** (geen 40 cm slack). Klik in bedekt gebied → automatisch dichtstbijzijnde toegestane face/nok. Punten en muur/nok-lijnen zijn schermvast dun (`strokeScaleEnabled: false`). |
| **2026-08-22** | Dak-tab: **Dakvlak** is een eigen teken-tool (geen roomtype). Snap = binnen-/buitenface + andere dakvlakken + nokken (ribbe én hoek). **Nok**-snap = binnen-/buitenface + andere nokken (ribbe én hoek). Geen hartlijn/junction. |
| **2026-08-23** | Dakvlak **eerste punt**: zelfde hover-snap als latere punten; landt op nok-knoop (hit-test, alleen ridge-graaf) of buitenface/buitenhoek (`listFloorOuterFaceCorners`, goot wint van binnenface). Geen plattegrond-hartlijn. Ctrl/Cmd = uit. |
| **2026-08-23** | Plattegrond-surface (niet Dakvlak): checkbox **Trapgat** zet FML `isCutout`. Nieuwe overlay zonder `isRoof` blijft op de floor (`surfaces[]`); Dak-tool blijft `isRoof` op het Dak-design. Lege naam bij aanzetten → `customName` Trapgat. |
| **2026-08-21** | **Nok-tekenen-snap:** binnen-/buitenfaces zoals maatlijnen (`snapDrawPointToWallFaces`), niet junction/hartlijn. Dak-tab = alle dikke plattegrondmuren; Ctrl/Cmd = vrij. Knooppunten niet tonen tijdens nok-draft. |
| **2026-08-23** | Project-brede knop **Dakvlakken genereren** geschrapt. Vlakken tekenen op de Dak-tab of 2-klik vanuit kopgevel (`elevation-roof-place`). Oude `btfOrigin=generated` blijft leesbaar. Eventuele later assist = per nok, niet plan-wide. |
| **2026-08-21** | **Dakvlakken** op hetzelfde Dak-design (`surfaces[]`, `isRoof`, z per hoek). Kopgevel = nok raakt gevel (geen flag). Aanzicht = projectie van dakvlak-randen. Later: overstek, dakkapel, workspace. (Auto-snapshot 2026-08-23 verwijderd.) |
| **2026-08-21** | Dakvlak-snap (aanzicht/goot): hoek = snijpunt van twee goten. Tekenen (2026-08-22): binnen- + buitenface + nok + andere dakvlakken. |
| **2026-08-21** | Aanzicht-dakvlak: niet alle vlakken. Tot 2026-08-27 alleen goot-raak; daarna ook T-vlak aan deze zijde (zie 2026-08-27). Vul grijs per gevelgroep. |
| **2026-08-21** | Aanzicht-dakvlak simuleert plaatdikte = `nokThicknessCm` (FML-surface heeft geen thickness). Vlak = surface-punten (handles); vul = verticale extrusie **omhoog**. |
| **2026-08-21** | Aanzicht-dakvlak bewerken: Ctrl+klik = punten. Tot 2026-08-27 sleep alleen hoogte (X/Y vast); daarna ook langs de gevel (zie 2026-08-27). Snap 8 cm; veld = punthoogte t.o.v. vloer. |
| **2026-08-21** | Geen zijgevel-projectie bij het dakvlak (witte vlakken / foute omtrek). Alleen gevelgroep-muren + het goot-rakende dakvlak. Andere gevels niet bedienen. |
| **V3 (oud)** | CV-herkenning ramen/deuren in aanzicht — niet in deze poging |

---

## Multi-verdieping

| Beslissing | Status |
|------------|--------|
| Scope | **Meerdere verdiepingen per project** (`ProjectState` V1) |
| Werkwijze | **Per verdieping** detectie-flow (stap 1–4); stap 0 = projectmeta |
| Stap 1 overname | Expliciete knop «Onderlegger overnemen» — projectbron (pre-crop) + schaal |
| Stap 2 overname | Expliciete knop «B/W overnemen» — tune only; LBE-rects opnieuw tekenen na crop |
| Stap 2 muurstempel | Expliciete knop «Muurstempel»: donor-FML → canvas-align/gum → bake dual (**architect-contour** `stampBw` in wall-B/W via `buildWallOutlinePolylines` + solid `stampMask` voor stamp-last face-prior ná Otsu; geen OR in Otsu); geen openings. Optioneel **Stempelset** = muren uit vaste gevelgroep `stamp` op donor (stap 4); aan = die muren zonder band-filter, **translate-only**, nulpunt-zaad + vector-inject op stap 4 (dikte pinned t.o.v. `harmonizeFmlWallThickness`); uit/leeg = diktebanden + stretch zoals nu. **Overflow:** stempel buiten de scan → automatisch wit pad op de kleur-onderlegger (plaatsen + bake); schaal blijft; linialen/refs/masks/nulpunt schuiven; geen auto-trim van wit op stap 1–3 (canvas blijft wit, zelfde als stap-4 infinity); max langste zijde 12k px |
| Stempel-eigendom (methode) | **Geïmplementeerd (optie A + ronde 2).** Stempel = waarheid in corridor — geometrie én dikte (3D: donor-cm én donor-dikte). Module `resolve-stamp-ownership.ts`; `extras.stampOwned`; inject `replaceOverlap: false`; ownership ná inject vóór `harmonize`; stamp coords/dikte frozen; detectie snapt/weldt op stamp (niet andersom); parallel ≥50% overlap → drop; gum filtert inject; bake toont inject-count; Opschonen herhaalt ownership. Band blijft raster-only. Uitwerking: `stamp-detectie-dubbele-muren.md` §13–§15 |
| Stap 3 | Altijd solo (geen `tabOutputs`/faces delen) |
| Stap 4 | Merge floors → één FML (`mergeFloorPlans`); juiste floor-namen/`level` |
| Stap 4 nulpunt | Tool «Nulpunt»: sleep kruis → ✓ bakken als FML `(0,0)` (of ✕/Esc annuleren); soft snap naar muurfaces (binnen/buiten, balance-aware), niet naar knoop/hartlijn; Ctrl/Cmd schakelt snap uit; `fmlNulpuntImageCm` persist (scant-cm); underlay-origin synchroon; per floor eigen anker voor 3D-stack. **FML-viewer:** bij openen, als oil-bottle-refid aanwezig en niet al op origin → popup rebase nulpunt naar item-midden op alle floors met die fles |
| Stap 4 oriëntatie | FML spiegel/90° om nulpunt `(0,0)` (`fmlOrient` D4-persist); underlay apart (rot/flip + verplaats-toggle op `previewUnderlayLayout`); geometrie ≠ scan-midden; **project-spiegel** = alle FML-floors X-flip zonder switch (viewer: eigen rij in linker menu; workspace achter `FML_ORIENT_CONTROLS_VISIBLE`) |
| Floor-switch | Exact restore + opgeslagen `previewPlan` (geen openings-rerun / geen regenerate) |
| Defaults | Per verdieping (`FloorMeta.defaults`); per component in FML-editor |
| Persistentie | **Niet** in V1 (IndexedDB later) |
| V2 | Template opslag + Makelaar Huisstijl — zie `v2-roadmap.md` |

---

## Maatvoeringslijnen

| Beslissing | Status |
|------------|--------|
| Drie types | **Autogen** (FP-flags + overlay), **Slicer** (`btfSlices` `{m,p}` + live P-lijn maten), **Handmatig** (`dimensions[]`) |
| Weergave | Exclusief session-dropdown: none / autogen / slicer / manual |
| Autogen | Flags roundtrip; overlay niet verder tunen (geen gevelband-patches); ticks/totaal volgen muurfaces + balance (0.5-area-rand schuift mee), niet hartlijn/2 |
| Slicer | Design-settings `btfSlices: [{m,p}]`; meetas = loodrecht op P−M; ticks = wallFaces ∩ meetlijn (balance-aware); interior skipzelfde-muur dikte; export baket `custom_dimension` op P-lijn |
| Handmatig | Meet-tool «Handmatig» → `dimensions[]`; imported custom dims zonder btfSlices; H/V-slide zoals muursegment (lengte vast) |
| Omzetten | Autogen/slicer-knop «naar handmatig»: bake overlay → `dimensions[]`, bron uit, vis = manual |
| Terugkoppelen | Dim op P-lijn (≤1 cm) = slicer-bake; strip bij import als `btfSlices` aanwezig |
| Area-zijde overlay | Toggle «Maten tonen» (niet `FmlToolId`): sessie-only; lengte = gemiterde face (binnen ≠ buiten op schuin) |
| FML flags | project: `dimensionMode`, `generateOuterDimension`, `showDims`; design: `engineAutoDims`, `btfSlices` — Autogen alleen op het plattegrond-design van de actieve floor; Dak altijd `engineAutoDims: false` (geen `dimensions[]`) |

**Viewer-maatlijn-tool:** Tape (tijdelijk) / Manual / Slicer (M→P). Shift = H/V; Ctrl = geen snap.

**Box-select (2026-08-24):** actieve strip zoals maatlijn (FML-editor + workspace resultaat). Dropdown type = muren / deuren / ramen / **Alles (mixed)**; box pakt alleen dat type (volledige AABB in kader). «Alles selecteren» = hele actieve floor van dat type (zoals gevelgroep-leden); mixed = muren+deuren+ramen tegelijk. Shift/Ctrl+box blijft toevoegen. Default = muren. Stap-3 face-box (onbekend/muur) ongewijzigd.

---

## Gebruikersvoorkeuren (localStorage)

| Sleutel | Scope | V1 |
|---------|-------|:--:|
| Overlay-kleuren | Per browser/gebruiker | ✓ |
| Sync server / account | — | ✗ V2 |

Velden: `walls`, `doors`, `windows`, `scaleHorizontal`, `scaleVertical`. Zie `v1-workflow-ui.md` § Menu → Kleuren.

### Eenheden — metric/imperial + input type (2026-08-23)

| Beslissing | Keuze |
|------------|-------|
| Settings | `unitSystem` (`metric` \| `imperial`) + `scaleInputUnit` (`mm` \| `cm` \| `m` \| `ft-in`) |
| Onafhankelijk | Systeem filtert het input type **niet**; conversie volgt alleen `scaleInputUnit` |
| Intern | FML blijft **cm-float**; geen version-bump (missing → factory) |
| Precisie | mm 0 / cm 1 / m 3 / ft-in **1/32"** (architectuurstring `5' 6 5/32"`) |
| Inch | Exact **2,54 cm** |
| Fase 1 | Settings + conversie-API; liniaal/editor-typen/labels al gekoppeld |
| Fase 2 (2026-08-23) | Alle user-facing lengtevelden via `ScaleLengthInput` / `parseScaleInput`; unit-switch herschrijft **geen** cm; FML-export `useMetric` ← `unitSystem` |
| Stepper (2026-08-24) | `−` links + `+` rechts in het veld; stap = **1 cm** (metric) of **1/16″** (imperial) via `unitSystem`; pijltjes omhoog/omlaag hetzelfde |
| Commit-delay (2026-08-26) | Floor-/defaults-velden met overwrite-all: `ScaleLengthInput` debounce **1 s** (`SCALE_LENGTH_COMMIT_DEBOUNCE_MS`); Enter/blur flush. Toolbelt-selectie blijft 700 ms draft-commit. |
| Module | `scale-input-unit.ts` + `scale-length-field.ts` + `ScaleLengthInput.vue` |

### Eenheden — cross-unit typen (2026-08-23)

| Beslissing | Keuze |
|------------|-------|
| Parse | Expliciete markering wint van `scaleInputUnit` |
| Imperial override | `1' 5"`, `66"`, `5/32"`, `…in` → altijd inches |
| Metric override | `3000mm` / `300cm` / `3m` → altijd die eenheid |
| Bare getal | Volgt settings (ft-in = inches) |
| Liniaal / rescale | `type="text"` + `parseScaleInputToMm` |
| Editor-toetsen | `'`, `"`, `/`, spatie + letters mm/cm/m/in |

### Plattegrond openings-glyphs + Editor/Bouw (2026-08-23)

| Beslissing | Keuze |
|------------|-------|
| Geometrie | CAD-plan (ISO/AIA): deurblad = dun rechthoekje (~4 cm) + echte `arc`; raam = 3 evenwijdige lijnen + mullions |
| Buiten-sill | Stroke **1,2 cm** (`OPENING_STROKE_CM`, niet heavy). Raam = langs-sill; deur = dwarslijnen op gat-einden (volle muurdikte, sluit buur-raam). Passage/boog blijft dashed langs + dezelfde dwars-einden. |
| Module | `core/fml/opening-plan-symbol.ts` (cm-first). `door-swing-symbol` blijft voor L12-overlay |
| Verf | `fmlViewer.planDisplayStyle`: `editor` (default, gekleurde gap) / `bouw` (zwart + wit gat + muurfill; gevels houden baksteen-fill) / `architect` (plattegrond muur-outlines; gevels wit papier-fill + zwarte lijnen) |
| Export | JPG/PDF/DXF later; outline-polylines + arc-params klaar voor `LINE`/`LWPOLYLINE`/`ARC` |

### Architect muur-buitenlijnen (2026-08-24)

| Beslissing | Keuze |
|------------|-------|
| Modus | Settings plattegrondstijl `architect` |
| Geometrie | Union-ringen (`buildWallRenderGeometry`) → opening-difference → drop sill/jamb-edges → open cm-polylines |
| Module | `buildWallOutlinePolylines` in `fml-preview-wall-polygons.ts` |
| Openings | Zelfde CAD-glyphs als Bouw; geen wit gat-vlak |
| Selectie | Blijft gevulde `wallPolygons` (chrome) |
| UI polish | Areas/dakvlakken/fixtures wit+zwart; annotatie+maten zwart; raam houdt jamb in outline, deur niet; Dak-tab: ghost/nok solid zwart, blocked wit+rand |

### Architect gevel-lijnwerk (2026-08-24)

| Beslissing | Keuze |
|------------|-------|
| Setting | Zelfde `fmlViewer.planDisplayStyle` (geen tweede knop). Label = weergavestijl (plattegrond + gevels) |
| Projectie | `elevationProjection` blijft apart (H/V vs projectief) |
| Architect | Wit papier-fill (evenodd gaten) + zwarte CAD-strokes; openingen/glyphs ook wit gevuld (achtergevel niet door ramen); painter back→voor |
| Bouw | Baksteen/dak/band-fill blijft; openings in aanzicht zelfde kleuren als Editor |
| Module | Preview in `FmlElevationHost`; `elevation-linework.ts` blijft voor later DXF/hidden-line |
| Hit-test | Fill-pad blijft `listening` |
| Export | Nog geen DXF; cm-polylines klaar voor later |

---

## Architectuur

| Laag | Keuze |
|------|-------|
| Frontend | Vue 3, TypeScript, Quasar, KonvaJS |
| CV / detectie V1 | **Client-side OpenCV** (browser) |
| Backend V1 | **Niet vereist** voor downloadflow |
| Backend V2 | Node.js, Fastify — API-import, optioneel server-side CV |
| V1 export | FML-download (geen API-key) |
| V2 | Floorplanner API-import |

---

## POC-fasen (mijlpalen)

Zie `.cursor/docs/poc-test-plan.md`.

| Fase | Doel | Go/no-go |
|------|------|----------|
| **A** | Deuren + ramen (template matching + masking) | Recall openingen acceptabel vs. FML |
| **B** | Muren + knooppunten op gemaskeerde B&W-tekening | ≥80% muurcount (53→~42), centerlines ~10 cm |
| **B2** | Openingen op muur segmenteren (`openings[]`, refid) | `t` + `width` visueel acceptabel |
| **C** | JSON v3 download valideert in Floorplanner | Roundtrip + handmatige open-test |
| **D** | Echte bouwtekening (per project, learn-by-example) | Aparte criteria; betere voorbeelden later |

FML-motor (fase C-voorbereiding) parallel met of vóór fase A.

---

## Eerste test / POC

**Kort:** Upload → **voorbewerking (B&W)** → kalibratie → train-by-example → **deuren/ramen → muren** → openingen op muur → JSON v3 FML.

**Referentie CV-pipeline:** `.cursor/docs/google-ai-cv-consultatie.md` (extern gesprek; exportformaat daar is generiek JSON, niet FML).
Startcase: `Kinderdijkstraat 53 1` — 1 verdieping, 53 muren, `drawing.url` aanwezig.

---

## Muur-detectie V2-only (2026-07-10) — historisch

| Beslissing | Status |
|------------|--------|
| Runtime (destijds) | Alleen **V2 pipeline**; geen UI-toggle |
| V1 | Was gearchiveerd; **archief geleegd 2026-07-25** (parking lot) |
| Runtime nu | **V3-only** (`pipeline-v3`); zie V3 decisions |
| Gedeelde geometry | `cv/walls/rooms/wall-segment-geometry.ts` |
| Index (historisch) | `.cursor/docs/archive/v1-v2-dependency-index.md` |

---

## Archive parking lot leeggemaakt (2026-07-25)

| Beslissing | Detail |
|------------|--------|
| `frontend/src/archive/**` | Inhoud verwijderd (V1/V2 walls, openings, ai-extractie); alleen README |
| `frontend/tests/archive/**` | Idem |
| Live cut | `room-first` importeert geen archive meer; finalize altijd V3 |
| Doel | Schone parkplek voor latere opruiming; geen museum-code in repo |

---

## FML diktebanden — max-ratio 0.80 (2026-07-29)

| Beslissing | Detail |
|------------|--------|
| `FML_BAND_MAX_RATIO` | **0.80** (code leidend) — mid t/m 80%, max &gt; 80% |
| Mid | `FML_BAND_MID_RATIO = 0.40` — min &lt; 40% |
| Waarom niet 0.85 | Comments/UI zeiden 85%, maar code + L6-collapse (`collinearThicknessWithinMaxBandNoise`) gebruiken 0.80; stil wijzigen raakt muurdetectie |
| Test | `derive-fml-band-from-ref` leidt grenzen af uit de constanten, niet hardcoded 85% |
| UI | Sidebar-tekst gelijkgetrokken naar 40%/80% |

---

## ESC-tags geankerd (2026-07-29)

| Beslissing | Detail |
|------------|--------|
| Tag-vorm | `// ESC:<ID> (<Cat>)` op eigen regel boven tak/tuning-key |
| Omvang | 228 inventaris-ID's, 249 tags in `frontend/src` |
| Checker | `npm run esc:check` — CI-poort na Lint |
| Tagindex | `.cursor/docs/archive/escalatie/tagindex.md` (gegenereerd) |
| Living doc | `.cursor/docs/escalatie.md` — aanpak + verdicts + grootboek |
| E2E-reservering | `EscalationLedger` in `tests/e2e/harness/`; layers-snapshot heeft vanaf eerste fixture een `escalations`-sleutel |
| Waarom | Inventaris-regelnummers schuiven; zonder tags is het document binnen twee refactors archeologie |

---

## Run-journaal — batch nul escalatiepaden (2026-07-30)

| Beslissing | Detail |
|------------|--------|
| Plaats | `frontend/src/core/diagnostics/` — leaf-module, geen UI/DOM, worker-veilig |
| ID-registry | Verhuisd van `tests/e2e/harness/` naar `src/core/diagnostics/`; `--write-ids` schrijft daarheen (productiecode mag niet uit `tests/` importeren) |
| Vorm | **Module-scoped** journaal + vrije functies, **niet** diagnostics-als-resultaat (zou ~130 signaturen raken; zie aanpak §5.6) |
| Worker | Eigen journaal per request; reist mee in het antwoord en wordt in `useExtraction` samengevoegd |
| Teller vs. event | `counts` per ESC-ID = waarheid (= grootboek-veld); `events` begrensd op 3/ID en 400/run; hot paths gebruiken `tally(id, niveau)` zonder allocatie |
| Gedegradeerd | Alleen een ingeslikte exceptie zet die vlag; zichtbaar in status-regel en in `journal` van het layer-debug-rapport |
| Buiten de inventaris | Aparte `DiagnosticCode` (nu `REF_COUNT_BELOW_ADVICE`), blijft buiten `escalations` — geen verzonnen ESC-ID's in de bevroren inventaris |
| Harde grens | Geen drempel gewijzigd, geen pad verwijderd |

---

## E2E fixtures — gebakken/getest + CI-split (2026-07-31)

| Beslissing | Detail |
|------------|--------|
| Doel | Verandering-detector late lagen; geen kwaliteitscijfer |
| Gebakken | Stap 1–2, L0/L1, deur-/raampas als lijsten |
| Draait | L2–L10, L11/L12, L14, FML + dikte-harmonisatie |
| Referentie | Alleen `fixtures/<slug>/reference.fml` (handwerk, één verdieping); Detectie-export ≠ referentie |
| Snapshots | Poort `.fml.json` / `.walls.fml.json`; vindplaats `.layers.json` (+ escalatie-grootboek); snapshot ≠ oordeel |
| Grove vloer | Lengte ±25% vs ref, ≥5 openingen, `degraded===false` |
| CI | `npm test` exclude `tests/e2e/**`; apart `npm run test:e2e` via `vitest.e2e.config.ts` na unit-tests in CI |
| Set | `kromme-mijdrecht-3e`, `amstelveenseweg-1092-bg`, `amstelveenseweg-1092-1e`, `staedion-10`, `bouwtek11`, `bg`, `schuine-gevel-bg`; Kinderdijkstraat later |
| Doc | `.cursor/docs/e2e-fixtures.md` |
| Snapshot-refresh 2026-09-11 | Na dikte-guard + L7/L9 uit `6e16996` (die alleen `schuine-gevel-bg`-geometrie bijwerkte). 21 files (7× walls/fml/layers). Huidige output = bedoelde waarheid: echte stappen blijven gesplitst; `bg` dekking 97,5→98,9 / precisie 98,4→100 / deur-recall 87,5→93,8. `layers.json` zat verstopt achter de FML-assertie in hetzelfde `it()`. Update: `npx vitest run --config vitest.e2e.config.ts --update` (npm 11 slokt `-u` op). |

---

## Schuine gevels — lezen op laag 3, toepassen op laag 10 (2026-08-13)

Een gevel die werkelijk uit lood staat kwam als H/V-trap uit de pipeline: laag 4 trekt
elk stuk naar de dichtstbijzijnde as en laag 5–10 poetsen de zaagtand netjes op in plaats
van weg. Een eerdere poging repareerde dat op laag 10 alleen op vorm (macro-stair) en
faalde, omdat daar niet meer te zien is welke knik echt was.

| Beslissing | Detail |
|------------|--------|
| Lezen | Laag 3 — laatste punt waar de keten ongesnapt op de hartlijn ligt |
| Toepassen | Eind laag 10, na `absorbMicroCornerJogs` — alle ruis en stubs zijn dan weg |
| Lidmaatschap | Loodrechte afstand tot de DT-rug via bergopwaartse klim (`ridge-probe`), niet bbox-spreiding |
| Bewijs | Lengte-gewogen hoekcluster + offsetcluster; dodezone 2,5° houdt scanrest buiten |
| Ankers | Snijpunt van de as met de vreemde tak; die tak schuift mee, dus knopen en graden blijven |
| Guard | `withTopologyGuard` (W-55); afkeur = input-clone terug |
| Meting `schuine-gevel-bg` | lengte-ratio 0.4 → 1.0; dekking 57,8% → 100%; max afwijking 18,5 → 1,6 cm |
| Neveneffect | Vijf orthogonale fixtures byte-identiek; enige diff is de W-54-boekhouding |

Waarom de rug en niet de vorm: op deze tekening liggen de gevelstukken van laag 3
0–1,5 px van de hartlijn, terwijl trap-treden er 12–26 px vanaf zitten en stootborden
63–70 px. Bergopwaarts klimmen is nodig omdat een venster-maximum bij een dunne muur
naast een dikke gevel de rug van de buur pakt (valse 70 px op controlemuur
`(837,1585)→(970,1585)`).

**Sub-pixel stubs vóór de guard weg (2026-08-13, tweede tekening).** Op een tweede
verdieping (gevel 12,6° uit lood, met knik) werd de herbouw correct berekend maar door de
guard teruggedraaid: één restsegment van 0,5 px in een trap-hoek levert in de guard-graaf
(`weldNearEndpoints` eps 1 → `buildJunctionGraph` snap 0) twee knopen op — een schijn-T
plus een losse I. De herbouw haalt die weg, dus de T-telling daalde en het I-eindpunt lag
191 px van het dichtstbijzijnde nieuwe eindpunt. Laag 10 prunet nu segmenten ≤ 1 px
(`OBLIQUE_STUB_MAX_PX`) **vóór** de guard zijn `before`-meting doet, alleen binnen het
schuine blok, dus orthogonale tekeningen blijven onaangeroerd. Resultaat op die tekening:
gevel = één segment van 1712 px op 12,57°, `facesSkippedObliqueTopology` 1 → 0.

---

## FML near-ortho snap (2026-08-14)

Na `extractionToPlan` (8 px junction-cluster) kunnen “rechte” muren nog 0,3–1° restjitter
houden; de viewer-union verbergt dat, Floorplanner niet. Fix in cm, ná thickness/balance:

| Beslissing | Detail |
|------------|--------|
| Plek | `orthogonalizeNearAxisWalls` eind `harmonizeFmlWallThickness` (viewer = export) |
| Drempel | Dominant H/V én hoek tot as **&lt; 1,5°** (onder oblique-dodezone 2,5°) |
| Methode | Knoop-gewijs: H-ketens → gedeelde Y, V-ketens → gedeelde X; L/T = `(Vx, Hy)` |
| Oblique | Knoop met oblique muur bevroren; H met één bevroren eind → as = bevroren Y |
| Niet | L4/L10 `hvBandPx` retune; geen her-run op `editedPreviewPlan` / import |

---

## FML design-snapshot vs live walls (2026-08-24)

Generate zette ruwe L10-muren in `designs[0]` (`ensureRidgeDesign` flush) en harmonize/T-split alleen op `floor.walls`. Canvas las live walls (nette 3-band + knopen); project-download via `mergeFloorPlans` las de stale snapshot → Floorplanner + heropen in onze editor = zaagtand/overschoot. Twee tekenaars (test + Wonen Limburg FIN-10619).

| Beslissing | Detail |
|---|---|
| Detectie | `extractionToPlan` = plat floor, **geen** `designs[]` / Dak. Ridge hoort bij FML-editor (lege floor, import, Dak-tab) |
| Bron | Live `floor.walls` is waarheid; `designs[]` is snapshot (alleen als die laag bestaat) |
| Generate | `harmonizeFmlWallThickness` flusht ná dikte+sanitize als designs er al zijn; area-regen idem |
| Project-download | `mergeFloorPlans` flusht eerst, daarna remap — nooit `designs[0]` over live walls heen |
| Herschalen / nulpunt / oriëntatie | `scaleFloorPlan` / `translateFloorPlan` / `floor-plan-orient` flush eerst, daarna live walls — nooit `designs[0]` over de huidige FML heen |

---

## FML wall sanitize (2026-08-19, T/X 2026-08-20)

Near-90° restjitter + T/X-junctions + muur-onder-muur in cm, ná thickness/balance. Markers blijven QA (ε 0,1 cm).

| Beslissing | Detail |
|------------|--------|
| Helper | `sanitizeFmlWalls` = weld 0,25 cm → `orthogonalizeNearAxisWalls` → `materializeWallJunctions` (T+X) → collinear cover (as ≤0,5 cm), **herhaald tot stabiel** (max 4) |
| T/X | T = eindpunt op binnenste hartlijn; X = interior-kruising. Eerste helft houdt oude `id`; tweede `split-host-` + 8 hex. ε = param 1e-4 / 0,25 cm; **geen** 4 cm min-segment. Openingen via wereldmiddelpunt; exact op knip = één helft |
| Auto (vol) | Alleen generate + knop «Opschonen»: volle weld/ortho/T-X/cover tot vast punt. Generate ná semantic + deuren/ramen (stamp/nulpunt mag pre-semantic plan niet bevriezen) |
| Import / viewer-download | Alleen junction-pass (`applyJunctionSanitizeToPlan`); niet volle sanitize. Download schrijft live plan terug (editor = bestand). Niet in `buildFmlV3` |
| Muur-teken | Hartlijn-snap 15 cm (`JUNCTION_POINT_SNAP_CM`) ná knoop-snap; `addWallSegment` T-split op a/b. Kamer blijft 4 cm |
| Niet | Volle sanitize automatisch bij openen; geen auto-gevel uit contour; geen `alignWallJunctionBalance` (import-balance blijft) |
| Balance | Keep-axis: overlever houdt `balance`/`thickness`/`extras`; split-stukken erven |
| Gevelgroepen | Editor-split remapt via `remapFacadeGroupWallIds`; download junction-pass remapt (nog) niet — T-split-PR hangt die hook |

---

## FML wall-join caps (2026-08-23)

Square-caps + centroid-inflate gaven stickouts op schuine hoeken en 0,1 cm te veel op de buitenface (330 vs 340,1 bij 10 cm).

| Beslissing | Detail |
|------------|--------|
| Miter | Joined ends = `wallJoinFaceCorner` (zelfde face-snijpunt als schuine-hoekmarkers / dak-buitenhoek). L = binnen+buiten; T = alleen nabije host-face |
| Vrij eind | Blijft square cap (halve dikte) |
| Bijna-collinear | Miter > 4× dikte of platte sector → square fallback (geen spike) |
| Multi-arm knoop | `+` / Y / doorgaande as: square-cap (vult het knooppunt). T-tak in een doorgaande muur: stop op de nabije host-face (niet erdoorheen — anders kove dicht). Sector-inners op 3+ armen gaven een wit gat ter dikte |
| Bowtie | Zelfsnijdende overlay-quad → beide einden square (geen losse ruit + witte driehoek) |
| Union-gaten | Geen automatische hole-drop: kleine koven naast een T/+ werden per ongeluk gedicht |
| Union | Geen centroid-inflate; miter blijft exact (geen 0,05 cm mee-schuiven langs de as) |
| Hole-snap | Loodrecht 2 cm; langs de face `2 + dikte` zodat de buitenmiter (±t/2 voorbij het as-eind) meegaat |
| Maten | Area-holes volgen gemiterde faces: T+L 10 cm → verschil 10,0 (niet 10,1) |

---

## FML gevelgroepen (2026-08-20, store 2026-08-24 extras-only)

Project-brede EPA-gevels. Bron van waarheid = `settings.facadeGroups` (extras). Native Floorplanner-markers worden **niet** meer geschreven.

| Beslissing | Detail |
|------------|--------|
| Store | `settings.facadeGroups[]`: `{ id, code, name, wallGuids, nativeId?, groupMarker? }` — enige bron; lidmaatschap = wallGuids |
| Scope | Project-breed (alle floors); **muur mag in meerdere gevelgroepen** (voor/na verbouwing); Stempel (`stamp`) orthogonaal |
| Native FP | Niet schrijven. Editor-download stript alle `groupMarker`/`groupId`/`stampGroupId` van muren; catalogus blijft (zonder stamp). Workspace-FML stript catalogus + markers |
| Import | Als extras leeg én muren markers hebben → eenmalig migreren naar catalogus. Als extras bestaan → no-op (extras winnen) |
| Assign | **Add** (niet verplaatsen); lege groepen blijven catalogus-slots (detach/prune wissen geen lege groep meer) |
| Defaults (2026-09-11) | Factory 4 slots `front/back/left/right` (`.plg` naam Engels; UI vertaalt). User Settings (editor) is de zaaicatalogus: hernoemen/toevoegen/verwijderen. `ensureDefaultFacadeGroups` alleen als het plan nog geen gevelgroep heeft. Aanzicht-chips alleen bij groepen mét muren |
| Id | Stabiel `front`/`back`/`left`/`right` of `G1`, `G2`, …; `nativeId` legacy/cache; `code` vrij; `name` verplicht |
| UI | Checkboxes per gevelgroep (+ Stempel); inspect idem. Expand-leden alleen bij precies één gevelgroep |
| Split-remap | Remap in alle groepen die de GUID bevatten (gevel én stamp) |
| Stempel | Workspace stap-4 alleen Stempel-preset; editor-download stript stamp-catalogus |
| Stacked floors | «Ook andere verdiepingen»: zelfde **as-band** (5 cm) + overlap langs de as — niet exact `a`/`b`. Junctions mogen anders knippen; T-tak valt af |
| Groepsdikte (2026-08-27) | Chip-select opent **gevel-settings** (niet muur-settings). Eén dikte → alle leden op alle floors. Balance blijft (binnenmaten bij 0/1). Losse muurdikte blijft balance resetten naar 0.5 |
| Chip-select scope (2026-09-11) | «Selecteer» op de gevelchip: popup huidige verdieping / alle verdiepingen (alleen als de groep op >1 floor muren heeft). Huidige floor = leden op deze floor, muur-settings. Alle floors = gevel-settings (dikte overal). Annuleren = selectie ongewijzigd |
| Niet | Dual `groupId[]` in product-export; native primary-group “zodat FP iets ziet”; Floorplanner library Groups (account-quota) |

---

## FML chrome-dialogs (2026-08-20)

Native `window.confirm` / `window.prompt` (browser-chrome) vervangen door dezelfde kaartstijl als de editor-help.

| Beslissing | Detail |
|------------|--------|
| Host | `FmlChromeDialog` + queue (`confirmFmlChrome` / `promptFmlChrome`); host in `App.vue` + embed-`FmlEditor` (eerste wint) |
| Confirm | Hoogte-overschrijven (per verdieping) + oil-bottle nulpunt |
| Prompt | Nieuwe gevelgroep-naam (editor + inspect) |
| Fallback | Zonder host: native dialog (tests / kale embed) |
| Niet | `beforeunload` (browser-only); Quasar Dialog |

---

## FML-selectie sticky + touch-pan (2026-08-19)

| Beslissing | Keuze |
|------------|--------|
| Type-plak | Selectie blijft binnen muur / opening / item / annotatie tot leeg of area (zonder muur) of ✕. **Ruimte is niet sticky** (2026-09-11): deur/raam/muur mogen erdoorheen |
| Wisselen | Muur ↔ opening: eerst deselecteren (16 px-halo). Vanuit een geselecteerde ruimte: click-through |
| Mobiel tik | `pointerdown` plaatst geen selectie; pas stille `pointerup` (geen slop, geen 2e vinger) |
| Pan met selectie | 2-vinger én 1-vinger voorbij slop; selectie blijft. ✕ in settings-kaart wist bewust |
| Hold-drag | Move / maatlijn / nulpunt / box-select starten ná slop |

---

## FML-editor touch + wachtwoord (2026-08-19)

| Beslissing | Keuze |
|------------|--------|
| Host | Alleen `/FML-editor` (`FmlViewerView`); workspace ongemoeid |
| Gate | Shared canvas achter `touchEditor` (default false) |
| Desktop-muis | `/FML-editor` op PC blijft mousedown/mousemove; geen wrap-capture |
| Touch-nav + rail | Alleen `pointer: coarse` (Set/H/V/Move; geen Sel — Settings is al multi) |
| Gestures | Stille tik = edit; 1-vinger-slop = pan (geen deselect); 2 vingers = pan; pinch = zoom |
| Redo | Ctrl+Y / Ctrl+Shift+Z **niet** achter flag — ook workspace |
| Editor-wachtwoord | Soft gate `J0rd!` (`bouwToFml.fmlEditorUnlocked`), naast app-access — **2026-08-30: uit** (editor in topnav, alleen app-access) |

---

## Losstaande editor — seats & prijs (2026-08-31)

Los product, niet BouwToFML-detectie. Canonieke tekst: `.cursor/docs/Pricing & Marketplace Strategy – Floorplan Editor.md`. Aug-21-credits in `product-idee-self-serve-plattegrond.md` zijn achterhaald.

| Beslissing | Keuze |
|------------|--------|
| Model | **Seats** (persoon, multi-device). Geen credits als kern |
| Treden | Gratis / Solo / Kantoor. **Geen Studio** |
| Solo | Alles in de stoel: PDF-met-maten **én** aanzichten. Richtprijs **€29/mnd**, jaar ~10× |
| Kantoor | 5 stoelen + lock/rollen. Richtprijs **€199–249/mnd** |
| Gratis | Trechter; **mag bureau bestellen**; bij levering **maand Solo cadeau** |
| Bureau | Offerte via partnerkantoor. Geen marketplace bij launch |
| Partner | go2scan = API-tenant, geen publieke Enterprise-rij |
| Markt | Geen NL-makelaars/corporaties (contractkader productidee) |

---

## App topnav Converter / Editor / Dashboard (2026-08-30)

| Beslissing | Keuze |
|------------|--------|
| Nav | `Nieuw` links naast BouwToFML; `Dashboard` `https://dashboard.go2scan.nl/projects` (nieuwe tab) · `Converter` `/` · `Editor` `/FML-editor` · tandwiel = settings |
| Editor-gate | Extra `J0rd!` uit; app-access blijft |
| Wissel | Beide views blijven gemount na eerste bezoek (geen detectie/editor-state weg) |

---

## FML muur schuiven (2026-08-23)

| Beslissing | Keuze |
|------------|--------|
| Desktop | **Beide:** klik+sleep (geen invoer) én Shift+klik Precise (richting + typ / 2e klik) |
| Touch | Alleen Precise via Move-knop; tik zonder Move = selecteren |
| Precise | `useFmlPreviewWallMove` — click-click + typ vanaf start; 2e klik ≥5 mm (jitter), getypt ≥1 mm |
| Sleep | `useFmlPreviewWallDrag` — pointer-hold, geen typ |
| Binnenmaten | Tijdens knoop- of segment-move: restmaten rond openingen (keten), of volle binnenlengte zonder opening. Zelfde overlay/inset als opening-restmaten. Knoop = muren aan die knoop; segment = schuifmuur + knoopburen. Alleen tonen, niet typen |

## FML precise move knoop + opening (2026-08-23)

| Beslissing | Keuze |
|------------|--------|
| Activatie | Zelfde als muur: desktop Shift+klik; touch Move+tik. Sleep blijft op desktop |
| Touch | Alleen Precise (geen vrije sleep via Move) voor knoop én opening |
| Knoop | `useFmlPreviewJunctionMove` — 2D zoals tekenen; typ afstand langs hover-vector; snap = `snapJunctionPoint` (Ctrl uit); merge bij commit |
| Opening | `useFmlPreviewOpeningMove` — alleen langs huidige muur (geen hop); deur/raam gedeeld; typ Δcm langs as |
| Intent | `resolveRelocatePointerIntent` (was wall-only) |

---

## FML muur/kamer mobile draft (2026-08-22)

| Beslissing | Keuze |
|------------|--------|
| Eerste tik | Seed **0,5 m** (muur omhoog; kamer 0,5×0,5 omhoog+rechts). FML Y-down → omhoog = −Y |
| Handles | Witte punten op preview-uiteinden/hoeken; sleep **zonder** move-tool |
| Mobile plaatsen | Alleen ✓-accept (of Enter op desktop). Tweede tik plaatst niet (`pointer: coarse`) |
| Desktop | Blijft click-move-click; handles zichtbaar maar klik op eindpunt plaatst |
| Maat-fallback | `-2` / `-2m` spiegelt die as t.o.v. de huidige richting |
| Ná draft op touch | Geen hover-follow: 1-vinger-pan + handle-hold-drag |
| Invoer | **Binnenmaat**. Kamer: hartlijn = binnen + t/2 + t/2 (bestaande randmuur telt mee). Muur: hartlijn = binnen + connector-inset op knopen |

---

## FML-hoekmarkers (2026-08-19)

| Beslissing | Keuze |
|------------|--------|
| Setting | `fmlViewer.cornerMarkerMode`: `off` / `square` / `skew` |
| Default | `skew` — `!` op binnenhoeken die niet exact H+V zijn |
| `square` | `|_` op exacte 90° H/V-binnenhoeken |
| Scope | Elke binnenhoek-sector &lt; 180°: L=1, T=2, X=4; plat T-vlak geen teken |
| Recht | Muur-eindpunten `|Δx|` of `|Δy|` ≤ 0,1 cm (niet gemiddeld knooppunt) |
| Plaats | In de sector langs de hoekbissectrice (niet op het knooppunt) |
| Overlay | Viewer-only; geen FML-export |
| UI | Alleen Instellingen (geen FML-toolbar) |

---

## FML-viewer mobile chrome (2026-08-19)

| Beslissing | Keuze |
|------------|--------|
| Onderbalk | Floating zoals topbar; `safe-area` + 8 px marge (alleen `/FML-editor`) |
| Settings | Eigen kaart boven de tools, wrap + max-hoogte; niet meer in dezelfde rij |
| Sidebar | Menu houdt labels (icoon + tekst); geen icon-only |
| Modifier-rail | Drie knoppen (`settings` / `axis` / `move`) als iconen, zelfde kaartstijl |
| Fit | Icoon (`ToolbeltIcon` `fit`), geen tekst |
| Fullscreen | Icoon naast fit; verbergt app-header + verdieping-rail; Escape / icoon uit |
| Viewport | Viewer op `100dvh` (iOS 100vh-clip) |

---

## Hosted test (Workers, 2026-08-19)

| Beslissing | Keuze |
|------------|--------|
| Host | Worker + static assets (`floorplan-fml`, `workers.dev`) — niet Pages |
| SPA-fallback | `assets.not_found_handling = "single-page-application"` in `frontend/wrangler.toml` |
| Geen `_redirects` | `/* /index.html 200` geeft Workers-fout 100324 (oneindige lus met HTML-handling) |
| Headers | `frontend/public/_headers` (COOP/COEP/CORP) blijft in `dist/` |

---

## Diagnose-export (2026-08-24)

| Beslissing | Keuze |
|------------|--------|
| Origineel (stap 1) | Schone kleur-scan — opslaan/kopiëren voor her-detectie |
| Schaallinialen | SVG-overlay op B/W (zelfde px als stap-1); JSON blijft in het rapport |
| Geen B/W | Fallback: zelfde scan + linialen in de B/W-sectie; origineel blijft schoon |

---

## Aanzicht muurvlak-hoogte (2026-08-26)

| Beslissing | Keuze |
|------------|--------|
| Wanneer | Selectie / resize van muur of knoop op Gevels (zelfde overlay als opening-restmaten) |
| Wat | Volle vlakhoogte (niet rond ramen/deuren); lijn naast de muur |
| Scheef | Kopgevel met Δhoogte &gt; 1 cm → beide einden |
| Nok | Geen (eigen grepen) |

---

## Aanzicht dakvlak-punthoogte (2026-09-11)

| Beslissing | Keuze |
|------------|--------|
| Wanneer | Geselecteerd dakvlak-punt op Gevels (sleep + na klik op handle) |
| Wat | Hart van de plaat → verdiepingsvloer van die floor (zelfde Z als toolbelt-veld) |
| Overlay | Zelfde maatlijn als knoop/nok, 8 cm naast het punt |
| Vlak zonder punt | Geen lijn (eerst handle kiezen) |

---

## Tekstlabels plattegrond (2026-08-27)

Floorplanner `labels[]` (`fontSize` in px bij 1:1) worden getoond zoals kamerbenamingen, niet als vaste schermpixels.

| Beslissing | Keuze |
|------------|--------|
| Schaal | Wereld-cm: 16 px = `AREA_LABEL_HEIGHT_CM` (20 cm); zoomt mee met de plattegrond |
| Multiline | `\n` / `\r` / `\r\n` stapelen met `lineHeight` 1.15; breedte = langste regel |
| Font | Zelfde Inter als ruimte-namen; bold/italic/kleur/outline blijven |
| LOD | Zelfde min-schermhoogte als kamerbenaming |
| Hit | Box op de tekst (align left/center/right), geen cirkel om het anker |
| Ruimte-benaming | Klik ruimte → oranje kader om de naam; sleep schrijft `name_x`/`name_y` (cm t.o.v. centroid) |

---

## Eigen planformaat `.plg` — losstaande editor (2026-09-10, gebouwd 2026-09-11)

FML blijft first-class **export** van BouwToFML. Voor de losstaande editor is FML geen canonical store.
Werknaam BTF verviel op 2026-09-10: `btf` = *BouwToFML* en is de verkeerde merknaam in een klantbestand.

| Beslissing | Detail |
|------------|--------|
| Native bestand | Eigen **JSON**, extensie `.plg`, `format: "plg-plan"` + `version`; geen XML |
| Geometrie | FML-achtig houden (wall `a/b` + opening `t`); kinds i.p.v. FP-refids intern |
| FML | Adapter: import = hydrateren; export = lossy projectie |
| Inspect / PWA | `.plg` default; FML-upload blijft; geen/beperkte FML-export (originele bytes OK) |
| Editor-tenant | Tekenbureau: FML in/uit aan; externe klant: geen FML |
| Knip | Ander host-domein; package bij ~90% + launch; geen tweede repo nu |

Uitwerking: `.cursor/docs/plg-native-format-plan.md`; uitvoering `.cursor/plans/plg_native_format_eff0f41f.plan.md`.

### Uitvoering (2026-09-11)

| Beslissing | Detail |
|------------|--------|
| Geen parallel objectmodel | `.plg` = bestaande `FloorPlan` + header; editor, canvas, hit-test en sanitize onaangeroerd |
| Adapter-registry als seam | `importFmlV3`/`buildFmlV3` kregen éénmalig hooks; concept-taken raakten die twee bestanden daarna niet meer. Volgorde in `FML_CONCEPT_ADAPTERS` is betekenisvol — adapters zijn niet commutatief |
| Hook-volgorde | `hydrate` draait ná de hele legacy import-keten; `serializePlanSettings` vóór `stripFloorplannerHostileSettings`, zodat dak-/aanzicht-keys gezet mogen worden en alsnog uit de FML-download verdwijnen |
| Accessor-signaturen | Ongewijzigd — alleen de opslagplek verhuisde, dus call sites buiten `core/fml/` bleven onaangeroerd |
| Stempel-eigendom | Runtime-only `wall.stampOwned`; de `delete` in `buildFmlV3` blijft als vangnet, want de legacy extras-key wordt bewust nog gelezen |
| IDB | Schema **v2**: per floor `plan` + converter-sidecar (CV-werkstaat). Geen migratiecode; v1-record wordt gewist. Versiebeheer loopt vanaf `.plg` v1 via `migratePlg` |
| Canonieke types | `core/plg` bezit `PlgFloorDefaults` + unit/display-unions; `ui`/`platform` importeren daaruit (niet andersom) |
| Importgrens | `core/plg` mag geen `cv/`/`ui/`/`platform/`; alleen `fml-adapter/` mag value-imports uit `core/fml/`, type-only elders toegestaan |
| FML on-demand | `buildFmlV3` draait bij download/copy, niet in een `computed`; altijd op de live keten `editedPreviewPlan ?? importedPlan ?? fmlExportPlan` |
| Stap-4 hergeneratie | Hoogtes muteren de huidige plattegrond via de bestaande overwrite-all-confirm; alleen diktes/banden hergenereren echt |
| Naamhygiëne | TS-identifiers `btf*` hernoemd (`plan-slices.ts`, `readPlanSlices`, `OPENING_FRAME_EXTRA`); de FML-JSON-**waarden** `btfSlices`/`btfFrame`/`btfRole`/`btfOrigin` blijven staan |
| Converter → editor | Stap-4 knop «Openen in editor»: clone van `previewPlan` (in-memory plattegrond, geen download). Confirm als de editor al inhoud heeft; CV-sidecar blijft in de converter |
| Taal | Intern/editor = plattegrond / `.plg`; converter-klant-UI mag FML. «FML-editor» vermijden. Pad `/FML-editor` blijft tot een gerichte rename |

---

## 1,50 m-hoogtelijn + dakkapel (2026-09-11)

| Beslissing | Keuze |
|------------|--------|
| Hoofddak | Eén dichte polygoon; **geen gat** voor dakkapel |
| Dakkapel | Getypt kindvlak `roofKind: 'dormer'` + `roofParentId` op `FloorSurface` (zoals `origin`) |
| Sibling-overlap | Verboden (~8 cm slack); dormer-in-ouder toegestaan; toast bij weigeren |
| Clear height | `dakplafondZ − liningCm` vanaf vloer-Z 0; `poly.z` = onderkant plaat; goot tot `−slab`; contour **live** (niet opslaan) |
| `liningCm` | Alleen per `FloorArea`; default 0; mag negatief tot `−dakThicknessCm` |
| Override | Slot op `plan.roof.clearHeightOverride`; deze bouw leeg (geen lijn-editor) |
| Weergave | Plattegrond: stippellijn `[12,6]` (+ optionele arcering default uit); Dak-tab: fill ≥1,50 geen lijn |
| Settings | `showClearHeight150` (aan), `showClearHeight200` (uit), `showClearHeightPlanFill` (uit) |
| Persist | `.plg` v1 typed velden; **geen** versiebump/migratie; FML-adapter lossy + optioneel `settings.roofPlanes.kinds` |
| Fitting | Bind in dormer: `z`=ouderZ, `h`=kindZ; erbuiten alleen top; wangen/gevelgroep handmatig |
| Meetstaat | Pure `computeClearHeightBands` als haak; geen Meetstaat-tab in deze bouw |

Uitwerking: `.cursor/docs/roof-clear-height.md`.

---

## Dakkapel-randmuren bind + aanzicht (2026-09-12)

| Beslissing | Keuze |
|------------|--------|
| Welke muren | Alleen hartlijn-**einden** op de kindvlak-rand (`ROOF_TOUCH_SLACK` + ½ dikte). Kamerschot in de kapel en lange gevel die de kapel raakt: nee |
| Bind | Zelfde knop «Muren aan dak». Ná hoogtes: hartlijn naar **huidige buitenface**, `balance` 0\|1 a→b, dikte naar **binnen**. Baksteen blijft |
| Aanzicht | Dezelfde randmuren auto (geen gevelgroep); `axisEdit`; wangen `skipReturnFilter` |
| As-sleep | Langs plattegrond-as, geklemd op kindvlak; geen Ctrl-escape; al buiten = niet naar binnen trekken |
| Knieschot | Geen auto-knip. Tekenaar: losse muur, licht offset zodat merge de wang niet opvreet |
| Niet | Kindvlak-ringen als crease; flush op binnen-muren; tweede knop |

---

## Handmatige maatlijnen bewerken (2026-09-11)

| Beslissing | Keuze |
|------------|--------|
| Punten | Geselecteerde/gehoverde lijn: knoop-handles op a/b; sleep langs de bestaande as (niet draaien) |
| Typen | Toolbelt-lengte via `ScaleLengthInput`; groeit/krimpt **evenredig naar beide kanten** (midden vast) |
| Verwijderen | Toolbelt-prullenbak + Delete (zelfde als overige objecten) |
| Snap tekenen | Handmatig meet-tool: muurfaces **én** andere manuals (oneindige assen + einden); Ctrl uit |
| Snap bewerken | Eindpunt: zelfde snap, daarna projectie op as; slide: evenwijdige andere maatlijn (H/V-offset) |
| Min. lengte | 1 cm |

---

## Opening/fixture-identiteit: kinds + eigen IDs (2026-09-11)

| Beslissing | Keuze |
|------------|--------|
| Exemplaar | Verplicht `Opening.id` / `FloorItem.id` (UUID); FML-export `guid = id` |
| Soort | Domein-`kind` (`door.single`, `window.triple`, `oil_bottle`, …); **geen** Floorplanner-hash op het plan |
| FML-hashes | Alleen adapter (`opening-fml-refids` / `fixture-fml-refids`); unmapped → `extras.fmlRefid` |
| Labels D1/R1 | **Buiten scope** — later bij Meetstaat |
| Migratie | Geen `migratePlg` bump (V1 ongepubliceerd); `normalizePlanIdentities` op `readPlg` / `importFmlV3` / IDB |

---

## Ruimte niet sticky (2026-09-11)

Kamer/dakvlak-selectie lockt het canvas niet meer. Hit-test (opening → object → muur → ruimte) mag door klikken; muur ↔ opening blijft plakkerig vanwege de 16 px-halo. Zie ook «FML-selectie sticky + touch-pan (2026-08-19)».

---

## Dakvlak = onderkant plaat (2026-09-12)

| Beslissing | Keuze |
|------------|--------|
| `poly.z` | Onderkant dakplaat (plafond), niet het hart |
| Aanzicht | Plaatdikte omhoog vanaf handles; goot tot `−slabThicknessCm` |
| Clear height | `dakplafondZ − liningCm` (geen ½ dikte) |
| Bind | Ongewijzigd (hartlijn-knoop); dak rust op zichtbaar vlak, niet buitensteen |
| Migratie | Geen; `.plg` v1 ongepubliceerd |

---

## Dakvlakken op de verdieping (2026-09-12)

| Beslissing | Keuze |
|------------|--------|
| Master | Topbar-knop (icoon `roof`, naast grid): `showRoofOverlayOnPlan` (default aan). Alleen editor-plattegrond; verborgen op Dak / Gevels / converter stap 1–4. Inspect: knop ja, teken-tool nee |
| Inhoud | Settings → Dak: `showRoofPlanesOnPlan` (omtrek, default aan) + bestaande 1,50 / 2,00 / arcering. Geen extra sidebar-fold |
| Render | Stippellijn `[12,6]`, `listening: false`; hoofddak / dakkapel via `resolveRoofSurfaceColor`. Geen fill in `surfaces` (zou kamer-hit stelen) |
| Teken-tool | `draw_roof` op editor-plattegrond; zelfde write/snap/kind-strip als Dak-tab (`isRoof` + `roofKind` op sibling Dak-design). Trapgat blijft `draw_surface` |
| Wang-snap | Muur-tekenen snapt op dakvlak-randen (8 cm) als master én omtrek aan; Ctrl = uit |
| Buiten scope | Nok-overlay op plattegrond; vertex-edit op verdieping; ghost-ramen op Dak; muurpunten op aanzicht |

Uitwerking: `.cursor/docs/roof-clear-height.md`.

---

## Nog open

- **Openings-preprocess (deur+raam eigen B/W):** plan 2026-09-08 — één laag zonder adaptive, stages op eigen dual, projectie `OpeningHit → L10` (geen FaceID-lijm, geen AABB-snede). Werkwijze: map-backup, experiment in deze repo. `.cursor/docs/openings-preprocess-refactor-plan.md`
- **Stempel ↔ detectie (dubbele muren):** ownership A geïmplementeerd (`resolve-stamp-ownership`); band-unificatie + fixture-tuning nog open — `.cursor/docs/stamp-detectie-dubbele-muren.md`
- Geschikte OpenCV browser-build/versie
- **Deur-rotatiestrategie:** 45° vs 5° vs 90° + 2e schuin voorbeeld (POC)
- **Raam-detectie:** heel raam + schaal vs kozijnstijl + clustering (POC)
- **Muur-detectie:** kernel+Hough vs textuur-match + close + skeleton (POC; gearceerde muren)
- Close-kernel + skeleton performance op hoge-res scans
- Trap: exact `refid` in actuele FP-catalogus
- Volledige deur/raam-refid catalogus documenteren (11 + 3 uit examples; structurele types → refid mapping)
- **Clustering-drempels** deuren/ramen: valideren vs. handmatig opruimwerk (POC fase D)
- **FML-deurtags roundtrip:** FP persistent veld voor front/internal/achterdeur (zie `klant-eisen-v1.md` §7)
- **Roomtag-lijst** klant (tekenprotocol) + werkwijze handmatig vs. FP
- **Default cm** muurdiktes + deurmaten voor klanttemplate
- **Bovenlicht** model (raam vs. tag vs. gecombineerd symbool)
