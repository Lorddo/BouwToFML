# Muur-detectie — alle stappen

Dit document loopt **in de volgorde van de app**: wat je doet, en wat de computer daarna doet.  
Geen code-jargon in de hoofdtekst — alleen wat er feitelijk gebeurt.

---

## Overzicht: de vier stappen in de app

| Stap | Naam in de app | Wat je hier doet |
|------|----------------|------------------|
| 1 | Onderlegger | Upload, schaal, rotatie, gum/crop |
| 2 | Voorbewerking | Zwart-wit tunen (OCR-tab en Muren-tab apart) |
| 3 | Detectie | Tekst maskeren, daarna muren (REF-muur → faces → review → afronden) |
| 4 | Resultaat | Muren bekijken, FML/vector, exporteren |

---

## Stap 1 — Onderlegger

### Wat jij doet

1. **Tekening uploaden** — PNG, JPG, of PDF (bij PDF eerst een pagina kiezen).
2. **Schaal zetten** — trek een horizontale lijn en vul de werkelijke lengte in mm in. Zonder schaal kun je later niet exporteren.
3. **Rotatie** — alleen hier, niet in stap 2:
   - draaien met de slider (klokwijs = plus),
   - optioneel 180° aanvinken,
   - optioneel «scheefstand detecteren» voor automatische correctie.
4. **Gum of crop** — ongewenste randen, titelblok of ruis wegwerken (optioneel).
5. **Volgende** — ga door naar voorbewerking.

### Wat de computer doet als je op Volgende klikt

1. Rotatie en gum worden **in de afbeelding gebakken** (niet meer als losse instelling).
2. Witte randen rond de tekening worden weggesneden.
3. Afbeelding wordt opgeschaald tot minimaal 3000 px (langste zijde).
4. Schaallinialen worden mee verschoven/geschaald.
5. Rotatie-instellingen worden op nul gezet — de tekening staat nu recht in het bestand.

**Klaar met stap 1:** één schone onderlegger, recht, op schaal, zonder losse rotatie-sliders meer.

---

## Stap 2 — Voorbewerking

Geen detectie nog. Je maakt de tekening geschikt als zwart-wit voor OCR en voor muren.  
**Geen rotatie-paneel** — dat zat in stap 1.

### Tab OCR — B/W tunen voor tekst

Stel per slider/checkbox in (live preview op canvas):

1. Helderheid / contrast (optioneel)
2. Drempel: vast, adaptief of Otsu
3. Bij actieve drempel: polariteit corrigeren (zwarte inkt op wit — automatisch)
4. Speckles verwijderen (optioneel)
5. Kleine witte gaten dichten (optioneel)
6. Spleten overbruggen (optioneel)
7. Lijnen gladstrijken (optioneel)
8. Lijnen verdikken of dunner maken (optioneel)

Deze instellingen gelden **alleen voor de OCR-tab**. Muren hebben een eigen tab.

### Tab Muren — B/W tunen voor muurdetectie

Zelfde soort instellingen, maar **apart opgeslagen**. De muur-tab erft de OCR-drempel niet automatisch.

### Einde van stap 2 — muurtype kiezen

Als je op **Volgende: Detectie** klikt, opent een dialoog:

1. Kies **Solid Walls** — gevulde zwarte muurbanden.
2. Of kies **Open Walls** — twee parallelle lijnen, holle muur.
3. Zet OCR aan of uit (los van muurtype).
4. Klik **Toepassen op alle tabs**.

Dit verandert **alleen** het muurtype voor detectie (solid/open). Je B/W-tuning uit stap 2 blijft staan.

**Klaar met stap 2:** twee getunede B/W-presets (OCR + muren) + gekozen muurtype.

---

## Stap 3 — Detectie

Twee tabs, in deze volgorde: **eerst OCR, dan Muren**.

---

### 3.1 Tab OCR — tekst wegfilteren

Twee fases: **één keer scannen** (Tesseract, traag) en daarna **clientside filteren** (confidence, snel).  
Confidence verschuiven hoort **geen** nieuwe scan te triggeren — alleen de zichtbare selectie en het masker bijwerken.

#### Wat jij doet

1. Controleer of OCR aan staat (stond in de dialoog aan het einde van stap 2).
2. Pas scan-instellingen aan vóór de scan: taal, modus (algemeen/cijfers), verticale tekst aan/uit.
3. Klik **Scan tekst** — eenmalig per OCR-B/W uit stap 2 (of na wijziging van die B/W-tuning).
4. Schuif **confidence** — direct preview en masker bijwerken; geen herscan.
5. Scan opnieuw **alleen** als iets aan de scan-input wijzigt: OCR-B/W (stap 2), taal, modus of verticale detectie.

#### Wat de computer doet bij scan (fase 1 — ruwe lijst)

1. Maakt B/W van de OCR-instellingen uit stap 2.
2. Maakt een apart **grijsbeeld** voor Tesseract (zelfde helderheid/rotatie, geen harde drempel — beter op kleine/afgeronde letters).
3. Zoekt tekst met Tesseract op **beide** beelden (horizontaal + optioneel verticaal; B/W én grijs).
4. Voegt alle hits samen en bewaart **alle** woord-resultaten met bbox en confidence — ook onder de huidige drempel. Geen confidence-filter in deze fase.

#### Wat de computer doet na scan (fase 2 — clientside filter)

1. Filtert de bewaarde ruwe lijst op confidence-drempel, modus en tekst-heuristiek (geen Tesseract).
2. Dedupliceert en merged overlappende hits.
3. Bouwt het **tekstmasker** uit de gefilterde selectie — bij muurdetectie worden die pixels wit gemaakt zodat maatvoering en labels de muren niet verstoren.
4. Bij wijziging van alleen confidence: opnieuw fase 2, niet fase 1.

**Klaar met OCR-tab:** ruwe scan + gefilterd tekstmasker liggen klaar; muur-pipeline leest geen tekst meer opnieuw.

---

### 3.2 Tab Muren — room-first flow

Dit is de kern van muurdetectie. De app doorloopt deze **fases** (knoppen en status):

| Fase in de app | Wat jij doet | Wat de computer bewaart / produceert |
|----------------|--------------|--------------------------------------|
| Wacht op REF-muur | Referentiemuur tekenen | nog niets |
| Classificeren… | wachten | face-topologie + autoclass-labels (`roomClassifyState`) |
| Review | vlakken corrigeren, optioneel inkt/gum | zelfde state + handmatige overrides |
| Afronden… | wachten | Laag A/B/C + muurmasker in `tabOutputs.walls` |
| Klaar | door naar resultaat | Laag D (semantische graaf) wordt direct na afronden gebouwd |

**Pipeline-fases in de code** (achter de knoppen): `classify` → (`recalculate` optioneel) → `finalize` → Laag D apart.

---

#### 3.2.1 Referentiemuur (REF-muur)

**Wat jij doet**

1. Teken een rechthoek over **één representatieve muur** — na loslaten meet de computer de dikte en start autoclassificatie.
2. Na verslepen van het vak: klik **Autoclassificeer** om de dikte opnieuw te meten en opnieuw te classificeren.
3. **Wis referentievak** verwijdert alleen het vak; gemeten dikte blijft staan tot je opnieuw meet.

**Wat de computer doet**

1. Maakt B/W volgens de muren-instellingen uit stap 2 (+ tekstmasker uit OCR-tab).
2. Meet de inktband in jouw rechthoek (breedte van de muur in pixels).
3. Slaat die waarde op als **referentiedikte** — alle latere stappen die «gaten dichten» of «masker sluiten» schalen hiermee mee.

Zonder REF-muur start classificatie niet.

---

#### 3.2.2 Automatisch classificeren (fase «Classificeren…» / knop «Autoclassificeer»)

Dit draait automatisch na een geldige REF-muur, of opnieuw na **Autoclassificeer** / wijziging van de **inkt-drempel**.  
Hieronder **exact de volgorde in de computer** (fase `classify`).

##### A. Muur-B/W klaarzetten

1. B/W draaien met muren-instellingen uit stap 2.
2. Tekstmasker uit OCR-tab toepassen (tekst wordt wit).
3. Referentiebeeld (Otsu) wordt in dezelfde pass voorbereid — deelt grijswaarden met muur-B/W (sneller).

##### B. Witte vlakken vinden (faces)

1. Alles boven drempel 127 = wit.
2. Elk wit connected component = één vlak (face) met label, grootte, bbox, en of het de rand van het canvas raakt.
3. **Ruwe topologie** (`rawLabelsData`) wordt bewaard — CC vóór inkt-toewijzing; nodig voor review, herbereken en afronden.

##### C. Bootstrap inkt-resolve (eerste pass)

Zwarte pixels (label 0) tussen witte vlakken worden toegewezen aan het **dichtstbijzijnde** vlak:

1. Voorlopige muur/vloer-hint uit muur-B/W: rand-vlakken = buiten; inkt op vlak of hoge dekking = muur; rest = vloer.
2. Vanaf elke face loopt de computer door aangrenzende inkt (multi-source BFS).
3. Muurvlakken krijgen **voorrang** bij gelijke afstand.
4. Niet-toegewezen inkt blijft open (zwart/transparant in overlay).

*Nog geen handmatige classificatie — alleen heuristiek.*

##### D. Kleine vlakken samenvoegen — micro-tier

Geldt voor vlakken waarvan de grootste bbox-zijde **≤ 3%** van de korte zijde van de tekening.

Per kandidaat-vlak, van klein naar groot:

1. Kijk vanaf elke zijde (links, rechts, boven, onder) wie de directe buur is.
2. Loop door **alle** zwarte inkt heen (dikke muren blokkeren niet).
3. Loop door **alle** aansluitende micro-vlakken heen (ketting van ≤3%-vlakken).
4. **Regel:** minstens **3 van de 4** zijden moeten naar hetzelfde buurvlak wijzen.
5. Geslaagd → klein vlak wordt onderdeel van het buurvlak (`parentMap`).

##### E. Kleine vlakken samenvoegen — small-tier

Geldt voor vlakken tussen **3% en 10%** van de korte tekeningzijde.

Zelfde ray-march als micro, maar:

1. **Regel:** **alle 4** zijden moeten naar hetzelfde buurvlak wijzen.
2. Omsloten kleine vlakken worden **niet** samengevoegd met een buiten-vlak op canvas-rand.

##### F. Referentiebeeld voor inkt-meting

Apart B/W van de **kleuren-onderlegger** (niet het muur-B/W), met vaste tune:

1. Otsu-drempel.
2. Helderheid 150 (neutraal = 50), contrast 0,6.
3. **Gaten vullen** — max. gatgrootte schaalt met REF-dikte en muurtype:
   - Solid: ca. 45% van REF-dikte (tussen 16 en 44 px).
   - Open: ca. 50% van REF-dikte (tussen 16 en 42 px).
4. **Lichte verdikking** — schaalt met REF-dikte (ca. 8–10% van dikte, 2–7 px).
5. **Extra +3 px** verdikking bovenop.

Doel: kozijngaten en dunne openingen in de referentie dichten zodat inkt-telling muur vs. vloer betrouwbaarder is.

##### G. Eerste inkt-classificatie

Per **samengevoegd** vlak (na micro/small-merge; pixels van kinderen tellen mee bij de parent):

1. Tel hoeveel pixels in het referentiebeeld zwart zijn.
2. Bereken verhouding: zwart / totaal oppervlak.
3. **Raakt het canvas** → buiten het plan (wit in overlay).
4. **Verhouding ≥ drempel** (standaard 80%, instelbaar) → **muur** (donkergrijs).
5. **Anders** → **vloer** (eigen kleur per ruimte).
6. Zwarte lijnen tussen vlakken blijven transparant in de overlay.

##### H. Buiten-pockets filteren

Kleine **buiten-pockets** (max. bbox-zijde 50 px, niet op canvas-rand, geen handmatige override) worden als `outside` gemarkeerd als:

1. **Alle 4** cardinale zijden een buurvlak opleveren (onopgeloste zijde telt niet).
2. Geen enkele buur is **vloer** (`surface`).
3. **Alle 4** buren zijn **buiten** (`outside`) — zelfde strengheid als small-tier merge (4/4, niet 3/4).

##### I. Muur-booster inkt-resolve (tweede pass)

1. Muurvlakken uit stap G krijgen extra bereik bij inkt-toewijzing.
2. Inkt-resolve opnieuw op `rawLabelsData`.
3. Micro/small parent-merge **opnieuw** op de bijgewerkte labels.
4. Classificatie wordt **nogmaals** berekend (zelfde referentie + drempel als stap G).

**Output:** `roomClassifyState` (raw topologie, labels, parentMap, classificatie, drempel) + gekleurde face-overlay.  
**Nog geen** skeleton, masker of export.

---

#### 3.2.3 Review (fase «Review»)

**Wat jij doet**

| Actie | Effect |
|-------|--------|
| **Klik op een vlak** | Wisselt muur → onbekend → vloer → muur. Handmatige keuze wordt vastgepind. |
| **Inkt-drempel** aanpassen | Volledige **Autoclassificeer** opnieuw (stap 3.2.2). |
| **Inkt/gum op canvas** (toolbar) | Tekening wijzigen; overlay toont «verouderd» tot je **Verwerk inkt** klikt. |
| **Verwerk inkt** | Zie 3.2.4 — alleen geraakte vlakken opnieuw classificeren. |
| **Autoclassificeer** | Volledige classificatie opnieuw (3.2.2), incl. referentievak meten indien aanwezig. |
| **Afronden** | Zie 3.2.5 — skeleton + masker. |

**Overlaykleuren:** grijs = muur, gekleurd = vloer, rood = onbekend, wit = buiten; zwarte inkt tussen vlakken = transparant.

**Wat de computer doet bij vlak-klik (live, geen volledige herclassificatie)**

1. Override opslaan op het geklikte component-label (+ vastpinnen).
2. **Inkt-resolve opnieuw** op de opgeslagen ruwe topologie met jouw overrides — alleen `labelsData` / inkt-overlay wijzigt.
3. **Geen** micro/small-merge opnieuw; **geen** Otsu-herclassificatie; `parentMap` blijft zoals in review.

**Wat jij nog niet doet in review:** geen skeleton, geen FML — dat komt bij afronden.

---

#### 3.2.4 Verwerk inkt (knop «Verwerk inkt»)

Gebruik dit na **inkt/gum-bewerkingen** op het canvas (of wanneer de stale-hint verschijnt).  
Draait **lokaal** (geen volledige detectie-worker) — sneller dan opnieuw autoclassificeren.

**Voorwaarden:** REF-dikte bekend + bestaande `roomClassifyState`.

**Exacte volgorde (ink-process v2):**

1. Muur-B/W opnieuw uit stap-2 tuning + OCR/eraser-maskers.
2. Otsu-referentiebeeld opnieuw opbouwen op huidig muur-B/W.
3. **Diff** tussen opgeslagen `baselineWallBwData` en huidig muur-B/W.
4. **Topologie-only update** in diff-regio: carve toegevoegde inkt, fill verwijderde inkt, splits, lokale CC-patch — **geen** classificatie-erven of `unknown`-heuristiek.
5. **Geraakte labels** bepalen (overlap met diff + margin, nieuwe/verdwenen labels).
6. **Frozen vlakken** behouden exact hun effectieve classificatie (autoclass én handmatige overrides).
7. **Alleen geraakte vlakken** opnieuw autoclassificeren via inkt-dekking op referentie; handmatige pin op geraakt vlak vervalt.
8. **Inkt-resolve** op opgeslagen topologie met bijgewerkte classificatie; `parentMap` ongewijzigd.
9. `baselineWallBwData` bijwerken; inkt-edits committen naar onderlegger.

**Output:** bijgewerkte `roomClassifyState` + overrides; fase blijft **Review**. Skeleton wordt **niet** herbouwd — daarvoor opnieuw **Afronden**.

*Verschil met Autoclassificeer: Autoclassificeer start de volledige classify-pipeline opnieuw (CC + bootstrap + autoclass alles). Verwerk inkt wijzigt alleen topologie + classificatie in de buurt van getekende/gewiste inkt.*

---

#### 3.2.5 Afronden detectie (fase «Afronden…» / knop «Afronden»)

Start met **Afronden**. Input: jouw face-keuzes + opgeslagen `rawLabelsData` + `parentMap` uit review + REF-dikte + muurtype (solid/open) + actueel muur-B/W.

**Belangrijk:** afronden doet **geen** micro/small-merge opnieuw en **geen** Otsu-herclassificatie. Jouw review-keuzes zijn leidend.

##### Stap 1 — Vlakken voorbereiden (`prepareRoomFinalizeState`)

1. Effectieve classificatie = auto-labels + jouw overrides (per component).
2. Buiten-pockets opnieuw filteren (demote naar `outside`).
3. **Inkt-resolve** alleen op opgeslagen ruwe topologie — `parentMap` **ongewijzigd** uit review.
4. Bewaarde ink-statistieken bijwerken.

##### Stap 2 — Inkt-first muurmasker

1. Per pixel: hoort de toegewezen face bij een **muur**-classificatie? (niet buiten, niet canvas-rand-face.)
2. Masker-pixel = **zwarte inkt** op muur-B/W **of** witte gap **binnen** dat muurvlak (dubbele lijnen).
3. Geen volledige vulling van alle muurpixels — alleen inkt + interne spleten.

##### Stap 3 — Masker sluiten en blob-selectie

1. **Morfologisch sluiten** (pinholes tussen muurstroken):
   - Solid: ca. 5% van REF-dikte (2–4 px).
   - Open: ca. 7% van REF-dikte (2–5 px).
2. Verbonden gebieden zoeken in het gesloten masker.
3. **Blob-selectie (één stap):** eerst alleen blobs ≥ min. oppervlak (≈ REF-dikte², minimaal 24 px²); daarvan **alleen de grootste** behouden. Kleinere eilandjes vallen al weg door «grootste»; de min-drempel is een fail-safe — is alles te klein, blijft het masker leeg (geen skeleton op ruis).
4. Behouden masker opslaan (RLE) voor dikte-meting en Laag C/D.

##### Stap 4 — Laag A — ruwe middenlijn (WASM-skeleton)

Per behouden muurblok:

1. Masker omkeren (skeleton-library verwacht zwarte lijnen op wit).
2. WASM skeleton traceren → ruwe pixel-polylijnen.
3. **Polyline-compressie** — opeenvolgende pixels in dezelfde richting → één lijnstuk (hoeken/L/T blijven).
4. Coördinaten terug naar volledige tekening.
5. Knooppunten bepalen per blob (L, T, X, eindpunt I).

Laag A = ruwe middenlijn — minder fragmenten dan pure WASM, nog met WASM-ruis.

##### Stap 5 — Laag B — lijnen polijsten (nog geen wegsnijden)

Op **alle** Laag-A-segmenten samen (`buildLayerBPolish`), in volgorde:

1. Vroege collinear merge (max. 8 px gat, hoek &gt; 12° telt als echte bocht).
2. **Eerste cleanup-pass:** parallelle dubbele lijnen → middenlijn (incl. T-junction discovery), ortho-snap per muurlijn, collinear merge.
3. Horizontale segmenten splitsen op verticale armen; arm-attachments splitsen.
4. Eindpunten sluiten (`close`, alignment behouden); splitsen op knooppunten; **fan-dedup** (collineaire armen: langste houden).
5. **Tweede cleanup-pass** (zelfde familie als stap 2).
6. Korte tegenoverliggende stubs en verticale tier-stubs weg.
7. **H×V-hoek polish** — plat H+V naar loodrecht snijpunt; WASM-chamfer-diagonaal weg; Z-jog connectors blijven.
8. Nogmaals splitsen, close, ortho-straighten, stub-prune.

Laag B = schonere topologie; **bewust nog geen** korte stukjes weggegooid.

##### Stap 6 — Laag C — opschonen (prune)

Mediaan muurdikte schatten uit masker + Laag-B-lijnen. Daarna (`buildLayerCSkeleton`):

1. Tegenovergestelde armen op dezelfde lijn samenvoegen (T-tak ≥ 8 px blokkeert merge).
2. Collinear merge + H×V-hoek polish.
3. **Parallel-pick** — dubbele lijnen die B miste, op basis van inkt-score in masker (gap ≤ 2,5× geschatte dikte).
4. **Junction-ruis** weg: valse X-kruisingen, fan-duplicaten, korte diagonalen/chamfers zonder echte inkt.
5. **Korte doodlopende takken** weg (drempel schaalt met muurdikte, max. ca. 50 px), tenzij echte muur-inkt onder ligt.
6. Opnieuw doorlopende muren samenvoegen + collinear.
7. Segmenten korter dan 4 px weg.

Laag C = input voor de semantische muurgraaf (Laag D).

**Klaar met afronden:** `tabOutputs.walls` bevat Laag A/B/C-debug, masker-RLE, classify-state; `roomPipelinePhase = finalize`.  
**Laag D bestaat nog niet** — die volgt direct daarna (3.2.6).

---

#### 3.2.6 Laag D — semantische muurgraaf (direct na afronden)

Wordt **automatisch** getriggerd zodra afronden slaagt (`buildAfterFinalize`). Bij stap 4 opnieuw openen wordt dit hergebruikt als de Laag-A-junction-telling niet gewijzigd is.

**Input:** Laag-C-segmenten per blob (fallback: Laag B als C leeg is) + Laag-A-junction-ankers + muurmasker-RLE.

**Exacte volgorde** (`buildSemanticWallGraph`, skeleton-cleanup overgeslagen — C is al schoon):

1. Afstandsmap uit muurmasker (voor dikte + balance).
2. Segmenten verlengen naar loodrechte kruisingen (ca. 1,5× mediaandikte, min. 16 px) — hoeken sluiten; guard tegen valse X (max. 1 andere muurlijn per kruising).
3. Eindpunten sluiten op snijpunten; knooppunten-graph bouwen.
4. **Ankers uit Laag A** injecteren (L/T/X/I van ruwe skeleton).
5. **T-punten uit parallel-merge** injecteren (indien van toepassing).
6. Overige semantische knooppunten: degree ≥ 2, of echte bocht ≥ 25°.
7. Gevalideerde Laag-A I/eindpunten toevoegen (mask-check).
8. **Hoek-clusters** — twee L-knooppunten dicht bij elkaar → één hoekpunt (niet als het een echte X wordt).
9. Segmenten tussen knooppunten leggen; kruisingssoort (L/T/X) herbepalen.
10. Nogmaals verlengen naar kruisingen.
11. Finale collineaire samenvoeging (min. 10 px).
12. Graph opnieuw koppelen.
13. **H/V-snap** alleen op echt horizontale/verticale muren; schuine muren behouden hoek.
14. Graph opnieuw koppelen.
15. **Per segment dikte meten** — maximale dikte + **balance** (asymmetrie: muur dikker aan één kant of gecentreerd).
16. **Lost-wall audit** — controleert of Laag-A-muurbanden nog dekking hebben in Laag D (debug).

**Output:** `semanticWallGraph` (Laag D) + `segments` voor export/FML-preview.

**Klaar met stap 3:** je kunt door naar resultaat.

---

## Stap 4 — Resultaat

### Wat jij doet

1. Tab **Muren** — overlay met eindresultaat; layer-debug toggles (A/B/C/D) voor controle.
2. Tab **Vector / FML** — preview van Floorplanner-geometrie (uit Laag D).
3. Exporteren: FML, onderlegger, HTML-rapport, layer-debug JSON + MD.

### Wat de computer doet

1. Bij binnenkomst stap 4: Laag D bouwen als die nog ontbreekt (`buildForResultStep`).
2. **Laag E** — semantische segmenten omzetten naar FML-plan (cm via schaal, dikte, balance).
3. Geen CV-geometrie meer wijzigen na Laag D (alleen editor/preview-transformaties).

---

## Debug-lagen — wat zie je waar?

| Laag | Wat het is | Wanneer kijken |
|------|------------|----------------|
| **A** | Ruwe WASM-skeleton (+ polyline-compress) | Te veel fragmenten? WASM-ruis? |
| **B** | Gepolijst: samenvoegen, snijpunten, dubbel→midden, ortho | Topologie klopt nog niet maar lijnen zijn al strakker |
| **C** | Opgeschoond: prune, parallel-pick, junction-ruis, spurs | Te agressief weggeknipt? |
| **D** | Semantische graaf: knooppunten, hoeken, dikte, balance | FML-input; definitieve geometrie |
| **E** | Export-segmenten | Alleen omzetting naar FML, geen CV meer |

**Face-overlay** (grijs/kleur review) is géén skeleton-laag — dat is raster-classificatie vóór afronden.

---

## REF-dikte — waar wordt die gebruikt?

| Waar | Hoe |
|------|-----|
| Referentie gatenvullen (classify) | Solid 45% · Open 50% van REF-dikte |
| Referentie lichte verdikking | 8–10% van REF-dikte (2–7 px) |
| Referentie extra verdikking | vast +3 px |
| Muurmasker sluiten (finalize) | Solid 5% · Open 7% van REF-dikte |
| Min. blob-oppervlak (finalize) | max(24, REF-dikte²) px² — pre-filter vóór «grootste blob»; geen aparte stap daarna |
| Laag C parallel-max-gap | 2,5× geschatte mediaandikte |
| Laag C spur-/stub-drempel | `resolveStubThresholdPx` (dikte-geschaald, max. ca. 50 px) |
| Laag C T-guard | vaste 8 px (loodrechte tak) |
| Laag D hoek-verlenging | 1,5× mediaandikte |

---

## Technische verwijzing (alleen voor code zoeken)

| Onderdeel | Module |
|-----------|--------|
| Workspace-flow | `.cursor/docs/workspace-flow.md` |
| Pipeline-fases classify/recalculate/finalize | `geometry-pipeline.ts`, `junction-strategy.ts` |
| Classify | `room-first.ts` → `runRoomClassifyPhase` |
| Verwerk inkt (UI lokaal) | `room-recalculate-local.ts`, `room-ink-process.ts` |
| Finalize skeleton | `room-first.ts` → `runRoomFinalizePhase` |
| Inkt tussen vlakken | `room-ink-resolve.ts` |
| Face-merge micro/small | `room-raster-merge.ts` |
| Exterior pocket demotion | `room-exterior-pocket.ts` |
| Finalize voorbereiden (ink only) | `room-refine-topology.ts` → `prepareRoomFinalizeState`, `resolveInkOnStoredTopology` |
| Geraakte labels + subset-classify | `room-ink-affected-faces.ts`, `room-ink-classify.ts` → `classifyFaceLabelsSubset` |
| Referentie + inkt-classify | `room-reference-preprocess.ts`, `room-ink-classify.ts` |
| Muurmasker (finalize) | `room-ink-wall-mask.ts` |
| Masker sluiten + blob split | `room-wall-merged-mask.ts`, `room-wall-connected-blobs.ts` |
| Skeleton Laag A/B/C | `room-wall-face-skeleton.ts`, `skeleton-cleanup/layer-b.ts`, `skeleton-cleanup/layer-c.ts` |
| Laag D semantic | `semantic-graph/build-graph.ts`, `build-semantic-walls-output.ts` |
| UI muren-tab + live ink | `useWorkspaceRoomFaces.ts`, `room-raster-cache.ts` |
| Laag D na afronden | `useWorkspaceSemanticWalls.ts` |
| Profielen solid/open | `drawing-profiles.ts` |
