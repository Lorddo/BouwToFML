# Advies: raster-naar-vector technieken (muren, deuren, ramen)

> **Datum:** 2026-06-26  
> **Status:** desk research — geen POC-benchmark of code-experimenten uitgevoerd  
> **Aanleiding:** vergelijking BouwToFML met Scan2CAD, Revit-ecosysteem en vergelijkbare tools

---

## Samenvatting

Commerciële raster-naar-vector tools (Scan2CAD, PlanTracer, WiseImage) en het Revit-ecosysteem lossen hetzelfde probleem op als BouwToFML, maar met andere doelen en output. **Revit heeft geen ingebouwde scan-vectorisatie.** AutoCAD PDFIMPORT extraheert alleen bestaande vector-paden uit vector-PDF's — geen conversie van gescande tekeningen.

BouwToFML past het beste bij de categorie **train-by-example + klassieke CV** (vergelijkbaar met PlanTracer/WiseImage FM), niet bij pure lijn-tracers (Scan2CAD) en bewust niet bij AI-BIM-tools (WiseBIM, ConstructAI).

**Kernadvies:** blijf bij OpenCV + train-by-example. Leen vooral van Scan2CAD op **muurlijn-continuïteit** (gap jumping), **solid-wall polygonen** en **kwaliteitsgates** vóór detectie. Voor deuren/ramen zit BouwToFML al voor op klassieke R2V. Onderzoek daarnaast of klant-PDF's vector-paden bevatten — dat is een apart, potentieel sneller pad.

---

## Wat is wél en niet uitgevoerd

| Onderdeel | Status |
|-----------|--------|
| Desk research (publieke docs, papers, blogs) | ✓ Dit document |
| POC-benchmark Kinderdijkstraat vs Scan2CAD trial | ✗ Nog niet |
| Code-experimenten (gap-bridge, polygon mode, PDF-vector) | ✗ Nog niet |
| Apart benchmark-bestand `raster-vector-benchmark-research.md` | ✗ Vervangen door dit advies |

---

## Revit en “PDF to CAD” — verwachtingen kalibreren

### Wat Revit wél doet

- **Import/Link PDF** als 2D-referentie in een view (niet in het model verankerd als BIM-elementen).
- Gebruiker traceert handmatig met Wall, Door, Window tools over de PDF.

### Wat Revit niet doet

- Automatische raster-naar-vector conversie.
- Herkenning van muren, deuren of ramen uit een scan.

### AutoCAD PDFIMPORT (vaak verward met Revit-workflow)

- Werkt alleen op **vector-PDF's** (geëxporteerd uit CAD).
- Vertaalt paden naar lijnen, bogen, polylijnen, hatches, tekst.
- Bij **gescande** PDF's: importeert alleen een rasterafbeelding — geen bewerkbare geometrie.
- Autodesk verwijst voor scan-vectorisatie naar **Raster Design** of tools als Scan2CAD.

### Praktische workflows naar Revit

1. Scan/PDF → Scan2CAD / Raster Design → DWG → link in Revit → (eventueel) handmatig opschonen.
2. Scan/PDF in Revit → handmatig trace (standaard).
3. AI add-ins (WiseBIM, ConstructAI): cloud-detectie → Revit-elementen (muren, deuren, ramen, slabs).

**Implicatie voor BouwToFML:** wij concurreren niet met Revit-import, maar met de **tussenstap** (vectorisatie + semantische elementen) en eindigen op **FML** i.p.v. DWG of .rvt.

---

## Landschap: vier categorieën

| Categorie | Voorbeelden | Output | Relevantie BouwToFML |
|-----------|-------------|--------|----------------------|
| Klassiek R2V | Scan2CAD, WinTopo, Autodesk Raster Design | Lijnen, bogen, polygons (domme CAD) | Technieken lenen (preprocess, snap, entity typing) |
| Template + objecten | PlanTracer, WiseImage FM | Intelligente muren/deuren/ramen | **Meest vergelijkbaar** — search patterns ≈ LBE |
| PDF vector-extractie | AutoCAD PDFIMPORT, Scan2CAD PDF-modus | Bestaande paden hergebruiken | Nieuw onderzoekspad voor hybride klant-PDF's |
| AI / deep learning | WiseBIM, Raster2CAD BeesAI, ConstructAI, Raster-to-Graph | BIM-model of gelaagde CAD | Referentie-architectuur; **buiten V1-scope** |

---

## Scan2CAD — meest gedetailleerde referentie (klassieke CV)

Scan2CAD (~20 jaar incrementele ontwikkeling) werkt in twee fasen. Proprietary algoritmen zijn niet openbaar; de workflow uit documentatie is wel consistent.

### Fase A: raster cleanup (vóór vectorisatie)

Typische volgorde:

1. B&W threshold
2. Negate (zwarte lijnen op wit)
3. Rotatie + deskew
4. Smooth (kleine rafels)
5. Kwaliteitscheck (~5 px lijndikte als optimum)
6. **Thicken pixels** (gaten/dither dichten) — risico: nabije lijnen verkleven
7. Despeckle + hole fill
8. Handmatige area-erase
9. OCR char-size instellen

### Fase B: vectorisatie + object recognition

Preset-gedreven (Architectural, Mechanical, Outline, …). Architectural preset voor plattegronden:

- **Orthogonal snap** — lijnen binnen ±8° → 90°/180°
- **Corner sharpening** — scherpe hoeken
- **Gap jumping** — onderbroken lijnen verbinden tijdens trace
- **Corner / pass-thro snap** — eindpunten aan kruisingen
- **Arc recognition** — deursbogen als echte arcs, niet als korte lijnsegmenten of Bezier
- **Wall modes** — enkele lijn, parallelle lijnen, solid-block → polygon (preset 2024)
- **OCR** — tekst als bewerkbare strings, gescheiden van geometrie

Kernidee: niet alleen pixels traceren, maar **het juiste vector-primitief kiezen** (boog bij deursymbool, parallelle lijnen als muurpaar, massief als polygon).

PDF-modus is hybride: bestaande vectorlagen extraheren én rasterporties vectoriseren; “Vector Optimization” voor domme PDF-polylijnen.

---

## Vergelijkbare tools per elementtype

### Muren

| Bron | Techniek | Leerpunt |
|------|----------|----------|
| Scan2CAD | Single-line, parallel-line, solid-block → polygon | Solid-block als polygon nieuwer dan onze centerline |
| WinTopo / academisch | Thinning + Hough + contour tracing | Faalt op ruis; wij vermijden bewust pure thinning |
| Raster-to-Graph (2024) | Autoregressive graph: junctions → segments | Junction-first i.p.v. lijn-first |
| BouwToFML | Hough+LSD → renderStyle routing → wall graph | Sterk op tekeningstijl-varianten via signatures |

### Deuren

| Bron | Techniek | Leerpunt |
|------|----------|----------|
| Scan2CAD | Arc entity inference | Boog als CAD-primitive |
| PlanTracer / WiseImage FM | Template library + search patterns | Vergelijkbaar met train-by-example |
| WiseBIM / ConstructAI | AI: muren eerst, dan openingen | Vergelijkbaar met onze geometry-lbe volgorde |
| BouwToFML | Pixel-first ink-mask + gap-hybrid + arc check | Voor op klassieke R2V voor openingen |

### Ramen

| Bron | Techniek | Leerpunt |
|------|----------|----------|
| Scan2CAD | Algemene lijn/outline trace | Geen aparte raam-semantiek |
| PlanTracer | Parametrische raam-objecten uit patronen | Template library |
| BouwToFML | Gap-hybrid + innerLineCount (kozijnprofiel) | Lijnprofiel naast template — meer dan pure trace |

---

## BouwToFML: wat we al hebben

Gebaseerd op huidige codebase en `memory.mdc`:

| Techniek | Implementatie |
|----------|---------------|
| Train-by-example (3–5/type) | LBE signatures per project |
| Per-laag preprocess | `wallMat` / `doorMat` / `windowMat` |
| Ink-mask template matching | `TM_CCORR_NORMED` + inkt-mask |
| Muurgraph | snap, merge, orthogonalize (`buildWallGraph`) |
| RenderStyle inference | solid / double / hatched routing |
| Gap-detectie op muren | openingen via `findWallGaps` |
| Deur-strategieën | pixel-first (default) + gap-hybrid toggle |
| Arc-detectie | `HoughCircles` voor deuren met boog |
| OCR + tekstfilter | Tesseract + text suppress op wallMat |
| Post-align | hardline snap, masker-regeneratie |
| Output | Semantisch FML (openings op muur, refid, tags) — verder dan DXF |

**Architectuurverschil t.o.v. industrie:** Scan2CAD stopt bij CAD-primitives; BouwToFML eindigt op **semantisch FML** — dichter bij PlanTracer/WiseBIM dan bij pure Scan2CAD.

---

## Gaps — geprioriteerd advies

### Hoog — onderzoeken op POC-materiaal (Kinderdijkstraat)

| # | Gap | Advies | Rationale |
|---|-----|--------|-----------|
| 1 | **Gap jumping op muurlijnen** | Experiment: graph edge completion na morph close | Scan2CAD verbindt gebroken muurlijnen vóór trace; wij gebruiken gaps vooral voor openingen |
| 2 | **Solid-block → polygon** | A/B: polygon-outline naast centerline voor `solid_fill` | Scan2CAD 2024 preset; dikke massieve muren kunnen met centerline afwijken |
| 3 | **Vector-PDF pad** | Detecteer of PDF vector-paden heeft → apart importpad | Grote tijdwinst bij niet-gescande klant-PDF's; nu alles als raster |
| 4 | **Kwaliteitsgate** | UI-waarschuwing bij te lage resolutie / te veel ruis | Scan2CAD Step 6; voorkomt nutteloze detectiepogingen |
| 5 | **Arc in output** | Valideer of swing-boog geometrie in FML nodig is | Scan2CAD behoudt arcs; wij classificeren `hasArc` maar exporteren structureel refid |

### Medium — V2 of tuning

- Dash/hatch als entity i.p.v. skeleton-lijnen
- Post-detectie geometrie-repair UI (grab-point clusters)
- Contour mode (outer/inner footprint) als alternatief voor complexe plattegronden
- Junction combinatorial optimization (academisch: Raster-to-Graph)
- PHT deskew via hoekhistogram (MDPI hybrid paper) vs huidige rotatie in `workImage.ts`

### Laag / bewust buiten scope V1

- AI semantic segmentation (WiseBIM, ConstructAI, Raster2CAD Ultra)
- Room/space detection uit gesloten contouren
- Batch multi-page PDF API
- SHX font / PDF path inference (AutoCAD-specifiek)

---

## Aanbevolen vervolgstappen

1. **POC-benchmark** — Kinderdijkstraat + 1–2 ZIP's uit `examples/samplessourcefiles/`: muur/deur/raam recall, false positives, edit-tijd na detectie. Optioneel: Scan2CAD trial ter vergelijking (geen licentie vereist voor researchfase).
2. **Drie gerichte experimenten** (na benchmark-prioritering):
   - Muurlijn gap-bridge in `wallGraph.ts` / `wall-geometry-layer.ts`
   - Solid polygon mode in `wall-geometry-layer.ts`
   - Vector-PDF detectie bij import (nieuw pad)
3. **Besluit vector-PDF** — als >30% klant-input vector-PDF is, aparte story in roadmap; anders uitstellen.

---

## Conclusie

| Vraag | Antwoord |
|-------|----------|
| Wat doet Scan2CAD? | Agressieve raster-cleanup → preset-trace → entity recognition (arc, parallel walls, solid polygons, orthogonal snap) → DXF/DWG |
| Wat doet Revit PDF-import? | Alleen referentie; geen automatische vectorisatie |
| Waar lijkt BouwToFML op? | PlanTracer/WiseImage (templates → intelligente objecten), met eigen FML-output |
| Waar zijn we sterk? | Deuren/ramen (ink-mask, gap-hybrid, pixel-first), muurvarianten (hatched/double/solid) |
| Waar kunnen we nog winnen? | Muurlijn-continuïteit, solid polygons, vector-PDF, kwaliteitsgate |
| Moeten we AI toevoegen? | Nee voor V1 — tegen `decisions.md`; AI-tools alleen als architectuur-referentie |

---

## Bronnen

| Bron | URL / pad |
|------|-----------|
| Scan2CAD vectorization settings | https://www.scan2cad.com/blog/tips/vectorization-settings-scan2cad/ |
| Scan2CAD object recognition | https://www.scan2cad.com/blog/cad/object-recognition-in-cad/ |
| Scan2CAD wall recognition (2024) | https://www.scan2cad.com/blog/cad/simplified-accurate-conversions/ |
| Scan2CAD Real World Guide | https://update.carlsonsw.com/simplicity/archive_pdf/manuals/S2C%20RealWorldGuide.pdf |
| AutoCAD PDF import guidance | https://www.autodesk.com/blogs/autocad/pdf-import-guidance-working-with-pdf-and-autocad-dwg-data/ |
| Revit PDF import (help) | https://help.autodesk.com/cloudhelp/2024/ENU/RevitLT-WhatsNew/files/GUID-37B9576D-CA15-42BE-99A3-B4DD5BFE2A6E.htm |
| MDPI hybrid DL + rule-based | https://www.mdpi.com/2075-5309/16/5/1043 |
| Raster-to-Graph (EG 2024) | https://wutomwu.github.io/publications/2024-Raster2Graph/paper.pdf |
| BouwToFML beslissingen | `.cursor/docs/decisions.md` |
| BouwToFML CV-consultatie | `.cursor/docs/google-ai-cv-consultatie.md` |
| PlanTracer (CSoft) | https://csoft.com/products/plantracer |
