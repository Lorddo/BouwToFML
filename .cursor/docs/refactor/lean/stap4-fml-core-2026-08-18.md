# Lean rapport — FML core — 2026-08-18

## Meta

| Veld | Waarde |
|------|--------|
| Cluster | Stap 4 FML core (`frontend/src/core/fml/`) |
| Scope-paden | `frontend/src/core/fml/**` (geen UI-preview) |
| Status | Batch 1+1b+2+2b+4 done; Batch 3 fixture-symbols = **F later** |
| Bron-refactor | [`../stap4-fml-2026-07-25.md`](../stap4-fml-2026-07-25.md) · lean B1–B4: [`stap4-fml-2026-07-28.md`](./stap4-fml-2026-07-28.md) |
| Gerelateerde docs | door-mirrored-semantics, export-options, decisions (areas/roundtrip/balance) |

## Samenvatting

- Post-B4 groei: areas/surfaces, bovenlicht fold, fixtures, roundtrip, balance, orient, scale, viewer-defaults.
- Concrete lean-winst: **I** `cloneFloorShallow` ×2 → **done** (`clone-floor-shallow.ts`, `b486cc8`); **I** opening-reproject/endpointKey ×6+ → **done** Batch 2; **G** `facade-elevation` → **done** Batch 4 (`facade-elevation` + `elevation-paint` + `elevation-hit`); **G**-context `fixture-symbols.ts` (~1148) blijft F.
- Catalogi / source-aware `buildFmlV3` = **F**. `wall-axis-balance` (keep-faces) **verwijderd** (`b486cc8`) — geen lean-winst, feature weg; herstel alleen op productbesluit.
- Editor/UI-campagne 2026-08-22: [`fml-editor-2026-08-22.md`](./fml-editor-2026-08-22.md) — `windowPanelCount` → catalog; `splitPlanWallAtT` core←UI-knip (CRUD/move nog UI).

## INDEX

| Pad | ~Regels | Rol | Owners |
|-----|---------|-----|--------|
| `extractionToPlan.ts` + `extraction-to-plan-*.ts` | ~203+helpers | entry conversie | L12/L14 → plan |
| `layer-openings-to-fml.ts` | ~80 | DTO | OrientedDoor/BoundWindow |
| `buildFmlV3.ts` | ~472 | export shell | Floorplanner + source roundtrip |
| `importFmlV3.ts` | ~627 | import + extras | foldBovenlicht |
| `bovenlicht.ts` | ~232 | synth/fold/clamps | build ↔ import |
| `types.ts` | ~271 | model | Floor/Wall/Opening/… |
| `design-sync.ts` | ~86 | multi-design | flush/load/switch |
| `translate-floor-plan.ts` | ~218 | nulpunt/translate | → `clone-floor-shallow` |
| `floor-plan-orient.ts` | ~411 | flip/90° | → `clone-floor-shallow` |
| `scale-floor-plan.ts` | ~211 | H/V rescale | muurdikte vast |
| `align-wall-junction-balance.ts` | ~622 | keep-axis flush | harmonize |
| ~~`wall-axis-balance.ts`~~ | — | keep-faces | **verwijderd** 2026-08-19 |
| `orthogonalize-near-axis-walls.ts` | ~264 | near-axis snap | reproject openings |
| `harmonize-fml-wall-thickness.ts` | ~254 | dikte-pipeline | → align |
| `fml-wall-geom.ts` | ~155 | balance/normal/length | canonieke geom |
| `wall-endpoint-height.ts` | ~306 | az/bz | overflow + export |
| `opening-height-overflow.ts` | ~153 | UI-hint | wallElevationAtT |
| `fixture-symbols.ts` | ~1148 | preview shapes | **G**-kandidaat |
| `fixture-refid-catalog.ts` + json | ~144 / ~547 | fixture kinds | |
| `opening-refid-catalog.ts` + json | ~174 / ~277 | door/window kinds | |
| `roomtype-catalog.ts` + json | ~81 / ~22 | area roles | |
| `viewer-session-defaults.ts` | ~128 | viewer defaults | |
| `door-swing-symbol.ts` | ~466 | deur 2D | mirrored |
| `area-match.ts` | ~155 | area↔walls | regenerate |
| overig (tiers/limits/pick/chain/rebase/download/drawing/presets/measure/face-evidence) | ≤424 | helpers | |

## Call-flow (kort)

- Detectie → `toLayer*` → `extractionToPlanWithOrigin` → harmonize (+ align keep-axis) → `previewPlan`.
- Editor: translate / orient / scale / endpoint-height; overflow-hint leest `az`/`bz`. Keep-faces/`rebasePlanSnap` weg.
- Import: `importFmlV3` → `foldBovenlichtOnWall` → design-sync → viewer symbolen via catalogs.
- Export: `ensureDesignsSynced` → `buildFmlV3` (source-aware envelope of workspace-rewrite).

## Findings

### I — Inline duplicaat

| Item | Locaties | Owner-voorstel | Batch | Risico |
|------|----------|----------------|-------|--------|
| `cloneFloorShallow` (~55r) | was translate + orient | `clone-floor-shallow.ts` | **1 done** | — |
| `endpointKey` + `openingWorldCenter` + `projectT` + `reprojectOpenings` | align, orthogonalize, sanitize, materialize, resolve-stamp, elevation-wall-faces, UI openings | `fml-wall-geom.ts` | 2 | mid |
| `buildOpeningId` ≈ `localElevationOpeningId` | UI openings / `facade-elevation` | `opening-ids.ts` | 2b | laag |
| core→UI in `elevation-openings` (move/CRUD) | UI drag-geom + openings | core opening-ops | 2b | mid |

### R — Redundant werk

| Item | Waar (dubbel) | Behoud-pad | Batch | Risico |
|------|---------------|------------|-------|--------|
| geen | — | — | — | — |

### W — Wet variant

| Locatie A | Locatie B | Consolideren? | Batch | Risico |
|-----------|-----------|---------------|-------|--------|
| Plan-entity walk translate/mirror/rotate/scale | zelfde veldenlijst | nee (alleen clone delen) | — / F | hoog |
| opening / fixture / roomtype catalog loaders | Map+JSON + domain infer | nee — geen echte copy-paste | F | — |
| 8 cm snap named consts | elevation + plan tools | **nee** — zie snap-tabel editor-rapport | F | — |

### O — Over-abstractie

| Wrapper | Roept alleen door naar | Actie | Batch | Risico |
|---------|------------------------|-------|-------|--------|
| `ensureDesignsSynced` | `flushActiveDesign` (beide takken) | inklappen of 1-liner documenteren | 1b | laag |

### C — Verkeerde home

| Logica | Nu in | Hoort in | Batch | Risico |
|--------|-------|----------|-------|--------|
| Opening move/CRUD (elevation writes) | UI, geïmporteerd door `elevation-openings.ts` | core opening-ops | 2b | mid |
| `splitWallAtT` | was UI←core; nu `splitPlanWallAtT` + inject | **deels done** editor B5 | — | — |

### N — Inconsistente vorm

| Concern | Varianten | Canonieke vorm | Batch | Risico |
|---------|-----------|----------------|-------|--------|
| `ENDPOINT_KEY_DECIMALS` | align/ortho/harmonize=4 | één const bij extract (Batch 2) | 2 | mid (gedrag) |

### D / M / H — Restanten

| Cat | Item | Actie | Batch | Risico |
|-----|------|-------|-------|--------|
| G | `facade-elevation.ts` | **done** Batch 4 — projectie (~905) + `elevation-paint` (~179) + `elevation-hit` (~375) | 4 | — |
| — | untracked core (glyphs/ridge-edit/display-geom) | commit met product of knip | — | — |

### F / P — Bewust / policy

| Item | Reden |
|------|-------|
| keep-axis (`align-wall-junction-balance`) | levend; keep-faces-module **weg** — niet opnieuw toevoegen zonder product-go |
| `buildFmlV3` source-aware roundtrip | niet herschrijven; workspace zonder source blijft rewrite |
| Catalog pattern opening/fixture/roomtype | domain verschillend; niet unificeren |
| `hasFmlSemanticSource` gate | product-F (B1–B4) |
| `fixture-symbols.ts` grootte | G-context; split alleen als navigateerbaarheid (Batch 3), niet “om regels” |
| 8 cm snaps unificeren | F — editor-rapport snap-tabel |

## Voorgestelde batches

1. **Batch 1 — shared `cloneFloorShallow`** — **done** (`clone-floor-shallow.ts`, 2026-08-19). Optioneel 1b: `ensureDesignsSynced` inklappen — nog open.
2. **Batch 2 — wall opening-reproject helpers → `fml-wall-geom`** (mid) — align / orthogonalize / sanitize / materialize / resolve-stamp / elevation-wall-faces (+ UI openings) — tests: align, orthogonalize, stamp, sanitize — niet: balance-semantiek mergen; decimals alleen met golden checks.
3. **Batch 2b — opening-ids + core←UI knip rest** (mid) — `buildLocalOpeningId` / scope; `elevation-openings` zonder UI-imports voor move/CRUD — niet: plan≠elevation edit-API mergen.
4. **Batch 3 — `fixture-symbols` split by kind** (mid, G) — thin `buildFixtureSymbol` — niet: kind-heuristieken retunen.
5. **Batch 4 — `facade-elevation` navigateerbaarheid** — **done** 2026-08-22 (`elevation-paint` + `elevation-hit`; geen barrel).

## Niet doen (deze ronde)

- God-split om regels; L6/detectie-tuning; `baseline.ts`
- Keep-faces herstellen zonder productbesluit
- `buildFmlV3` source-pad herschrijven
- Catalog-loaders unificeren zonder copy-paste-bewijs
- Plan translate/orient/scale tot één generic mapper
- 8 cm tot één magic const

## Verificatie

- [x] Batch 1: `clone-floor-shallow` in tree; consumers translate + orient
- [ ] `npm run build` (frontend) na Batch 2+
- [ ] gerichte tests: `translate-floor-plan`, `floor-plan-orient*`, `align-wall-junction-balance`, orthogonalize/sanitize/stamp, `fml-roundtrip`, catalogs
- [ ] UI-smoke (na Batch 3): FML-viewer fixtures + download roundtrip

## Log

| Datum | Fase / Batch | Resultaat |
|-------|--------------|-----------|
| 2026-08-18 | INDEX + DOCUMENT | inventaris; batches 1–3 voorgesteld |
| 2026-08-19 | Batch 1 | `clone-floor-shallow.ts`; `wall-axis-balance` verwijderd (`b486cc8`) |
| 2026-08-22 | herziening | core-inventaris na gevels/dak/maten/stamp; batches 2/2b/4 aangescherpt; editor-campagne deelde panelCount + split-knip |
| 2026-08-22 | Batch 1b | `ensureDesignsSynced` → alleen `flushActiveDesign` |
| 2026-08-22 | Batch 2 | `wallEndpointKey` / `openingWorldCenter` / `projectOpeningT` / `reprojectWallOpenings` → `fml-wall-geom`; consumers align/ortho/sanitize/materialize/stamp/harmonize; elevation-wall-faces 3 cm-key **F** |
| 2026-08-22 | Batch 2b | `opening-ids.ts` + `opening-wall-ops` (find/move); elevation gebruikt core voor find/move/ids; add/update/remove nog UI |
| 2026-08-22 | Batch 4 | `facade-elevation` → projectie (~905); `elevation-paint` (~179); `elevation-hit` (~375); Host/spec/ridge-edit imports; build + 96 tests groen |
