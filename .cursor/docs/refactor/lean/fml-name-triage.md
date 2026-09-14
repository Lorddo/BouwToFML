# `fml*`-namen: triage voor besluit

Opgemeten 2026-09-14 na rename fase 4, over `frontend/src` + `frontend/tests`:
**96 unieke namen, 1465 verwijzingen.** Dit is de volledige lijst — niet de steekproef uit de plantabel.

De hoofdvraag per naam is dezelfde: *gaat dit over het FML-uitwisselingsformaat, of over de plattegrond die per ongeluk een FML-naam kreeg?*

Belangrijk voor de omvang: **de 855 «plattegrond-state»-verwijzingen zijn geen 60 losse besluiten maar 14 clusters.** Per cluster één ja/nee is genoeg; ik doe de rest mechanisch.

---

## A — Echt FML, naam blijft (13 namen, 269 refs)

Geen besluit nodig tenzij je het ergens niet met me eens bent.

| Naam | Refs | Waarom blijft |
|---|---|---|
| `fmlRefId` | 150 | Floorplanner-refid op opening/fixture; leeft in de adapter |
| `fmlText` | 28 | De FML-string zelf |
| `FML_REFID_EXTRA` | 22 | Refid-catalogus |
| `FML_CONCEPT_ADAPTERS` | 12 | Adapter-registry (volgorde-gevoelig) |
| `fmlSnapshot` | 10 | E2E-snapshot van FML-uitvoer |
| `fmlImport` / `fmlExport` | 8 / 7 | `PlanIoCaps`: FML-adapterrechten per tenant |
| `FML_ALIGN_FIXTURE_KIND` / `_REFID` | 7 / 4 | Refid-catalogus |
| `fmlRefidForOpeningKind` / `...FixtureKind` | 5 / 5 | Kind → refid-maps in de adapter |
| `fmlBody` | 2 | FML-blok in het diagnoserapport |

---

## B — Persist: rename kán, maar heeft een lees-alias nodig (6 namen, 328 refs)

Dit is **rename fase 5**. Ik pak deze zelf op; ze staan hier alleen zodat je weet dat ze niet in de 855 zitten.

| Naam | Refs | Waar opgeslagen | Voorstel |
|---|---|---|---|
| `fmlViewer` | 156 | `settings.fmlViewer` | `planDisplay` |
| `setFmlNulpuntImageCm` / `fmlNulpuntImageCm` | 51 / 40 | IDB floor-blob | `setNulpuntImageCm` / `nulpuntImageCm` |
| `fmlOrient` / `setFmlOrient` | 46 / 18 | IDB floor-blob | `floorOrient` / `setFloorOrient` |
| `fmlOpacityPct` | 17 | user-settings | `contentOpacityPct` |

---

## C — Plattegrond-state met een FML-naam: 14 clusters (75 namen, 855 refs)

Per cluster één besluit. Mijn voorstel staat er al in; «ja» = ik doe hem, «nee» = naam blijft.

### C1 — Dikte-catalogus + banden (19 namen, ~215 refs) → `plan*` / `THICKNESS_*`
`fmlThicknessMinCm` `fmlThicknessMidCm` `fmlThicknessMaxCm` (+3 setters) · `fmlBandMidBoundaryCm` `fmlBandMaxBoundaryCm` (+2 setters) · `fmlBandDirty` · `FML_BAND_MID_RATIO` `FML_BAND_MAX_RATIO` `FML_BAND_MID_BOUNDARY_CM` `FML_BAND_MAX_BOUNDARY_CM` · `FML_CATALOG_MIN_HEADROOM` `FML_CATALOG_MAX_FOOTROOM` · `fmlWallThicknessLimits` · `fmlThicknessBandBoundaries`

Voorstel: `planThicknessMinCm`, `planBandMidBoundaryCm`, `THICKNESS_BAND_MID_RATIO`, enz. — het **FML_**-voorvoegsel valt weg, niet vervangen door **PLAN_** (het zijn gewoon dikte-constanten).

> Let op: vier van deze staan in `core/fml/fml-wall-thickness-tiers.ts` en `fml-wall-thickness-limits.ts`. Die bestanden gaan in **fase 6** mee (`core/fml` → `core/plan`). Efficiënter om C1 daar aan te haken dan nu apart.

JA

### C2 — Dikte-meting op de onderlegger (4 namen, ~67 refs) → `thicknessPick*`
`fmlThicknessPickTier` `fmlThicknessPickMessage` `fmlThicknessPickBusy` `FML_THICKNESS_PICK_SEARCH_CM`

JA

### C3 — Hoogte-defaults (8 namen, ~155 refs) → `plan*`
`fmlWallHeightCm` `fmlDoorHeightCm` `fmlWindowHeightCm` `fmlWindowSillZCm` + 4 setters

JA

### C4 — Bovenlicht-defaults (8 namen, ~120 refs) → `plan*`
`fmlBovenlichtDefault` `fmlWindowBovenlichtDefault` `fmlBovenlichtHeightCm` `fmlBovenlichtGapCm` + 4 setters

JA

### C5 — Herschalen (5 namen, ~115 refs) → `rescale*`
`fmlRescaleActive` `fmlRescaleState` `fmlRescaleDistanceMmX` `fmlRescaleDistanceMmY` `fmlRescaleStateFromImageHandles`

Voorstel: voorvoegsel gewoon weg (`rescaleActive`) — «rescale» zegt al genoeg.

JA

### C6 — Weergave / doorzichtigheid (5 namen, ~60 refs) → `plan*` / `content*`
`fmlOpacity` `fmlOpacityAria` `fmlContentOpacity` `fmlUnderlayOpacity` `fmlHidePlanText`

JA

### C7 — Onderlegger (2 namen, 16 refs) → voorvoegsel weg
`fmlUnderlaySrc` `fmlUnderlaySize` → `underlaySrc` / `underlaySize`

JA

### C8 — Verdieping- en plan-identiteit (4 namen, 15 refs) → voorvoegsel weg
`fmlFloorName` `fmlFloorLevel` `fmlFloorId` `fmlPlanName` → `floorName`, `floorLevel`, `floorId`, `planName`

JA

### C9 — UI-refs en panelen (5 namen, ~29 refs) → `plan*`
`fmlPreviewHostRef` `fmlToolbarRef` `fmlDevPanelVisible` `fmlFold` `fmlChromeDialogState`

Voorstel: `planCanvasHostRef`, `planToolbarRef`, `planDevPanelVisible`, `planFold`, `planChromeDialogState`.

JA

### C10 — Toolbelt + draft-commit (3 namen, 15 refs) → `PLAN_*`
`FML_EDIT_TOOLS` `FML_SELECT_TOOLS` `FML_FIELD_COMMIT_DEBOUNCE_MS` → `PLAN_EDIT_TOOLS`, `PLAN_SELECT_TOOLS`, `PLAN_FIELD_COMMIT_DEBOUNCE_MS`

JA

### C11 — Muur-balance-constanten (4 namen, 30 refs) → voorvoegsel weg
`FML_WALL_BALANCE_FALLBACK` `FML_WALL_BALANCE_MIN` `FML_WALL_BALANCE_MAX` `FML_WALL_BALANCE_ABS_MAX` → `WALL_BALANCE_*`

JA

### C12 — Detectie-uitvoer (5 namen, ~62 refs) → `plan*`
`fmlReady` `fmlStats` `fmlExportPlan` `fmlWallCount` `fmlPreview`

`fmlExportPlan` is nadrukkelijk **geen** FML: het is de geharmoniseerde gegenereerde plattegrond, onderaan de keten `editedPreviewPlan ?? importedPlan ?? fmlExportPlan`. Voorstel `generatedPlan`. `fmlStats` zit in `layer-10-plan.ts` (was `layer-10-fml.ts`) → `planStats`.

JA

### C13 — Nulpunt / stempel (2 namen, 4 refs) → voorvoegsel weg
`fmlZeroBasePx` `fmlZeroLivePx` → `zeroBasePx` / `zeroLivePx`

JA

### C14 — Editor-gate (1 naam, 1 ref) → `editorUnlocked`
`fmlEditorUnlocked`

---
JA

## D — Twee die ik echt niet voor je wil beslissen

### D1 — `fmlConversion` + `fmlConversionHint` (33 refs)

Inhoud is `{ mergeDoubleDoors: boolean, mergeMultiWindows: boolean }` in `UserSettingsV1`. Twee lezingen:

- **Het gaat over FML** — je voegt dubbele deuren samen *omdat* Floorplanner één deur wil. Dan blijft de naam.
- **Het gaat over detectie** — je voegt samen omdat de detectie twee blobs zag waar één opening zit. Dan is `openingMerge` de eerlijke naam en heeft dit niets met FML te maken.

Ik gok op de tweede (de merge draait vóór de adapter, op de plattegrond), maar dit is een productvraag. Nadeel van renamen: het is **persisted** in user-settings, dus het kost een lees-alias net als de B-groep.

JA WEG

### D2 — `fmlOrientFlipX` (9 refs)

Hangt aan `fmlOrient` uit de B-groep, maar is een **prop op `PlanPanel*.vue`**, geen opslagsleutel. Wil je props meteen meenemen met fase 5 (dan één beweging, maar fase 5 wordt groter), of pas in de C-batch? Ik zou hem bij fase 5 doen zodat `orient` in één keer consistent is.

JA

---

## Naschrift: nog een familie die mijn telling miste (9 namen, 214 refs)

`\bFML_`-patronen vinden `DEFAULT_FML_DOOR_HEIGHT_CM` niet, want tussen `_` en `F` zit geen woordgrens. Deze horen bij de clusters hierboven en gaan mee met hetzelfde besluit:

| Naam | Refs | Cluster |
|---|---|---|
| `DEFAULT_FML_DOOR_HEIGHT_CM` | 51 | C3 |
| `DEFAULT_FML_WINDOW_HEIGHT_CM` | 41 | C3 |
| `DEFAULT_FML_WINDOW_SILL_Z_CM` | 38 | C3 |
| `DEFAULT_FML_WALL_HEIGHT_CM` | 33 | C3 |
| `DEFAULT_FML_BAND_BOUNDARIES` | 28 | C1 |
| `DEFAULT_FML_WALL_THICKNESS_LIMITS` | 17 | C1 |
| `DEFAULT_FML_HELP_KEYS` | 2 | C9 |
| `DEFAULT_FML_CONTENT_OPACITY_PCT` / `_UNDERLAY_OPACITY_PCT` | 2 / 2 | **al gedaan in fase 5** |

Voorstel: `_FML` valt weg (`DEFAULT_DOOR_HEIGHT_CM`) — deze constanten zeggen niets over het uitwisselingsformaat.

Totale omvang wordt daarmee **1679 refs in 105 namen**, waarvan 269 blijven (groep A) en 340 in fase 5 zaten.

---

## Wat ik voorstel als je niets per cluster wil uitzoeken

Eén antwoord dat alles dekt: **«C1 mee met fase 6, C2–C14 allemaal ja, D1 = `openingMerge`, D2 = mee met fase 5.»**
Daarmee blijft alleen groep A over met een FML-naam, en dat is precies de bedoeling van het rename-plan: FML alleen waar het écht om het uitwisselingsformaat gaat.

JA
