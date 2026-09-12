# IFC / DWG → FML — vooronderzoek en ontwikkelplan

Peildatum: 2026-09-09 · Status: **PLAN** (nog niet gebouwd) · Bron: gesprek + meting op klantbestanden

Aanleiding: klant wil IFC- en DWG-bestanden kunnen omzetten naar FML. Nieuwe pijplijn, **los van** de huidige blueprint-converter (CV). Voorbeelden: `examples/IFC/`, `examples/DWG/`.

Gerelateerd: [`plg-native-format-plan.md`](plg-native-format-plan.md), [`project-brief.md`](project-brief.md), [`workspace-flow.md`](workspace-flow.md), [`product-idee-self-serve-plattegrond.md`](product-idee-self-serve-plattegrond.md) («Export later: DXF / IFC»), [`fml-inspect-pwa.md`](fml-inspect-pwa.md) («IFC-converter later: geometrie + IDs»).

> **Herziening 2026-09-10 — `extras` → getypte velden.** Dit plan is geschreven met FML als opslagformaat en zet daarom extra IFC-gegevens (`GlobalId`, laagopbouw, kozijnmaten) in `extras`. Inmiddels is besloten dat het eigen formaat **`.plg`** de opslag wordt en FML én IFC beide adapters zijn — zie [`plg-native-format-plan.md`](plg-native-format-plan.md). De IFC-importer schrijft dus naar **getypte domeinvelden** (`origin.guid`, `wall.layers[]`, `opening.frame`); alleen de FML-*serializer* propt ze eventueel in `extras`. Het onderliggende besluit — bewaren wat je weggooit — verandert niet. Waar hieronder `extras.x` staat, lees `.plg`-veld.

---

## 1. Kern in het kort

| | Oordeel |
|---|---|
| **IFC → FML** | Goed haalbaar. Muur-hartlijnen, diktes, ruimtenamen en openingsmaten zitten er bruikbaar in. **€0 licentiekosten** (`web-ifc`, MPL-2.0). 4–6 weken. |
| **DWG → FML** | Via **PDF-export** door het tekenbureau. Die route bestaat vandaag al in de app; kost geen module, alleen een exportinstructie. |
| **Native DWG** | Niet doen. Legale server-side DWG-parsing kost $7.500 jaar 1 / $4.500 daarna (ODA Sustaining). Buiten scope. |
| **DWF** | Buiten scope. Alleen realistisch via Autodesk Platform Services (betaald per bestand). |
| **Grootste risico** | Niet de techniek maar de **inputkwaliteit** van een derde partij. Mitigatie = importvalidatie + vaste exportinstructie. |

---

## 2. Volume en waarom dit werk verdedigbaar is

- Blueprint (huidige converter): **40–60 panden per dag** ≈ 95% van het volume.
- IFC/DWG samen: **50–200 per maand** ≈ 5%. Geen vaste verdeling tussen IFC en DWG.

Op tijdwinst alleen is 4–6 weken voor 5% van het volume niet uit te leggen. De rechtvaardiging is drieledig:

1. **Compleetheid** — geen "stuur maar een plaatje" meer; we nemen aan wat de klant heeft.
2. **Kwaliteit** — op deze bestanden is bijna-100% haalbaar in plaats van ~80% bij CV.
3. **Export later** — dit project legt de **FML↔IFC-mapping**. De importer is de eerste gebruiker; de latere IFC/DWG-export uit de editor is de tweede. Dat is de eigenlijke opbrengst.

---

## 3. Gemeten bevindingen — `A_facade_DLW_ALG3830_A.ifc`

Gemeten met een wegwerp-STEP-parser (28.603 entities), niet aangenomen.

### 3.1 Wat het bestand is

IFC2X3, Autodesk Revit 2020, `CoordinationView_V2.0`, eenheid **millimeter**, 1,8 MB. Kleine eengezinswoning. Ondanks de bestandsnaam een compleet model, geen aanzicht.

Drie `IfcBuildingStorey`: `00_begane grond` (0 mm), `01_eerste verdieping` (2590 mm), `02_dak` (6090 mm).

### 3.2 Muren — direct bruikbaar

31 muren (`IfcWallStandardCase` + `IfcWall`), allemaal met een `IfcShapeRepresentation('Axis','Curve2D')` die een **2-punts polylijn** is. Dat is letterlijk de FML-hartlijn.

| Voorkomende dikte | Aantal | Uit |
|---|---|---|
| 70 mm | meeste binnenwanden | `IfcMaterialLayerSet` |
| 100 mm | woningscheidend / binnen | idem |
| 300 mm (100-50-50-100) | spouwmuur, gevel | idem |

Voorbeeld, muur `#4610`: as van (14590, 8700) naar (14590, 300), dikte 300 mm, `OffsetFromReferenceLine` 150 `.NEGATIVE.`.

**Belangrijk:** bij *alle* muren is `|offset| == dikte / 2`. De as ligt dus consequent **op een muurvlak**, nooit in het hart. In FML betekent dat `balance` 0 of 1, nooit 0.5.

**Twee muren (`#5540`, `#40406`) hebben geen `IfcMaterialLayerSetUsage` op de instance** — die loopt via `IfcRelDefinesByType` → `IfcWallType`. De parser moet materiaal dus via zowel instance als type resolven. Fallback: de dikte staat óók in de typenaam.

**Muurfragmenten:** `#16488` is 25 mm lang, `#11235` is 70 mm lang. Modelleerartefacten die anders degenerate FML-muren opleveren. Minimumlengte-filter nodig.

41 × `IfcRelConnectsPathElements` met `.ATSTART.` / `.ATEND.` / `.ATPATH.` — knopen en T-splitsingen zitten er expliciet in.

### 3.3 Naamgevingsconventie — tweede bron van waarheid

Het bureau hanteert een strakke NLCS-achtige conventie:

```
21_WA_Spouwmuur_Kalkzandsteen_300mm_100_50_50_100
22_WA_Kalkzandsteen_WS_100mm
22_WA_Kalkzandsteen_70mm
32_CWA_Deurkozijn_050x100mm
31_CWA_Kozijn_067x114mm
30_DO_Deur:32_DO_Binnendeur   ·   30_DO_Stolpdeur   ·   30_DO_Deur:31_DO_Buitendeur
30_WI_Raam1   ·   WI_subvak:Dubbelglas   ·   WI_subvak:Enkelglas
23_FL_generiek_200mm   ·   27_RO_hellend_generiek_200mm
```

`WA` wand, `DO` deur, `WI` raam, `CWA` kozijn, `FL` vloer, `RO` dak. Dikte en kozijnprofiel staan **letterlijk in de naam**. Dit is een onafhankelijke controle naast de geometrie en maakt classificatie deterministisch.

> **Te bevestigen bij het tekenbureau:** is dit hun vaste standaard of toevallig netjes in dit project? Eén extra voorbeeldbestand van een ander woningtype geeft antwoord.

### 3.4 Openingen — het lastigste deel, nu gemeten

De structuur wijkt af van standaard-IFC en dat is bepalend voor het werk:

- **Geen enkele `IfcRelFillsElement`.** De koppeling opening → gastheermuur ontbreekt formeel.
- Deuren en ramen zitten in **`IfcCurtainWall`-assemblages** (17 stuks) — de Nederlandse Revit-werkwijze waarin kozijnen als vliesgevel worden gemodelleerd. Via `IfcRelAggregates` hangen daar `IfcDoor`/`IfcWindow` plus `IfcMember`-stijlen onder.
- De 20 `WI_subvak`-ruiten hangen **niet** in een aggregate; die staan los in de storey.
- 14 `IfcDoor`, 24 `IfcWindow` (4 × `Raam1` + 20 × `WI_subvak`).
- 12 × `IfcOpeningElement`, waarvan 11 in muren en 1 in een vloer (trapgat).

**Meetresultaat — het gat is exact het paneel plus het kozijnhout:**

| Gat | Gatbreedte | Paneel (`OverallWidth`) | Verschil | Kozijntype |
|---|---|---|---|---|
| `#5774` | 900 mm | 800 mm | 100 | `050x100mm` → 2 × 50 |
| `#6603` | 900 mm | 800 mm | 100 | `050x100mm` |
| `#6416` | 900 mm | 800 mm | 100 | `050x100mm` |
| `#6230` | 825 mm | 725 mm | 100 | `050x100mm` |
| `#39015` | 460 mm | 326 mm | 134 | `067x114mm` → 2 × 67 |

Die relatie is exact en deterministisch: **gatbreedte = `OverallWidth` + 2 × kozijnprofielbreedte uit de typenaam.**

**Maar: 6 van de 17 kozijnen hebben géén `IfcOpeningElement`.** Bij die kozijnen loopt de muur gewoon door (o.a. de voorgevel `#5540` met drie kozijnen, en `#40406`). Daar is het gat dus alleen af te leiden uit paneel + kozijnprofiel.

> **Conclusie voor de pijplijn:** gebruik het `IfcOpeningElement` als het er is, en val anders terug op `OverallWidth` + 2 × kozijnprofiel. Waar beide bestaan komen ze exact overeen — dat is het bewijs dat de fallback veilig is.

**Openstaand:** mijn probe gaf voor 4 van de 11 gaten de muurhoogte in plaats van de breedte (oriëntatie van de `IfcAxis2Placement3D` bij die specifieke openingen). Dat is een parserfout, geen dataprobleem, maar het moet in de spike kloppend zijn vóór we op gatmaten vertrouwen. De z-hoogte van het gat is sowieso **niet** bruikbaar: Revit snijdt royaal door (bijv. gat tot 2765 mm in een wand van 2390 mm).

### 3.5 Ruimtes

16 × `IfcSpace` met Nederlandse `LongName`: garage, badkamer, gang, slaapkamer, woonkamer, keuken, … Direct te mappen op de Floorplanner `role` uit `roomtype-catalog.json`. Er bestaat nog geen reverse-lookup (naam → role); die moet gebouwd worden.

### 3.6 Dak

`IfcRoof` + `IfcSlab` met `.ROOF.` (`27_RO_hellend_generiek_200mm`). Een geëxtrudeerde plaat, geen nok met dakvlakken. Mapping naar het Dak-model van de editor is apart werk.

---

## 4. Gemeten bevindingen — DWG, DWF en PDF

| Bestand | Bevinding |
|---|---|
| `MFB_..._Plattegronden Bruggenhoofd.dwg` | Formaat **AC1018** = AutoCAD 2004. Secties gecomprimeerd; laagnamen niet leesbaar zonder echte parser (geverifieerd). Naam suggereert **meerdere verdiepingen in één tekening**. Gewone AutoCAD, dus **plat lijnwerk zonder AEC-muurobjecten**. |
| `floorplan_Wonen Zuid_..._TB.dwf` | **DWF v06.00** — ZIP-container met W2D whip-vectorstreams. Alleen lijnwerk, geen bouwkundige semantiek. Door Autodesk afgeschreven formaat. Buiten scope. |
| `A_floorplan_8265RX_44.pdf` | **Vector**, geen scan. 2 × A3, 40 fonts, slechts 2 kleine logo-JPEG's. Aangemaakt met Aspose.PDF. Bevestigt dat vector-PDF een reële route is. |

---

## 5. Vastgelegde klanteisen

| # | Eis | Gevolg |
|---|---|---|
| 1 | IFC komt altijd uit **Revit**; bestanden van een **derde partij**, maar altijd dezelfde | Eén exporteur-dialect. Grootste onzekerheid ("elke exporteur is anders") vervalt. |
| 2 | Tekenbureau heeft 6 × gewone AutoCAD en kan converteren | DXF/PDF-export is bij hén een eenmalige inrichting. **Bespaart $7.500.** |
| 3 | **Deuren en ramen moeten op de juiste plek** | Openingen staan op het kritieke pad, niet optioneel. |
| 4 | Kozijnmaten zijn voor FML **niet relevant**; alleen de openingsmaat + hoogte | `IfcDoorLiningProperties` / `IfcWindowLiningProperties` negeren. |
| 5 | **Per raam een eigen FML-object** — geen bovenlicht-verpakking bij import | Geen clustering van subvakken. Ombouwen naar bovenlicht kan later in de editor. |
| 6 | Geen muur in IFC = **geen muurstrookje in FML**. Openingen sluiten aan of overlappen 5 cm | Stijlen tussen subvakken worden niet als muur weergegeven. |
| 7 | **Eigen pijplijn.** Geen `harmonizeFmlWallThickness` of andere CV-conversielogica | IFC-geometrie is exact; er is geen meetruis om te repareren. |
| 8 | Spouwmuur 300 mm → **30 cm** in FML | `IfcMaterialLayerSet.TotalThickness`; laagopbouw wél bewaren in `extras`. |
| 9 | Extra gegevens bewaren, ook al kent FML ze niet | Getypt veld in `.plg`; de FML-export mag ze in `extras` zetten of laten vallen. |
| 10 | Export naar IFC/DWG later gewenst; werk met een **vaste tabel** zodat het te tweaken is | Mapping declaratief houden, niet in parsercode. |

---

## 6. Architectuur

### 6.1 Twee wezenlijk verschillende problemen

| | IFC | DXF / vector-PDF / blueprint |
|---|---|---|
| Wat je krijgt | objecten met betekenis | lijnen zonder betekenis |
| Wat je moet doen | mappen + openingen aan muren hangen | detecteren |
| Betrouwbaarheid | hoog en voorspelbaar | afhankelijk van tekenafspraken |
| Hoort bij | **nieuwe pijplijn** | bestaande converter |

DXF en vector-PDF horen bij de blueprint-familie, niet bij IFC. Alleen netter aan de invoerkant.

### 6.2 Wat de nieuwe pijplijn wél deelt met bestaande code

**Gebruiken:**

- `core/fml/types.ts` — `FloorPlan`, `Floor`, `Wall`, `Opening`, `FloorArea`
- `core/fml/buildFmlV3.ts` + `importFmlV3.ts` — de FML-schrijver/-lezer. Géén tweede serializer bouwen.
- `core/fml/roomtype-catalog.ts` + `opening-refid-catalog.ts`
- De **FML-editor** als correctiestoel. Een importer die 85% goed is, is bruikbaar omdat de nabewerking al bestaat.

**Niet gebruiken:**

- `extractionToPlan*`, CV-preprocess, stempel/ownership, `pdfToImage` (raster)
- `harmonizeFmlWallThickness` — quantiseert exacte IFC-diktes en maakt het resultaat slechter
- `sanitizeFmlWalls` (weld / ortho / T-X) — repareert meetruis die hier niet bestaat

De junction-pass hoeft niet aangeroepen te worden; de editor doet die al bij FML-import.

### 6.3 Uitvoeringsomgeving

`web-ifc` is WASM en draait in de browser of een web worker. **Geen backend nodig** — dat past bij de huidige client-only SPA op Cloudflare Workers. Er is geen `backend/`-map en die is voor dit plan ook niet nodig.

Aandachtspunt: dit bestand is 1,8 MB voor één woning. Een appartementencomplex is 100+ MB en dan knelt browser-only.

---

## 7. Mappingtabel FML ↔ IFC

Declaratief houden — dit is straks ook de exportspecificatie.

| FML | IFC (import) | IFC (export, later) |
|---|---|---|
| `floors[]` | `IfcBuildingStorey` (`Elevation`) | idem |
| `floor.height` | Δ elevatie of extrusiediepte | idem |
| `wall.a` / `wall.b` | `IfcShapeRepresentation('Axis','Curve2D')` → wereldcoördinaten | idem |
| `wall.thickness` | `IfcMaterialLayerSet.TotalThickness`, via instance **of** type; fallback typenaam | terug naar laagopbouw uit `wall.layers[]` |
| `wall.balance` | `OffsetFromReferenceLine` + `DirectionSense` — hier altijd een vlak (0 of 1) | idem |
| `wall.extras.az/bz` | wandtop / storeyhoogte | idem |
| `opening` (deur) | `IfcDoor.OverallWidth` / `OverallHeight`, positie via kozijn-as | `IfcDoor` + `IfcOpeningElement` + `IfcRelVoidsElement` + `IfcRelFillsElement` |
| `opening` (raam) | `IfcWindow` idem; **elk subvak een eigen object** | idem |
| opening-breedte | gat uit `IfcOpeningElement`, anders `OverallWidth` + 2 × kozijnprofiel | gat = breedte + `opening.frame` |
| `areas[].role` | `IfcSpace.LongName` → `roomtype-catalog` (reverse-lookup te bouwen) | `IfcSpace` |
| `surfaces` / Dak | `IfcRoof` / `IfcSlab .ROOF.` | idem |
| `origin.guid` | `GlobalId` van elk element | hergebruiken bij export |
| `wall.layers[]` | `IfcMaterialLayer[]` (bijv. 100-50-50-100) | laagopbouw herstellen |
| `opening.frame` | kozijnprofiel uit typenaam | kozijn terugschrijven |

De onderste drie zijn `.plg`-velden; in een FML-download landen ze in `extras` of vervallen ze.

### 7.1 Drie beslissingen die nu genomen moeten worden

1. **Bewaar `GlobalId` bij élk element** (`origin.guid`). Eén regel code per element. Geeft roundtrip-identiteit: importeren → bewerken → terugschrijven met dezelfde GUID, matchbaar tegen hun BIM. Achteraf toevoegen is voor reeds geïmporteerde bestanden te laat.
2. **Bewaar wat je weggooit** — laagopbouw, kozijnmaten, psets. Kost niets nu, onmogelijk later.
3. **Mapping in één tabel/module**, niet als losse `if`-jes in de parser.

---

## 8. Openstaande punten voor de spike

| # | Vraag | Waarom het uitmaakt |
|---|---|---|
| 1 | `balance` 0 of 1 — welke kant? Of a/b naar het hart verschuiven en 0.5 gebruiken? | Verkeerd teken = elke muur gespiegeld over zijn eigen dikte. Bij 300 mm zeer zichtbaar. |
| 2 | Gatbreedte kloppend meten (oriëntatiebug bij 4 van 11 gaten) | Fundament onder de openingsmaat. |
| 3 | Kozijn zonder gat: fallback `OverallWidth` + 2 × profiel valideren op alle 6 gevallen | Bepaalt of eis 3 haalbaar is. |
| 4 | Minimumlengte-filter voor muurfragmenten (25 mm, 70 mm) | Voorkomt degenerate FML-muren. |
| 5 | Materiaal via `IfcRelDefinesByType` naast de instance | 2 van 31 muren missen anders hun dikte. |
| 6 | Sluiten subvakken aan of overlappen ze 5 cm (eis 6)? | Visuele keuze; beide implementeerbaar. |
| 7 | Ziet pdf.js optional content groups van een AutoCAD-PDF met "Include layer information"? | Zo ja: vector + laagnamen zonder DWG-library. Grote kwaliteitssprong voor 1–2 weken. |

---

## 9. Fasering en tijdsbestek

| Fase | Inhoud | Duur |
|---|---|---|
| **0 — Spike** | `web-ifc` op dit bestand; muren + diktes + ruimtes naar FML; openen in de editor. Punten 1–6 uit §8 beantwoorden. Eén screenshot van dit huis in de FML-editor. | 3–5 dagen |
| **1 — Muren, verdiepingen, ruimtes** | `a`/`b`/dikte/balance, storeys → floors, spaces → areas + role, hoogtes, GUID's op `origin`. Nog geen openingen. Demonstreerbaar resultaat. | 2 weken |
| **1b — Deuren en ramen** | Host-matching op collineaire kozijn-as, gat of fallback, elk paneel een eigen object. | 1,5–2,5 weken |
| **1c — Dak en gevels** | `IfcRoof`/`IfcSlab .ROOF.` → Dak-design. Optioneel. | 1–2 weken |
| | **IFC totaal** | **4–6 weken** |
| **2 — DWG via PDF** | Exportinstructie voor het tekenbureau. Route bestaat al in de app. | ~0 dev |
| **3 — PDF vector + lagen** | Optioneel, ná spike-punt 7. Optional content groups uitlezen i.p.v. rasteren. | 1–2 weken |
| **4 — IFC/DWG-export** | Buiten scope van deze aanvraag. De mapping uit §7 is de voorbereiding. | later |

Uitgesloten: native DWG-parsing, DWF, AutoCAD Architecture-objecten.

---

## 10. Kosten en licenties

| Route | Licentie | Kosten |
|---|---|---|
| IFC via `web-ifc` | MPL-2.0, bedrijfsvriendelijk | **€0** |
| DXF-lezers | MIT | **€0** |
| PDF via `pdfjs-dist` | reeds in de stack | **€0** |
| ODA Drawings SDK (native DWG, web/SaaS) | Sustaining verplicht — Commercial verbiedt SaaS voor derden | $7.500 jaar 1, $4.500/jaar |
| ODA File Converter (gratis binary) | **alleen non-commercieel** | onbruikbaar |
| LibreDWG | GPL-3.0, server-side mag zonder eigen code te openen | €0, maar wisselende versiedekking en gedocumenteerde silent partial reads |
| Autodesk Platform Services | per bestand | dekt ook DWF, levert mesh i.p.v. lijnwerk |

Fase 0 t/m 3 zijn licentievrij.

---

## 11. Wat we van het tekenbureau nodig hebben

1. **Revit IFC-exportinstellingen** (bestand, twee minuten werk voor hen).
2. **Eén extra IFC** van een ander woningtype — bevestigt of de naamgevingsconventie uit §3.3 hun standaard is.
3. **Exportinstructie voor PDF** (één A4), met:
   - vector plotten, geen raster
   - **één verdieping per pagina** — lost het meervoudprobleem uit de DWG op
   - vaste schaal of 1:1 op custom papierformaat, zodat de schaal exact bekend is
   - tekst, maatlijnen en arcering op hun eigen lagen laten staan
   - "Include layer information" aan (zie §8 punt 7)

---

## 12. Risico's en verwachtingen

### Grootste risico: inputkwaliteit van een derde partij

De keten is tekenbureau → klant → wij, dus terugkoppeling is traag. Mitigatie: een **importvalidatie die vóór conversie afgaat** en in leesbare taal rapporteert — gevonden eenheden, lagen, schaalplausibiliteit, aantal muurkandidaten, ontbrekende XREFs. Dat rapport is bedoeld om door te sturen, niet als intern hulpmiddel.

### Overige risico's

| Risico | Impact | Mitigatie |
|---|---|---|
| Kozijnen zonder gat (6 van 17) | openingen op verkeerde plek | fallback via typenaam, gevalideerd in spike |
| `balance`-teken verkeerd | elke muur gespiegeld over eigen dikte | spike-punt 1 |
| Naamgevingsconventie niet standaard | classificatie valt terug op geometrie | tweede voorbeeldbestand opvragen |
| Grote modellen (100+ MB) | browser-only knelt | eerst meten; worker of chunking |
| Dak-mapping | `IfcSlab` ≠ nok + dakvlakken | apart als fase 1c |

### Wat dit **niet** wordt

- Geen native DWG, geen DWF, geen AutoCAD Architecture-objecten.
- Geen "wij ondersteunen IFC" in het algemeen — wél "wij ondersteunen de Revit-IFC's van dit bureau". Eén bestand goed krijgen is niet hetzelfde als het formaat ondersteunen.
- Geen IFC/DWG-export in deze opdracht; wel de mapping die dat later mogelijk maakt.
- Geen 100%. De FML-editor blijft de correctiestoel.

---

## 13. Besluiten uit dit gesprek

- **2026-09-09** — IFC eerst als eigen pijplijn; DWG via PDF-export op de bestaande blueprint-converter. Klant akkoord.
- **2026-09-09** — Native DWG buiten scope; DXF/PDF contractueel als invoer. Bespaart ODA Sustaining ($7.500 / $4.500).
- **2026-09-09** — Geen `harmonize` / `sanitize` op BIM-import: IFC-geometrie is exact, die stappen repareren meetruis die er niet is.
- **2026-09-09** — Elk raam en elke deur een eigen FML-object; geen bovenlicht-clustering bij import. Ombouwen kan in de editor.
- **2026-09-10** — Extra IFC-gegevens naar **getypte `.plg`-velden** (`origin.guid`, `wall.layers[]`, `opening.frame`), niet naar `extras`. FML is één van twee adapters. Zie [`plg-native-format-plan.md`](plg-native-format-plan.md).
- **2026-09-09** — Kozijnmaten niet in FML; wél bewaren voor eigen formaat en IFC-export.
- **2026-09-09** — `GlobalId` van elk IFC-element bewaren voor roundtrip-identiteit.
- **2026-09-09** — Mapping FML↔IFC declaratief in één tabel, niet in parsercode, met het oog op latere export.
