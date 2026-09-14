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
6. E1-gate in [`fml-embed-boundary.spec.ts`](../../../../frontend/tests/ui/fml-embed-boundary.spec.ts) herschrijven: `core/plg` mag `core/plan`; alleen `core/plg/fml-adapter/` mag value-imports uit `core/fml`; `core/plan` mag geen `cv/`/`ui/`/`platform/`.
7. Draai [`scripts/check-i18n-collisions.mjs`](../../../../frontend/scripts/check-i18n-collisions.mjs) met de C1-namen erin, en [`scripts/fix-mojibake.mjs`](../../../../frontend/scripts/fix-mojibake.mjs) achteraf.

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
