# Wall face-class flow (`RoomRasterClass = 'wall'`)

Laatste update: 2026-07-23

Doel: vastleggen waar face-class `'wall'` / `'window'` / `'door'` / `'doorframe'` in de muurflow leeft.
L1–L10 zien alleen binary mask; L14 gebruikt windows later apart (niet doorframe).

## Verdict

**Face-classes leven in L0** (classify → ink-resolve → muurmasker → finalize).  
**V3 L1–L10 lezen `RoomRasterClass` niet** — alleen `blobs` + `maskRle` (+ dikte).

| Face-class | UI-kleur | `toWallPipelineClass` | `isWallMaskClass` | In ink-muurmasker? |
|---|---|---|---|---|
| `wall` | zwart | `wall` | ja | ja |
| `window` | cyaan | → `wall` | **ja** | **ja** (glas/strips = muur tot L14) |
| `doorframe` | donker oranje | → `wall` | **ja** | **ja** (kozijn naast deurboog; geen L14) |
| `door` | amber | → `unknown` | nee | **nee** (alleen bogen; aanliggende vlakken al `wall`) |
| `unknown` / `surface` / `outside` | rood / pastel / wit | zelf | nee | nee |

---

## Dual-space: wall-ink vs opening-wit

Eén muur-B/W → twee bbox-ruimtes (geen tweede preprocess), als **`FaceDualSpace`** op `RoomRasterCache` (muren + deuren + ramen + probe):

| View | Bron | Gebruik |
|---|---|---|
| **Wall-ink** | `labelsData` na ink-resolve (`areaPx` bevat toegewezen inkt) | L0-masker, V3, face-overlay, deur wall-rescue/fill, raam Stage 2/3 ink-pad |
| **Opening-wit** | `rawLabelsData` white CC’s (`areaPx` = wit alleen) | Deur/raam Stage 1 seeds, raam strips/evidence |

API: `frontend/src/cv/walls/rooms/face-dual-space.ts` (`ensureFaceDualSpace`); builder-hulp `opening-white-space.ts` — `isOpeningWhiteClass` (`surface|outside|unknown|door|window`). **`doorframe` uitgesloten** (wallish). Prefer-lookup: `pickGeomByPrefer` (gedeeld met REF).

REF-crops (stap 2): parallel **`RefFaceDualSpace`** (`ref-face-dual-space.ts`) — white default op `RefFace`, ink-geom voor framing; `geom(prefer)` deelt fallthrough met floor.

Stage 1 deuren/ramen **meten geen `wall`-faces** als strip/sector (inkt). Outside mag seed zijn; size-band filtert mega-exterior.

---

## Type & helpers

Bron: `frontend/src/cv/walls/rooms/room-ink-classify.ts`

```ts
export type RoomRasterClass = 'wall' | 'surface' | 'unknown' | 'outside' | 'door' | 'window' | 'doorframe'

isWallMaskClass(cls)      // wall | window | doorframe
toWallPipelineClass(cls)  // door→unknown, window|doorframe→wall
```

| Helper | Rol |
|---|---|
| `isWallMaskClass` | gate voor ink-muurmasker + ink-resolve boost/rank |
| `toWallPipelineClass` | finalize-mapping vóór topology die alleen wall/unknown/… verwacht |
| `mapClassesForWallPipeline` | mapt override-map via `toWallPipelineClass` |
| `pickDoorOverrides` / `pickWindowOverrides` / `pickDoorframeOverrides` | display-locks na finalize |
| `cycleFaceClassification` | UI: `wall → unknown → surface`; `door`/`window`/`doorframe` → `wall` |
| `isOpeningWhiteClass` | Stage 1 opening-wit gate (geen wall/doorframe) |

---

## L0: waar wall/window/doorframe meetellen

| Fase | Bestand | Gedrag |
|---|---|---|
| Autoclass | `classifyFacesByInkCoverage` | ink-ratio → `wall` / `surface`; geen auto-`window`/`doorframe` |
| Ink-resolve | `room-ink-resolve.ts` | `isWallMaskClass` → zelfde reach-boost + rank als muur |
| Merge-erfenis | `applyMergedWallChildInheritance` / `extendInkEaterClassAfterMerge` | parent `wall` / `window` / `doorframe` erft door |
| ParentMap claim | `claimFacesFromParentMap` / `claimFacesInRoomRasterCache` | na wallish-erfenis (en deur/raam/doorframe-push / handmatige pin): child → individuele root; **geen** nieuwe parent-hiërarchie |
| Muurmasker | `buildInkWallMaskData` | pixels van wall **+** window **+** doorframe faces |
| Finalize | `prepareRoomFinalizeMask` | overrides mappen; display door/window/doorframe terugzetten |
| Stage-2/3 | `syncDoor*` / `syncWindowFaceOverrides` / `syncDoorframeFaceOverrides` | pin `door` / `window` / `doorframe` |
| Gaps demote | `face-demote.ts` | alleen oude `wall`→`surface` zonder coverage; window/doorframe-pins blijven |

---

## Kritisch pad finalize → V3

```
prepareRoomFinalizeMask
  → mapClassesForWallPipeline (door→unknown, window|doorframe→wall)
  → prepareRoomFinalizeState (ink-resolve; window/doorframe≡wall boost)
  → buildInkWallMaskMat (isWallMaskClass: wall|window|doorframe)
  → close + splitConnectedWallBlobs
  → lockedClassification (+ door/window/doorframe UI)
  → runFinalizePipelineV3 → maskRle → runPipelineV3 L1…L10
```

`pipeline-v3/` importeert face-class **niet**.

---

## UI: deuren & ramen op Muren-tab

| | Deuren | Ramen | Doorframes |
|---|---|---|---|
| Start | `walls`/`doors`, review | `walls`/`windows`, review | via raam Stage 2 (deurboog) |
| Class | `door` (amber) | `window` (cyaan) | `doorframe` (donker oranje) |
| In L0-mask? | nee | ja | ja |
| Later | L11/L12 openings | L14 openings | geen FML-opening |

---

## Drie betekenissen van “wall”

| Domein | Type | Betekenis |
|---|---|---|
| Face / room-raster | `RoomRasterClass` | L0 classify/mask/UI |
| Extractie / segment | `type: 'wall'` | geometrie na skeleton/FML |
| Stap-1 LBE-ref | `rect.type === 'wall'` | voorbeeld-bbox |

---

## Open / later

- Stage-2 deur-filters: seeds die `=== 'wall'` / `!== 'wall'` gebruiken — window niet als deur-seed.
- Optioneel: `box_window` toolbelt.
- Per-ref Template ID voor ramen (nu catalog single/double/triple via merge).

## L14 (actief)

Stage-4 `ResolvedWindowCandidate` → `bindWindowsToWalls` → `BoundWindow` (geen snap; bbox blijft image-space).
Junction in raam-bbox → reject. Daarna `mergeAdjacentBoundWindows` per segment (voor→achter, greedy 3→2→1):
bbox raakt/overlapt + maat ≤20% afwijking → `WINDOW_DOUBLE_REFID` / `WINDOW_TRIPLE_REFID`.
FML via `layer14Windows`. Overlay: Layer Debug L14.
