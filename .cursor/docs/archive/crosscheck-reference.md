# Crosscheck – hergebruik voor BouwToFML

Referentieproject: `C:\Pranimate\Crosscheck`

Crosscheck bevat een **Crosschecker** (beeldvergelijking/kalibratie) en een **FML-converter POC** (deterministische FML-motor). BouwToFML deelt veel met de FML-converter en de CV-laag uit Crosscheck.

---

## Wat direct hergebruiken kan

### Computer vision (`src/cv/`)

| Module | Pad | Relevantie voor BouwToFML |
|--------|-----|---------------------------|
| Normalisatie | `src/cv/normalization.ts` | Voorbewerking scan (threshold, contrast) |
| Transformaties | `src/cv/transform.ts` | Schaal/rotatie, kalibratie px→m |
| Async helpers | `src/cv/async.ts` | Zware CV off main thread |
| Difference | `src/cv/difference.ts` | Minder relevant (Crosscheck-specifiek) |

### UI-patronen (Crosschecker)

| Patroon | Pad | Relevantie |
|---------|-----|------------|
| Zoom/pan op canvas | `src/tools/crosscheck/components/ImagePane.vue` | Tekening-viewer, selectievakken |
| Kalibratie-overlay | `CalibrationOverlay.vue` | Crosscheck: één kruis-rechthoek; **BouwToFML: twee H'en** (zie `v1-workflow-ui.md` §2.3) |
| View controls | `ImagePaneViewControls.vue` | Zoom/pan toolbar |
| Preferences store | `src/stores/crosscheckPreferencesStore.ts` | Slider-waarden onthouden |
| PDF laden | `pdfjs-dist` in `package.json` | PDF → afbeelding met paginaselectie (**V1 geïmplementeerd** in `platform/upload/pdfToImage.ts`) |

### FML-motor (`docs/fml-converter/Floorplan/`)

| Onderdeel | Beschrijving | BouwToFML |
|-----------|--------------|-----------|
| Intern muur-model | Wall graph: punten + lijnstukken + dikte + openingen | **Hergebruiken** (concept) |
| FML XML generator | `<lines>` + `<objects>` | **Niet** — vervangen door JSON v3 |
| FML importer | XML `.fml` → model | **Niet** — nieuwe `importFmlV3()` |
| Preview renderer | PNG overlay | **Hergebruiken** (aanpassen voor cm + openings) |

**Exportdoel:** JSON v3 `walls[]` + `openings[]` in cm — zie `examples/FML(current)/` en `fml-format.mdc`.

### Voorbeeldbestanden (BouwToFML)

| Bron | Pad |
|------|-----|
| Actuele grondwaarheid | `examples/FML(current)/` — zie `examples-inventory.md` |
| Crosscheck XML (alleen intern model-idee) | `C:\Pranimate\Crosscheck\docs\fml-converter\Floorplan\` |

---

## Stack-verschillen

| | Crosscheck | BouwToFML |
|---|-----------|-----------|
| Frontend | Vue 3 + Vite (geen Quasar) | Vue 3 + Quasar + KonvaJS |
| Backend | Geen (client-only POC) | V1: geen; V2: Fastify voor API-import |
| CV | Client-side TS + canvas (onvoldoende voor detectie) | **OpenCV client-side V1** |
| Detectie | Mask/skeleton in POC | Train-by-example **per project** + OpenCV |

Crosscheck draait als monolithische Vite-app. BouwToFML hergebruikt UI-patronen en FML-motor; detectie is nieuw (train-by-example). Pure TS-CV bleek onvoldoende — OpenCV vereist.

---

## Documentatie in Crosscheck

| Document | Pad | Inhoud |
|----------|-----|--------|
| Technische aanpak | `docs/fml-converter/TECHNICAL_APPROACH.md` | Pijplijn, multi-verdieping, state |
| Beslissingen | `docs/fml-converter/DECISIONS.md` | Stack, fasering, maatconventies |
| Cursor rules | `docs/fml-converter/Floorplan/.cursor/rules/` | fml-format, project-context, decisions |

Deze kennis is geconsolideerd in `.cursor/rules/` van BouwToFML — niet dupliceren buiten `.cursor`.

---

## Conventies overnemen (uit Crosscheck decisions)

- **Maten binnenwerks**, niet hart-op-hart
- **Muurdiktes:** buiten ~0.25 m, binnen ~0.10–0.15 m
- **X/Y apart schalen** op basis van bekende binnenmaten
- **Geen schaalbalk** als enige kalibratiemethode
- **Areas:** Floorplanner genereert ruimtes automatisch — geen `areas[]` exporteren
- **Eenheden:** vector en export in **cm** (JSON v3); API-import V2: `cm → m`

---

## Train-by-example (nieuw in BouwToFML)

Crosscheck heeft geen train-by-example flow. BouwToFML voegt toe:

- Bounding-box selectie per objecttype, **per project** (één tekeningstijl per project)
- Template matching / similarity search op basis van voorbeelden
- Sessie-gebonden (geen globale modeltraining); template opslag = V2
- Detectievolgorde: deuren/ramen (masking) → muren + knooppunten → openingen op muur
- Optionele footprint-guide voor schuine buitenmuren

OpenCV template matching en feature matching passen hier; Crosscheck `normalization.ts` levert schone input.
