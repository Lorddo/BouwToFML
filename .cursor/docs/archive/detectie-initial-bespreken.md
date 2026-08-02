# Detectie initial — paden bespreken

Peildatum: 2026-08-01 · Doel: **doorspreken** wat er in de stap-3 detectiepijplijn zit (muur L0 / deur Stage 1–2 / raam Stage 1–4).

Niet: E2E-harnas, kill-switch-poort, of recall t.o.v. handwerk. Tekenaars corrigeren sowieso; meten is lastig en niet het doel van deze ronde.

Late lagen (L2–L10, L11/L12, L14-bind, FML) zijn al doorsproken → [`escalatie.md`](escalatie.md).  
Bevroren ID-lijst → [`escalatiepaden-inventaris.md`](escalatiepaden-inventaris.md).  
Flow-detail → [`archive/wall-face-class-flow.md`](archive/wall-face-class-flow.md), [`door-detection-flow.md`](door-detection-flow.md), [`window-detection-flow.md`](window-detection-flow.md).

**Status 2026-08-01:** rondes **A–G afgerond** (muur L0, deur/raam Stage, REF, orkestratie). Klaar voor ontwikkeling — geen VERWIJDEREN-batch uit deze bespreking.

---

## 0. Hoe dit document gebruiken

Per cascade: lees “wat”, kijk of de tak nog **nodig / legitiem / over-fit / dood** voelt, vul verdict in.

| Verdict | Betekenis (zelfde als finalize) |
|---|---|
| **PROMOVEREN** | Dit is de hoofdweg; dode aanloop mag weg |
| **HERLEIDEN** | Drempel moet ratio/beleid zijn, niet n=1 |
| **AFBAKENEN** | Blijft, met duidelijke precondititie |
| **VERWIJDEREN** | Dood of gedekt elders |
| **BEHOUDEN (F)** | Bewuste keuze; laten |

Spelregel: **geen pad én drempel in dezelfde diff** als er later wél code volgt.

---

## 1. Plaats in de flow

```
Stap 2: muur-B/W + LBE-refs (muur/deur/raam)
    ↓
Stap 3 Muren: room-first classify (L0 faces)
    ↓  FaceDualSpace (opening-wit + wall-ink)
    ├─ Deuren Stage 1–2 → class door (+ bridge doorframe)
    ├─ Ramen Stage 1–4 → class window (+ Stage-2 doorframe)
    ↓
Afronden: finalize-mask → V3 L1–L10 → L11/L12 / L14 → FML
```

| Face-class na detectie | UI | In L0-muurmasker? | Later |
|---|---|---|---|
| `wall` | zwart | ja | V3 segmenten |
| `window` | cyaan | ja (≡ wall in mask) | L14 opening |
| `doorframe` | oranje | ja (≡ wall in mask) | geen FML-opening |
| `door` | amber | **nee** (≡ unknown) | L11/L12 opening |
| `surface` / `unknown` / `outside` | pastel / rood / wit | nee | — |

Dual-space (gedeeld): Stage 1 deuren/ramen **meten** op opening-wit; bruggen/fill/framing op wall-ink. Policy: `DOOR_SPACE_POLICY` / `WINDOW_SPACE_POLICY`.

---

## 2. Muur — L0 room faces (`room-first`)

Entry: `strategies/room-first.ts` → `classifyRoomFacesFromBwMat`.  
V3 L1–L10 ziet **geen** face-class — alleen binary mask na finalize.

### Pijplijn (volgorde)

| # | Stap | Module | ESC |
|---|---|---|---|
| 1 | White CC’s uit muur-B/W | `buildFaceLabelsFromBw` | — |
| 2 | Eerste ink-resolve (eaters) | `buildInkEaterLabels` + `resolveInkBetweenFaces` | — |
| 3 | Enclosed parentMap | `buildEnclosedFaceParentMap` | — |
| 4 | Autoclass ink-coverage → wall/surface | `classifyFacesByInkCoverage` | — |
| 5 | Buiten-pocket demote | `demoteExteriorPocketFaces` | W-02, W-06 |
| 6 | **Tweede** ink-resolve (muur-booster) | `resolveInkFromRawTopology` | W-03 |
| 7 | Autoclass opnieuw | `classifyFacesByInkCoverage` | — |
| 8 | Wallish-erfenis + claim children als roots | `claimWallishAfterInherit` | W-04 |
| 9 | (later) UI overrides + deur/raam push | faceOverrides / sync* | — |
| 10 | Finalize → mask + V3 | `prepareRoomFinalizeMask` → L1…L10 | W-01 bij blob-split |

### Cascades om te bespreken

| ID | Pad | Wat | Anker / notitie | Verdict |
|---|---|---|---|---|
| W-01 | `keepLargestOnly` | Meerdere wall-blobs → alleen grootste | Bewuste keuze (losse garage = eigen plattegrond) | **BEHOUDEN (F)** |
| W-02 | Exterior pocket | Klein vlak, 4× `outside` → `outside`; fallback 30 px | | **AFBAKENEN** |
| W-03 | Tweede ink-resolve | Na pocket opnieuw labels/parentMap met wall-booster | Kern van “muur-booster” | **AFBAKENEN** |
| W-04 | Claim na inherit | Wallish children → individuele roots | Nodig voor Stage-1 seeds in enclosed faces | **PROMOVEREN** |
| W-05 | Preview-kleur fallback | 24 zout-pogingen → vaste hue | Cat F (UI) | **BEHOUDEN (F)** |
| W-06 | Class onbekend → `surface` | Pocket zonder class | | **BEHOUDEN (F)** |

**Bespreekpunten muur** — ronde A afgerond 2026-08-01 (zie §6).

1. ~~Dubbele ink-resolve~~ → W-03 AFBAKENEN
2. ~~Exterior pocket~~ → W-02 AFBAKENEN
3. ~~keepLargestOnly~~ → W-01 BEHOUDEN (F)

---

## 3. Deur — Stage 1–2 (`runDoorStagePipeline`)

Entry: `cv/doors/run-door-stage-pipeline.ts`.  
L11/L12 (snap/orient) = finalize-ronde — hier alleen tot **resolve + face-push**.

### Pijplijn (volgorde)

| # | Stap | Module | ESC-cluster |
|---|---|---|---|
| 0 | REF-bands uit stap-2 rects | `analyzeDoorSwingRef` | REF-* (apart) |
| 1 | Dual + wall-rescue merge | `buildDoorMergedForPipe` | D-01…D-08 (space policy) |
| 2 | Detach + white rebind | `prepareOpeningPipeDual` | — |
| 3 | **Stage 1** seed/match/cluster | `runDoorSwingFilter` (+ seed/cluster/matching) | D-09…D-23 |
| 4 | Wall-fill extras | `buildWallRejectedFillCandidates` | D-24, D-26 |
| 5 | Fill-band ±20% | `runDoorFillFilter` | D-25 |
| 6 | Room-surround reject | `filterRoomSurroundedHypotheses` | D-27 |
| 7 | Angle-rescue inject | `runDoorSwingAngleRescue` | D-29…D-39 |
| 8 | Wall-touch gate | `filterWallUntouchedHypotheses` | D-28 |
| 9 | Bridge → doorframe | `findDoorBridgeWallFaces` | D-40, D-41 |
| 10 | Resolve span/width | `resolveDoorCandidates` | D-43 |
| 11 | Push `door` (+ sticky DF attach) | UI / `attachDoorframesToResolvedDoors` | D-42 |

`existingDoorsOnly` (demote/restore): slaat fill/surround/wall-touch/**bridge** over; angle-rescue blijft voor class=`door` → **D-61**.

### Cascades om te bespreken

#### Space policy (Cat C)

| ID | Key | Waarde | Verdict |
|---|---|---|---|
| D-01 | `stage1Measure` | white | **AFBAKENEN** |
| D-02 | `stage1ClusterBridge` | ink | **AFBAKENEN** |
| D-03 | `wallRescueMeasure` | ink | **AFBAKENEN** |
| D-04 | `wallRescueMatchSpaces` | ink **óf** white | **AFBAKENEN** |
| D-05 | `wallFillMeasure` | ink | **AFBAKENEN** |
| D-06 | surround / wallTouch / bridge | ink | **AFBAKENEN** |
| D-07 | REF swing / framing | white / ink | **AFBAKENEN** |
| D-08 | angleRescue prefer | white | **AFBAKENEN** |

#### Stage 1 — match & cluster

| ID | Pad | Kort | Anker | Verdict |
|---|---|---|---|---|
| D-09 | Size-near aspect 18% | Strikte 5% faalt → ruimer | Project4 Otsu | **AFBAKENEN** |
| D-10 | Shallow-under-min | Onder wallMin → axis-relax | 2D_3E kast | **AFBAKENEN** |
| D-11 | Wall-rescue axis 0.65 | Derde match-poging | | **AFBAKENEN** |
| D-12 | Rescue area/fill-gate | Vier drempels keuren rescue | | **AFBAKENEN** |
| D-13 | Either ink→white | Class wall in beide ruimtes | | **AFBAKENEN** |
| D-14 | Clipped-arc | Langere boog, score-vloer | dubbele deur | **AFBAKENEN** |
| D-15 | Non-wall match-cascade | strict → clipped → sizeNear → shallow | | **AFBAKENEN** |
| D-16 | White-geom override | Either koos white, aggregate was ink | | **PROMOVEREN** |
| D-17 | Undersized → cluster-retry | Union &lt;0.55× ref-area | | **AFBAKENEN** |
| D-18 | Ref-axis relax band | muur-as ∩ ref×[0.75, 2.0] | | **AFBAKENEN** |
| D-19 | Ink-bridge buren | Wit–inkt–wit hop | | **PROMOVEREN** |
| D-20 | Clipped-arc in cluster | | | **AFBAKENEN** |
| D-21 | Overshoot tip-guard | Buur &gt;1.2× bbox → skip | probe-1 | **AFBAKENEN** |
| D-22 | Absorb buren +8% aspect | | | **AFBAKENEN** |
| D-23 | Best-score i.p.v. grootste union | Voorkomt middenstrook twin | effect onduidelijk | **AFBAKENEN** |

#### Stage 2 — gates & rescue

| ID | Pad | Kort | Verdict |
|---|---|---|---|
| D-24 | Wall-fill pass A | Stage-1 wall-reject → opnieuw zonder area/fill | **AFBAKENEN** |
| D-25 | Fill-band 0.8–1.2 | te leeg / te vol | **AFBAKENEN** |
| D-26 | Merge unclaimed wall-fill | | **PROMOVEREN** |
| D-27 | Room-surround | Alles room of alles wall → drop | **AFBAKENEN** |
| D-28 | `no_wall_touch` | Geen ink-adjacent wall/window/DF → drop | **AFBAKENEN** |
| D-29…D-39 | Angle-rescue | Ondiepe refs; omzeilt fill+surround; wall-touch blijft | **AFBAKENEN** (batch; D-38 PROMOVEREN) |
| D-40 | Bridge-promote BFS | surface/unknown tussen muren → doorframe | **AFBAKENEN** |
| D-41 | Sticky DF niet herpromoten | | **PROMOVEREN** |
| D-42 | Post-bridge attach | Zonder Stage-2 her-run | **PROMOVEREN** |
| D-43 | Width-fallbacks | ratioBlade / overhang / swing-span | **AFBAKENEN** |
| D-61 | `existingDoorsOnly` | Vier gates uit in demote-modus | **AFBAKENEN** |

**Bespreekpunten deur** — ronde B+C afgerond 2026-08-01 (zie §6).

1. ~~Match-cascade / wall-rescue~~ → ronde B
2. ~~Angle-rescue / D-61~~ → ronde C: AFBAKENEN (tweede modus + ondiepe special case)
3. Bridge vs raam Stage-2 → bij ronde D/E kort noemen (D-41 sticky)

---

## 4. Raam — Stage 1–4 (`runWindowStagePipeline`)

Entry: `cv/windows/run-window-stage-pipeline.ts`.  
L14 bind/merge = finalize-ronde — hier tot **Stage 4 resolve + class push**.

### Pijplijn (volgorde)

| # | Stap | Module | ESC-cluster |
|---|---|---|---|
| 0 | REF-bands | `analyzeWindowAxelRef` e.d. | R-02…R-05, REF-* |
| 1 | Detach + white rebind | `prepareOpeningPipeDual` | R-01 |
| 2 | **Stage 1** axel/strip + cluster | `runWindowAxelFilter` (+ cluster/strip-geom) | R-06…R-13 |
| 3 | **Stage 2** deurboog → doorframe-kandidaten | `filterWindowsTouchingDoorArcs` | R-14, R-15 |
| 4 | **Stage 3** evidence (ramen) | `filterWindowsByRefEvidence` | R-16…R-20 |
| 5 | Stage 3 evidence (doorframes, framing-only) | zelfde, `evidenceModes: ['framing']` | |
| 6 | Late retarget raam→doorframe | `applyStage3DoorframeRetarget` | R-21 |
| 7 | **Stage 4** resolve bbox | `resolveWindowCandidates` ×2 | R-22…R-25 |
| 8 | Push `window` / `doorframe` | UI | — |

### Cascades om te bespreken

| ID | Pad | Kort | Anker | Verdict |
|---|---|---|---|---|
| R-01 | Dual-rebind na detach | White parentMap/geom vóór Stage 1 | | **PROMOVEREN** |
| R-02 | Asymmetrische rails | Eén rail buiten as → half `strip_stack` | Project4 | **AFBAKENEN** |
| R-03 | As-band uit rails | Geen kopeinde → band uit top/bottom rail | | **AFBAKENEN** |
| R-04 | Ink-vs-white rail | Ink prefer, anders white | | **AFBAKENEN** |
| R-05 | `fullStripHeightsPx` fallback | Leeg → `stripHeightsPx` | | **AFBAKENEN** |
| R-06 | Orientatie-retry H↔V | Tweede pass geroteerd | | **AFBAKENEN** |
| R-07 | `fallbackToPrimaryTarget` | Secundaire orient hergebruikt primaire kalibratie | | **AFBAKENEN** |
| R-08 | Bounded strip-kalibratie | Mediaan clamp [0.7×, 3.0×]; skip bij 1 strip | De Roemer | **AFBAKENEN** |
| R-09 | Strip-sample band→centroid | | | **AFBAKENEN** |
| R-10 | Relaxed hoogtetolerantie ~75% | `max(2, target×0.75)` | 2D_3E | **AFBAKENEN** |
| R-11 | Px-vloeren 2/3/4 | Schalen niet mee | | **AFBAKENEN** |
| R-12 | As-span spreidingsguard 1.5 | Lange rail × kort glas → reject | | **AFBAKENEN** |
| R-13 | Wall-ink bridge relaxed | Overlap 0.1, centerDelta ×1.6 | | **PROMOVEREN** |
| R-14 | Deurboog ink-adjacency | 1-hop via wall-ink | | **PROMOVEREN** |
| R-15 | Directionele boog-propagatie | Zelfde as-band → reject/align | | **AFBAKENEN** |
| **R-16** | Evidence cascade | `strip_stack` → `framing` → **passthrough zonder bewijs** | REF zonder rails én framing | **AFBAKENEN** |
| R-17 | Stack-groei ink-bruggen | BFS lokaal | De Roemer Hal/mk | **AFBAKENEN** |
| R-18 | Framing dual OR | White faalt → ink | | **AFBAKENEN** |
| R-19 | Framing soft-min 25% | Onder minH maar &gt;25% → door | | **AFBAKENEN** |
| R-20 | Stack early exit | Geen span/heights → alleen seed | | **AFBAKENEN** |
| R-21 | Stage-3 late retarget | Raam raakt deurboog → doorframe-lijst | | **AFBAKENEN** |
| R-22 | Stage-4 bbox prefers | Glas whiteThenInk; kozijn inkThenWhite | | **AFBAKENEN** |
| R-23 | Measure-bbox fallback | Geen dual-geom → unionBBox (tests) | | **BEHOUDEN (F)** |
| R-24 | Cross-ref stack-merge | Zelfde strips onder 2 refs → één raam | | **AFBAKENEN** |
| R-25 | Framing de-dupe op score | | | **PROMOVEREN** |
| R-27 | (L14) adjacent merge | Finalize — niet in ronde E | 2D_3E | — |

R-26 = al **VERWIJDERD** (finalize-ronde).

**Bespreekpunten raam** — ronde D+E afgerond 2026-08-01 (zie §6).

1. ~~R-16 passthrough~~ → **AFBAKENEN** (preconditie: REF zonder rails én framing; niet dichtdoen zonder smoke)
2. ~~Stage 2 doorframe vs deur-bridge~~ → R-14 PROMOVEREN; sticky D-41
3. ~~R-06 / R-11~~ → AFBAKENEN

---

## 5. Voorgestelde bespreekvolgorde

Kleiner dan finalize; één sessie per blok is genoeg.

| Ronde | Scope | Focus |
|---|---|---|
| **A** | Muur L0 | ✅ 2026-08-01 |
| **B** | Deur Stage 1 | ✅ 2026-08-01 |
| **C** | Deur Stage 2 | ✅ 2026-08-01 |
| **D** | Raam Stage 1–2 | ✅ 2026-08-01 |
| **E** | Raam Stage 3–4 | ✅ 2026-08-01 (R-16 AFBAKENEN) |
| **G** | REF-analyse | ✅ 2026-08-01 |
| **F** | Orkestratie O-* | ✅ 2026-08-01 |

---

## 5b. REF-analyse (`cv/refs`) — ronde G

Entry: `runRefStages` / `analyzeDoorSwingRef` / `analyzeWindowAxelRef` / muur-stijl. Voedt alle Stage-drempels.

| ID | Pad | Kort | Verdict |
|---|---|---|---|
| REF-01 | B/W-bron | `baseBw` → shared → rebuild; nooit OCR-`effectiveBw` | **PROMOVEREN** |
| REF-02 | As-align | Hough spanning → langste lijn → edge-ink → `0` | **AFBAKENEN** |
| REF-03 | Window deskew | Lijn-deskew; PCA alleen als lijn &lt;0.15° én PCA ≥1° | **AFBAKENEN** |
| REF-04 | Opening-units | Posts → paren → scan / primary / bbox | **AFBAKENEN** |
| REF-05 | `singleUnit` | Eén unit → hele crop = opening | **AFBAKENEN** |
| REF-06…REF-08 | Crop safety | Geen inkt / labels / rollen → ruimer meenemen | **AFBAKENEN** |
| REF-09 | Kleine interior | &lt;75% kozijn-area → `outside` | **AFBAKENEN** |
| REF-10 | Polygon pool | Geen `on_axis` → alle parts | **AFBAKENEN** |
| REF-11 | Muurstijl-bron | Prefer `baseBw` | **PROMOVEREN** |
| REF-12 | Swing-pool | `below` → `on_axis` → alle; full-width reject | **AFBAKENEN** |
| REF-13 | Hinge | Wall-corner → classic as-paar | **AFBAKENEN** |
| REF-14 | Diktebanden | Ongeldige ref/schaal → throw (geen 12/23) | **hard fail** (al) |

§7.1: geen code-afdwinging 3–5 refs → **BEHOUDEN (F)** V1.

---

## 5c. Orkestratie (UI) — ronde F

Regressie-bescherming: sticky, demote-wipe, watches. Geen “vind iets”-cascade.

| Groep | ID’s | Verdict |
|---|---|---|
| Sticky asymmetrie | O-01…O-04 | **AFBAKENEN** (O-04 never auto-remove = product) |
| Sticky helpers | O-05…O-13 | **AFBAKENEN** |
| Prune-only demote | O-14…O-22 | **PROMOVEREN** — demote-contract (geen herdetectie) |
| Cross-type watches | O-23…O-30 | **AFBAKENEN** (O-23 boog→raam blijft tot leaner invalidatie) |
| Stille fouten | O-31…O-41 | **AFBAKENEN** (O-40 skip-loud; mop-up later) |
| Gates | O-42…O-46 | **BEHOUDEN (F)** — UI-beleid |

Sticky asymmetrie (audit A6) en O-23 = bekende schuld, geen blokker voor doorontwikkeling.

---

## 6. Verdicts (invullen tijdens bespreking)

### Muur L0 — ronde A (2026-08-01)

| ID | Verdict | Bewijs / notitie | Datum |
|---|---|---|---|
| W-01 | **BEHOUDEN (F)** | Audit §5.0: losse garage = eigen plattegrond; aanbouw zit vast | 2026-08-01 |
| W-02 | **AFBAKENEN** | 4× outside + bbox ≤ ~3× dikte; blijft met preconditie | 2026-08-01 |
| W-03 | **AFBAKENEN** | Tweede ink-resolve (muur-booster) na pocket/autoclass; niet knippen zonder smoke | 2026-08-01 |
| W-04 | **PROMOVEREN** | Hoofdweg: wallish children → individuele roots (Stage-1 contract) | 2026-08-01 |
| W-05 | **BEHOUDEN (F)** | Alleen UI-pastel; vaste hue-fallback | 2026-08-01 |
| W-06 | **BEHOUDEN (F)** | Safety-net: ontbrekende class → `surface` in pocket-helper | 2026-08-01 |

### Deur Stage 1 — ronde B (2026-08-01)

| ID | Verdict | Bewijs / notitie | Datum |
|---|---|---|---|
| D-01…D-08 | **AFBAKENEN** | Dual-space beleid (vaste prefer); enige Either = D-04. Genoeg deuren → zo houden | 2026-08-01 |
| D-09…D-15 | **AFBAKENEN** | Match-cascade + wall-rescue; ankers Project4 / 2D_3E / dubbele deur | 2026-08-01 |
| D-16 | **PROMOVEREN** | White-geom override na Either — correctie, geen fallback | 2026-08-01 |
| D-17, D-18 | **AFBAKENEN** | Undersized cluster-retry; ref-axis band | 2026-08-01 |
| D-19 | **PROMOVEREN** | Ink-bridge = cluster-hoofdweg (contract met D-02) | 2026-08-01 |
| D-20…D-22 | **AFBAKENEN** | Clipped in cluster; overshoot-guard; absorb | 2026-08-01 |
| D-23 | **AFBAKENEN** | Best-score vs grootste union — effect in praktijk onduidelijk; niet knippen | 2026-08-01 |

### Deur Stage 2 — ronde C (2026-08-01)

| ID | Verdict | Bewijs / notitie | Datum |
|---|---|---|---|
| D-24, D-25, D-27, D-28 | **AFBAKENEN** | Wall-fill + fill-band + surround + wall-touch | 2026-08-01 |
| D-26 | **PROMOVEREN** | Unclaimed wall-fill merge (dedupe) | 2026-08-01 |
| D-29…D-37, D-39 | **AFBAKENEN** | Angle-rescue batch; alleen refs &lt;60°; omzeilt fill+surround | 2026-08-01 |
| D-38 | **PROMOVEREN** | Best diag per root | 2026-08-01 |
| D-40, D-43 | **AFBAKENEN** | Bridge-promote; width-fallbacks | 2026-08-01 |
| D-41, D-42 | **PROMOVEREN** | Sticky DF + attach zonder Stage-2 her-run | 2026-08-01 |
| D-61 | **AFBAKENEN** | `existingDoorsOnly` = tweede modus (4 gates uit); demote-wipe voorkomen | 2026-08-01 |

### Raam Stage 1–2 — ronde D (2026-08-01)

| ID | Verdict | Bewijs / notitie | Datum |
|---|---|---|---|
| R-01 | **PROMOVEREN** | Dual-rebind bootstrap (zelfde als deuren) | 2026-08-01 |
| R-02…R-12, R-15 | **AFBAKENEN** | REF-in + Stage 1 axel/cluster + directionele boog; ankers Project4 / De Roemer / 2D_3E | 2026-08-01 |
| R-13, R-14 | **PROMOVEREN** | Ink-bridge cluster + deurboog 1-hop | 2026-08-01 |

### Raam Stage 3–4 — ronde E (2026-08-01)

| ID | Verdict | Bewijs / notitie | Datum |
|---|---|---|---|
| R-16 | **AFBAKENEN** | Passthrough als REF geen rails én geen framing; journaal telt; niet dichtdoen zonder smoke | 2026-08-01 |
| R-17…R-22, R-24 | **AFBAKENEN** | Stack grow / framing OR / soft-min / early exit / retarget / bbox prefers / cross-ref merge | 2026-08-01 |
| R-23 | **BEHOUDEN (F)** | unionBBox-fallback voor tests / ontbrekende dual-geom | 2026-08-01 |
| R-25 | **PROMOVEREN** | Framing de-dupe op score | 2026-08-01 |
| R-27 | — | L14 finalize — buiten ronde E | |

### REF-analyse — ronde G (2026-08-01)

| ID | Verdict | Bewijs / notitie | Datum |
|---|---|---|---|
| REF-01 | **PROMOVEREN** | B/W-bron: `baseBw` / shared → rebuild; nooit `effectiveBw`/OCR | 2026-08-01 |
| REF-02…REF-10, REF-12, REF-13 | **AFBAKENEN** | As-align, deskew, units, crop-fallbacks, interior demote, swing-pool, hinge; anker Project4 swing | 2026-08-01 |
| REF-05 | **AFBAKENEN** | `singleUnit` — geldig bij 1-strip / één opening in crop | 2026-08-01 |
| REF-11 | **PROMOVEREN** | Muurstijl prefer `baseBw` (zelfde contract als REF-01) | 2026-08-01 |
| REF-14 | **hard fail** | Stille 12/23 weg (finalize 2026-08-01); ongeldige ref/schaal → throw | 2026-08-01 |
| §7.1 één-ref | **BEHOUDEN (F)** | Geen 3–5 refs afdwingen in V1 | 2026-08-01 |

### Orkestratie — ronde F (2026-08-01)

| ID | Verdict | Bewijs / notitie | Datum |
|---|---|---|---|
| O-01…O-13 | **AFBAKENEN** | Sticky asymmetrie + helpers; O-04 never auto-remove | 2026-08-01 |
| O-14…O-22 | **PROMOVEREN** | Prune-only demote-contract (geen Stage-herdetectie) | 2026-08-01 |
| O-23…O-41 | **AFBAKENEN** | Watches + stille fouten; O-23 boog→raam = bekende schuld | 2026-08-01 |
| O-42…O-46 | **BEHOUDEN (F)** | Gates / overlay / latch / verborgen tabs | 2026-08-01 |

---

## 7. Gerelateerd

| Doc | Rol |
|---|---|
| [`escalatie.md`](escalatie.md) | Living finalize-verdicts + instrument |
| [`escalatiepaden-inventaris.md`](escalatiepaden-inventaris.md) | Bevroren volledige ID-lijst |
| [`e2e-fixtures.md`](e2e-fixtures.md) | Harness dekt Stage 1–4 **niet** (gebakken lijsten) |
| [`door-detection-flow.md`](door-detection-flow.md) | Diepte deur |
| [`window-detection-flow.md`](window-detection-flow.md) | Diepte raam |
| [`archive/wall-face-class-flow.md`](archive/wall-face-class-flow.md) | Face-class ↔ mask |
