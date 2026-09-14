# `fml*`-namen: triage — BESLOTEN EN UITGEVOERD (2026-09-14)

> **Besluit:** C2–C14 ja, C1 mee met fase 6, D1 = `openingMerge`, D2 = mee met de oriëntatie-rename.
> **Uitgevoerd** via [`scripts/rename-c-clusters.mjs`](../../../../frontend/scripts/rename-c-clusters.mjs): ~1000 vervangingen in 90 bestanden. Zie «Uitvoering» onderaan.
> Nog open: **C1** (dikte-catalogus + banden, 21 namen / ~215 refs) gaat mee met fase 6, en de **CSS-klassen** (`fml-fold`, `fml-rescale-*`, `fml-load-*`, …) zijn een eigen batch die hier niet in stond.

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

*(Dit is het gekozen antwoord.)*

---

## Uitvoering — 2026-09-14

**~1000 vervangingen in 90 bestanden.** Restant is nu exact drie groepen, niets anders: groep A (≈340 refs, echte adapter), C1 (≈215, wacht op fase 6) en de vijf lees-aliassen. Getoetst met een restant-scan die ook `\w*_FML_\w*` meeneemt.

> **Correctie (fase 6, 2026-09-14): «exact drie groepen» was fout.** Die restant-scan was geankerd op namen die *beginnen* met `fml` (plus de `_FML_`-reparatie), en zag daarmee een hele klasse niet: `Fml` in het **midden** van een naam. Ruim 400 refs bovenop C1, onder andere `parseFmlHex` 30, `isFmlToolbarSettingsOpen` 30, `harmonizeFmlWallThickness` 30, `ProjectFmlDefaults` 22, `sanitizeFmlWalls` 20, `FmlExtras` 58, `appliedFmlWallHeightCm` + 3 zusjes elk 19. Zelfde fout als eerder met `DEFAULT_FML_*`. Alles is meegegaan in fase 6 (120 namen, één kaart in [`phase6-name-map.mjs`](../../../../frontend/scripts/phase6-name-map.mjs)); zie [`fase6-en-css-voorwerk.md`](fase6-en-css-voorwerk.md). **Les: tel een restant nooit met een voorvoegsel-anker — meet met `Fml` op elke positie, of je onderschat de batch met een factor twee.**

### Vier dingen die ik eerst moest uitzoeken, niet renamen

1.  **i18n-sleutels vallen samen met identifiers.** Een gemiste sleutel faalt *stil*: de UI toont het pad in plaats van de tekst, en geen typecheck of test ziet dat. [`scripts/check-i18n-collisions.mjs`](../../../../frontend/scripts/check-i18n-collisions.mjs) vond vijf: `fmlOpacity`, `fmlOpacityAria`, `fmlConversion`, `fmlConversionHint`, `fmlFold`.

2.  **`fmlOpacity` betekende twee dingen.** In de prop-keten (`WorkspaceView` → `WorkspacePlanResultPanel` → `PlanPanel` → `PlanPanelOpacity`) is het een **percentage** (default 80, `{{ fmlOpacity }}%`); in `EditorView.vue` + `useEditorLoad.ts` is het een **0–1 ref** die `:content-opacity` voedt. Eén naam over beide leggen zou een schaalfout inbouwen die niemand zou zien. Nu: prop-keten → `contentOpacityPct`, editor-ref → `contentOpacity`, i18n-label → `contentOpacity` (het label is «Plattegrond», geen percentage).

3.  **Kebab-vormen: alleen ná een dubbele punt.** De regel is `(?<=:)fml-x\b`, zodat `:fml-opacity=` en `@update:fml-opacity=` meegaan maar `class="fml-fold"` en de CSS-selector `.fml-fold` niet. Dat bleek meteen nuttig: `fml-thickness-pick-tier` was wél een prop (3×), `fml-fold` puur CSS (13×).

4.  **`openingMerge` is persisted.** `fmlConversion` staat in `UserSettingsV1`, dus die vroeg dezelfde lees-alias als fase 5 (`obj.openingMerge ?? obj.fmlConversion` op beide normalisatie-ingangen), met test en omgekeerd bewijs. **Dit was ik bijna vergeten** — de rename zelf typecheckt en test groen zónder alias; alleen bestaande browsers zouden hun merge-instelling stil zien terugvallen naar fabriek.

### Twee botsingen die de typecheck ving

-   `plan-canvas-openings.ts` exporteerde dezelfde constante onder **twee** namen: `DEFAULT_FML_WINDOW_HEIGHT_CM` én een alias `DEFAULT_WINDOW_HEIGHT_CM`. Iemand had de doelnaam al vooruitgezet. De rename laat die samenvallen; het export-blok gaat van 5 regels naar 3.
-   `fmlExportPlan` → `generatedPlan` botste met een **bestaande** `generatedPlan` in hetzelfde bestand: dat is de ruwe bundel-plattegrond, terwijl `fmlExportPlan` de gehármoniseerde is (`buildPreviewFromRawBundle`). Twee verschillende dingen. Geworden: `harmonizedPlan`. Mijn voorstel `generatedPlan` in de tabel hierboven was dus fout.

### Nacontrole — 2026-09-14: twee gaten in mijn eigen aanpak

De smoke-test van de gebruiker gaf drie meldingen. Dat was reden om de rename-rondes ná de feiten te toetsen op twee foutklassen die de typecheck principieel níet ziet. Eén ervan leverde een echte bug op.

**Gat 1 — een rename kan op een naam landen die al bestaat.** In dezelfde scope is dat een redeclare-fout, maar in een *geneste* scope is het legale shadowing: stil, en de betekenis verandert. [`scripts/audit-rename-shadowing.mjs`](../../../../frontend/scripts/audit-rename-shadowing.mjs) vergelijkt per bestand de git-versie van vóór de ronde: bestond de doelnaam daar al én de oude naam? **13 treffers**, waarvan 3 al bekend (die ving de typecheck). De acht in `useWorkspace.ts` bleken onschuldig: de «bestaande» naam was telkens de property-key die al de doelnaam had (`underlaySrc: fmlUnderlaySrc` werd `underlaySrc: underlaySrc`). Fase 5: nul treffers.

**Gat 2 — een rename kan binnen een string-literal landen.** Identifiers hernoemen is veilig; strings zijn contracten met de buitenwereld. [`scripts/audit-rename-strings.mjs`](../../../../frontend/scripts/audit-rename-strings.mjs) zoekt daarop. **Één echt slachtoffer, en het was een bug:**

```ts
// vóór de C-ronde
const EDITOR_UNLOCK_STORAGE_KEY       = 'bouwToFml.editorUnlocked'
const EDITOR_UNLOCK_STORAGE_KEY_LEGACY = 'bouwToFml.fmlEditorUnlocked'
// ná de C-ronde: de terugval wees naar dezelfde sleutel als de nieuwe
```

De legacy-terugval van de editor-gate was dus dood; iedereen die de editor al ontgrendeld had, moest opnieuw `J0rd!` typen. Gerepareerd, met twee tests in [`editor-gate.spec.ts`](../../../../frontend/tests/ui/editor-gate.spec.ts) die de letterlijke oude sleutel pinnen, omgekeerd bewezen.

Bijkomend, ter afdekking van dezelfde klasse: [`scripts/check-i18n-keys.mjs`](../../../../frontend/scripts/check-i18n-keys.mjs) controleert nu dat élke `t('x.y')` in de bron in `nl`/`en`/`th` bestaat — **738 sleutels, nul ontbrekend**. De collisie-check van hierboven kijkt of een sleutel per ongeluk *mee* hernoemd wordt; deze kijkt of hij daarna nog *bestaat*. Twee kanten van dezelfde stille fout.

Wat deze nacontrole níet verklaart: de drie meldingen uit de smoke-test (schaal en B/W-drempel van het vorige project op stap 1/2, en de «niet opgeslagen»-melding bij refresh). Geen van de 13 botsingen raakt die paden. Die zijn apart onderzocht.

### CSS-klassen — GEDAAN, zie [`fase6-en-css-voorwerk.md`](fase6-en-css-voorwerk.md)

Was hier nog «te doen» met een eigen risico — [het renameplan](../../../plans/fml_naar_plan_rename_5075de5d.plan.md) noemt dat fit-chrome en gesture-ignore-lijsten op klassenaam zoeken, en een gemiste klasse faalt stil. Dat risico bleek in de huidige code niet te bestaan: **geen enkele JS-regel leest een `fml-`klassenaam** (geen `classList`, geen `closest`, geen ignore-lijst). Uitgevoerd op 2026-09-14: 146 vervangingen in 11 bestanden, 34 basisnamen `fml-*` → `plan-*`, plus `fml-panel-fields.css` → `plan-panel-fields.css`. De ruwe telling hierboven was te hoog omdat ze klassen, importpaden en kebab-props door elkaar mengde.
