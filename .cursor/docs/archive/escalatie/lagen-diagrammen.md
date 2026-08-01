# Escalatiepaden — lagen & stages (flowcharts)

Peildatum: 2026-07-31 · Companion bij [`escalatiepaden-inventaris.md`](escalatiepaden-inventaris.md)

Per laag/stage: **één mermaid flowchart** (hoofdweg + escalatietakken). Cat A–E in de node. `*` = over-fit-anker. Geen drempelwijzigingen.

REF / orkestratie / FML-conversie → inventaris §7–9. L13 bestaat niet.

---

## Legenda

| Cat | Naam |
|---|---|
| A | Relax-retry |
| B | Guard/rollback |
| C | Alternatieve meetruimte (`ink`/`white`) |
| D | Compensatie-orkestratie |
| E | Meting weggegooid |
| P | Primair (geen escalatie) |

---

## Overzicht

```mermaid
flowchart TD
  L0[L0 classify mask] --> L1[L1 WASM skeleton]
  L1 --> L2[L2 jitter merge]
  L2 --> L3[L3 prune]
  L3 --> L4[L4 HV position]
  L4 --> L5[L5 cleanup]
  L5 --> L6[L6 connector repair]
  L6 --> L7[L7 chain align]
  L7 --> L8[L8 finalize]
  L8 --> L9[L9 dissolve]
  L9 --> L10[L10 fmlReady]
  L10 --> DoorS1[Door Stage 1]
  L10 --> WinS1[Window Stage 1]
  DoorS1 --> DoorS2[Door Stage 2]
  DoorS2 --> L11[L11 door snap]
  L11 --> L12[L12 door orient]
  WinS1 --> WinS2[Window Stage 2]
  WinS2 --> WinS3[Window Stage 3]
  WinS3 --> WinS4[Window Stage 4]
  WinS4 --> L14[L14 window bind]
  L12 --> FML[FML openings]
  L14 --> FML
```

---

## L0 — classify / mask

Face-classes + muurmasker vóór V3. Input B/W+classify → wall-blobs voor L1.

```mermaid
flowchart TD
  bw[wall B/W + classify] --> resolve1[eerste ink-resolve]
  resolve1 --> booster{tweede resolve wall-booster?}
  booster -->|ja| W03A["W-03 A herbereken labels"]
  booster -->|nee| claim[face parent claim]
  W03A --> claim
  claim --> W04A["W-04 A claimWallishAfterInherit"]
  W04A --> pocket[exterior pocket]
  pocket --> classOk{class bekend?}
  classOk -->|nee| W06E["W-06 E unknown to surface"]
  classOk -->|ja| demote{klein + 4x outside?}
  W06E --> demote
  demote -->|ja| W02A["W-02 A demote buiten-pocket"]
  demote -->|nee| blobs[connected wall blobs]
  W02A --> blobs
  blobs --> multi{meerdere componenten?}
  multi -->|ja| W01E["W-01 E keepLargestOnly"]
  multi -->|nee| outL0[L0 mask naar L1]
  W01E --> outL0
```

---

## L1 — WASM skeleton

Geen escalatiepaden in inventaris — alleen primaire skeleton-trace.

```mermaid
flowchart TD
  blobs[L0 wall blobs] --> invert[invert mask]
  invert --> trace[traceSkeletonSegments WASM]
  trace --> snap["junctionGraphSnapPx = 2"]
  snap --> outL1[L1 face skeletons]
```

---

## L2 — jitter merge

```mermaid
flowchart TD
  inL1[L1 segments] --> mergeLoop[jitter merge while changed]
  mergeLoop --> sampleDT{DT sample op knik?}
  sampleDT -->|nee| W07E["W-07 E thicknessFallback"]
  sampleDT -->|ja| angleCheck{hoek ok?}
  W07E --> angleCheck
  angleCheck -->|"25-26 + small spread"| W08A["W-08 A relax angle"]
  angleCheck -->|T-arm| W09B["W-09 B skip merge"]
  angleCheck -->|ok| doMerge[merge knik]
  W08A --> doMerge
  W09B --> mergeLoop
  doMerge --> more{changed?}
  more -->|ja W-10 A| mergeLoop
  more -->|nee| unify["W-11 B unifyNearEndpoints *2D_3E"]
  unify --> outL2[L2 segments]
```

---

## L3 — prune

```mermaid
flowchart TD
  inL2[L2 segments] --> spur{gemeten dikte voor spur?}
  spur -->|nee| W13E["W-13 E thicknessFallbackRefPx"]
  spur -->|ja| prune["W-12 A iterative-tx prune"]
  W13E --> prune
  prune --> more{nog korte I?}
  more -->|ja| prune
  more -->|nee| outL3[L3 segments]
```

---

## L4 — HV position

```mermaid
flowchart TD
  inL3[L3 segments] --> thick["W-14 E sampled / faceMedian / ref / policy"]
  thick --> place[position H/V]
  place --> freeEnd{endpoint binnen snap?}
  freeEnd -->|nee| W15B["W-15 B alleen as-update"]
  freeEnd -->|ja| snapJ[junction snap]
  W15B --> outL4[L4 positioned]
  snapJ --> outL4
```

---

## L5 — cleanup

Per face: cleanup-stappen achter connectivity-guard; eindfail → L4.

```mermaid
flowchart TD
  inL4[L4 face] --> iter["loop max 20 W-24 A"]
  iter --> compact["W-16 B compactCandidate *BouwTek11"]
  compact --> step{cleanup stap}
  step -->|same-line| W22A["W-22 A kort only *BouwTek11"]
  step -->|tx-micro| W20B["W-20 B stub guard *2D_3E"]
  step -->|ll-stair| W23A["W-23 A stair collapse"]
  step -->|micro-loops| W21B["W-21 B loop guards *BouwTek11"]
  step -->|dangling| W19A["W-19 A repairDangling"]
  W22A --> accept
  W20B --> accept
  W23A --> accept
  W21B --> accept
  W19A --> accept["W-17 B tryAcceptStep"]
  accept -->|guard fail| keepPrev[vorige work]
  accept -->|ok| workNext[work = accepted]
  keepPrev --> changed
  workNext --> changed{changed?}
  changed -->|ja| iter
  changed -->|nee| finalG{final connectivity ok?}
  finalG -->|nee| W18B["W-18 B rollback naar L4"]
  finalG -->|ja| outL5[L5 cleaned]
  W18B --> outL5
```

---

## L6 — connector / junction repair

Face-accept houdt laatste face-OK state (niet volledige L5-rollback).

```mermaid
flowchart TD
  inL5[L5 face] --> bestOk["bestFaceOk = L5"]
  bestOk --> loop["repair loop W-27 A"]
  loop --> conn[connector pass]
  conn --> keep1{face-ok?}
  keep1 -->|sanitize explode| W26B["W-26 B sanitize-skip raw"]
  keep1 -->|fail| roll1["W-25 B work = bestFaceOk *2D_3E"]
  keep1 -->|ok| land[landing pass]
  W26B --> land
  land --> keep2{face-ok?}
  keep2 -->|fail| keepBest1[keep bestFaceOk]
  keep2 -->|ok| junc[junction pass]
  keepBest1 --> junc
  junc --> keep3{face-ok?}
  keep3 -->|fail| roll1
  keep3 -->|ok| stable{converged?}
  stable -->|nee| loop
  stable -->|ja| outL6[L6 repaired]
  roll1 --> outL6
```

### L6 detail — detect / chamfer / junction

```mermaid
flowchart TD
  seed[connector seed] --> detect{primary detect hit?}
  detect -->|nee| W33A["W-33 A HVbridge / chainTip"]
  detect -->|ja| extras
  W33A --> extras["W-30 A extras sweep"]
  extras --> reindex["W-31 A seed re-index"]
  reindex --> resolve["W-34 A landing / simpleL / multi"]
  resolve --> near["W-35 A hvIncidentsNear"]
  near --> touch{seed on group?}
  touch -->|nee| W36B["W-36 B seedOnGroupTouch *2D_3E"]
  touch -->|ja| kind["W-28 B kind-accept"]
  W36B --> reject[reject candidate]
  kind -->|fail| reject
  kind -->|ok| chamfer["W-29 B chamfer multi-guard"]
  chamfer -->|fail| reject
  chamfer -->|ok| snapFar{shift te groot?}
  snapFar -->|ja| W37B["W-37 B verre-hit skip *2D_3E"]
  snapFar -->|nee| snapLong{lang + shift gt 8?}
  W37B --> reject
  snapLong -->|ja| W38B["W-38 B lang-segment skip"]
  snapLong -->|nee| landLoop["W-32 A landing sub-loop"]
  W38B --> reject
  landLoop --> junc[junction repair]
  junc --> splice{validatie ok?}
  splice -->|nee| W39B["W-39 B splice-rollback"]
  splice -->|ja| lSkip{landing-chamfer?}
  lSkip -->|ja| W40B["W-40 B skip L-repair"]
  lSkip -->|nee| diag{verre chamfer tip?}
  diag -->|ja| W41B["W-41 B unretractable diag"]
  diag -->|nee| lGuard["W-42 B repairLAtPoint"]
  lGuard --> band["W-43 E HV_BAND fallback 8px"]
  band --> done[candidate applied]
```

---

## L7 — chain align

```mermaid
flowchart TD
  inL6[L6 face] --> collapse[chain collapse]
  collapse --> bridge{dunne tussenbrug?}
  bridge -->|ja| W45A["W-45 A pickChainExtension"]
  bridge -->|nee| sample
  W45A --> sample{DT sample?}
  sample -->|nee| W46E["W-46 E thickness fallback DT-miss"]
  sample -->|ja| guard
  W46E --> guard["W-44 B withTopologyGuard"]
  guard -->|T/X daalt| rollback[input clone]
  guard -->|ok| outL7[L7 aligned]
  rollback --> outL7
```

---

## L8 — finalize HV

```mermaid
flowchart TD
  inL7[L7 face] --> hv2["W-47 A tweede HV + distance map"]
  hv2 --> prune["W-48 B once-ltx + protect T/X"]
  prune --> outL8[L8 finalized]
```

---

## L9 — dissolve

```mermaid
flowchart TD
  inL8[L8 face] --> chain["W-49 B chain pass + guard"]
  chain --> stub["W-49 B stub pass + guard"]
  stub --> cover["W-49 B parallel-cover *BouwTek11"]
  cover --> outL9[L9 dissolved]
```

---

## L10 — fmlReady

```mermaid
flowchart TD
  inL9[L9 face] --> chainG["W-50 B chain guard"]
  chainG --> straighten["W-51 A straightenCollinearAxis *BouwTek11 geen guard"]
  straighten --> micro{micro-corner ok?}
  micro -->|topo daalt| W52B["W-52 B skip micro-pass"]
  micro -->|ok| absorb[micro-corner absorb]
  W52B --> ready
  absorb --> ready{fmlReady?}
  ready -->|nee| W53B["W-53 B geen L8/L9 fallback"]
  ready -->|ja| outL10[L10 semantic source]
  W53B --> undef[undefined FML walls]
```

---

## Deuren — space policy

```mermaid
flowchart TD
  dual[FaceDualSpace] --> D01["D-01 stage1Measure white"]
  dual --> D02["D-02 clusterBridge ink"]
  dual --> D03["D-03 wallRescueMeasure ink"]
  dual --> D04["D-04 wallRescueMatch Either"]
  dual --> D05["D-05 wallFillMeasure ink"]
  dual --> D06["D-06 surround / wallTouch / bridge ink"]
  dual --> D07["D-07 refSwing white / framing ink"]
  dual --> D08["D-08 angleRescuePrefer white"]
```

---

## Door Stage 1 — seed / match / cluster

```mermaid
flowchart TD
  pipe[pipeDual] --> roots["root faces white D-01"]
  roots --> isWall{class wall?}
  isWall -->|ja| either["D-13 C / D-04 Either ink then white"]
  isWall -->|nee| cascade["D-15 A strict to clipped to sizeNear to shallow"]
  either --> matched{match?}
  cascade --> matched
  matched -->|undersized| D17A["D-17 A cluster-retry"]
  matched -->|ok| cluster[cluster grow]
  D17A --> cluster
  cluster --> inkBr["D-19 C / D-02 ink-bridge"]
  inkBr --> outS1[Stage1 hypotheses]
```

### Door Stage 1 detail — match cascade

```mermaid
flowchart TD
  cand[candidate] --> strict{strict aspect?}
  strict -->|ok| hit[accept]
  strict -->|fail| clipped["D-14 A clipped-arc"]
  clipped -->|ok| hit
  clipped -->|fail| sizeNear["D-09 A sizeNear 18pct *Project4"]
  sizeNear -->|ok| hit
  sizeNear -->|fail| shallow["D-10 A shallow under-min *2D_3E"]
  shallow -->|ok| hit
  shallow -->|fail wall| wallR["D-11 A wallRescueMatch 0.65"]
  wallR --> gate["D-12 B isWallRescueCandidate"]
  gate -->|ok| hit
  gate -->|fail| reject[reject]
  hit --> remap["D-16 C white-geom override"]
  remap --> band["D-18 A refAxisMinMaxRelax"]
  band --> done[matched]
```

### Door Stage 1 detail — cluster

```mermaid
flowchart TD
  seed[matched seed] --> neigh[neighbors]
  neigh --> bridge["D-19 C ink bridge"]
  bridge --> overshoot{bbox overshoot?}
  overshoot -->|ja| D21B["D-21 B tip-guard *probe-1"]
  overshoot -->|nee| absorb
  D21B --> skip[skip neighbor]
  absorb["D-22 A absorb +8pct"] --> clipC["D-20 A clipped-arc in groei"]
  clipC --> best["D-23 B best-score vs largest"]
  best --> hyp[cluster hypothesis]
```

---

## Door Stage 2 — fill / surround / angle-rescue / bridge

```mermaid
flowchart TD
  s1[Stage1 hyps] --> existing{existingDoorsOnly?}
  existing -->|ja| D61D["D-61 D skip fill surround wallTouch bridge"]
  existing -->|nee| fill["D-24 A wall-fill pass A"]
  fill --> fillBand["D-25 B fill-band 0.8-1.2"]
  fillBand --> mergeFill["D-26 A merge unclaimed"]
  mergeFill --> surround["D-27 B room-surround"]
  surround --> angleR
  D61D --> angleR[angle-rescue]
  angleR --> touch["D-28 B no_wall_touch"]
  touch --> bridge["D-40 A bridge-promote BFS"]
  bridge --> sticky["D-41 D sticky geen herpromote"]
  sticky --> attach["D-42 D post-bridge attach"]
  attach --> resolve["D-43 E width fallbacks"]
  resolve --> outS2[Stage2 + doorframes]
```

### Door Stage 2 detail — angle-rescue

```mermaid
flowchart TD
  ref{ref angle le 60deg?} -->|nee| skip["D-29 B not eligible"]
  ref -->|ja| classes["D-30 B allowedClasses"]
  classes --> height["D-31 C height Either pm15pct"]
  height --> hinge["D-32 C ink-hinge fallback *face262"]
  hinge --> tooLong{too long?}
  tooLong -->|ja| D33B["D-33 B rejected_too_long"]
  tooLong -->|nee| fillCap{fill gt 0.80?}
  fillCap -->|ja| D34B["D-34 B fill_cap"]
  fillCap -->|nee| noHinge{hinge ok?}
  noHinge -->|nee| D35B["D-35 B rejected_no_hinge"]
  noHinge -->|ja| angMis{angle ok?}
  angMis -->|nee| D36B["D-36 B angle_mismatch"]
  angMis -->|ja| inject["D-37 A inject angle_rescue"]
  inject --> prefer["D-39 A H/V + expectedAngle"]
  prefer --> rank["D-38 B keepBetterDiag"]
  rank --> accepted[angle-rescue hyp]
```

---

## L11 — door snap

```mermaid
flowchart TD
  door[resolved door] --> pathA{doorframe beschikbaar?}
  pathA -->|explicit IDs| D44P["D-44 P Path A explicit"]
  pathA -->|nee| D45A["D-45 A 1-hop doorframe"]
  D45A -->|nee| D46A["D-46 A multi-hop as-grow"]
  D44P --> bindA
  D46A --> bindA["D-47 A Path A segment-first *Project4"]
  bindA -->|hit| bound[BoundDoor]
  bindA -->|miss| pathB["D-48 A Path B swing-mask"]
  pathB -->|hit| bound
  pathB -->|miss| relax["D-49 A relaxed segment-match"]
  relax -->|hit| bound
  relax -->|miss| union["D-50 A wall-union anchor"]
  union -->|hit| bound
  union -->|miss| maskU["D-51 A wallMask op union"]
  maskU -->|hit| bound
  maskU -->|miss| legacy["D-52 A legacy wallMask bbox"]
  legacy -->|hit| bound
  legacy -->|miss| anchor["D-53 A anchor relaxed"]
  anchor -->|hit| bound
  door --> morph["D-54 A cluster morph-close"]
  morph --> dist["D-55 C min mask bbox dist"]
```

---

## L12 — door orient

```mermaid
flowchart TD
  bound[BoundDoor] --> purge["D-56 B kept-mask purge"]
  purge -->|no contact| drop[reject + unpin]
  purge -->|ok| swing180["D-57 A 180deg swing orient"]
  swing180 --> pathAB["D-58 A Path A vs B width"]
  pathAB --> hinge{hinge ok?}
  hinge -->|nee| D59B["D-59 B hard gate drop FML"]
  hinge -->|ja| blade{blade degenerate?}
  blade -->|ja| D60E["D-60 E swing-span maat"]
  blade -->|nee| oriented[OrientedDoor]
  D60E --> oriented
```

---

## Window Stage 1 — axel / strip

```mermaid
flowchart TD
  dual[pipeDual] --> rebind["R-01 C dual-rebind na detach"]
  rebind --> ref[analyzeWindowAxelRef]
  ref --> asym{asymmetrische rails?}
  asym -->|ja| R02A["R-02 A strip_stack *Project4"]
  asym -->|nee| rails
  R02A --> rails["R-03 A as-band uit rails"]
  rails --> metric["R-04 C ink-vs-white rail"]
  metric --> heights["R-05 E fullStripHeights fallback"]
  heights --> filter[runWindowAxelFilter]
  filter --> orient{orient miss?}
  orient -->|ja| R06A["R-06 A H/V retry"]
  orient -->|nee| cluster
  R06A --> R07E["R-07 E fallbackToPrimaryTarget"]
  R07E --> cluster[axel cluster]
  cluster --> calib["R-08 A bounded strip-calib *DeRoemer"]
  calib --> sample["R-09 A band to centroid"]
  sample --> tall["R-10 A height tol 70pct *2D_3E"]
  tall --> floors["R-11 E px floors 2/3/4"]
  floors --> spanG{as-span spreiding ok?}
  spanG -->|nee| R12B["R-12 B reject"]
  spanG -->|ja| inkBr["R-13 C wall-ink bridge relaxed"]
  inkBr --> outS1[Stage1 hypotheses]
```

---

## Window Stage 2 — deurboog

```mermaid
flowchart TD
  s1[Stage1 hyps] --> touch{touches door arc?}
  touch -->|white miss| R14C["R-14 C ink-adjacency 1-hop"]
  touch -->|ja| rejectArc[reject as window]
  R14C --> prop["R-15 A directional arc propagate"]
  prop --> dfCand[doorframeCandidates]
  rejectArc --> dfCand
  touch -->|nee| kept[Stage2 kept windows]
```

---

## Window Stage 3 — evidence

```mermaid
flowchart TD
  kept[Stage2 kept] --> evidence{evidence mode?}
  evidence -->|strip_stack| stack["R-17 C stack BFS ink *DeRoemer"]
  evidence -->|framing| frame["R-18 C framing OR white/ink"]
  evidence -->|passthrough| pass["R-16 A accept zonder bewijs"]
  stack --> early{span/heights?}
  early -->|nee| R20B["R-20 B early exit seed only"]
  early -->|ja| accepted
  frame --> soft["R-19 A framing soft-min 25pct"]
  soft --> accepted
  R20B --> accepted
  pass --> accepted[Stage3 accepted]
  accepted --> retarget["R-21 D late retarget naar doorframes"]
  retarget --> outS3[Stage3 + doorframes]
```

---

## Window Stage 4 — resolve

```mermaid
flowchart TD
  s3[Stage3 accepted] --> bbox["R-22 C glass whiteThenInk / frame inkThenWhite"]
  bbox --> measure{dual geom?}
  measure -->|nee| R23E["R-23 E unionBBox fallback"]
  measure -->|ja| merge
  R23E --> merge["R-24 A cross-ref stack-merge"]
  merge --> dedupe["R-25 B framing de-dupe score"]
  dedupe --> resolved[ResolvedWindowCandidate]
```

---

## L14 — window bind / merge

```mermaid
flowchart TD
  resolved[Stage4 windows] --> bind[window-wall-bind]
  bind --> width{widthPx gt 0?}
  width -->|nee| R26E["R-26 E projected bbox-span"]
  width -->|ja| merge
  R26E --> merge["R-27 A adjacent merge double/triple *2D_3E"]
  merge --> fmlWin[FML windows]
```

---

## L13

Bestaat niet. Nummering springt van L12 (deur) naar L14 (raam).

---

## Verwijzingen

- [`escalatiepaden-inventaris.md`](escalatiepaden-inventaris.md) — tabellen + triggers
- [`escalatiepaden-tagindex.md`](escalatiepaden-tagindex.md) — code-locaties
- [`escalatiepaden-aanpak.md`](escalatiepaden-aanpak.md) — opruim-aanpak
- [`door-detection-flow.md`](door-detection-flow.md) / [`window-detection-flow.md`](window-detection-flow.md)
