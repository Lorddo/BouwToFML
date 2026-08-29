# Lean rapport — FML editor — 2026-08-27

## Meta

| Veld | Waarde |
|------|--------|
| Cluster | FML editor (UI) |
| Scope-paden | `frontend/src/ui/composables/fml-preview/**`, `useFmlPreviewEditor.ts`, `FmlElevationHost.vue`, `FmlPreviewCanvas.vue`, `FmlViewerView.vue`, `fml-viewer/**`, presentatie-core |
| Status | **E1–E8 + E7 done** (2026-08-27/28) |
| Bron-refactor | lean B1–B8 (2026-08-18/22); productie-rondes 10–12 |

## Samenvatting (na implementatie)

| Bestand | Was | Nu |
|---------|----:|---:|
| `FmlElevationHost.vue` | 3836 | **764** |
| `useFmlPreviewInteraction.ts` | 2030 | **1091** |
| `useFmlPreviewEditor.ts` | 1271 | **790** |
| `useFmlPreviewWallSelection.ts` | 1031 | **676** |
| `FmlViewerView.vue` | 2787 | **2146** |
| `FmlPreviewToolbarSettings.vue` | 829 | **721** |
| `FmlPreviewCanvas.vue` | 1972 | **1901** (+ typed props) |
| `useFmlElevationInteraction.ts` | 2520 | **556** |
| `fixture-symbols.ts` | 1148 | **shim** → map (types/kitchen/sanitary/stairs/building/index) |
| `opening-plan-symbol.ts` | 1167 | **95** (+ types/geom/door/window siblings) |
| `fml-preview-wall-polygons.ts` | 888 | **55** (+ types/fill/outline) |

## Batches gedaan

1. **E1** — ElevationHost → RenderModel + Interaction + StagePlanes/Guides/Handles
2. **E2** — Interaction → ToolCoordinator + SelectionCoordinator (flat return)
3. **E3** — Editor → undo / annotations / facade-stamp / ridge-roof
4. **E4** — WallFacadeSelection + junction-drafts + ToolbarSettingsStrips + `FmlCanvasHostProps`
5. **E5** — `useFmlViewerUnderlay` (+ underlayBox TDZ-fix voor gevels) + `FmlViewerInspectPanel`
6. **E6** — `splitPlanWallAtT` blijft plan-owner; `splitWallAtT` = geom inject; elev opening CRUD al in core
7. **E8a–c** — ElevationInteraction → DrawTools / SelectEdit / Precise
8. **E7a** — `fixture-symbols/` kind-map + thin shim (`buildFixtureSymbol` API stabiel)
9. **E7b** — opening-plan types/geom/door/window; barrel re-exports
10. **E7c** — wall fill vs outline siblings; barrel + balance helpers in `ui/components`

## Restschuld / F

- Plan-undo ≠ elevation-undo; pick-order F; snap-consts niet unificeren
- Wall-polygons blijven in `ui/components` (niet `core/fml`) — stamp + architect + ridge-floor
- Pre-existing test fail: `facade-elevation.spec` `buildFmlV3` floorStack (export-laag)
- Handmatige smoke: gevels (E8) + fixtures/architect-outline/stamp-contour (E7) — nog niet gedaan

## Verificatie

- `vue-tsc`: schoon
- Elev-suite (E8): 57/57
- E7: `opening-plan-symbol` 3/3; wall-polygons 31/31; wall-outlines 4/4; doors 28/28
- Publieke import-paden ongewijzigd
