# Lean rapport — UI / UX workspace — 2026-07-28

## Meta

| Veld | Waarde |
|------|--------|
| Cluster | UI/UX workspace (facade, faces, visibility, exports, DevSession) |
| Scope-paden | `useWorkspace*`, faces helpers, assemble facade, view visibility |
| Status | **Done** — B1 rest + B2 stats; filter+B3 = F |
| Bron-refactor | [`../ui-ux-workspace-2026-07-25.md`](../ui-ux-workspace-2026-07-25.md) |
| Gerelateerde docs | workspace-flow |

## Samenvatting

- Na ronde 8–15: faces/exports/DevSession gesplit; lean-winst in **shared classification/persist** + stats-conventie.
- B3 auto-pass/overlay shell = F (geen code zonder apart go).

## INDEX

| Pad | ~Regels | Rol | Owners |
|-----|---------|-----|--------|
| `useWorkspace.ts` | 641 | entry wiring | flow / layer-flow |
| `assembleWorkspaceFacadeReturn.ts` | 315 | facade | flat View API |
| `useWorkspaceRoomFaces.ts` + room-faces-* | 476+ | orch | classify/finalize |
| `useWorkspaceDoorSwingFaces.ts` + door-faces-* | 472+ | orch | L11/L12 |
| `useWorkspaceWindowFaces.ts` + window-faces-* | 416+ | orch | L14 |
| `room-face-demote-guards.ts` | 37 | helper | demote |
| `faces-overrides-persist.ts` | 52 | helper | overrides→tabOutputs (deur+raam) |
| `faces-effective-classification.ts` | ~45 | helper | live class + parentMap |
| `workspace-view-visibility.ts` + `useWorkspaceViewUi` | 166+163 | UI gates | initial-detection |
| `useWorkspaceExports.ts` + export-* | 67+ | facade | downloads |
| `useWorkspaceDevSession.ts` + restore-* | 250+ | entry | session |

## Call-flow (kort)

- View → `useWorkspace` + assemble → flow gates / visibility / faces.
- Stap 3: room classify → door/window auto-pass; demote guards.
- Afronden: door snap + window bind → FML (class via `resolveEffectiveWallClassification`).
- DevSession/Exports: thin entries + helpers.

## Findings (afgehandeld)

### I — Inline duplicaat

| Item | Actie | Status |
|------|-------|--------|
| Classification resolve (door-snap vs window-bind) | → `faces-effective-classification.ts` + `applyFaceClassificationOverrides` | **Done** |
| `filterResolved*StillClassified*` generic | strip_stack breekt faceIds-only; wrapper = O | **F** |

### C — Verkeerde home

| Logica | Actie | Status |
|--------|-------|--------|
| Shared persist in `door-faces-persist` | rename → `faces-overrides-persist.ts` | **Done** |

### N — Inconsistente vorm

| Concern | Actie | Status |
|---------|-------|--------|
| Overlay stats return | raam → `{ activeHypotheses, stats }` via `syncWindowStatsFromCache` | **Done** |
| Auto-pass state fields | niet forceren | **F** |

### O — Over-abstractie

| Wrapper | Actie | Status |
|---------|-------|--------|
| `recalculateWorkspaceFaces` | inklap in useWorkspace | **Done** |

### W / F — Bewust skip

| Item | Reden |
|------|-------|
| Shared auto-pass create/should/mark | ~4 regels; pendingApply ≠ appliedDoorArcSig; wipe-hotfixes |
| Overlay-schedule shell | domain-specifiek; orch races |
| `opening-faces-refresh-shell` | zonder apart go |
| Initial-detection busy + settled latch | recent besluit |
| Flat facade keys | View contract |
| Gaps-tab hidden | half-feature |

## Batches

1. **B1** — persist rename + classification owner + O — **done**
2. **B2** — stats shape only; generic filter = **F** — **done**
3. **B3** — auto-pass/overlay shell — **F / skip**

## Niet doen

- Big-bang `useWorkspace` / flat API
- OCR in geometry-pipeline; Gaps-tab aan
- `opening-faces-refresh-shell` zonder besluit
- God-split faces om regels
- Doors D1 / windows policy opnieuw openen

## Verificatie

- [x] prune/demote specs (door + window)
- [ ] UI-smoke Project4: face demote + Deuren/Ramen stats + DevPanels

## Log

| Datum | Fase / Batch | Resultaat |
|-------|--------------|-----------|
| 2026-07-28 | INDEX/DOCUMENT/DISCUSS | inventaris |
| 2026-07-28 | Batch 1 (O) | `recalculateWorkspaceFaces` inklap in `useWorkspace` |
| 2026-07-28 | B1 rest + B2 | `faces-overrides-persist` + `faces-effective-classification`; window stats `{active,stats}`; filter+B3=F |
