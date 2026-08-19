# Lean rapport — Workspace facade / persist — 2026-08-18

## Meta

| Veld | Waarde |
|------|--------|
| Cluster | Workspace facade / persist (lean campagne cluster 3) |
| Scope | `useWorkspace`, assemble, project CRUD, FML generate |
| Status | **INDEX + DOCUMENT** — batches open (geen code) |
| Bron | ronde 8/22 faces split; [`ui-ux-workspace-2026-07-28.md`](./ui-ux-workspace-2026-07-28.md) |
| Gerelateerd | `workspace-flow.md`, `constants.ts` product-gates |

## Samenvatting

- Faces Door/Window/Room = **buiten scope** (al gesplit). Focus = flat return + project↔FML blob.
- ~15–20 **dode/weinig-gebruikte View-keys** op assemble/`useWorkspace` return (intern nog via deps).
- Project CRUD vs live FML: blob capture/hydrate is de brug; **niet** mergen met viewer-session-defaults.
- Product-gates in `constants.ts` = **F**.

## INDEX

| Pad | ~Regels | Rol | Owners |
|-----|---------|-----|--------|
| `useWorkspace.ts` | 1241 | entry wiring | flow / layer-flow |
| `assembleWorkspaceFacadeReturn.ts` | 351 | flat View API | slices → proxyRefs |
| `project/useWorkspaceProject.ts` | 839 | project CRUD + IDB + floor blob | `project-store` |
| `workspace/workspace-fml-generate.ts` | 671 | generate/preview/orient/rescale | `buildFmlV3` / import |
| `useWorkspaceFml.ts` | 183 | thin glue | generate + thickness-ui |
| `project/{types,defaults,merge,mirror}` | klein | DTO / merge | persist shape |
| `platform/project-store/*` | IDB | only as needed | quota/serialize |

## Call-flow (kort)

- View → `useWorkspace` = `assemble(...)` + **extra** project/stamp/wrappers.
- Floor-switch: `captureActiveFloorIntoBlob` (DevSession + previewPlan/nulpunt/orient) → hydrate restore.
- Result: live FML in generate; blob `generatedFloor`/`previewPlan`; project-download = `mergeFloorPlans` + `downloadProjectFml`.
- Floor defaults (`activeFloorDefaults`) ↔ UI thickness/hoogte; **los** van `viewer-session-defaults`.

## Findings

### I — Inline duplicaat

| Item | Locaties | Owner-voorstel | Batch | Risico |
|------|----------|----------------|-------|--------|
| Filename sanitize + `buildFmlV3` download | `useWorkspace.downloadProjectFml` vs generate `downloadGeneratedFml` | project-download blijft merge-pad; deel alleen sanitize/name | 2 | mid |
| Stamp serialize/hydrate | return keys **én** DevSession deps closures | alleen deps; drop public keys | 1 | laag |

### R — Redundant werk

| Item | Waar | Behoud-pad | Batch | Risico |
|------|------|------------|-------|--------|
| Flat keys die View nooit leest | assemble + post-facade return | knip View-API; intern deps houden | 1 | laag |
| `...ctx.fml` expose generate+import+copy | View gebruikt project-download via flow | behoud regenerate/preview; audit download/import/copy | 1 | mid |

**Dode/weinig-gebruikte `ws.*` (View/components geen hit; intern wél):**  
`drawingProfileId`, `showOcrDetails`, `RESULT_TAB_LABELS`, `doorSwingHypotheses`, `windowHypotheses`, `faceToolbeltHint`, `onBuildVectorDebug`, `roomInkCoverageThreshold`/`set…`, `wallsClassifyReadyForGaps`, `sourceUnderlay`, `canProceedFromProject` (flow = `projectCanProceed`), `wallStampHasInk`, `serializeWallStamp`/`hydrateWallStamp`, vermoedelijk ook `generatedPlan`/`fmlExportPlan`/`importedPlan`/`downloadGeneratedFml`/`copyGeneratedFml`/`importFmlFile` (download = `downloadProjectFml`).  
`preprocess*LayerTabs` / `showTemplates`: check View vs overlays-deps vóór knip.

### O — Over-abstractie

| Wrapper | Roept door | Actie | Batch | Risico |
|---------|------------|-------|-------|--------|
| `useWorkspaceFml` | generate + thickness | OK thin; geen extra laag | — | — |
| Post-assemble project/stamp hand-list | zelfde flat API | optioneel sliceProject/sliceStamp in assemble | 2 | mid |

### C — Verkeerde home

| Logica | Nu | Hoort | Batch | Risico |
|--------|-----|-------|-------|--------|
| Project + stamp return | `useWorkspace` na assemble | assemble-slice **of** bewust entry-only (F) | 2 | mid |
| `onConfirmScale` + `ensureSourceUnderlay` | entry override | scaleUi + project hook (nu OK) | F | — |

### N — Inconsistente vorm

| Concern | Varianten | Canoniek | Batch |
|---------|-----------|----------|-------|
| Floor FML persist | blob `previewPlan`/`generatedFloor` vs live generate refs | capture/hydrate blijft single bridge | F |
| Defaults | project floor defaults vs viewer-session-defaults | **niet mergen** zonder besluit | F |

### F / P — Bewust

| Item | Reden |
|------|-------|
| `FML_AREA_SURFACE_*` / orient / roomtag / hide-text gates | product UI uit; techniek blijft |
| Flat facade keys | View contract; geen big-bang nesten |
| Gaps/OCR/doors/windows tabs hidden | Dev-panels blijven keys nodig tot tabs weg |
| Viewer-session-defaults ≠ workspace floor defaults | aparte surfaces |

## Voorgestelde batches

1. **B1 — Dead return keys** (laag) — assemble + `useWorkspace` return; grep View/components/DevSession; knip alleen onbetwiste. Test: build + bestaande UI/workspace specs. Niet: product-gates, faces, detectie.
2. **B2 — Project/stamp slice of document F** (mid) — of keys in assemble-slices, of comment “entry-only”. Optioneel DRY project-download name helper. Niet: blob semantics / defaults-merge.
3. **B3 — FML generate surface audit** (mid/hoog) — welke generate-API View écht nodig heeft vs DevSession-only; geen gedrag. Stop vóór semantiek.

## Niet doen

- God-split `useWorkspace` / flat API herschrijven
- Faces Door/Window/Room opnieuw
- Viewer-session-defaults mergen met floor defaults
- Product-gates als dode code knippen
- Detectie-tuning / `baseline.ts`

## Verificatie (na go)

- [ ] `npm run build`
- [ ] gerichte: project/fml/workspace UI specs
- [ ] UI-smoke: floor-switch + resume + project-download + stamp

## Log

| Datum | Fase | Resultaat |
|-------|------|-----------|
| 2026-08-18 | INDEX+DOCUMENT | inventaris + B1–B3 voorstel; geen code |
