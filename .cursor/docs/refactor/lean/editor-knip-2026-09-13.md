# Knip-triage — 2026-09-13 (kernel-campagne fase 1)

Scan: `npx knip` (knip 6.35.1) op `frontend/`, working tree met rename fase 0–3 ongecommit, HEAD `a02891a`.
Baseline: [`baseline-red.md`](baseline-red.md). Plan: [`editor_kernel_plugins_v2_d0e1ed1b.plan.md`](../../../plans/editor_kernel_plugins_v2_d0e1ed1b.plan.md).

## Samenvatting

> **Status: fase 1 afgerond.** Batch 1 (3 bestanden) en batch 2 (5 exports) zijn uitgevoerd — zie onderaan.

- **3 bestanden verwijderbaar** (categorie A, ~450 regels) — 1 vierde vondst bewust behouden
- **136 ongebruikte exports + 123 ongebruikte types**, waarvan **75 barrel-re-exports** — triage, geen bulk
- **1 deprecated alias** met alleen een eigen test eromheen
- **2 config-reparaties al doorgevoerd** aan `knip.json`, zonder welke deze scan onbruikbaar was

## Vooraf: de scan was kapot

Twee dingen aan [`frontend/knip.json`](../../../../frontend/knip.json) moesten eerst om, anders is het rapport gif:

1. **Entries wezen naar niet-bestaande paden.** `src/ui/fml-editor/entry.ts` en `src/ui/fml-inspect/entry.ts` heten sinds rename-fase 2 `src/ui/editor/entry.ts` en `src/ui/inspect/entry.ts`. Knip bereikte de editor dus niet vanaf een entry. Gerepareerd.
2. **`ignoreExportsUsedInFile` stond alleen op `interface` + `type`.** Daardoor rapporteerde knip 370 "unused exports", waarvan de meeste gewoon constanten zijn die binnen hun eigen bestand gebruikt worden (`STAMP_APPLY_SEGMENT_EPS_CM`, `MIN_AREA_CM2`, `AUTO_DIM_TICK_MERGE_CM`, … — steekproef bevestigde dit). Dat is een overbodig `export`-keyword, geen dode code. Op `true` gezet: 370 → **136**. De 234 die wegvielen zijn geen bevinding.

## Categorie A — verwijderen (laag risico)

| Bestand | Regels | Reden | Batch |
|---|---|---|---|
| [`src/ui/components/FloorplanToolbar.vue`](../../../../frontend/src/ui/components/FloorplanToolbar.vue) | — | Nul referenties. Staat al als schuld in [`memory.mdc`](../../../rules/memory.mdc): vervangen door de editor-topbar | 1 |
| [`src/ui/composables/plan-canvas/usePlanCanvasWallFacadeSelection.ts`](../../../../frontend/src/ui/composables/plan-canvas/usePlanCanvasWallFacadeSelection.ts) | 423 | Nul referenties buiten zichzelf. Opgevolgd door `plan-canvas-wall-facade-selection.ts` (431 regels, gebruikt door `usePlanCanvasWallSelection.ts:23`). De twee zijn **152 regels uiteengelopen**: de dode kopie heeft de bugfixes niet meegekregen | 1 |
| [`src/ui/composables/workspace/fml-rescale-from-measure.ts`](../../../../frontend/src/ui/composables/workspace/fml-rescale-from-measure.ts) | 2 | Re-export-shim naar `plan-canvas-rescale-from-measure`. Alle consumers (`PlanRescalePanel.vue`, `useEditorUnderlay.ts`, `workspace-fml-generate.ts`, de spec) importeren de echte module al direct | 1 |

Geen van de drie is een rename-artefact — `git status` bevestigt dat alle drie al vóór de rename bestonden (de facade-kopie sinds `edcaac1`).

## Categorie B — dode exports in levende bestanden

Concrete, veilige posten (nul referenties buiten hun definitie):

| Export | Bestand | Opmerking |
|---|---|---|
| `listFloorUnderlayDonors`, `listElevationUnderlayDonors` | `src/core/fml/copy-underlay-drawing.ts:146,156` | Opgevolgd door `listUnderlayReuseDonors`, dat `useEditorUnderlay.ts:106,108` wél gebruikt. Oude split-versies |
| `buildFloorJunctions` | `src/core/fml/bind-walls-to-roofs.ts:105` | Nul referenties |
| re-export `decodePlanOpeningId` / `encodePlanOpeningId` | `src/core/fml/elevation-openings.ts:26` | Consumers importeren rechtstreeks uit `opening-ids.ts`; alleen de doorgeef-regel is dood |

**75 van de 259 bevindingen zijn barrel-re-exports** in 10 `index.ts`-bestanden: `platform/selection` (20), `platform/project-store` (18), `core/diagnostics` (9), `pipeline-v3/engines/collapse` (6), `platform/upload` (6), `platform/canvas` (6), rest kleiner. **De barrels zelf blijven** — ze worden zwaar gebruikt (`@/core/diagnostics` 120 importeurs, `@/platform/selection` 37). Alleen losse namen in de export-lijst zijn ongebruikt. Dat trimmen is laag risico maar raakt 10 bestanden met matige opbrengst; voorstel: **niet in deze campagne**.

Resterende ~50 exports en 123 types zijn verspreid (`core/fml` 34, `ui/composables` 28, `cv/walls` 24 types, `platform/export` 14 types). Die vragen per stuk een oordeel — buiten de fase-1-opdracht "veilige dode files + veilige exports in editor-paden".

## Categorie D — duplicaten

| Locatie | Besluit |
|---|---|
| `plan-canvas-mods.ts:50` — `resolveWallPointerIntent` is een `@deprecated` alias voor `resolveRelocatePointerIntent` | Verwijderbaar, maar `plan-canvas-mods.spec.ts:6,54,55` test de alias. Alias weg = spec bijwerken. Batch 2 |

Los daarvan gezien tijdens fase 0: `ringArea` staat vier keer los gedefinieerd (`elevation-linework.ts`, `roof-clear-height.ts`, `roof-overlap.ts`, `plan-canvas-wall-fill.ts`), en `toClipRing` + `resolveIntersectionFn` elk twee keer (`roof-clear-height.ts`, `roof-overlap.ts`). Geen knip-bevinding (allemaal in gebruik), wel DRY-materiaal voor de lean-pass. Niet nu.

## Categorie F — bewust behouden

| Item | Reden |
|---|---|
| [`src/core/fml/test-plan-fixtures.ts`](../../../../frontend/src/core/fml/test-plan-fixtures.ts) (53 regels) | Knip noemt het dood, en dat is het letterlijk: `testOpening` / `testItem` hebben nul consumers. Maar het zijn helpers die een `Opening` met verplichte `id` + `kind` bouwen — precies wat de **108 openstaande typefouten in 28 testbestanden** nodig hebben. Dit is een half-gebouwde steen, geen dode code. Weggooien maakt die opruiming duurder |
| `frontend/scripts/patch-*.mjs` (4 stuks) | Het plan gaat ervan uit dat ze untracked zijn; ze zijn **tracked**. `patch-tests-id-kind.mjs` en `patch-remaining-refids.mjs` horen bij dezelfde onafgemaakte identiteit-cutover als hierboven. Pas weg als de fixtures om zijn |
| `ignore`-regels voor `src/archive/**` en `tests/archive/**` | Knip 6 geeft 6 "Remove from ignore"-hints, maar beide mappen bestaan. Hints zijn ruis van de v6/schema-v5-mismatch |

## Niet gedaan (bewust)

- Geen bulk-verwijdering van de 136 exports / 123 types
- Barrels niet getrimd
- `src/archive/**`, `spike/`, `examples/` niet aangeraakt
- Geen gedragswijziging; `baseline.ts` niet aangeraakt
- De 108 test-typefouten niet opgelost (eigen taak, buiten de kernel)

## Batch 1 — uitgevoerd

De drie categorie-A-bestanden zijn via `git rm` verwijderd (deletie gestaged, past bij de al gestagede renames).

- [x] `npx vue-tsc -b` — `src/` schoon, geen nieuwe fouten
- [x] `npx vitest run` — 310 bestanden, 2453 tests, **9 rood**, exact de bekende lijst uit [`baseline-red.md`](baseline-red.md)

## Batch 2 — uitgevoerd (2026-09-14)

Alle vijf posten weg. Vóór het verwijderen opnieuw op nul lezers gecontroleerd; alleen bij de re-export bleek de check nodig — `facade-elevation.ts:48` importeert `encodePlanOpeningId`, maar rechtstreeks uit `opening-ids.ts`, dus de doorgeefregel in `elevation-openings.ts` was inderdaad dood.

| Post | Bestand | Gevolg |
|---|---|---|
| `listFloorUnderlayDonors` + `listElevationUnderlayDonors` | `copy-underlay-drawing.ts` | 20 regels; beide waren `@deprecated` filters over `listUnderlayReuseDonors` |
| `buildFloorJunctions` | `bind-walls-to-roofs.ts` | 28 regels, **plus 24 regels aanhang** |
| re-export `decodePlanOpeningId` / `encodePlanOpeningId` | `elevation-openings.ts` | 1 regel |
| `resolveWallPointerIntent` (alias) | `plan-canvas-mods.ts` | 3 regels + 6 in `plan-canvas-mods.spec.ts` |

`buildFloorJunctions` was de enige lezer van een hele knoop-cluster: de types `Junction` / `JunctionRef` en de helpers `junctionKey` / `stableJunctionId`. Die stonden tussen de dak-geometrie en zien er levend uit; **de typecheck wees ze zelf aan** zodra de functie weg was. Zelfde patroon als bij de snap-extractie in fase 4b: de compiler is hier de betrouwbaarder zoeker dan grep.

- [x] `npx vue-tsc -b` — nul fouten
- [x] `npx vitest run` — 314 bestanden, **2530** tests (was 2531; de alias-test verdween mee), **dezelfde 9 rood**
- [x] `npx knip` — exports 136 → 131; het enige "dode bestand" is de bewust bewaarde `test-plan-fixtures.ts`

**Fase 1 klaar.** Wat bewust blijft liggen: de 75 barrel-re-exports, de resterende ~50 exports en 123 types, en de vier categorie-F-posten.
