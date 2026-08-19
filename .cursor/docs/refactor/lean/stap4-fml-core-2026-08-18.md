# Lean rapport — FML core — 2026-08-18

## Meta

| Veld | Waarde |
|------|--------|
| Cluster | Stap 4 FML core (`frontend/src/core/fml/`) |
| Scope-paden | `frontend/src/core/fml/**` (geen UI-preview) |
| Status | inventaris / batches open |
| Bron-refactor | [`../stap4-fml-2026-07-25.md`](../stap4-fml-2026-07-25.md) · lean B1–B4: [`stap4-fml-2026-07-28.md`](./stap4-fml-2026-07-28.md) |
| Gerelateerde docs | door-mirrored-semantics, export-options, decisions (areas/roundtrip/balance) |

## Samenvatting

- Post-B4 groei: areas/surfaces, bovenlicht fold, fixtures, roundtrip, balance, orient, scale, viewer-defaults.
- Concrete lean-winst: **I** `cloneFloorShallow` ×2; **I** opening-reproject/endpointKey ×3–4; **G**-context `fixture-symbols.ts` (~1148).
- Catalogi / keep-axis↔keep-faces / source-aware `buildFmlV3` = **F**. Geen L6/detectie.

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
| `translate-floor-plan.ts` | ~270 | nulpunt/translate | cloneFloorShallow |
| `floor-plan-orient.ts` | ~468 | flip/90° | cloneFloorShallow (dup) |
| `scale-floor-plan.ts` | ~211 | H/V rescale | muurdikte vast |
| `align-wall-junction-balance.ts` | ~620 | keep-axis flush | harmonize |
| `wall-axis-balance.ts` | ~272 | keep-faces + `rebasePlanSnap` | editor dikte |
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
- Editor: translate / orient / scale / `rebasePlanSnap` (keep-faces) / endpoint-height; overflow-hint leest `az`/`bz`.
- Import: `importFmlV3` → `foldBovenlichtOnWall` → design-sync → viewer symbolen via catalogs.
- Export: `ensureDesignsSynced` → `buildFmlV3` (source-aware envelope of workspace-rewrite).

## Findings

### I — Inline duplicaat

| Item | Locaties | Owner-voorstel | Batch | Risico |
|------|----------|----------------|-------|--------|
| `cloneFloorShallow` (~55r, byte-gelijk incl. designs) | `translate-floor-plan.ts`, `floor-plan-orient.ts` | `clone-floor-shallow.ts` of export uit translate | 1 | laag |
| `endpointKey` + `openingWorldCenter` + `projectT` + `reprojectOpenings` + lokale `cloneWall` | `align-wall-junction-balance`, `wall-axis-balance`, `orthogonalize-near-axis-walls` (+ `endpointKey` in `harmonize-…`) | `fml-wall-geom.ts` | 2 | mid |

### R — Redundant werk

| Item | Waar (dubbel) | Behoud-pad | Batch | Risico |
|------|---------------|------------|-------|--------|
| geen | — | — | — | — |

### W — Wet variant

| Locatie A | Locatie B | Consolideren? | Batch | Risico |
|-----------|-----------|---------------|-------|--------|
| Plan-entity walk translate/mirror/rotate/scale | zelfde veldenlijst | nee (alleen clone delen) | — / F | hoog |
| opening / fixture / roomtype catalog loaders | Map+JSON + domain infer | nee — geen echte copy-paste | F | — |

### O — Over-abstractie

| Wrapper | Roept alleen door naar | Actie | Batch | Risico |
|---------|------------------------|-------|-------|--------|
| `ensureDesignsSynced` | `flushActiveDesign` (beide takken) | inklappen of 1-liner documenteren | 1b | laag |

### C — Verkeerde home

| Logica | Nu in | Hoort in | Batch | Risico |
|--------|-------|----------|-------|--------|
| geen | — | — | — | — |

### N — Inconsistente vorm

| Concern | Varianten | Canonieke vorm | Batch | Risico |
|---------|-----------|----------------|-------|--------|
| `ENDPOINT_KEY_DECIMALS` | align=4, axis=3 | één const bij extract (Batch 2) | 2 | mid (gedrag) |

### D / M / H — Restanten

| Cat | Item | Actie | Batch | Risico |
|-----|------|-------|-------|--------|
| — | geen | — | — | — |

### F / P — Bewust / policy

| Item | Reden |
|------|-------|
| `align-wall-junction-balance` ↔ `wall-axis-balance` | keep-axis (flush X-01) vs keep-faces; **F tenzij dood** — beide levend |
| `buildFmlV3` source-aware roundtrip | niet herschrijven; workspace zonder source blijft rewrite |
| Catalog pattern opening/fixture/roomtype | domain verschillend; niet unificeren |
| `hasFmlSemanticSource` gate | product-F (B1–B4) |
| `fixture-symbols.ts` grootte | G-context; split alleen als navigateerbaarheid (Batch 3), niet “om regels” |

## Voorgestelde batches

1. **Batch 1 — shared `cloneFloorShallow` (+ optioneel `ensureDesignsSynced`)** (laag) — `translate-floor-plan.ts`, `floor-plan-orient.ts`, evt. `design-sync.ts` — tests: `translate-floor-plan`, `floor-plan-orient*`, roundtrip — niet: plan-transform framework.
2. **Batch 2 — wall opening-reproject helpers → `fml-wall-geom`** (mid) — align / axis / orthogonalize / harmonize endpointKey — tests: `align-wall-junction-balance`, `wall-axis-balance`, orthogonalize specs — niet: balance-semantiek mergen; decimals wijzigen alleen met golden checks.
3. **Batch 3 — `fixture-symbols` split by kind** (mid, G) — bv. `fixture-symbols/{stairs,kitchen,bath,roof,misc}.ts` + thin `buildFixtureSymbol` — tests: fixture/catalog + preview smoke — niet: kind-heuristieken retunen.
4. **Batch 4 — (skip default)** catalog base / import KNOWN-sets DRY / buildFmlV3 opsplits — alleen bij nieuw bewijs.

## Niet doen (deze ronde)

- God-split om regels; L6/detectie-tuning; `baseline.ts`
- Keep-axis + keep-faces consolideren
- `buildFmlV3` source-pad herschrijven
- Catalog-loaders unificeren zonder copy-paste-bewijs
- Plan translate/orient/scale tot één generic mapper

## Verificatie

- [ ] `npm run build` (frontend)
- [ ] gerichte tests: `tests/core/translate-floor-plan.spec.ts`, `floor-plan-orient*.spec.ts`, `align-wall-junction-balance.spec.ts`, `wall-axis-balance.spec.ts`, `fml/fml-roundtrip.spec.ts`, `fml/opening-fixture-catalog.spec.ts`, `build-fml-v3.spec.ts`
- [ ] UI-smoke (na Batch 3): FML-viewer fixtures + download roundtrip

## Log

| Datum | Fase / Batch | Resultaat |
|-------|--------------|-----------|
| 2026-08-18 | INDEX + DOCUMENT | inventaris; batches 1–3 voorgesteld |
