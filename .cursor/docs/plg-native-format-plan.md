# Eigen planformaat `.plg` + FML en IFC als adapters

Peildatum: 2026-09-11 · Status: **GEBOUWD** (fase A–F) · Bron: gesprek 2026-08-24 → 2026-09-11

**Veld-voor-veld schema (wat het bestand is):** [`.cursor/docs/plg-specification.md`](plg-specification.md). Dit document is het waarom + de adapters. Schema wijzigen: overleg, niet stil.

Aanleiding: de losstaande editor wordt een eigen product (ander domein). FML vasthouden als intern werkmodel én als klantbestand is daar de verkeerde default. Klanten van die editor **mogen geen FML ontvangen**; FML blijft wél beschikbaar als gated import/export.

> **Naamswijziging 2026-09-10:** werknaam hernoemd naar **PLG**. Extensie **`.plg`**, schema `format: "plg-plan"`. FML-extras voor eigen concepten heten `plg*` (zie §9).

Gerelateerd: [`ifc-dwg-naar-fml-plan.md`](ifc-dwg-naar-fml-plan.md), [`fml-inspect-pwa.md`](fml-inspect-pwa.md), [`Pricing & Marketplace Strategy – Floorplan Editor.md`](Pricing%20&%20Marketplace%20Strategy%20%E2%80%93%20Floorplan%20Editor.md), [`product-idee-self-serve-plattegrond.md`](product-idee-self-serve-plattegrond.md), [`decisions.md`](decisions.md).

Zaad in code: `frontend/src/ui/editor/entry.ts`, `frontend/src/ui/inspect/entry.ts`, `plan-capabilities.ts` (`editor` / `inspect` / `detection`).

### Taal (2026-09-11)

| Context | Woord |
|---|---|
| Intern, editor-product, docs, agent-chats | **editor** + **plattegrond** / `.plg` |
| Converter-klant-UI (BouwToFML) | **FML** blijven (dat is wat de tekenaar naar Floorplanner wil) |
| FML in de editor | Alleen import/export, **per tenant** (tekenbureau aan; overige accounts uit) |
| In-memory na detectie | `previewPlan` — geen download nodig |
| Editor-URL | `/editor` (redirect vanaf `/FML-editor` / `/fml-editor/`). Shell/canvas TS is Plan/Editor; workspace + `core/fml` later |

---

## 1. Kern in het kort

| | Oordeel |
|---|---|
| **Native bestand** | Eigen **JSON**, extensie **`.plg`**, met `format` + `version`. |
| **Doel** | **Eén extensie, twee ondersteunende formats.** `.plg` is de waarheid; FML en IFC zijn adapters. |
| **Opslag in de app** | `.plg` is óók het **IDB-opslagschema** — geen apart blob-formaat. Grens in §5. |
| **Geometrie** | FML-achtig houden: wall `a→b` + dikte + balance; opening op de muur (`t`, breedte, z); floors; areas/surfaces. Geen nieuw BIM-model. |
| **FML** | Adapter, geen productidentiteit. Import = hydrateren naar `.plg`. Export = lossy projectie. |
| **IFC** | Adapter, zelfde laag als FML. Import schrijft naar het domein, **niet** naar `extras`. |
| **Losstaande editor** | Ander host-domein. Ontwikkeling pas los bij ~90% + launch. Integratie via **package**, geen iframe / hand-sync. |
| **Inspect / PWA** | Default `.plg`; **FML-upload blijft** (eenmalig hydrateren). Export-FML uit of alleen originele bytes terug. |
| **Tekenbureau** | FML-import (en export) in de editor, **per tenant/account**. |
| **Externe editor-klant** | Alleen `.plg`. Geen FML-knoppen, geen FP-refids in hun file. |

BouwToFML (converter) blijft FML-export first-class. Dat product wijzigt dit besluit niet.

---

## 2. Waarom dit moet — drie onafhankelijke redenen

### 2.1 Commercieel (doorslaggevend)

Met de huidige klant is afgesproken dat wij **FML-ondersteuning niet aan derden leveren**; zij financieren het leeuwendeel van de ontwikkeling. Zonder eigen formaat kan de losstaande editor dus niet gelanceerd worden — er is geen bestand dat we aan een externe klant mógen geven. `.plg` is daarmee een randvoorwaarde voor het editor-product, geen technische luxe.

### 2.2 Technisch — FML bewaart onze data niet betrouwbaar

Dit is geen netheidskwestie. Uit `roof-planes.ts`:

```1:4:frontend/src/core/fml/roof-planes.ts
/**
 * Dakvlakken op het sibling Dak-design (naast nok-muren).
 * GUID-lijst in settings — Floorplanner stript surface-extras soms.
 */
```

We zijn hier al een keer tegenaan gelopen en hebben het omzeild door de GUID-lijst naar `source.settings` te verplaatsen. Onze eigen gegevens overleven een rondje Floorplanner dus deels op geluk en workarounds.

### 2.3 Structureel — `extras` doet drie dingen tegelijk

Dat is de eigenlijke bron van de rommel. Eén bak, drie soorten data met tegengestelde eisen:

| Soort | Voorbeelden | In `.plg` |
|---|---|---|
| **Floorplanner-eigen (passthrough)** | `decor`, `groupMarker`, `cameras`, `project_id` | **opaque bewaren** in `foreign.fml`, nooit typen |
| **Onze extensies** | `plgFrame`, `plgSlices`, `roofPlanes`, `facadeGroups`, `bovenlichtPacked`, `floorStack`, `elevationViews`, `thicknessCms` | **getypt veld** |
| **Sessie-only** | `stampOwned` (wordt in `buildFmlV3` weer verwijderd) | **niet opslaan** |

Alleen de middelste categorie promoveert. De passthrough-bak **moet blijven bestaan**: promoveer je alles, dan kun je een klant-FML die je alleen wilde bewerken niet meer ongeschonden terugschrijven. Het bestaande `leftover` op drie niveaus (`FloorPlanSource`, `FloorSource`, `FloorDesignSource`) is daarvoor het goede patroon — in `.plg` onder een eerlijke naam.

---

## 3. Waarom FML als canonical store faalt

De editor denkt al in `FloorPlan` (`frontend/src/core/fml/types.ts`) — FML-vorm. Tegelijk groeit een eigen laag in `extras` / `settings` die Floorplanner niet als bron van waarheid heeft:

| Eigen concept | Waar het nu woont | Wringpunt |
|---|---|---|
| Gevelgroepen (multi-lid) | `settings.facadeGroups` | Native `groupMarker` wordt niet meer geschreven; download stript FP-markers |
| Nok | sibling design `Dak` + `plgRole: "ridge"` | Geen first-class object; weld/T/X bewust uit |
| Dakvlakken | `settings.roofPlanes` (GUID-lijst) | Surface-extras worden soms gestript |
| Slicer-maten | `plgSlices` (bij import gestript) | FP ziet alleen gebakken `dimensions[]` |
| Kozijn | `extras.plgFrame` | FML kent het gat, niet het kozijn |
| Bovenlicht packed | session-only + `bovenlichtPacked` | Geen FML-entity |
| Stempel | `extras.stampOwned`, groep `stamp` | Mag niet mee in klant-FML |
| Junctions | afgeleid `wallId:end` | FML heeft geen knoop-guid |
| IFC-herkomst | (nog niets) | `GlobalId` + laagopbouw hebben geen FML-plek |

Dat patroon is het bewijs: het productmodel is al groter dan FML.

---

## 4. Drie lagen

Niet "FML óf iets anders". Drie lagen:

1. **Domein** — wat de editor bewerkt (nu `FloorPlan`, later schoner: kinds i.p.v. hashes, nok/gevel/slicer first-class).
2. **Native bestand** — versioned `.plg`-JSON; default open/save én IDB-opslag.
3. **Adapters** — FML in/uit (gated), IFC in/uit (later), DXF later. Lossy mag, als het bewust is.

De editor-canvas, hit-test, sanitize, slide en aanzichten blijven op het domein. Alleen persist, catalogus en "wat is first-class" verschuiven. Geen parallel objectmodel "omdat we vrij zijn".

**Belangrijk:** het werk zit niet in het bestandsformaat maar in het **typeren**. Zodra de losse `FmlExtras`-hoekjes echte interfaces zijn (`WallElevation`, `OpeningFrame`, `RoofModel`, `FacadeGroups`, `DimensionModel`, `ThicknessCatalog`, `ProjectSettings`), is `.plg` een serializer met een header. Die typering heeft op zichzelf al waarde en past in een gewone lean/DRY-pass.

---

## 5. `.plg` als opslag — waar de grens ligt

**Besluit:** `.plg` vervangt het losse IDB-blob-schema. Eén model, één migratiepad, en "project downloaden" wordt het opslaan van wat er al staat.

Maar: de workspace-blob bevat vandaag ook **CV-werkstaat** — scan-bytes, B/W-tune, maskers, LBE-refs, `tabOutputs`, `detectionExact`. Dat is geen plan en hoort niet in een klantbestand. Een externe editor-klant kan er niets mee, het is fors in omvang, en we lopen nu al tegen quota aan (`detectionExact` wordt op de result-floor al niet meer bewaard).

Daarom een harde tweedeling:

| Deel | Inhoud | Waar |
|---|---|---|
| **`.plg`** | floors, walls, openings, areas, surfaces, dak/nok, gevelgroepen, maatlijnen, onderlegger-meta, settings, guids | bestand **en** IDB |
| **converter-sidecar** | scan-bytes, maskers, B/W-tune, refs, `tabOutputs`, detectie-cache | alleen IDB, alleen BouwToFML, verwijst naar de `.plg` |

De sidecar is converter-only en gaat nooit mee in een download. Zo blijft `.plg` klein en betekenisvol, en blijft de editor vrij van OpenCV-staat.

### Migratieplicht

Zodra `.plg` de opslag ís, is elke modelwijziging een migratie — ook zonder dat er één klantbestand bestaat, want de IDB van bestaande gebruikers is dan al `.plg`. Dus vanaf v1:

```json
{ "format": "plg-plan", "version": 1, "generator": "BouwToFML 1.x", ... }
```

met een expliciete migratieketen `v(n) → v(n+1)`. Die pijn is nu al voelbaar in het klein bij de legacy-blob met alleen `min`/`mid`/`max` voor `thicknessCms`.

---

## 6. Wat van FML blijft, wat first-class wordt

**Houden (geometrie):**

- segment `a→b` + dikte + balance
- opening op de muur (`t`, breedte, z), niet als vrij 2D-blok
- floor stack + hoogte
- area/surface als gesloten poly
- cm-float intern; eenheden alleen weergave

**First-class in `.plg` (nu FML-hoekjes):**

1. **Types, geen Floorplanner-hashes** — **GEBOUWD (2026-09-11):** domein `Opening.kind` / `FloorItem.kind` (`door.single`, `window.triple`, …) + verplicht `id` (UUID). `refid`/`guid` alleen in de FML-adapter (`opening-fml-refids` / `fixture-fml-refids`); unmapped hash → `extras.fmlRefid`. Codes D1/R1 later bij Meetstaat.
2. **Nok, dakvlak, gevelgroep, slicer** — eigen arrays. FML-export projecteert naar `designs[]` / `dimensions[]` / niks.
3. **Kozijn** — `frame` als echt veld (breedte/diepte per opening). FML kent alleen het gat; IFC kent het kozijn wél.
4. **Schema + versie** — `format` + `version`. Geen stille FP-`leftover` (cameras, `project_id`) in klant-saves. Onbegrepen FP-keys alleen in een expliciete `foreign.fml`-bag ná *onze* FML-import.
5. **Onderlegger en settings** — scan-meta, schaal, nulpunt, `unitSystem`, `planDisplayStyle`, aanzicht-onderleggers.
6. **Stabiele IDs** — **GEBOUWD:** verplicht `id` op openings/items (PWA join key = die UUID). FML-export schrijft `guid = id`. Junctions first-class pas als inspect/IFC knopen nodig heeft.
7. **Herkomst** — `origin: { kind: "ifc" | "fml" | "detection" | "manual", guid?, meta? }` per element. Zie §7.

**Niet doen:** XML (Crosscheck-historie, geen productbestand); IFC-achtig BIM als intern model; een "beter FML" dat stiekem nog FP-refids als identiteit gebruikt.

---

## 7. Adapters — één laag, drie richtingen

`.plg` is de waarheid. FML en IFC zijn beide **mappings**, gelijkwaardig, geen van beide bevoorrecht.

| Adapter | In | Uit | Verlies |
|---|---|---|---|
| **FML** | hydrateren naar `.plg`; onbegrepen keys → `foreign.fml` | lossy projectie; extensies → `extras` of weg | kozijn, slicer, nok-semantiek, IFC-herkomst |
| **IFC** | `web-ifc` → domein (zie [`ifc-dwg-naar-fml-plan.md`](ifc-dwg-naar-fml-plan.md)) | later: `.plg` → IFC4 met nette `IfcRelFillsElement` | psets, materialen buiten de laagopbouw |
| **DXF / vector-PDF** | later; hoort bij de blueprint-familie | later | — |

**Correctie op het IFC-plan:** daar staat dat de importer `GlobalId` en de laagopbouw (100-50-50-100) in `extras` moet bewaren. Met `.plg` wordt dat **getypte velden op het domein** (`origin.guid`, `wall.layers[]`); alleen de FML-serializer propt ze eventueel in `extras`. Het besluit zelf — bewaren wat je weggooit — blijft ongewijzigd.

De mappingtabel in §7 van het IFC-plan is daarmee ook de `.plg`↔IFC-tabel. Eén tabel, declaratief, zodat hij te tweaken is.

### Twee schrijvers mogen niet uit elkaar lopen

Met FML én `.plg` én later IFC als uitvoer is drift het grootste onderhoudsrisico. Borging: **roundtrip-fixtures** (`plg → model → plg` byte-identiek; `model → fml → model` semantisch gelijk) in de bestaande E2E-fixtureopzet — zie [`e2e-fixtures.md`](e2e-fixtures.md).

---

## 8. Hosts en FML-rechten

FML is een **richting + recht**, geen bestandseigenschap. Na FML-upload is het werkmodel altijd `.plg`.

```ts
type PlanIoCaps = {
  nativeRead: true
  nativeWrite: boolean      // inspect: false (of alleen observations)
  fmlImport: boolean
  fmlExport: 'none' | 'lossy'
  ifcImport?: boolean
  ifcExport?: 'none' | 'lossy'
}
```

| Tenant / host | Open/save | FML in | FML uit |
|---|---|---|---|
| Editor, externe klant | alleen `.plg` | uit | **uit** (contractueel) |
| Editor, tekenbureau | `.plg` default | aan | aan (jullie keten, lossy) |
| Inspect / PWA | observations + bevroren plan | **aan** (upload) | uit / hooguit **originele bytes** terug |
| BouwToFML converter | intern + FML-download | aan | altijd |

Inspect: `fmlImport: true`, `fmlExport: 'none'`. Als het geüploade `.fml` bewaard moet: originele blob naast observations, niet opnieuw `buildFmlV3`.

Tekenbureau-vlag op account/tenant. Zelfde package, andere caps. FML offlimit = UI + API-gate, geen tweede editor-build. `plg-fml` wél als apart package-entry zodat een publieke editor-bundle de schrijver niet hoeft te shippen.

PWA-contract blijft: subjects bij openen, join op guid + kind + floorIndex, gevel = `wallGuids[]`. Veld mag `fmlGuid` heten in v1; intern `planGuid`, alias houden. Niet hernoemen op dag 1. Bevroren plan zodra inspectie loopt: format-onafhankelijk.

---

## 9. FML-extras `plg*` (uitgevoerd 2026-09-16)

Zie [`.cursor/docs/refactor/lean/plg-fml-extras.md`](../refactor/lean/plg-fml-extras.md).

FML mag onze extensies dragen als `plgFrame` / `plgSlices` / `plgRole` / `plgOrigin` / `plgRoofSurfaceId`. `.plg` blijft getypt; `writePlg` stript die keys. Domein leest geen FML-extras meer.

| Waar | Stand |
|---|---|
| **`.plg`-schemakeys** | schoon: `slices`, `frame`, `role`, … |
| **FML-extras** | alleen `plg*` (adapter) |
| **Package/entry-namen** | `plg-core` / `plg-fml` / `plg-ui`, `@plg/plan` |

---

## 10. Package-knip (niet nu een tweede repo)

Ander domein = **hosting**. Integratie = **semver-package**. Geen iframe van `/editor`, geen hand-sync tussen repo's.

**Regel:** pas los halen wanneer ~90% van de editor erin zit **en** jullie het losse product willen lanceren. Tot die tijd één codebase; workspace/detectie mag de editor importeren, andersom nooit.

| Package (start) | Inhoud |
|---|---|
| **plg-core** | Domein, `.plg`-JSON + versie + migraties, guids |
| **plg-fml** | `importFmlV3` / `buildFmlV3` — aparte entry, tree-shakebaar |
| **plg-ifc** | `web-ifc`-adapter — aparte entry (WASM niet in de editor-bundle) |
| **plg-ui** | Canvas, editor-chrome, inspect-API (`inspectSelect`, `inspectColors`) |

Twee npm-namen volstaan om te starten (`@plg/plan` met subpaths `./fml` en `./ifc`, `@plg/ui`). Niet vijf pakketten vooraf.

| Host | Gebruikt | Niet |
|---|---|---|
| Losstaande editor (nieuw domein) | core + ui + *optioneel* fml/ifc | OpenCV, stap 1–3, converter-sidecar |
| OpnameChecklist | core + inspect + fml-import | mutate-tools, FML-schrijver in de UI |
| BouwToFML | alles + detection-preset | — |

`detection` blijft een **host-preset** van de converter, geen derde product in het package.

Zaad nu: `fml-editor/entry.ts`, `fml-inspect/entry.ts`. Eerste integratie mag path-alias / workspace-package zijn (geen publicatie verplicht). Inspect-briefing (`fml-core` + `fml-viewer`) wordt hiermee hernoemd: core is `.plg`, FML is adapter.

---

## 11. Volgorde

**Nu, zelfde repo (geen launch):**

1. **Typeren** — de `FmlExtras`-hoekjes uit §2.3 naar echte interfaces tillen. Grootste stuk werk, losse waarde, incrementeel in normale passes.
2. `.plg`-JSON benoemen (`format` + `version` + migratieketen); FML-modules als adapter behandelen.
3. **IDB omzetten** naar het `.plg`-schema, met de converter-sidecar apart (§5).
4. `PlanIoCaps` invoeren — inspect hardcoded import-aan/export-uit; editor later tenant.
5. Roundtrip-fixtures voor `.plg` en FML.
6. Importgrens: editor/inspect importeren geen `cv/` / workspace.
7. Package-entries scherp houden; nog niet publiceren.

**Bij IFC (zie [`ifc-dwg-naar-fml-plan.md`](ifc-dwg-naar-fml-plan.md)):**

8. IFC-adapter schrijft naar het domein, niet naar `extras`. Herkomst (`origin.guid`, `wall.layers[]`) als getypt veld.

**Bij launch los domein:**

9. Tweede SPA, package uit de monorepo (`apps/editor` + `packages/plg-…`).
10. Tenant: tekenbureau `fmlImport` + lossy export; overige accounts geen FML.
11. PWA: `.plg` openen + FML-upload → dezelfde hydrate.

**Pas daarna (apart team / eigen cadence):** eigen git-repo + semver. Converter en PWA pinnen een versie.

---

## 12. Buiten scope (dit besluit)

- Editor-canvas of muurgraaf herschrijven
- XML als productbestand
- FML-export-UI voor externe editor-klanten
- OpenCV / stap 1–3 in het editor-package
- CV-werkstaat in `.plg` (blijft converter-sidecar)
- `fmlGuid` hernoemen in de PWA op dag 1
- Tweede repo of iframe nú
- Native DWG/IFC als intern model (IFC blijft een adapter)

---

## 13. Besluiten

- **2026-09-16** — FML-extras hernoemd naar `plg*`; lekken dicht (domein + writePlg + slicer-bake). Zie §9.
- **2026-09-11** — Taal: intern/editor = plattegrond / `.plg`; converter-klant-UI mag FML blijven zeggen. «FML-editor» vermijden. Download serialiseert; maakt geen plan.
- **2026-09-10** — Werknaam → **PLG**; extensie `.plg`, schema `format: "plg-plan"`.
- **2026-09-10** — `.plg` wordt **ook het IDB-opslagschema**. Eén model, één migratiepad, download = opslaan wat er staat.
- **2026-09-10** — CV-werkstaat (scan, maskers, refs, `tabOutputs`, detectie-cache) blijft een **converter-sidecar** buiten `.plg`.
- **2026-09-10** — **Eén extensie, twee ondersteunende formats**: FML en IFC zijn gelijkwaardige adapters op `.plg`.
- **2026-09-10** — IFC-import schrijft naar getypte domeinvelden (`origin.guid`, `wall.layers[]`), niet naar `extras`. Corrigeert het IFC-plan.
- **2026-09-10** — `.plg`-schemakeys meteen schoon (`slices`, `frame`).
- **2026-09-10** — Versie + migratieketen vanaf v1, omdat `.plg` de opslag is en bestaande IDB dus meteen meetelt.
- **2026-09-10** — Commerciële grond: contractueel geen FML-ondersteuning aan derden; zonder `.plg` kan de losstaande editor niet gelanceerd worden.
