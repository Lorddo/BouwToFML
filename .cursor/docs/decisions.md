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
| Keten | Laag 7 adjacency; **door T/L/X**; breuk bij echte diktestap (15% hysterese over bandgrens) |
| Aggregatie | Gemiddelde binnen keten |
| Kwantiseren | 3 absolute banden (default 1–12 / 12–22 / 23+ cm) → 3 exportmaten |
| Implementatie | `harmonizeFmlWallThickness` na `extractionToPlan` op `FloorPlan.walls` |
| `balance` | Floorplanner **hartlijn** `a`/`b` (Y-down): `0` = alles **rechts**, `1` = alles **links** (`floorplannerLeftNormal`); lichaam schuift, as blijft (keep-axis). Default export 0.5 (X-01); collineaire diktewissel flush **alleen bij face-evidence**; zonder bewijs blijft 0.5; `quantizeBalance`; shift ≤ Δt/2; jog-stubs &lt;25 cm; stub-bump alleen bij gemeten nabijheid. Detectie clamp 0–1; editor-invoer tot ±1000% (slider 0–100%) |
| Editor dikte | Handmatige dikte (`setWallsThickness`, ook dezelfde maat) zet `balance` terug naar 0.5 — flush-waarden horen bij de vorige uitlijning; hartlijn `a`/`b` ongewijzigd |
| Diktemeting | `thicknessPxTypical` = mediaan DT-samples (FML-export); `thicknessPxMax` blijft opening-snap bovengrens; korte stubs kern-sample t∈[0.3,0.7]; junction-marge schaalt met `referenceWallThicknessPx` |
| Keten-union | Gemeten gelijkenis + 15% hysterese over bandgrens (niet alleen band-identiteit) |
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
| Stap-4 rescale | «Herschalen» bij plan-met-muren (ook na heropenen + FML-viewer): H/V apart, geen muurdikte |
| Herschalen | Zelfde posities + mm herstellen voor mini-aanpassingen (workspace: stap-1 handles via layout; viewer: bbox) |
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
| Stap 2 muurstempel | Expliciete knop «Muurstempel»: donor-FML → canvas-align/gum → bake dual (adaptive `stampBw` in wall-B/W + pure zwarte OR in Otsu); geen openings. Optioneel **Stempelset** = muren uit vaste gevelgroep `stamp` op donor (stap 4); aan = die muren zonder band-filter, **translate-only**, nulpunt-zaad + vector-inject op stap 4 (dikte pinned t.o.v. `harmonizeFmlWallThickness`); uit/leeg = diktebanden + stretch zoals nu. **Overflow:** stempel buiten de scan → automatisch wit pad op de kleur-onderlegger (plaatsen + bake); schaal blijft; linialen/refs/masks/nulpunt schuiven; geen auto-trim van wit op stap 1–3 (canvas blijft wit, zelfde als stap-4 infinity); max langste zijde 12k px |
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
| Autogen | Flags roundtrip; overlay niet verder tunen (geen gevelband-patches) |
| Slicer | Design-settings `btfSlices: [{m,p}]`; meetas = loodrecht op P−M; ticks = wallFaces ∩ meetlijn; interior skipzelfde-muur dikte; export baket `custom_dimension` op P-lijn |
| Handmatig | Meet-tool «Handmatig» → `dimensions[]`; imported custom dims zonder btfSlices |
| Terugkoppelen | Dim op P-lijn (≤1 cm) = slicer-bake; strip bij import als `btfSlices` aanwezig |
| Area-zijde overlay | Toggle «Maten tonen» (niet `FmlToolId`): sessie-only |
| FML flags | project: `dimensionMode`, `generateOuterDimension`, `showDims`; design: `engineAutoDims`, `btfSlices` |

**Viewer-maatlijn-tool:** Tape (tijdelijk) / Manual / Slicer (M→P). Shift = H/V; Ctrl = geen snap.

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
| Set | `kromme-mijdrecht-3e`, `amstelveenseweg-1092-bg`, `amstelveenseweg-1092-1e`, `staedion-10`, `bouwtek11`, `bg`, `schuine-gevel-bg`; Kinderdijkstraat later |
| Doc | `.cursor/docs/e2e-fixtures.md` |

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

## FML gevelgroepen (2026-08-20)

Project-brede EPA-gevels zonder GUID-suffix of wall-extras (Floorplanner stript die bij floor-rewrite).

| Beslissing | Detail |
|------------|--------|
| Store | Alleen `plan.source.settings.facadeGroups[]`: `{ id, code, name, wallGuids }` |
| Scope | Project-breed (alle floors); **één muur max één gevelgroep**; Stempel (`stamp`) is **orthogonaal** (mag samen met één gevel) |
| Id | Stabiel `G1`, `G2`, …; `code` vrij (VG/AG), default = id; `name` verplicht |
| Lege groep | Auto-delete na detach / prune / assign-weg; **uitzondering:** vaste id `stamp` (Stempel-preset) blijft leeg |
| Prune | Bij FML-openen (viewer + workspace-import); niet elke tick |
| UI | `/FML-editor` muursettings (gevel + Stempel-checkbox) + inspect-panel (geen stamp); workspace stap-4: **alleen** preset «Stempel» — geen nieuwe groep / rename |
| Canvas | Overige leden op actieve floor licht meemarkeren; inspect-tik selecteert alle leden op die floor (`FmlInspectHit.ids`) |
| Split-remap | Handmatige split, **Opschonen** en **junction-pass**: remap in **alle** groepen die de GUID bevatten (gevel én stamp); uitstekende T-tak niet |
| Stempel (detectie) | Stap-4 koppeling → stap-2 checkbox «Stempelset»; workspace-download **stript** `facadeGroups` |
| Stempel (editor) | Plattegrond-knop «Stempel»: kopieer stamp-muren van andere floors naar actieve floor (zelfde `a`/`b`, nieuwe GUIDs, gevel mee, niet in stamp); editor-download stript **alleen** `stamp` |
| Niet | GUID-suffix; `facadeGroupId` op muur; auto-contour; scores in FML |

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
| Type-plak | Selectie blijft binnen muur / opening / item / annotatie / area tot leeg of area (zonder muur) of ✕ |
| Wisselen | Eerst deselecteren; klik nabij een deur terwijl muren geselecteerd zijn blijft muur |
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
| Editor-wachtwoord | Soft gate `J0rd!` (`bouwToFml.fmlEditorUnlocked`), naast app-access |

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

## Nog open

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
