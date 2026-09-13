# Editor-canvas: kernel, plugins, view, lijm

Fase 2 van [`editor_kernel_plugins_v2_d0e1ed1b.plan.md`](../../../plans/editor_kernel_plugins_v2_d0e1ed1b.plan.md).
Gemeten 2026-09-13 op de working tree ná rename fase 0–3 en kernel fase 1 batch 1. Regelaantallen = **totale** regels (`(Get-Content).Count`), niet niet-lege regels.

Dit is een kaart, geen refactor. Niets in dit document is uitgevoerd. Doel: fase 3–6 hoeven niet meer te discussiëren over waar iets hoort.

**Scope:** `frontend/src/ui/composables/plan-canvas/` (93 `.ts`) + `frontend/src/ui/composables/editor/` (9 `.ts`) = 102 bestanden, 24.352 regels. Daarvan horen 11 bij het aanzicht (§2), dus **91 bestanden** vallen in de vier bakken hieronder.

---

## 1. Vier bakken

| Bak | Wat | Bestanden | Regels | Gemiddeld |
|---|---|--:|--:|--:|
| **kernel** | infrastructuur die elke tool nodig heeft | 36 | 4.830 | 134 |
| **plugin** | logica van één tool of één objecttype | 34 | 8.107 | 238 |
| **view** | rendermodel/presentatie, geen interactie | 12 | 2.875 | 240 |
| **lijm** | coördinator die doorgeeft of samenstelt | 9 | 4.368 | **485** |
| *aanzicht (§2)* | *buiten scope* | *11* | *4.172* | *379* |

De verhouding is de diagnose. **Negen lijm-bestanden dragen 4.368 regels** — gemiddeld 485, ruim drie keer een kernel-bestand. Een coördinator die doorgeeft hoort dun te zijn; deze zijn dik omdat de tool-kennis erin is neergeslagen. Dat is wat fase 4a/4b weghaalt.

### kernel — per zorg

Niet alfabetisch maar per concern, want dát is de indeling die de plugin-context straks moet aanbieden.

| Zorg | Bestanden |
|---|---|
| **coördinaten + viewport** (4, 550) | `usePlanCanvasViewport.ts` (266), `usePlanCanvasPanZoom.ts` (141), `plan-canvas-gestures.ts` (94), `plan-canvas-world-stroke.ts` (49) |
| **hit-test** (9, 1.103) | `usePlanCanvasHitTest.ts` (392), `item-rotate-handles.ts` (167), `plan-canvas-opening-handles.ts` (163), `item-resize-handles.ts` (131), `plan-inspect.ts` (104), `plan-canvas-ridge-hit.ts` (60), `plan-canvas-fixture-bounds.ts` (56), `plan-canvas-hit-test-api.ts` (25), `plan-canvas-vertex-hit.ts` (5) |
| **selectie-store** (4, 341) | `plan-canvas-wall-select.ts` (149, box-select geometrie), `plan-canvas-selection.ts` (102), `plan-canvas-mods.ts` (50), `plan-canvas-sticky-select.ts` (40) |
| **drafts + commit** (3, 508) | `plan-canvas-draft-commit.ts` (222), `plan-canvas-opening-draft.ts` (145), `plan-canvas-junction-drafts.ts` (141) |
| **snap-geometrie** (2, 377) | `plan-canvas-draw-measure.ts` (272), `snap-area-holes-to-faces.ts` (105) |
| **meet-overlays** (5, 501) | `plan-canvas-wall-move-measure.ts` (134), `plan-canvas-wall-internal-measure.ts` (121), `plan-canvas-area-live.ts` (90), `plan-canvas-opening-move-measure.ts` (79), `plan-canvas-measure.ts` (77) |
| **plan-mutatie + undo** (3, 267) | `plan-editor-undo.ts` (177), `regenerate-floor-areas.ts` (68), `seed-plan-stack-defaults.ts` (22) |
| **host + chrome** (4, 865) | `plan-canvas-editor-keyboard.ts` (329), `usePlanCanvasTouch.ts` (290), `plan-capabilities.ts` (156), `plan-canvas-touch-tap.ts` (90) |
| **sessie + I/O** (2, 318) | `useEditorSessionDefaults.ts` (264), `parse-editor-plan-file.ts` (54) |

### plugin — per tool of objecttype

| Objecttype / tool | Bestanden |
|---|---|
| muur (5, 1.983) | `usePlanCanvasWallSelection.ts` (777), `plan-canvas-wall-facade-selection.ts` (431), `usePlanCanvasDrawWall.ts` (321), `usePlanCanvasWallDrag.ts` (241), `usePlanCanvasWallMove.ts` (213) |
| knoop (1, 243) | `usePlanCanvasJunctionMove.ts` (243) |
| opening (5, 1.181) | `usePlanCanvasOpeningSelection.ts` (592), `usePlanCanvasOpeningMove.ts` (204), `usePlanCanvasOpeningResize.ts` (146), `usePlanCanvasOpeningDrag.ts` (131), `usePlanCanvasAddOpening.ts` (108) |
| ruimte / surface (5, 1.423) | `usePlanCanvasDrawRoom.ts` (383), `usePlanCanvasAreaSelection.ts` (377), `usePlanCanvasSurfaceEdit.ts` (310), `usePlanCanvasDrawSurface.ts` (208), `usePlanCanvasAreaLabelDrag.ts` (145) |
| fixture (4, 417) | `usePlanCanvasItemDrag.ts` (142), `usePlanCanvasItemRotate.ts` (132), `usePlanCanvasItemResize.ts` (90), `usePlanCanvasAddFixture.ts` (53) |
| dak / nok (1, 398) | `plan-editor-ridge-roof.ts` (398) |
| maatlijnen (4, 634) | `usePlanCanvasMeasure.ts` (197), `usePlanCanvasDimensionDrag.ts` (163), `usePlanCanvasSlicer.ts` (153), `useEditorDimensions.ts` (121) |
| annotatie (3, 352) | `plan-editor-annotations.ts` (165), `usePlanCanvasDrawLine.ts` (114), `usePlanCanvasDrawLabel.ts` (73) |
| onderlegger (2, 778) | `useEditorUnderlay.ts` (678), `usePlanCanvasUnderlayMove.ts` (100) |
| overig (4, 698) | `usePlanCanvasNulpunt.ts` (188), `plan-canvas-rescale-from-measure.ts` (178), `plan-editor-facade-stamp.ts` (170), `usePlanCanvasInspect.ts` (162) |

### lijm — en wat de campagne ermee doet

| Bestand | Regels | Lot |
|---|--:|---|
| `usePlanCanvasInteraction.ts` | 1200 | blijft lijm; krimpt als 4b de tool-map landt |
| `usePlanCanvasSelectionCoordinator.ts` | 955 | fase 3 haalt de selectie-store eruit; de twee lazy-hacks (r. 84, 267–282) vervangt 4b |
| `usePlanCanvasPointer.ts` | 820 | **wordt kernel** in 4a/4b: cascade eruit, dan is dit een dispatcher |
| `usePlanCanvasToolCoordinator.ts` | 722 | 4b: mode-computeds → tool-map; `resolveDraw/Room/Surface` → `plan-canvas-snap-resolve.ts` |
| `useEditorLoad.ts` | 352 | shell-lijm, fase 5 |
| `useEditorGevels.ts` | 132 | shell-lijm |
| `plan-canvas-host-props.ts` | 88 | props-contract; fase 6 gate leest hier |
| `useEditorDak.ts` | 57 | shell-lijm; zet de view-as (§3) |
| `useEditorInspect.ts` | 42 | shell-lijm |

### view (12, 2.875)

`usePlanCanvasRenderModel.ts` (669) · `plan-canvas-area-side-dims.ts` (345) · `plan-canvas-opening-render.ts` (325) · `plan-canvas-render-openings.ts` (288) · `plan-canvas-render-types.ts` (224) · `plan-canvas-render-areas.ts` (215) · `plan-canvas-corner-markers.ts` (207) · `plan-canvas-selected-panels.ts` (172) · `plan-canvas-render-annotations.ts` (161) · `usePlanCanvasDrawPreviews.ts` (158) · `plan-canvas-underlay-layout.ts` (95) · `facade-group-label.ts` (16)

### Twijfelgevallen, met uitspraak

Een kaart die negen bestanden open laat is geen kaart.

| Bestand | Uitspraak | Waarom |
|---|---|---|
| `usePlanCanvasPointer.ts` | lijm nú, kernel ná 4a | de dispatch ís infrastructuur; de cascade erin is dat niet |
| `usePlanCanvasWallSelection.ts` | plugin | 777 regels muur-domein; de box-select-geometrie erin zit al apart in `plan-canvas-wall-select.ts` (kernel) |
| `plan-canvas-wall-facade-selection.ts` | plugin | gevelgroep is één concern, niet iets dat elke tool nodig heeft. Gedeeld ≠ kernel |
| `usePlanCanvasInspect.ts` | plugin | inspect is een host-preset (§3), maar de pick-prioriteit erin verhuist in 4a naar de hit-cascade |
| `plan-canvas-rescale-from-measure.ts` | plugin | pure math, maar alleen de rescale-tool gebruikt het |
| `useEditorUnderlay.ts` / `useEditorDimensions.ts` | plugin | editor-shell-features, geen canvas-infrastructuur |
| `plan-canvas-host-props.ts` | lijm | alleen types, maar het ís het host-contract |
| `elevation-interaction-types.ts` | aanzicht | buiten scope |

---

## 2. Aanzicht: andere kernel, niet meenemen

Elf bestanden (4.172 regels) horen bij het gevel-aanzicht en vallen **buiten** deze campagne:

`useElevationSelectEdit.ts` (1773) · `useElevationRenderModel.ts` (688) · `useElevationInteraction.ts` (583) · `useElevationPrecise.ts` (359) · `useElevationDrawTools.ts` (334) · `plan-canvas-elevation-wall-measure.ts` (174) · `useElevationPointer.ts` (85) · `plan-canvas-elevation-opening-measure.ts` (72) · `elevation-interaction-types.ts` (53) · `elevation-precise-move.ts` (50) · `elevation-tool.ts` (1)

Ze zijn niet "puur" en dus **geen import-only verhuizing**: ze trekken plattegrond-helpers binnen (`plan-canvas-mods`, `usePlanCanvasViewport`, `plan-canvas-measure`, `plan-canvas-vertex-hit`, `plan-canvas-opening-move-measure`). Wie ze naar een eigen map tilt, houdt die import-richting over — en botst met de gate van fase 6. De verhuizing kan pas als de kernel benoemd is, zodat de brug naar kernel-modules loopt in plaats van naar willekeurige plattegrond-bestanden. Eigen batch, na de campagne.

Let op: `useElevationSelectEdit.ts` is met 1773 regels de grootste composable van de editor (alleen `ui/views/EditorView.vue` met 2398 is groter). Dat is een eigen campagne waard, niet deze.

---

## 3. Drie assen, niet één

De hardnekkigste denkfout in v1 was dat alles capability kon worden. Er zijn drie onafhankelijke assen:

| As | Wat | Waar gezet | Waar gelezen |
|---|---|---|---|
| **host-preset** — wie embedt het canvas | `PlanKind` = `editor` \| `inspect` \| `detection` → `PlanCapabilities` (14 velden, w.o. een `tools`-record van 13 en `planIo`) | `plan-capabilities.ts`, via prop `kind` | overal; statisch per mount |
| **view-as** — welke tab | `dakMode`: plattegrond of Dak | `useEditorDak.ts`, prop `dakMode` | **122 refs in 20 bestanden**; in de pointer op 5 plekken |
| **sessie** — wat de tekenaar nu doet | `activePlanTool` + modifiers (`settingsMod`/`moveMod`/`touchNav`) + teken-defaults | `plan-canvas-selection.ts` | tool-modi in de ToolCoordinator |

**`dakMode` is geen capability.** Het verandert hit-*gedrag* per klik, niet welke tools bestaan:

| Pointer-regel | Wat dak doet |
|--:|---|
| 367 | fixture-selectie uit (geen rotate/resize-grepen) |
| 409 | knoop alleen als er een nok-muur aan hangt |
| 485 | fixtures niet aan te klikken |
| 569 | muur-hit wordt nok-hit; surface valt weg als er nok onder ligt |
| 639 | niet-nok-muur → deselecteren i.p.v. selecteren |

Een boolean-record kan dat niet uitdrukken. Fase 4a maakt hier `PlanViewContext` van: `mode: 'plan' | 'dak'` + de set selecteerbare kinds + `isRidgeWallId`. Dan verdwijnt de gedrilde `dakMode?: ComputedRef<boolean>` uit de bags.

Dubbeling om op te ruimen (fase 6): `plan-canvas-host-props.ts` heeft naast `kind` nog losse `areaSurfaceEdit`/`annotationEdit`/`inspectMode`/`touchEditor`-props die met "Ignored when `kind` is set" in de doc-comment staan. Twee waarheden met een comment als scheidsrechter.

---

## 4. Selectie in drie bakken

`plan-canvas-selection.ts` heeft **39 refs** in één platte bag. Ze horen in drie groepen — en dat is niet één discriminated union.

**Selected (15)** — wat is geselecteerd
`settingsWallIds[]`, `settingsFacadeGroupId`, `settingsJunctionId`, `settingsOpeningIds[]`, `settingsAreaId`, `settingsSurfaceId`, `settingsLabelId`, `settingsLineId`, `settingsItemId`, `moveWallId`, `moveOpeningId`, `moveItemId`, `moveDimensionId`, `pinnedJunctionId`, `draggingJunctionId`

**Hover (10)** — puur cursor-feedback, nooit persistent
`hoveredWallId`, `hoveredOpeningId`, `hoveredAreaId`, `hoveredSurfaceId`, `hoveredLabelId`, `hoveredLineId`, `hoveredJunctionId`, `hoveredItemId`, `hoveredDimensionId`, `hoveredDimensionEnd`

**ToolSession (14)** — actieve tool, drafts, plaats-defaults
`activePlanTool`, `drawWallKind`, `drawSurfacePoints`, `drawLinePoints`, `surfaceEditId`, `roofPolyMutate`, `addDoor{Subtype,WidthCm,HeightCm,SillZCm}`, `addWindow{Subtype,WidthCm,SillZCm,HeightCm}`

### Waarom niet één `mode: 'settings' | 'move'`

Omdat `settingsWallIds` en `moveWallId` **tegelijk** gevuld kunnen zijn: Ctrl-select zet ids in de settings-lijst terwijl er een move-target staat. `currentStickyKind()` (r. 222–232) OR-t ze bewust: `hasWall = settingsWallIds.length > 0 || moveWallId != null`. Eén verplichte discriminant gooit die toestand weg — dat is een gedragswijziging vermomd als typefix.

De knoop heeft zelfs **drie** standen: `settingsJunctionId` (Ctrl-settings), `draggingJunctionId` (sleept), `pinnedJunctionId` (geselecteerd, wacht op precise-invoer). Ook geen settings/move-paar.

Uitspraak voor fase 3: `PlanSelected` als union van *kinds* (welk objecttype is aan de haak), met settings-ids en move-id als aparte velden. Hover en ToolSession blijven erbuiten.

### Gebouwd (fase 3, batch 1): één schrijf-lane

[`plan-canvas-selected.ts`](../../../../frontend/src/ui/composables/plan-canvas/plan-canvas-selected.ts) (165 regels, kernel) is nu de enige plek waar de Selected-bak geschreven wordt: `setPlanSelected` (wis alles, zet één soort), `togglePlanSelected` (Ctrl-klik) en `clearPlanSelected`. Zes handgeschreven kopieën van hetzelfde wis-blok zijn weg — twee inline in de pointer, drie toggles in de SelectionCoordinator, en `clearSelection()` in WallSelection. `planStickySelectKind` haalt de zes losse booleans uit de pointer.

Regels: pointer 820 → 788, SelectionCoordinator 955 → 914, WallSelection 777 → 766. Het totaal stijgt (−84 daar, +165 hier): de winst is niet minder regels maar **gewicht van lijm naar kernel** — 73 regels uit de twee dikste coördinatoren naar een module met 19 eigen tests.

**Twee dingen die dit blootlegde.**

*De Selected-bak had twee resolvers met verschillende prioriteit.* Sticky doet muur vóór opening; `deleteSelected()` doet **opening vóór muur**. Eén afgeleide `Selected.kind` kan die twee niet beide bedienen zonder gedrag te veranderen, dus de plan-aanname "één `kind` volstaat" gaat hier niet op. **Besluit 2026-09-13: twee resolvers houden.** Het zijn verschillende vragen — "wat houd ik vast" (mag deze hit erdoor?) versus "wat verwijder ik". Ze staan expliciet naast elkaar met een comment dat het verschil opzettelijk is; `deleteSelected()` houdt zijn eigen keten. Niet unificeren zonder aparte afweging: het raakt een destructieve actie.

*Eén echte inconsistentie gerepareerd.* `toggleSettingsItem` wiste `settingsJunctionId`, maar `toggleSettingsLabel` en `toggleSettingsLine` niet. Omdat `selectedJunctionPanel` alleen op die ref kijkt, bleef de knoop-strip openstaan naast de label-strip. De unieke writer wist hem nu altijd; vastgelegd in de spec.

---

## 5. Hit-prioriteit, zoals de code het nu doet

`onWrapPointerDown` (r. 234–680) is 447 regels met **28 exit-punten**. Dit is de volgorde.

Vastgepind in [`plan-canvas-pointer-cascade.spec.ts`](../../../../frontend/tests/ui/plan-canvas-pointer-cascade.spec.ts) (46 tests, groen) met harnas [`plan-canvas-pointer-harness.ts`](../../../../frontend/tests/ui/plan-canvas-pointer-harness.ts). De pointer krijgt zijn buitenwereld via één options-object, dus er is geen component-mount nodig: elke actie wordt geregistreerd en een test zegt "deze actie won, die andere niet". Dat ís de definitie van prioriteit.

**A. Guards** (234–260) — niet-links-klik · target binnen `PLAN_CANVAS_CHROME_SELECTOR` · focus-blur van sidebar-inputs · Space → pan.

**B. Draft-first** (268–290) — een lopende precise-move wint van alles: muur, knoop, opening. Tweede klik plaatst.

**C. Tool-dispatch** (292–361) — actieve tool krijgt de klik vóór elke selectie:

| # | Tool | Bijzonderheid |
|--:|---|---|
| 1 | inspect | `applyInspectPick` |
| 2 | draw wall | |
| 3 | measure | |
| 4 | nulpunt | |
| 5 | underlay move | |
| 6 | draw room | |
| 7 | draw surface | ook actief bij `draw_roof` |
| 8 | draw label | |
| 9 | draw line | |
| 10 | surface-edit | **enige die kan doorvallen**: alleen `return` als de handler `true` geeft |
| 11 | add door / window | zonder muur onder de cursor: klik valt weg (geen fallthrough) |
| 12 | add fixture | alleen touch-editor |

**D. Select-cascade** (363–680) — met `allowHit()` uit de sticky-regels als poortwachter:

| # | Doel | Bijzonderheid |
|--:|---|---|
| 13 | grepen van geselecteerde fixture | rotate (hoeken) vóór resize (randen); dak: uit |
| 14 | grepen van geselecteerde opening | move-greep → precise/drag; start/end → resize |
| 15 | knoop | dak: alleen op nok. Ctrl → settings; anders precise / pin / drag |
| 16 | dikte-pick | `emit('thicknessWallPick')`; **staat vóór box-select en opening** |
| 17 | box-select | dus niet te starten bovenop een knoop |
| 18 | opening | wist expliciet 12 andere selectie-refs |
| 19 | fixture | dak: uit |
| 20 | maatlijn | eindpunt vóór lijn |
| 21 | label | **alleen met Ctrl** |
| 22 | lijn | **alleen met Ctrl** |
| 23 | naam van geselecteerde ruimte | sleept het naam-offset |
| 24 | surface | Ctrl, of dak-overlay-pick |
| 25 | ruimte met Ctrl | |
| 26 | ruimte / surface gewoon | |
| 27 | leeg binnen ruimte | deselecteren — de muur niet stelen |
| 28 | muur | dak + niet-nok → deselecteren |

Kruislings hierdoor: **`wallPreemptsAreaHit()`** keert 24–27 om t.o.v. 28. Ligt er een muur onder de cursor, dan slaat de cascade de ruimte-takken over en landt op de muur. Dat is de "muur in ruimte"-regel uit `memory.mdc`, en het is de reden dat 24–28 niet los te testen zijn.

De twee dingen die me hier tegenstaan en die de spec vastlegt vóórdat iemand ze "opruimt": stap 16 (dikte-pick) zit midden in de objectcascade in plaats van bij de tools, en stap 10 is het enige voorwaardelijke doorval-punt. Beide zien uit als een bug maar zijn gedrag waar iets op leunt.

### Wat het schrijven van de spec opleverde

Drie dingen die de kaart alleen niet had laten zien:

1. **De cascade zit vast aan de DOM.** `onWrapPointerDown` doet `target instanceof Element` en leest `document.activeElement` om sidebar-inputs te blurren, terwijl vitest hier op `environment: 'node'` staat. Zonder shim knalt de guard op een `ReferenceError` — dat is de werkelijke reden dat deze keten nooit een test had, niet de omvang. Bij de extractie in 4a hoort die DOM-afhankelijkheid **buiten** de cascade te blijven (guard-laag in de dispatcher, cascade puur op `cm` + state).
2. **Sticky slaat harder toe dan de nummering suggereert.** Met een geselecteerde fixture haalt een klik op een deur stap 18 niet: `currentStickyKind()` geeft `'item'` en `allowHit('opening')` wordt false. De cascade-nummers gelden dus alleen bij een lege selectie; met selectie ligt er een tweede filter over. Mijn eerste testaanname was hier fout, de code niet.
3. **Ctrl-takken zijn kort.** Bij Ctrl op een muur of knoop is de volledige uitkomst twee acties (`stopContentGroupDrag` + `toggleSettings…`) — geen selectie-opschoning. Een gewone muurklik doet er vijf. Dat verschil is precies wat fase 3 moet bewaren.

De drie bags (`PointerToolModes`, `PointerDragState`, `PointerActions`) zijn hiervoor `export` geworden, type-only, zodat het harnas erop kan typen in plaats van een eigen structurele kopie te onderhouden die stil uit elkaar loopt. Fase 4b ruimt ze alsnog op.

### Gebouwd (fase 4a, slice 1): cascade eruit

Stap 13–28 staan nu in [`plan-canvas-hit-cascade.ts`](../../../../frontend/src/ui/composables/plan-canvas/plan-canvas-hit-cascade.ts) (385 regels, kernel). **Pointer 820 → 511**, ruim een derde eraf; wat overblijft zijn de guards en de tool-dispatch, precies de tweedeling uit §5. Alle 46 karakteriseringstests bleven groen bij het verplaatsen van 295 regels — dat is waarvoor het net gebouwd is.

De cascade declareert een **eigen, kleiner contract** (`PlanHitCascadeModes` met 12 velden, `PlanHitCascadeActions` met 34 van de 66) in plaats van de pointer-bags te importeren. Dat vermijdt een importcykel én maakt zichtbaar wat de cascade nodig heeft versus wat de tools nodig hebben — bruikbaar voor 4b. TypeScript's structurele typing doet de rest: de pointer geeft zijn volle bags gewoon door.

`dakMode` is uit de cascade verdwenen ten gunste van [`plan-view-context.ts`](../../../../frontend/src/ui/composables/plan-canvas/plan-view-context.ts) (44 regels): `mode: 'plan' | 'dak'`, `canSelect(kind)` en `isRidgeWallId`. De vijf touch points uit §3 zijn nu één `onDak` plus `view.canSelect('item')`.

### Gebouwd (fase 4a, slice 2): drilling weg

De context wordt nu één keer gebouwd in [`PlanCanvas.vue`](../../../../frontend/src/ui/components/PlanCanvas.vue) en als object doorgegeven aan Interaction, die hem aan Tool, Selection, Pointer en RenderModel geeft. De optionele `dakMode?: Ref<boolean>` is uit alle vier de composable-contracten verdwenen; tien `options.dakMode?.value === true`-checks zijn `options.view.mode === 'dak'` geworden.

Wat er van `dakMode` overblijft in `src/ui/composables/` is precies de bedoelde vorm: de **bron** (`useEditorDak.ts`, die de tab bezit) en de **ingang** (`plan-canvas-host-props.ts`, de prop). Alles daartussen is weg. Stage- en Toolbar-componenten houden hun Vue-props; `PlanCanvas.vue` houdt de `dakMode`-computed voor de template-bindingen.

Eindstand van de keten: pointer **502**, cascade 385, view-context 44, selected-store 165. Interaction 1200, Tool 723, Selection 915 — die krimpen pas in 4b en 5. Typecheck nul fouten, suite 2518 met dezelfde 9 rood, knip schoon.

---

## 6. Plugin-contract, met lazy context

De ToolCoordinator bezit nu de snap-diensten (`resolveDrawPoint` r. 255, `resolveRoomStartPoint` 283, `resolveRoomEndPoint` 289, `resolveSurfacePoint` 293). Een kale `Map` van tools zonder huis voor die functies betekent dat elke plugin ze kopieert.

En de bestaande constructie-cyclus is echt: `usePlanCanvasSelectionCoordinator.ts` r. 84 `const openingDraftSync = { run: () => {} }` en r. 267–282 `bindResolveSurfacePoint` zijn er om plugins te laten verwijzen naar iets dat nog niet bestaat. **Eager plugin-deps herbouwen die hack.** De context moet lazy zijn (getters), niet een object dat je bij constructie volpakt.

Voorstel voor 4b:

```ts
/** Alles wat een tool mag aannemen. Getters: constructie-orde doet niet mee. */
export interface PlanKernelContext {
  get plan(): PlanDocAccess          // floor, walls, commit + undo
  get view(): PlanViewContext        // mode 'plan' | 'dak', selecteerbare kinds, isRidgeWallId
  get caps(): PlanCapabilities       // host-preset, statisch
  get viewport(): PlanViewportApi    // clientToCm, cmToStage, scale
  get hit(): HitTestApi
  get sel(): PlanSelectionApi        // Selected + Hover + ToolSession
  get snap(): PlanSnapService        // resolveDrawPoint / Room / Surface
  get session(): PlanSessionDefaults // o.a. de vijf bovenlicht-defaults
}

export interface PlanToolPlugin {
  readonly id: PlanToolId
  /** Uit bij hosts die de tool niet hebben; geen if-else in de pointer. */
  enabled?(caps: PlanCapabilities): boolean
  /** true = klik geconsumeerd. Zelfde contract als het huidige
   *  onSurfaceEditPointerDown, dat al een boolean teruggeeft. */
  onPointerDown?(cm: Point2D, event: MouseEvent, k: PlanKernelContext): boolean
  onPointerMove?(cm: Point2D, event: MouseEvent, k: PlanKernelContext): void
  onPointerUp?(event: MouseEvent, k: PlanKernelContext): void
  /** Esc / tool-wissel. Nu verspreid over de keyboard-module. */
  onCancel?(k: PlanKernelContext): void
  cursor?(k: PlanKernelContext): string | null
}
```

Wat dit opheft: `PointerToolModes` (**25 leden**, twintig booleans die alle uit `activePlanTool` volgen) en `PointerActions` (**66 leden**). Twee bags van samen 91 velden die de Interaction-laag moet vullen — dat is waarom negen lijm-bestanden 4.368 regels dragen.

Wat het **niet** doet: de select-cascade (§5, stappen 13–28) is geen plugin. Dat is kernel-gedrag dat na de tool-dispatch komt. Plugins krijgen de klik eerst; de cascade is de bodem.

---

## 7. Wat de kaart betekent voor de volgende fasen

| Fase | Wat deze kaart vastlegt |
|---|---|
| 3.0 | **klaar** — 46 tests over de 28 exit-punten, beide takken × plan/dak × Ctrl/Shift/touch |
| 3 | **batch 1 klaar** — schrijf-lane + sticky-read in `plan-canvas-selected.ts`; de ~23 lezers van `move*Id` staan nog op de refs |
| 4a | **klaar** — §5 in `plan-canvas-hit-cascade.ts`; `PlanViewContext` gebouwd in `PlanCanvas.vue`, geen `dakMode`-drilling meer |
| 4b | §6: tool-map + lazy context + `plan-canvas-snap-resolve.ts` als huis |
| 5 | §1 lijm-tabel: de vier `useEditor*`-shell-bestanden zijn het doel |
| 6 | §1 bakken zijn de gate-regels; §3 noemt de props-dubbeling die dan weg moet |
| later | §2: de elf aanzicht-bestanden, mét de brug-lijst |
