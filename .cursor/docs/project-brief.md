# Projectbeschrijving – Bouwtekening naar FML Conversietool

## Projectdoel

Ontwikkel een webapplicatie waarmee een gebruiker (tekenaar) bouwkundige plattegronden **semi-automatisch** kan omzetten naar een Floorplanner-compatibel FML-bestand.

De applicatie is niet bedoeld als volledig automatische AI-converter. De gebruiker blijft verantwoordelijk voor interpretatie van de tekening en levert voorbeelden aan waarmee het systeem **de huidige tekening** kan analyseren.

Het primaire doel is het verminderen van **repetitief handmatig tekenwerk** binnen Floorplanner — niet het wegnemen van alle interpretatiewerk. Focus: muren, deuren en ramen detecteren en omzetten naar vectorcoördinaten.

Succes wordt gemeten in tijdsbesparing voor de tekenaar (80% detectie / 50% tijdsbesparing), niet in volledig automatische herkenning.

**Buiten scope:** handschetsen en point-cloud-verwerking — dat gebeurt in een ander project/tool, niet in BouwToFML.

---

## Gebruikersflow

### Stap 1 – Upload

Gebruiker uploadt per verdieping: **PNG, JPG, JPEG** (plattegrond-afbeelding of scan).

**V1:** geen PDF-ondersteuning. Per verdieping een afbeelding; typisch één appartement, niet een heel complex in één scan.

Intern formaat: `ImageData` of `Canvas`.

### Stap 2 – Voorbewerking (vóór detectie)

**Verplichte stap** vóór kalibratie en herkenning: de tekening opschonen tot een **zwart-wit werkbasis**.

Sliders: brightness, contrast, threshold, noise reduction, **rotation** — gericht op het verwijderen van vlekken, kleur, ruis en scan-artefacten.

De gebruiker bepaalt zelf wanneer de afbeelding voldoende opgeschoond is. Rotatie wordt hier opgelost. De software mag suggesties doen maar voert geen verplichte automatische correcties uit.

Alle CV-stappen (template matching, lijndetectie) werken op deze opgeschoonde B&W-afbeelding. Die versie is ook de **onderlegger** voor aparte download (V1).

### Stap 3 – Schaal bepalen

Zodra de onderlegger op het canvas staat, verschijnen **twee H-referenties** (horizontaal + verticaal). Zie `v1-workflow-ui.md` §2.3 voor volledige UX.

**Horizontale maat (X):** H-vorm — verticale poten over volledige schermhoogte, horizontaal middelstuk op de tekening; poten verslepen om uit te lijnen; mm op middelstuk.

**Verticale maat (Y):** zelfde principe 90° gedraaid — horizontale poten over volledige schermbreedte, verticaal middelstuk.

**Bevestiging:** ✓ en ✕ rechts op het scherm — ✓ past `pixelsPerMillimeterX/Y` toe en heft greyed-status op.

**Herschalen:** via Settings; opent met **opgeslagen posities en mm** voor mini-aanpassingen.

De tekenaar kiest zelf welke maten kloppen — referentiefouten zijn gebruikersfouten; de preview moet afwijkingen zichtbaar maken.

Resultaat: `pixelsPerMillimeterX` en `pixelsPerMillimeterY`. Schaal is **per verdieping**.

### Stap 4 – Train By Example (per project)

Selectievakken rond voorbeelden op **deze tekening**: muurlijn/arcering, deur-primitives (standaard draai, optioneel schuif/garage/opening), raam (kozijnstijl; optioneel rond), optioneel trap.

**Progressief:** start met standaard deur + raamstijl; extra templates alleen bij missers — niet alle structurele types vooraf verplicht.

**Geen** train-by-example voor semantisch muurtype (buiten vs. woningsscheidend) — die classificatie gebeurt **na** detectie in de editor (zie stap 8).

**3–5 voorbeelden** per objecttype. Train-by-example is **per project/sessie** — per project is doorgaans één tekeningstijl beschikbaar. Template opslag over projecten = **V2 (meerprijs)**.

**Schuine buitenmuren:** tekenaar kan optioneel een ruwe footprint/guide intekenen als hulplijn voor de buitencontour.

### Stap 5 – Detectie (volgorde)

OpenCV (template matching, morphology, Hough lines). **Geen AI.** Menselijke voorbeelden blijven leidend.

**Volgorde:**

1. **Deuren en ramen** — template matching op B&W-tekening; live feedback; gevonden openingen **maskeren** (witgummen) op werkkopie
2. **Clustering** (optioneel) — voorstel structureel type: deurparen, schuifparen, raamstijlen op één lijn
3. **Muren** — lijndetectie + diktefilter op gemaskeerde tekening; knooppunten en wall graph; gaten over deuren heen dichten (`maxLineGap` + hoeksnapping)
4. **Openingen op muur** — gedetecteerde deuren/ramen projecteren op muursegmenten (`t`, `width`, `refid`); muur loopt door, openingen zweven niet vrij

Deze volgorde ruimt stoorzenders op vóór muurdetectie en levert muurrichting/dikte-informatie mee. Zie `google-ai-cv-consultatie.md`.

Conceptbewijs **start** met één standaard deur-refid en één raam-refid; intern model ondersteunt **structurele types** (dubbel, schuif, schuifpui, …) via editor + clustering. Visuele deurstijl per makelaar = **V2**.

### Stap 6 – Vectorisatie

Intern vector-model: wall graph (`Wall` met knooppunten) + openingen op muurlijnen, in **centimeters**. Per opening: `structuralKind` (refid), optioneel `doorTag` (semantisch), `exportShape` (enkele brede vs. gepaarde openings).

### Stap 7 – Project- en verdiepingsparameters (V1)

| Parameter | V1 |
|-----------|-----|
| Hoogte plafond | mm/cm per verdieping |
| **Muurdikte buiten / woningsscheidend / binnen** | 3 defaults in cm (klanttemplate) |
| **Deurmaten per tag** | breedte + hoogte + z voor voordeur / achterdeur / binnendeur |
| Hoogte ramen + positie t.o.v. vloer | sill + hoogte per verdieping (default alle ramen) |

Tag-specifieke deurmaten worden toegepast bij classificatie van een deur. **V2:** volledige per-opening editor — zie `v2-roadmap.md` en `klant-eisen-v1.md`.

### Stap 8 – Preview en minimale editor

Vectorresultaat als overlay op originele tekening. **Minimale editor** (V1):

- muurpunt verplaatsen
- muur splitsen
- muur toevoegen
- **muurtype** (buiten / woningsscheidend / binnen) — na detectie
- deur draaien (draairichting via `mirrored`)
- **deur/raam toevoegen** (icoon + learn-by-example refresh)
- **structureel openingstype** (refid: enkel/dubbel/schuif/schuifpui/garage/opening; raam 1/2/3-delig/rond)
- **clustering-review** (batch-bevestiging automatische voorstellen)
- **deur-tag menu** (voordeur / achterdeur / binnendeur; bovenlicht indien haalbaar) — **los** van structureel type

Geen volledige Floorplanner-editor. **Geen embedded Floorplanner-editor** — voorkomt facturering bij foutieve renders vóór de gebruiker tevreden is.

**Aanzichten (elevations):** **V1 niet** — alleen plattegrond. **V2:** aanzichten inschieten, schalen en maten meten (square tool). **V3:** herkenning ramen/deuren in aanzicht (onzeker) — zie `v2-roadmap.md`.

### Stap 9 – Export

Floorplanner-compatibel **JSON v3** FML (cm): `walls[]` met `openings[]` voor deuren en ramen.

**Deuren/ramen V1:** structurele types met refid-placeholders; POC start met standaard **enkeldeur** (`0434246537840a3326e305dbe7b9c355743e6e93`) en standaard **raam** (`b88cd3f479455fbf57205a91c613c02b7e6dc2df`). **V2:** visuele stijl per makelaar (andere refid, zelfde structureel type).

**Onderlegger (opgepoetste bouwtekening):**

- **V1:** apart **downloaden** naast FML (niet in FML ingebed)
- **V2:** online opslaan en meenemen in FML (`floors[].drawing`)

**Maatlijnen:** **V1 nee**. **V2:** automatisch op binnenmaten, **buiten** footprint. Trap: export mits mogelijk, niet verplicht in V1.

**Roomtags:** optioneel `areas[]` met namen uit klantlijst — onderzoek; geen OCR V1.

**Keuken/sanitair:** detectie **V2**; eventueel licht icoon-menu V1.

**V1:** FML-download + onderlegger-download. **API-import:** V2 — zie `v2-roadmap.md`.

**Multi-verdieping:** per verdieping werken; bij nieuwe verdieping keuze **herkenningen overnemen** of **nieuwe input** (overschrijfbaar). Schaal en hoogteparameters altijd per verdieping.

Zie ook: [export-options.md](./export-options.md) · [poc-test-plan.md](./poc-test-plan.md) · [google-ai-cv-consultatie.md](./google-ai-cv-consultatie.md)

---

## Technische architectuur

### Frontend (V1)

Vue 3, TypeScript, Quasar Framework, KonvaJS.
Zoom, pan, bounding boxes, selectietools, overlay rendering, minimale editor.

**Detectie en CV draaien client-side in V1** (OpenCV in browser). Pure TypeScript-CV (skeleton/mask) bleek onvoldoende in Crosscheck; OpenCV is nodig, met geschikte build/versie voor de browser.

Typische input: per appartement, geen megascans van hele complexen.

### Backend (later / V2)

Node.js, Fastify, REST API — voor API-import naar Floorplanner en eventueel zware server-side verwerking. Niet vereist voor V1-downloadflow.

### Analyse layer

OpenCV only (client-side V1). Prioriteit: edge → contour → template matching.

---

## Ontwerpprincipes

1. Semi-automatisch = grootste repetitieve werk wegnemen; interpretatie blijft bij tekenaar.
2. Train-by-example **per project** (3–5 per type); template opslag = V2.
3. **OpenCV only** — geen AI fallback.
4. Snelheid belangrijker dan perfectie (80%/50%-regel).
5. Voorbewerking tot B&W vóór detectie; detectievolgorde: deuren/ramen (masking) → muren + knooppunten → openingen op muur.
6. Floorplanner = eindomgeving; geen embedded editor (factureringsrisico).
7. Multi-verdieping per project; herkenningen optioneel overnemen; schaal per verdieping.
8. Focus V1: muren, deuren, ramen; **structurele openingstypes** + clustering-voorstel; muurclassificatie post-detectie; deur-tags (semantisch); onderlegger apart; geen maatlijnen, geen aanzichten.
9. V2: visuele deurstijl per makelaar, maatlijnen, volledige opening-editor, onderlegger in FML, aanzichten, keuken/sanitair detectie — zie `v2-roadmap.md`.
10. Klanteisen (jun 2026): `klant-eisen-v1.md`.
11. Mijlpaal: end-to-end op Kinderdijkstraat (POC) — zie `poc-test-plan.md`.
12. Geen BIM, geen CAD, geen handschetsen — praktische productietool.

---

## Referentieproject

Technieken en patronen uit **Crosscheck** (`C:\Pranimate\Crosscheck`): zie [crosscheck-reference.md](./crosscheck-reference.md).

FML-formaat en exportmotor: JSON v3 — referentie `examples/FML(current)/`; spec in `fml-format.mdc`.
