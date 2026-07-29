# Raam-detectie flow (stap 3) + REF dual

Laatste update: 2026-07-27

Doel: inventaris van raam Stage 1–4, L14, en dual-space (floor + REF).

Gerelateerd: [`door-detection-flow.md`](./door-detection-flow.md), [`workspace-flow.md`](./workspace-flow.md), [`archive/wall-face-class-flow.md`](./archive/wall-face-class-flow.md).

---

## Verdict

Ramen starten op Muren- of Ramen-tab na classify. Pipeline: `runWindowStagePipeline({ dual })` met **`FaceDualSpace`** van `RoomRasterCache.ensureFaceDualSpace`.

**Eenmalige auto-pass** na verse classify (en opnieuw bij raam-refs / deur-arc update). **Niet** herdraaien na Inkt verwerken — `window`/`doorframe`-pins blijven staan.

Na **`prepareOpeningPipeDual`**: `pipeDual` (white parentMap/byId/adjacency herbonden; ink ongewijzigd). Stages 1–4 + overlay lezen **alleen** `pipeDual` + `WINDOW_SPACE_POLICY` (geen parallelle bbox-maps / hardcodes).

Permanente wall-state: bij push van `window`/`doorframe` ook `claimFacesInRoomRasterCache` (zelfde contract als deuren) zodat enclosed faces individuele roots blijven.

| Concern | Space | Policy-key |
|---|---|---|
| Stage 1 strip-maat / score | opening-wit | `stage1Measure` |
| Stage 1 cluster-brug | wall-ink adjacency (wit–inkt–wit via `wall-ink-bridge`) | `stage1ClusterBridge` |
| Stage 2 deurboog / doorframe | wall-ink adjacency | `stage2DoorArc` |
| Stage 3 strip_stack leden | opening-wit | `stage3StackMembers` |
| Stage 3 strip_stack brug | wall-ink | `stage3StackBridge` |
| Stage 3 framing | **either** (OR white of ink) | `stage3Framing` |
| Stage 4 glas-bbox | whiteThenInk via `dual.geom` | `stage4GlassBBox` |
| Stage 4 kozijn-bbox | inkThenWhite via `dual.geom` | `stage4FrameBBox` |
| Overlay paint | wall-ink labels | `overlayPaint` |
| REF strip / targetStripHeight | white | `refStripMeasure` |
| REF framing / rails ink | ink | `refFramingMeasure` |

Policy-constante: `frontend/src/cv/windows/window-space-policy.ts` (`WINDOW_SPACE_POLICY`) — **runtime geïmporteerd** in Stage 1–4, REF, overlay.

---

## Dual-space contract

### Floor (`FaceDualSpace`)

- Bron: `rawLabelsData` (white) + `labelsData` (ink) na classify.
- API: `frontend/src/cv/walls/rooms/face-dual-space.ts` + `ensureFaceDualSpace(cache)`.
- Zelfde FaceID → twee geoms (`dual.geom(id, prefer)` / `dual.unionBBox`); prefer via gedeelde `pickGeomByPrefer`.
- Hard-fail zonder `rawLabelsData`.
- Gedeeld met muren, deuren, ramen, probe, export.

### Pipeline-dual na detach

1. `prepareOpeningPipeDual(dual)` — seed-detach op `dual.white` + `rebindFaceDualWhite` → `pipeDual`.
2. Stage 1–4 krijgen `pipeDual` (niet losse component/wallInk-lijsten).
3. RootFaces via `rootFacesFromSpace(pipeDual.white|ink)` (`window-dual-faces.ts`).

### REF (`RefFaceDualSpace`)

- Bron: wallLayer B/W-crop (stap 2).
- White-pass: `labelWhiteFaces`; ink-pass: lokale BFS-assign (`ref-face-dual-space.ts`).
- Prefer-fallthrough = zelfde `pickGeomByPrefer` als floor (geen shared builder).
- `RefFace` / profile.faces blijven **white-default**; `profile.dual` biedt beide.
- `analyzeWindowAxelRef`: strips = `refStripMeasure` (white); framing/rails = `refFramingMeasure` (ink).
- `analyzeDoorSwingRef`: swing-sector = white; framing-sizing = ink faces.

---

## Stages (kort)

1. **Stage 1** — `runWindowAxelFilter({ dual })` — axel/strip op white; clustering via ink-brug (`areLinkedViaWallInkBridge` in `walls/rooms/wall-ink-bridge.ts`; geom gates lokaal in `window-axel-cluster`).
2. **Stage 2** — deurboog-touch → doorframe-kandidaten (ink adjacency).
3. **Stage 3** — `filterWindowsByRefEvidence({ dual })` — strip_stack of framing OR; doorframe framing-only. Modules: `window-evidence-filter` (orchestratie) + `geom` / `stack` / `framing`; ratios in `WINDOW_EVIDENCE_TUNING` (geen policy-merge met space-keys).
4. **Stage 4** — `resolveWindowCandidates({ dual })` — glas/kozijn bbox via policy prefers → class push.
5. **L14** — bind + merge → FML windows.

UI: `useWorkspaceWindowFaces` — overlay = `pipeDual.ink.labelsData`.

---

## Doorframe

Stage 2 adjacency → Stage 3 framing-only → aparte Stage 4 lijst; class `doorframe` (mask≡window); geen L14.

Stage-3 late retarget (na evidence): alleen `hypothesis.faceIds` + as-overlap met geraakte deurboog — **niet** `evidenceFaceIds` (jamb naast deur ≠ kozijn).

## Class-gate

`allowedClassForWindow` blijft breder dan `isOpeningWhiteClass` (`wall` / `doorframe` bewust mee). Geen merge met deur-rescue (`mergeOpeningWhiteWithWallInk`).

---

## Legacy

`frontend/src/archive/openings/**` blijft museum (geen actieve imports). Actieve flow = `frontend/src/cv/windows/**` + L14.
