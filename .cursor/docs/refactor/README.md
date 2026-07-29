# Production-refactor — workspace-pipeline index

**Datum:** 2026-07-28 (sync na cleanup Batch 1–6 / ronde 18–23)  
**Status:** inventaris + advies. **Ronde 1–17 + cleanup V3-legacy/god-files gedaan** (pipelineV2Debug V3-only, naming, raster-cache, swing-hinge, faces).  
**Diepte:** B (structuur + slumber), scope C alleen waar seams UI↔CV raken.  
**Skill:** `.cursor/skills/production-refactor/SKILL.md`

## Rapporten

| # | Onderdeel | Rapport |
|---|-----------|---------|
| 1 | Stap 1 Onderlegger | [`stap1-onderlegger-2026-07-25.md`](./stap1-onderlegger-2026-07-25.md) |
| 2 | Stap 2 Voorbewerking | [`stap2-voorbewerking-2026-07-25.md`](./stap2-voorbewerking-2026-07-25.md) |
| 3 | Stap 3 Wall detectie | [`stap3-wall-detectie-2026-07-25.md`](./stap3-wall-detectie-2026-07-25.md) |
| 4 | Stap 3 Door detectie | [`stap3-door-detectie-2026-07-25.md`](./stap3-door-detectie-2026-07-25.md) |
| 5 | Stap 3 Window detectie | [`stap3-window-detectie-2026-07-25.md`](./stap3-window-detectie-2026-07-25.md) |
| 6 | Stap 4 Conversie | [`stap4-conversie-2026-07-25.md`](./stap4-conversie-2026-07-25.md) |
| 7 | Stap 4 FML | [`stap4-fml-2026-07-25.md`](./stap4-fml-2026-07-25.md) |
| 8 | UI / UX workspace | [`ui-ux-workspace-2026-07-25.md`](./ui-ux-workspace-2026-07-25.md) |

Gerelateerd (niet vervangen): [`../cv-primitive-centralization-audit.md`](../cv-primitive-centralization-audit.md), [`../workspace-flow.md`](../workspace-flow.md).

## Post-split lean/DRY pass

Na god-file/package-splits: **code** beoordelen (DRY, geen dubbel werk, juiste home) — niet opnieuw splitten om regels.

→ **[`lean/README.md`](./lean/README.md)** · skill [`.cursor/skills/lean-dry-review`](../../skills/lean-dry-review/SKILL.md)

## Consumer-chain (reverse necessity)

Apart van bovenstaande production-refactor inventaris: **wat heeft de volgende stap écht nodig?**  
Lagen/stages die output maken zonder follow-up (orphan / overlay-only / schema-ruis).

→ **[`consumer-chain/README.md`](./consumer-chain/README.md)** (leesvolgorde: Resultaat → … → stap 1)

| # | Doc |
|---|-----|
| 0 | [`consumer-chain/00-result-fml.md`](./consumer-chain/00-result-fml.md) |
| 1 | [`consumer-chain/01-walls-l0-l10.md`](./consumer-chain/01-walls-l0-l10.md) |
| 2 | [`consumer-chain/02-doors-stages.md`](./consumer-chain/02-doors-stages.md) |
| 3 | [`consumer-chain/03-windows-stages.md`](./consumer-chain/03-windows-stages.md) |
| 4 | [`consumer-chain/04-stap2-voorbewerking.md`](./consumer-chain/04-stap2-voorbewerking.md) |
| 5 | [`consumer-chain/05-stap1-onderlegger.md`](./consumer-chain/05-stap1-onderlegger.md) |

## Cross-cutting top issues

1. **God-files / orchestratie** — ~~UI faces / FML / Panel / Canvas / facade / exports / DevSession / L0 / raster-cache / swing-hinge / face-orchestrators~~ **gesplit**. L6 connector blijft F/NO-GO. Facade/`useWorkspace`/`WorkspaceView` shell OK.
2. **Legacy half-stenen na migraties** — ~~archive-V2-import~~; ~~`preprocessTab='ocr'`~~; ~~`pipelineV2Debug` dual-write / L10→L9 mirror~~ **V3-only (ronde 18)**; `composeLayers` zonder wall → lege segments; gaps/OCR layer-defaults F.
3. **Seams openings ↔ FML** — deuren/ramen in UI-refs (L11/L12/L14); deur-swing export = live L12 (fallback re-snap); sticky doorframe over window-pass; demote live-prune synchroon houden.
4. **Knip-orphans (laag risico)** — ~~ronde 1~~; ~~ronde 17~~; ~~examples-report HTML + doorframe alias (cleanup Batch 1)~~; rest o.a. L6 exports (F), `snappedBBox` (F — overlays/merge).
5. **DRY-owners grotendeels gedaan** — dual/claim/detach/adjacency/pin (audit #1–#5, #7–#10). Audit **#6** deur ink-adjacency na detach = **F** (deur-only).

## Voorgestelde bespreekvolgorde

| Ronde | Batches | Risico | Doel |
|-------|---------|--------|------|
| **1** | ~~Dead aliases + knip-orphans (alle scopes P0)~~ **gedaan 2026-07-27** | — | Slimmer lezen; geen gedrag |
| **2** | ~~Walls: archive-V2 uit `room-first`~~ **gedaan** + archief leeg (parking lot) | — | — |
| **3** | ~~Preprocess: default-tab + meetpad DRY naar `baseBw`~~ **gedaan 2026-07-27** (meten ná bake) | — | Minder migratie-ruis |
| **4** | ~~Doors: `skipDetach` + Stage-1 split + magic→const~~ **gedaan 2026-07-27** | — | Overdraagbaar Stage-1 |
| **5** | ~~Windows: evidence-filter split~~ **gedaan 2026-07-27** | — | Stage-3 lean |
| **6** | ~~Conversie: compose↔semantic documenteren + helper~~ **gedaan 2026-07-27** | — | Eerlijke stap-4 seam |
| **7** | ~~L11 snap-split~~ **gedaan 2026-07-27** | — | Overdraagbaar L11 |
| **8** | ~~UI faces-split~~ **gedaan 2026-07-27** | — | Dunne room/door/window orchestrators |
| **9** | ~~FML conversie: `extractionToPlan` + `useWorkspaceFml`~~ **gedaan 2026-07-27** | — | Lean conversie + preview/thickness |
| **10** | ~~FML editor: Toolbar / Render / Interaction~~ **gedaan 2026-07-27** | — | Lean editor cores |
| **11** | ~~FML Panel presentational~~ **gedaan 2026-07-27** (Heights/Thickness/Opacity/Actions) | — | Lean sidebar |
| **12** | ~~FML Canvas/Stage presentational~~ **gedaan 2026-07-27** | — | Lean shell + Stage children |
| **13** | ~~Facade `useWorkspace` / `WorkspaceView` slices~~ **gedaan 2026-07-27** | — | Flat keys + construction slices + View hosts |
| **14** | ~~`useWorkspaceExports` split~~ **gedaan 2026-07-28** | — | Lean entry + underlay/layer-debug/ref/deur/raam helpers |
| **15** | ~~DevSession capture/restore split~~ **gedaan 2026-07-28** | — | Lean entry + capture/restore-base/detection/flow |
| **16** | ~~L0 `room-ink-classify` split~~ **gedaan 2026-07-28** | — | mapping/effective/autoclass/render + lean barrel; TUNING; cache apart |
| **17** | ~~Consumer-chain hot-path X~~ **gedaan 2026-07-28** | — | Finalize canvases/`parallelPairs`; FML `openingBBox`; semantic length+angle; docs |
| **18** | ~~`pipelineV2Debug` V3-only~~ **gedaan 2026-07-28** | — | Stop dual-write / L10→L9 mirror; readers V3-only |
| **19** | ~~V2-naming~~ **gedaan 2026-07-28** | — | `PipelineLayerDebug`; `layer-debug-report`; `LayerDebugPanel`; `WallPipelineVersion='v3'` |
| **20** | ~~`room-raster-cache` split~~ **gedaan 2026-07-28** | — | create/dual/mutate/preview + lean barrel |
| **21** | ~~`ref-swing-hinge` split~~ **gedaan 2026-07-28** | — | geom/axis/resolve/render + lean barrel |
| **22** | ~~Face-orchestrators inkorten~~ **gedaan 2026-07-28** | — | Room/Door/Window ~476/472/416 + helpers |
| **NO-GO** | L6 Cat C, policy deur↔raam mergen, detectie-tuning, `baseline.ts` | — | Alleen met besluit |

## Architectuurconstraints (niet schenden)

- Geometry-first + per-laag preprocess (`layer-preprocess` / `layer-flow`)
- Enige muurpad: room-first + V3 L10 (`fmlReady`)
- OCR alleen `useWorkspaceOcr` — niet in `geometry-pipeline`
- `tabOutputs` alleen detectie-run; valideer `isValidTabOutput`
- Worker: `registerAllExtractors` + `canvasEnv` (geen DOM)
- Niet aanraken zonder besluit: `cv/port/baseline.ts`, spike, PREVIOUS BUILD
- `src/archive/**` = lege parking lot (zie README); geen actieve imports
- DRY-owners: zie centralization-audit — geen parallelle dual/claim/adjacency

## Inventaris-bronnen

- `inventory.ps1` scopes: workspace composables, preprocess, walls, doors, windows, pipeline, fml, pipeline-v3
- knip (frontend): 0 unused files; ~25 unused exports (L6/F + overige triage)
- Explore-pass per cluster + gerichte grep-verificatie

## Wat bewust niet gedaan (inventaris-fase)

- Geen detectie-tuning / L6 Cat C
- Spike / PREVIOUS BUILD / `.cursor/docs/archive` docs ongemoeid

## Follow-up uitgevoerd

- **2026-07-25** — `src/archive` + `tests/archive` geleegd; `room-first` V3-only; probe-scripts die archive importeerden verwijderd.
- **2026-07-27** — Docs-sync: consumer-chain + stap3-rapporten bijgewerkt na post-inventaris gedrag (geen refactor-batch-go). Zie log in de betreffende rapporten.
- **2026-07-27** — **Ronde 1:** dead aliases + knip-orphans + consumer-chain X (schema/`debugRoomWallFaces*`/`lineDetectorMode`). FML bbox-DTO’s bewust F (overlays/merge/layer-debug).
- **2026-07-27** — **Ronde 3:** `preprocessTab` default `'walls'`; diktemeting op canonieke `baseBw` ná bake (geen `runPreprocessLayer`-rebuild); sticky ocr/gaps blijft.
- **2026-07-27** — **Ronde 4:** doors `skipDetach` weg; Stage-1 split (`filter-cluster`/`filter-seed`); clipped-arc score → `DOOR_SWING_TUNING`; audit #6 F.
- **2026-07-27** — **Ronde 5:** windows `WINDOW_EVIDENCE_TUNING`; Stage-3 split (`evidence-geom`/`stack`/`framing` + lean `filterWindowsByRefEvidence`).
- **2026-07-27** — **Ronde 6:** compose↔semantic conversion-note; `ensureSemanticWallsOnTabOutputs`; `SEMANTIC_JUNCTION_EPS_PX` / `SEMANTIC_SEGMENT_CONFIDENCE` DRY.
- **2026-07-27** — **Ronde 7:** L11 `door-wall-snap` → tuning/geom/scoring/bind/doorframe/path-b + lean entry; `snapDoorsToWalls` stabiel; 25 L11 specs groen.
- **2026-07-27** — **Ronde 8:** UI faces-split — `room-face-demote-guards`; `window-faces-helpers`+`bind`; `door-faces-snap`; faces ~752/747/686; UI specs 10/10.
- **2026-07-27** — **Ronde 9:** FML conversie — `extractionToPlan` → types/geom/walls/doors/windows; `useWorkspaceFml` → generate + thickness-ui + `layer-openings-to-fml`; 33 FML specs groen.
- **2026-07-27** — **Ronde 10:** FML editor — Render types/openings/panels; Interaction pointer; Toolbar settings-child; 93 fml-preview specs; Panel later.
- **2026-07-27** — **Ronde 11:** FmlPanel → Heights/Thickness/Opacity/Actions + `fml-panel-fields.css`; import-props F; 7 UI specs; volgende = 12 Canvas/Stage.
- **2026-07-27** — **Ronde 12:** Canvas draw-previews + dead `resetView`; Stage → Walls/Openings/Fixtures/Junctions; 93 fml-preview specs; volgende = 13 facade.
- **2026-07-27** — **Ronde 13:** sticky helpers; assemble construction-slices (flat keys); View → FmlResultPanel/PreviewHost/FloorplanCanvasHost; gaps-ink persistence; 12 UI specs; volgende = 14 exports.
- **2026-07-28** — **Ronde 14:** `useWorkspaceExports` → shared/underlay/layer-debug/ref/door/window helpers; dode deps + DRY door-helpers/imageUtils; return-keys stabiel; vite build OK; volgende = DevSession / L0.
- **2026-07-28** — **Ronde 15:** `useWorkspaceDevSession` → capture/restore-base/detection/flow; dode `wallBwPreviewUrl`; return-keys + exact/replay 1:1; 16/16 dev-workspace specs; volgende = L0.
- **2026-07-28** — **Ronde 16:** `room-ink-classify` → mapping/effective/autoclass/render + lean barrel; `ROOM_INK_CLASSIFY_TUNING`; pickers DRY; `isFaceConnectedToExterior` private; refineWall F; 77 specs.
- **2026-07-28** — **Ronde 17:** consumer-chain hot-path X — finalize canvases/`parallelPairs` weg; FML-DTO zonder `openingBBox`; semantic `lengthPx`/`angleDeg` weg (`junctions` blijven voor L14); docs sync; follow-up = `pipelineV2Debug` V3-only.
- **2026-07-28** — **Stap2 Batch 3:** `ocrLayer` legacy JSDoc; `layerTuneFingerprintParts` DRY + OCR-invalidatie op wall; `layer-preprocess` → tabs/defaults/normalize + lean barrel.
- **2026-07-28** — **Stap4 Batch 3:** deur-swing export prefer live `orientedDoors`; `build-semantic-walls-v2` → `build-semantic-walls-source` + `hasFmlSemanticSource`.
- **2026-07-28** — **Cleanup Batch 1–6 / ronde 18–22:** knip (examples-report HTML, doorframe alias, bridgeMode); `pipelineV2Debug` V3-only; naming (`layer-debug-report`, `PipelineLayerDebug`); `room-raster-cache` + `ref-swing-hinge` + face-orchestrators gesplit.

## Post-inventaris gedrag (geen batch; wel docs/F)

Wijzigingen ná 2026-07-25-inventaris die architectuurkaarten/F-lijsten raken — **niet** als “refactor done” tellen:

| Thema | Impact op refactor-docs |
|-------|-------------------------|
| Wall B/W overlay + ink bake bij afronden | Stap 2 / consumer-chain 04 — al grotendeels |
| Face bbox-index + dual classEpoch | UI faces / walls — dual niet op toggle |
| Initial-detection gate + spinner | UI UX |
| Sticky doorframes / Path A–B dual / L12 framing+morph-close | Doors consumer-chain + stap3-door |
| Wall-touch + kept-mask purge + existingDoorsOnly+angle-rescue | Doors stages (G/P) |
| Window demote live-prune + Stage-3 doorframe retarget (faceIds-only) | Windows + UI |
| `arcCentroidPx` verwijderd | Consumer-chain X-orphan weg |
