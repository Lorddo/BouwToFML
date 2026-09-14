# Voorwerk: fase 6 (`core/fml` → `core/plan`) en de CSS-klassen-batch

Gemeten 2026-09-14, ná rename fase 5 + de C-clusters. **Alleen lezen** — geen bronbestand aangeraakt.
Doel: beide batches zijn hierna *beslist* in plaats van gegokt.

Script: [`scripts/audit-core-fml-split.mjs`](../../../../frontend/scripts/audit-core-fml-split.mjs) (leidt de I/O-kern af uit de import-graaf, niet uit bestandsnamen).

---

## 1. Fase 6 is kleiner dan het plan suggereert: 3 blijven, 101 verhuizen

Het renameplan beschrijft `core/fml` als «102 files, domein + adapter in één map» en noemt als I/O: `importFmlV3`, `buildFmlV3`, `downloadFml`, `fml-export-safe`, `strip-floorplanner-hostile-settings`.

**Die laatste twee bestaan niet als bestand.** `stripFloorplannerHostileSettings` leeft ín `buildFmlV3.ts`. De I/O-kern is dus precies **drie bestanden**:

| Blijft in `core/fml/` | Regels |
|---|---|
| `importFmlV3.ts` | 8 relatieve imports naar buren |
| `buildFmlV3.ts` | 14 relatieve imports naar buren |
| `downloadFml.ts` | 0 |

De overige **101 bestanden gaan naar `core/plan/`**. De graaf-analyse vond **nul bestanden die exclusief onder de I/O hangen** — er is geen tussencategorie die twijfel oplevert.

### De belangrijkste uitkomst: geen cyclus

Niets in de 101 domeinbestanden importeert een van de drie I/O-bestanden. Na de splitsing loopt de afhankelijkheid dus strikt één kant op: `core/fml` (adapter) → `core/plan` (domein). Dat is precies wat de E1-gate wil, en het betekent dat er **geen re-export-shims nodig zijn** — het plan zei dat al, en dit bevestigt het.

### Omvang van de sweep

| Wat | Aantal |
|---|---|
| Import-sites `@/core/fml/...` buiten `core/fml` | 903 |
| …waarvan naar de 3 I/O-bestanden (blijven ongewijzigd) | 58 |
| **Te herschrijven naar `@/core/plan/`** | **845** |
| Bestanden met minstens één zo'n import | 331 |
| Relatieve imports binnen `core/fml` | 333 — **blijven geldig**, de 101 verhuizen samen |
| Relatieve imports in de 2 achterblijvende I/O-bestanden | 22 — moeten naar `@/core/plan/...` |

Meest gelezen modules (bepaalt waar een fout het hardst doorwerkt): `types` 300 lezers, `facade-groups` 40, `ridge-walls` 40, `roof-planes` 30, `fml-wall-geom` 29, `wall-endpoint-height` 28.

### Werkorder die hieruit volgt

1. `git mv` de 101 bestanden naar `src/core/plan/` (drie blijven staan).
2. Sweep `@/core/fml/X` → `@/core/plan/X` voor alles behalve de drie namen.
3. De 22 relatieve imports in `importFmlV3.ts` / `buildFmlV3.ts` naar `@/core/plan/...`.
4. Domeinnamen mee (`sanitize-fml-walls` → `sanitize-plan-walls`, `harmonize-fml-wall-thickness` → `harmonize-wall-thickness`, `fml-wall-geom` → `plan-wall-geom`, `fml-dimension-*` → `plan-dimension-*`) + `FmlExtras` → `PlanExtras`.
5. **C1-cluster meenemen** (dikte-catalogus + banden, ~215 refs): `fml-wall-thickness-tiers` / `-limits` / `-catalog` verhuizen hier toch al, dus dat is het goedkoopste moment.
6. E1-gate herschrijven: `core/plg` mag `core/plan`; alleen `core/plg/fml-adapter/` mag value-imports uit `core/fml`; `core/plan` mag geen `cv/`/`ui/`/`platform/`. *(Uitgevoerd, maar strakker en met twee allowlists — zie hieronder.)*
7. Draai [`scripts/check-i18n-collisions.mjs`](../../../../frontend/scripts/check-i18n-collisions.mjs) met de C1-namen erin, en [`scripts/fix-mojibake.mjs`](../../../../frontend/scripts/fix-mojibake.mjs) achteraf.

### Uitgevoerd — 2026-09-14

**104 verhuisd, 3 gebleven.** De voormeting zei 101/3 en zat er drie naast: die telling liep over `.ts`-bestanden, terwijl `core/fml` ook twee JSON-databestanden en een `fixture-symbols/`-submap had. Scripts: [`rename-phase6-move.mjs`](../../../../frontend/scripts/rename-phase6-move.mjs) + [`rename-phase6-names.mjs`](../../../../frontend/scripts/rename-phase6-names.mjs) + [`rename-phase6-relpaths.mjs`](../../../../frontend/scripts/rename-phase6-relpaths.mjs).

| Sweep | Aantal | Voorspeld |
|---|---|---|
| `@/core/fml/X` → `@/core/plan/X` | 851 | 845 |
| `../fml/X` → `../plan/X` in `core/plg` | 25 | niet voorzien |
| Relatieve imports in de blijvers | 22 | 22 |
| Identifiers + bestandspaden | 1333 in 157 bestanden | ~215 (alleen C1) |
| Relatieve sibling-imports ná de bestandsrename | 28 in 19 bestanden | niet voorzien |

**Twee soorten verwijzingen die de voormeting niet zag**, beide gevonden door de typecheck en niet door mij: de 25 `../fml/`-imports uit `core/plg` (relatief, dus buiten bereik van de alias-sweep) en de 28 sibling-imports (`./fml-wall-geom`) ná het omdopen van de tien bestanden. Beide zijn hetzelfde patroon: een sweep die op één schrijfwijze van een pad is geankerd, mist de andere. Dat is dezelfde fout als de kebab-prop in fase 4.

**`git mv` van de hele map faalt op Windows** met «Permission denied» zodra een watcher of tsserver een handle in de boom heeft. Per bestand verhuizen werkt wel. Ook de Grep/Glob-tools van de agent gaven tijdens deze batch een verouderde index (bestandsnamen van vóór fase 4); alleen `rg` via de shell was betrouwbaar.

#### De triage was incompleet: infix-namen

Mijn eerdere conclusie dat er ná de C-clusters «exact drie groepen» resteerden, was fout. Die telling was geankerd op namen die *beginnen* met `fml`, en zag daarmee een hele klasse niet: `Fml` in het midden van een naam. Voorbeelden: `parseFmlHex` 30, `isFmlToolbarSettingsOpen` 30, `harmonizeFmlWallThickness` 30, `ProjectFmlDefaults` 22, `sanitizeFmlWalls` 20, `FmlExtras` 58, `appliedFmlWallHeightCm` + 3 zusjes elk 19. Bij elkaar ruim 400 refs bovenop de 215 van C1. Zelfde fout als eerder met `DEFAULT_FML_*`: een regex-anker dat een categorie onzichtbaar maakt.

Besluit (gebruiker, 2026-09-14): **alles mee**, inclusief de UI-kant. Uitgevoerd als één kaart van **120 identifiers + 10 bestandsnamen** in [`phase6-name-map.mjs`](../../../../frontend/scripts/phase6-name-map.mjs), waar de rename-run én de twee na-audits uit lezen. Drie kopieën van zo'n kaart lopen uiteen, en dat is precies hoe een audit een echte botsing mist.

**Elke regel kreeg een teller**, zodat een naam die ik verkeerd gokte zichtbaar wordt als nul treffers. Uitkomst: alle 120 namen en alle 10 paden raakten. De 116 nul-treffers waren uitsluitend kebab-varianten van namen die geen Vue-prop zijn (vier props raakten wél).

#### Wat de audits vonden

- **Shadowing: nul** voor fase 6. Maar de audit had eerst twee eigen fouten. (1) Hij vergeleek twee git-refs terwijl het werk ongecommit was, dus hij rapporteerde «0 gewijzigde bestanden» en deed stilzwijgend niets. (2) Voor de 104 verhuisde bestanden bestond het nieuwe pad niet in de oude ref, dus die werden overgeslagen — juist de bestanden waar ook identifiers hernoemd zijn. Nu volgt hij renames via `git diff --name-status -M` en meldt hij hoeveel bestanden hij oversloeg.
- **Valse meldingen weggewerkt in de meetlat, niet in het lezen.** Bij een rename met streepjes zit de nieuwe naam ín de oude (`fml-wall-thickness-limits` bevat `wall-thickness-limits`, want `-` is geen woordteken), dus élke zo'n rename meldde een botsing met zichzelf — 29 stuks. De audit knipt nu eerst de oude naam eruit.
- **Strings: nul treffers.** Geen rename landde in een string-literal. Mooie bevestiging onderweg: de twee localStorage-sleutels heten al `bouwToFml.wallThicknessLimits` en `bouwToFml.thicknessBandBoundaries` — zónder `Fml` in de veldnaam. De code liep dus achter op de opslag; `Fml` laten vallen brengt ze in lijn.
- **i18n:** nul botsingen met de nieuwe namen, 738 sleutels compleet. **Encoding:** nul mojibake.

#### De gate werd sterker, en legde een schending bloot

`core/plg` raakt `core/fml` nu **helemaal niet meer** aan — ook `fml-adapter` niet. De type-only-uitzondering uit de oude E1-gate bestond alleen omdat het domein in `core/fml/types` woonde, en is dus dood. De regel is nu het sterkere «`core/plg` importeert `core/fml` niet, type noch value».

Nieuw gemeten en vastgezet in [`import-boundaries.spec.ts`](../../../../frontend/tests/ui/import-boundaries.spec.ts) (omgedoopt van `fml-embed-boundary.spec.ts`, 12 tests):

- het domein importeert zijn eigen adapter niet — nul, blijft nul;
- **`core/plan` reikt op vier plekken omhoog naar `ui/components/`** (`plan-canvas-openings` 3×, `plan-canvas-wall-polygons` 1×). Dezelfde verkeerd gestalde geometrie-helpers die gate stap 1 aan de andere kant vond, nu met het domein als afnemer. Bevroren allowlist: verdwijnt met de geometrie-verhuizing, groeit tot dan niet;
- alleen de detectie-brug (`extractionToPlan`, `extraction-to-plan-walls`, `layer-openings-to-plan`) mag `cv/` kennen — 5 randen, de rest van het domein nul.

Beide nieuwe regels omgekeerd bewezen: met lege allowlists faalt de gate met exact die vier respectievelijk vijf randen.

#### Testmap gespiegeld

`tests/core/fml/` bevatte 49 specs waarvan 46 `core/plan`-modules testten. Die 46 staan nu in `tests/core/plan/`; de drie echte adapter-specs (`fml-roundtrip`, `build-fml-export-safe`, `areas-surfaces-roundtrip`) blijven. Plus zeven losse specs omgedoopt met hun module. De `.fml`-fixtures blijven `.fml` — dat zijn echte FML-bestanden.

**Eindstand:** typecheck 0, 2580 tests met de bekende 9 rood, knip 129 exports / 123 types / 1 dood bestand (`test-plan-fixtures.ts`, al bekend als schuld). Eén verouderde `@lintignore` verwijderd die knip zelf als ongebruikt meldde.

---

## 2. De CSS-klassen-batch is níet risicovol — het gevreesde risico bestaat niet

Ik had deze batch apart gezet omdat het renameplan waarschuwt dat «fit-chrome en gesture-ignore-lists op classnamen zoeken» en een gemiste klasse stil faalt. **Dat is in de huidige code niet zo.** Vier controles:

1.  **Geen enkel `.ts`-bestand kent een `fml-`klassenaam.** Alle `fml-`treffers in `.ts` zijn modulepaden (`fml-adapter`, `fml-wall-thickness-tiers`), geen selectors.
2.  **De gesture-ignore-lijst bevat geen `fml-`klasse.** `PLAN_CANVAS_CHROME_SELECTOR` in [`plan-canvas-gestures.ts`](../../../../frontend/src/ui/composables/plan-canvas/plan-canvas-gestures.ts) noemt `.plan-canvas-hint`, `.canvas-toolbelt(-dock)`, `.fixture-palette(-dock)`, `.editor-topbar`, `.editor-help-modal`, `.plan-chrome-dialog`, `.editor-mod-rail`, `.item-settings`, `.elev-groups` plus de vier form-tags. Nul overlap.
3.  **Fit-chrome gebruikt geen `fml-`klasse.** `useChromeFitScale` schrijft alleen `is-chrome-compact` en leest een doorgegeven `containerSelector`.
4.  **Geen dynamisch samengestelde klassenamen.** Geen `:class`-binding en geen string-concatenatie raakt een `fml-`klasse.

Daarmee is dit een gewone zoek-en-vervang over `.vue` + `.css`. **57 unieke klassen**, ~100 verwijzingen, verspreid over 24 bestanden.

Eén echt aandachtspunt blijft: **vijf klassen staan in een gedeeld, niet-scoped stylesheet** ([`fml-panel-fields.css`](../../../../frontend/src/ui/components/fml-panel-fields.css)) en worden in andere bestanden gebruikt: `fml-fold`, `fml-limit-field`, `fml-limit-input-row`, `fml-limit-spacer`, `fml-band-hint`. Die moeten in hetzelfde pass mee als hun gebruikers, en het bestand zelf hoort mee omgedoopt (`plan-panel-fields.css`). De overige klassen staan in `<style scoped>` naast hun eigen template, dus die veranderen per definitie samen.

Zwaartepunten: `PlanRescaleOverlay.vue` 30, `PlanPanel.vue` 21, `EditorView.vue` 20, `fml-panel-fields.css` 15, `PlanPanelThickness.vue` 15, `WorkspaceView.vue` 11, `PlanMeasureOverlay.vue` 10.

### Herziene inschatting

De batch mag dus **vóór** fase 6, niet erna: hij is mechanisch, raakt geen enkel `.ts`-bestand en kan de grote map-verhuizing niet in de weg zitten. Enige onzekerheid is visueel (een vergeten selector geeft een ongestyled paneel), en dat is precies wat één smoke-test op stap 2 en stap 4 aantoont.

### Uitgevoerd — 2026-09-14

**146 vervangingen in 11 bestanden** via [`scripts/rename-css-classes.mjs`](../../../../frontend/scripts/rename-css-classes.mjs), plus `git mv fml-panel-fields.css → plan-panel-fields.css`. Typecheck 0, 995 tests met de bekende 7 rood, knip ongewijzigd (129 exports; de 2 minder zijn de editor-gate-functies die nu een test-lezer hebben).

**De inschatting van 57 klassen in 24 bestanden was te hoog.** Die telling kwam van een ruwe `fml-[a-z0-9-]+`-zoekactie, en die mengt drie dingen door elkaar: echte klassen, modulenamen in importpaden, en kebab-props. Een tussenstap loste dat op: [`scripts/classify-fml-tokens.mjs`](../../../../frontend/scripts/classify-fml-tokens.mjs) bepaalt per token of het een style-selector, een class-attribuut, een importpad of een kebab-prop is. Uitkomst: **34 basisnamen zijn echt klasse** (modifiers als `--h` / `--v` / `--preview` volgen automatisch, want `-` is geen woordteken dus de woordgrens valt achter de basisnaam).

Vijf tokens leken klasse en zijn het niet — die zouden bij een blinde sweep stil kapot zijn gegaan:

| Token | Wat het werkelijk is | Waarom het blijft |
|---|---|---|
| `fml-ref-id`, `fml-text` | kebab-props `fmlRefId` / `fmlText` | groep A: échte FML-adapter |
| `fml-band-max-boundary-cm`, `-mid-`, `fml-band-dirty` | kebab-props van het C1-cluster | C1 gaat mee met fase 6, moet in sync blijven met de camelCase-naam |
| `fml-export` | terugvalnaam van een echt `.fml`-downloadbestand | is letterlijk een FML-bestand |
| `fml-preview` | Vue `:key` | geen klasse |
| `fml-generate`, `fml-settings` | substring-artefact van `workspace-fml-generate` en `bouwtofml-settings.json` | bestaat niet als token; `\b` sluit `bouwtofml-` wél uit, `workspace-` niet |

**De meetlat die de batch bewees:** [`scripts/check-css-class-pairing.mjs`](../../../../frontend/scripts/check-css-class-pairing.mjs) vergelijkt de verzameling *gebruikte* klassen met de *gedefinieerde*, voor de hele `fml-`/`plan-`-familie. Vóór de rename: 104 gebruikt / 101 gedefinieerd, 5 wees-gebruikt en 2 wees-gedefinieerd. Ná de rename exact dezelfde aantallen en dezelfde zeven namen (nu met `plan-`). Een gemiste kant zou het verschil onmiddellijk laten zien — dat is wat een smoke-test hier niet betrouwbaar kan doen, want ongestyled is niet altijd zichtbaar. Les voor volgende keer: bouw zo'n paren-meetlat *vóór* de wijziging, niet erna.

Die meetlat had zelf eerst een fout: `_` zat niet in de tekenklasse, waardoor alle BEM-namen (`plan-toolbelt__field`) ongedefinieerd leken — 51 valse wezen. Een controle die te veel meldt is net zo onbruikbaar als een die te weinig meldt.

Niet meegenomen, bewust: de foutteksten `'fml-walls: …'` in [`plan-canvas-wall-fill.ts`](../../../../frontend/src/ui/components/plan-canvas-wall-fill.ts) (geen klasse, hoort bij geen batch) en de comments die naar de embed-pakketten `fml-editor` / `fml-inspect` verwijzen.
