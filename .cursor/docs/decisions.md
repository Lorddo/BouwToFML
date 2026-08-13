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
| Keten | Laag 7 adjacency; **door T/L/X**; breuk alleen bij andere dikteband |
| Aggregatie | Gemiddelde binnen keten |
| Kwantiseren | 3 absolute banden (default 1–12 / 12–22 / 23+ cm) → 3 exportmaten |
| Implementatie | `harmonizeFmlWallThickness` na `extractionToPlan` op `FloorPlan.walls` |
| `balance` | Default 0.5 (X-01); collineaire diktewissel: **langste dikteband** blijft B=0.5; overige flushen tegen **één wereld-face** (a→b-onafhankelijk; default faceLo); jog-stubs &lt;25 cm (kortere keten → langere hartlijn); stub-dikte=max(armen) ook als stub blijft; collinear stubs &lt;15 cm |
| L9 stub | Bewaart cross-band + parallel CL-offset (thickness-gate + `orthoStubTierMaxPx` mid-capped) |
| L10 straighten | Geen axis-union over dikteband-wissel (thickness-gate op direct + bridge); FML balance blijft post-L10 consument |
| Legacy min/max clamp | Vervangen door tier-model |

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
| Herschalen | Zelfde posities + mm herstellen voor mini-aanpassingen |
| Menu (rechtsboven) | **Nieuw project** (bevestiging, sessie wissen) + **Kleuren** (localStorage) |
| Kleuren local | Muurlijnen, deuren, ramen, linialen H horizontaal/verticaal — per tekenaar, geen server |
| Onderlegger toggle | Oog-icoon + **spatie vasthouden** tijdelijk verbergen |

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
| **V1** | **Geen** — alleen plattegrond per verdieping |
| **V2** | Aanzichten uploaden, schalen, ramen/deuren meten met **square tool** (breedte × hoogte) |
| **V3** | Herkenning ramen/deuren in aanzicht + hoogte verwerken in FML — **kleine kans** op uitvoering |

---

## Multi-verdieping

| Beslissing | Status |
|------------|--------|
| Scope | **Meerdere verdiepingen per project** (`ProjectState` V1) |
| Werkwijze | **Per verdieping** detectie-flow (stap 1–4); stap 0 = projectmeta |
| Stap 1 overname | Expliciete knop «Onderlegger overnemen» — projectbron (pre-crop) + schaal |
| Stap 2 overname | Expliciete knop «B/W overnemen» — tune only; LBE-rects opnieuw tekenen na crop |
| Stap 2 muurstempel | Expliciete knop «Muurstempel»: donor-FML → canvas-align/gum → bake dual (adaptive `stampBw` in wall-B/W + pure zwarte OR in Otsu); geen openings |
| Stap 3 | Altijd solo (geen `tabOutputs`/faces delen) |
| Stap 4 | Merge floors → één FML (`mergeFloorPlans`); juiste floor-namen/`level` |
| Floor-switch | Exact restore + opgeslagen `previewPlan` (geen openings-rerun / geen regenerate) |
| Defaults | Per verdieping (`FloorMeta.defaults`); per component in FML-editor |
| Persistentie | **Niet** in V1 (IndexedDB later) |
| V2 | Template opslag + Makelaar Huisstijl — zie `v2-roadmap.md` |

---

## Maatvoeringslijnen

| Beslissing | Status |
|------------|--------|
| V1 | **Nee** — niet in scope |
| V2 | Automatisch op **binnenmaten**, **buiten** footprint |
| Meetwaarde | **Binnenmaten** (tussen binnenwanden / binnenwerks), niet hart-op-hart |
| Plaatsing | **Buiten** om de verdieping — externe maatketting rondom (zoals in `examples/`) |
| Generatie | Automatisch afgeleid uit muurgeometrie / footprint |
| Correctie | Tekenaar past aan in Floorplanner na import |
| FML | v3 `dimensions[]` (`type: custom_dimension`) |

Binnenmaten = meetwaarde; lijnen staan visueel **buiten** footprint (grote offset in cm — zie Kinderdijkstraat dimensions).

---

## Gebruikersvoorkeuren (localStorage)

| Sleutel | Scope | V1 |
|---------|-------|:--:|
| Overlay-kleuren | Per browser/gebruiker | ✓ |
| Sync server / account | — | ✗ V2 |

Velden: `walls`, `doors`, `windows`, `scaleHorizontal`, `scaleVertical`. Zie `v1-workflow-ui.md` § Menu → Kleuren.

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
| Set | `kromme-mijdrecht-3e`, `amstelveenseweg-1092-bg`, `amstelveenseweg-1092-1e`, `staedion-10`, `bouwtek11`, `bg`; Kinderdijkstraat later |
| Doc | `.cursor/docs/e2e-fixtures.md` |

---

## Nog open

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
