# Cleanup rapport — 2026-08-18

## Samenvatting

- **0** unused files (categorie A leeg voor hele bestanden)
- **187** unused exports · **87** unused exported types (knip)
- Geen unused dependencies
- **45** source files >400 regels (top: `FmlViewerView` 1714, `useWorkspace` 1189, `useFmlPreviewInteraction` 1155, `fixture-symbols` 1148, `FmlPreviewToolbarSettings` 1057, `FmlPreviewCanvas` 1021)
- Ruwe knip: [`_knip-raw-2026-08-18.txt`](./_knip-raw-2026-08-18.txt)

Scan: `npx knip` in `frontend/` + line-count >400. Geen gedragswijziging in deze fase.

## Categorie A — verwijderen (laag risico)

| Item | Reden | Batch |
|------|-------|-------|
| *(geen)* | 0 unused files | — |

Geen hele modules verwijderen zonder apart go. Orphan **exports** → B.

## Categorie B/C — exports/barrels

### B1 — veilig unexport (na go; geen API voor View/tests)

| Package | Items (knip) | Actie |
|---------|--------------|-------|
| `window-wall-dedupe.ts` | `WINDOW_DEDUPE_*`, `DOOR_WINS_*`, interval-helpers | unexport; behoud `dedupeOverlappingBoundWindows` / `suppressWindowsNearDoors` |
| `wall-stamp-raster.ts` | `STAMP_GRAY_INK` | unexport |
| `ref-door-orient.ts` | `resolveDoorWallAxis`, `pickHeaviestFace` | unexport |
| `fml-preview-*` / openings | `ENDPOINT_SNAP_RADIUS_CM`, `distancePointToWallSegment`, `reprojectOpeningT`, `DEFAULT_FML_*` (als alleen intern) | unexport of `@lintignore` als tests |
| `core/fml` leafs | veel constants/helpers (`MIN_AREA_CM2`, bovenlicht match-consts, `wall-endpoint-height` helpers, design-sync named) | triëren: intern maken **of** F als publieke test-API |
| workspace helpers | prune/snap/bind helpers die alleen package-intern zijn | unexport |

### B2 — barrels / noise (voorzichtig)

| Item | Actie |
|------|-------|
| `cv/doors/index.ts` / `cv/windows/index.ts` star `export *` | **F** tenzij tree-shake pijn |
| `collapse/index.ts` re-exports stats helpers | unexport orphans of F |
| Unused exported **types** (87) | grotendeels F (contract / barrel) |

## Categorie D — duplicaten

| Locatie A | Locatie B | Besluit |
|-----------|-----------|---------|
| Wall/opening field draft→schedule→flush | `useFmlPreviewWallSelection` ↔ `OpeningSelection` | Cluster 1 — shared helper boven `fml-preview-draft-commit` |
| Inspect pick vs edit pick | `fml-inspect.pickInspectTarget` ↔ `useFmlPreviewPointer` | Cluster 1 — canonicaliseer of F |
| `cloneFloorShallow` | `translate-floor-plan` ↔ `floor-plan-orient` | Cluster 2 |
| Opening reproject / endpointKey | align / axis-balance / orthogonalize | Cluster 2 → `fml-wall-geom` |
| Settings heights vs ProjectSetup | twee surfaces | Cluster 4 = **geen** merge (F) |

## Categorie E — structuur

| Bestand | Voorstel |
|---------|----------|
| `useFmlPreviewInteraction.ts` (~1155) | Split inspect + keyboard + dunne facade (Cluster 1) |
| `FmlViewerView.vue` (~1714) | Extract shell: load, session-defaults, inspect panel, orient |
| `FmlPreviewToolbarSettings.vue` (~1057) | Children per selection-kind |
| `FmlPreviewCanvas.vue` (~1021) | Wire-up; alleen inkorten als Interaction dunner wordt |
| `fixture-symbols.ts` (~1148) | Split by kind (Cluster 2) |
| `useWorkspace.ts` + assemble | Dead return-keys knip (Cluster 3) |
| Face-orchestrators / L5–L10 | **Gesloten** — geen her-split |

## Categorie F — bewust behouden

| Item | Reden |
|------|-------|
| Product-gates `FML_*_VISIBLE=false` | Techniek blijft; UI uit |
| L6 connector exports + types | Historisch F |
| `baseline.ts` / `BaselineResult` | Niet aanraken |
| `hasFmlSemanticSource` gate | Product-F |
| Star-barrels doors/windows | Convenience API |
| Unused types in type-modules | Publieke contract-surface |
| `CONCEPT_WINDOW_REFID` `@lintignore` | knip tag-hint — behouden |

## Niet gedaan (bewust)

- Geen A/B unexports zonder go
- Geen god-split om regels
- Geen detectie-tuning / L6 Cat C
- Archive / spike / PREVIOUS BUILD ongemoeid
- Volledige `vitest run` niet in scan (hangt soms op Windows); knip + line-count wel

## Doorverwijzing clusters

| Cluster | Rapport |
|---------|---------|
| 1 FML editor/viewer | [`fml-editor-viewer-2026-08-18.md`](./fml-editor-viewer-2026-08-18.md) |
| 2 FML core | [`stap4-fml-core-2026-08-18.md`](./stap4-fml-core-2026-08-18.md) |
| 3 Workspace facade | [`workspace-facade-2026-08-18.md`](./workspace-facade-2026-08-18.md) |
| 4 UI panels | [`ui-panels-2026-08-18.md`](./ui-panels-2026-08-18.md) — **skip VERBETER** |
| 5 CV delta | [`cv-delta-2026-08-18.md`](./cv-delta-2026-08-18.md) |

## Verificatie

- [x] knip (exit 1 = findings; 0 unused files)
- [ ] build (na eerste VERBETER-batch)
- [ ] gerichte tests (per batch)

## Stop — go nodig

**Welke batches mag ik doen?**

1. Cleanup B1 (window-dedupe + stamp + ref-door orphans)
2. Cluster 1 batches (zie fml-editor-viewer rapport)
3. Cluster 2 / 3 / 5 B zoals in hun rapporten
4. Niets — alleen rapporten bewaren
