# L6 connector-engine — fragiliteits-audit ("probe-tuning" & magic numbers)

Status: **Fase 1 uitgevoerd** (Layer6Scale + HV-band threading). Datum: 2026-07-17.
Doel: alle plekken in de L6-laag (`cv/walls/rooms/pipeline-v3/engines/connector/**` + `layer-6-repair.ts`)
in kaart brengen die **niet schaal-/tekening-onafhankelijk** zijn, zodat we ze later systematisch en
correct kunnen herbouwen. Dit document beschrijft **waar** en **hoe** het breekt en een voorgestelde
oplosrichting — het verandert nog geen gedrag.

> Scope: alleen L6 (connector/chamfer-repair). L3–L5, L7–L10 vallen buiten deze audit.

---

## 0. Belangrijkste conclusie (lees dit eerst)

Er is één misverstand dat ik expliciet wil rechtzetten, want het bepaalt de fix-strategie:

- **Er staan GEEN letterlijke coördinaten in de runtime-condities.** Ik heb de hele
  `pipeline-v3` doorzocht op alle bekende probe-getallen (`572, 660, 1489, 653, 587, 908, 1509,
  1058, 1044, 645, 234, 506, 1354, 1229, 1515, 266, 560, 573, 577, …`). Ze komen **uitsluitend in
  commentaar** voor, nooit in een `if`/guard. De runtime-logica is dus **translatie-invariant**:
  dezelfde tekening 1000px verschoven geeft identieke topologie.

- **De echte fragiliteit zit in twee dingen:**
  1. **~50 harde pixel-/hoek-drempels die NIET met de muurdikte (`referenceWallThicknessPx`)
     meeschalen.** Dit breekt bij een **schaalverschil**, en dat is precies wat "dezelfde
     plattegrond niet gecropt in stap 1" veroorzaakt: stap 1 doet `normalizeWorkingCanvas`
     (whitespace-trim + upscale naar min. 2000px). Croppen/niet-croppen ⇒ andere content-bounds
     ⇒ **andere upscale-factor** ⇒ andere pixels-per-mm. De ref-geschaalde drempels passen zich aan,
     maar de ~50 vaste getallen (`8, 12, 18, 36, 40, 48, 200 px`, `28°/75°`, `1.15`, `0.45`, …) niet.
     Op 2× schaal is een `minArm = 12px` guard ineens "een halve muur" i.p.v. "een hele muur".
  2. **Over-fit vertakkingslogica.** De volgorde en de exacte conditie-combinaties van de
     chamfer-branches (landing vs. simple-L vs. T-jog vs. inverted) zijn omgekeerd-ontworpen tegen
     **twee** tekeningen (BouwTek11, 2D_3E). De probe-comments bewijzen dat: elke tak heeft een
     `@coördinaat`-anker. Ook al zijn de condities parametrisch, ze zijn **niet gevalideerd** op
     andere plattegronden of andere schalen.

- **De tests bevriezen de over-fit.** De L6-fixtures zijn absolute-coördinaat-snapshots van
  BouwTek11/2D_3E, en `describe`-blokken heten letterlijk `@572`, `@1489`, `@1509`. Een refactor die
  de machinerie generaliseert breekt deze tests, ook als het resultaat objectief beter is.

**Kortom:** de user-intuïtie klopt in effect ("niet-gecropt ⇒ breekt"), maar het mechanisme is
**schaal**, niet translatie. De fix is daarom: (a) alle vaste px/hoek-drempels afleiden uit
`referenceWallThicknessPx`, (b) de branch-logica generaliseren + de probe-comments vervangen door
benoemde geometrische invarianten, (c) tests omzetten naar translatie-/schaal-invariante fixtures.

---

## 1. Severity-categorieën

| Cat | Beschrijving | Breekt bij | Aantal |
|-----|--------------|-----------|--------|
| **A** | Letterlijke coördinaat in runtime-conditie | élke crop/verschuiving | **0** (goed nieuws) |
| **B** | Vaste px/hoek-drempel, niet ref-geschaald | schaalverschil (crop → re-normalize, andere DPI, andere tekenschaal) | **0 in L6 runtime (opgelost in Fase 1)** |
| **C** | Over-fit branch-logica (probe-comment-ankers) | andere plattegrond-topologie / schaal | **~10 takken** |
| **D** | Tests/fixtures op absolute coördinaten | blokkeren generalisatie | **2 specs + fixtures** |
| **E** | Dode code (restanten) | n.v.t. (ruis/onderhoud) | **0 in L6 runtime (opgelost in Fase 1)** |

---

## 1A. Update na Fase 1 (geïmplementeerd)

- `Layer6Scale` is toegevoegd in `connector/constants.ts` als **enige ref-geschaalde bron** voor
  arm/jog/stub/chain-budgetten (`hvBandPx`, `armStrictPx`, `armLoosePx`, `minVArmPx`,
  `shortHStubPx`, `jogEpsilonPx`, `shortDiagonalPx`, `consensusReachPx`, `stubCapPx`,
  `stubTipChainPx`, plus bestaande `connectorMaxPx/axisChainPx/maxAttachmentShiftPx/...`).
- `classifyLayer6Segment(s)` accepteert nu `hvBandPx` (default `8`) en die band is doorgetrokken
  door de connector-engine en aanpalende helpers (`connector/**`, `collapse/adjacency.ts`,
  `prune/index.ts`).
- De kale lengtedrempels uit Cat B zijn vervangen door `scale.*` of benoemde dimensieloze
  constanten (`LAYER6_DIAGONAL_MAX_RATIO`, `LAYER6_BRIDGE_MAX_SHIFT_RATIO`, etc.).
- Dode code uit Cat E is verwijderd:
  - `segment-classify.ts`: `normalizeUndirectedDeg`, `undirectedAngleDiffDeg`
  - `chamfer-chain.ts`: `isShortDiagonalSegment`
- Verificatie:
  - `vitest run tests/cv/walls/pipeline-v3/layer-6-repair.spec.ts tests/cv/walls/pipeline-v3/layer-6-report26-corners.spec.ts` → **15/15 groen**
  - `vitest run tests/cv/walls/pipeline-v3` → **97/97 groen**

---

## 2. Cat B — historische inventaris (opgelost in Fase 1)

Referentie: de ref-geschaalde helpers in `engines/connector/constants.ts` zijn de **goede baseline**
(`resolveLayer6ConnectorMaxPx`, `…AxisChainPx`, `…ArmDetectPx`, `…MaxAttachmentShiftPx`,
`…ThicknessMarginPx`). Alles hieronder omzeilt die baseline met een kaal getal.

### 2.1 `constants.ts`
| Regel/naam | Waarde | Probleem |
|---|---|---|
| `LAYER6_HV_ANGLE_TOL_DEG` | `12°` | hoek-tolerantie H/V-classificatie; vast (schaal-neutraal, maar over/onder-fit-gevoelig) |
| `LAYER6_ENDPOINT_SNAP_PX` | `1.25` | sub-pixel weld — acceptabel als echte epsilon, maar wordt overal `×2` gebruikt als "nabijheid" (zie hieronder) |
| `LAYER6_CHAMFER_L_GUARD_PX` | `12` | vast, niet ref-geschaald |
| `LAYER6_ARM_DETECT_MIN_PX` / `_MAX_PX` | `22` / `50` | clamp-grenzen probe-afgeleid; ketenen `resolveLayer6ArmDetectPx` op vaste band |

### 2.2 `segment-classify.ts`
| Regel | Code | Probleem |
|---|---|---|
| 35 | `classifyHvOrientation(seg, 8)` | vaste 8px H/V-band |
| 22,27 | `tolDeg = LAYER6_HV_ANGLE_TOL_DEG` (12°) | zie boven |

### 2.3 `chamfer-chain.ts` (grootste opeenhoping)
| Regel | Code | Probleem |
|---|---|---|
| 78 | `for (… step < 16 …)` | vaste max keten-lengte (16 stappen) |
| 52 | `dot < -0.25` | anti-parallel-drempel (~104°), vast |
| **308** | `maxChainPx: 200` | **kale 200px** — geen ref-scaling; grootste schaal-lek |
| 328 | `inc.lengthPx >= 18` | vaste min V-arm |
| 359–360 | `minV = 12`, `minH = 4` | vaste arm-minima |
| 391, 417, 593 | `minArm ?? 12` | vaste arm-minimum default (3×) |
| 449 | `Math.min(minArm, 2)` | vaste 2px "y-jog @660"-uitzondering |
| 467 | `inc.lengthPx >= 2` | vaste 2px H-stub |
| 478, 510 | `diagLen <= maxConnectorPx * 1.25` | ratio (semi-ok, maar magische 1.25) |
| 482, 514 | `dx < 2 || dy < 2` | vaste 2px diagonaal-check |
| 507 | `<= Math.min(maxConnectorPx, 12)` | 12px cap bovenop ref |
| 665, 669 | `> 2`, `> 4` | vaste jog-drempels |
| 679 | `maxLengthPx = 36` | vaste "korte diagonaal" |
| 684 | `dx > 1.5 && dy > 1.5` | vaste diagonaal-ondergrens |

### 2.4 `chamfer-group-geometry.ts`
| Regel | Code | Probleem |
|---|---|---|
| 89 | `for (… step < 8 …)` | vaste uitbreidingslimiet |
| 129 | `` `${x.toFixed(2)}:${y.toFixed(2)}` `` | float-gekeyde `Set` — jitter/rounding-fragiel |
| 254 | `Math.max(span, 40)` | vaste 40px reach |
| 288, 318 | `minArmPx: 8` | vaste 8px arm |
| 343 | `angleFromH < 28 \|\| > 75` | vast hoek-venster (28°–75°) voor "ondiepe jog"-skip |
| 396 | `maxConnectorPx * 0.5` | magische 0.5 |
| 403 | `reach > maxConnectorPx * 2` | magische 2 |
| 408–409 | `Math.min(maxConnectorPx, 12)` | 12px cap |
| 446 | `Math.min(maxConnectorPx * 2, 48)` | vaste 48px |
| 532–533 | `LAYER6_ENDPOINT_SNAP_PX * 2` | nabijheid als 2× epsilon |
| 556–560 | `*2`, `*1.5`, `*0.35` | drie magische ratio's in één `Math.max` |

### 2.5 `chamfer-group-apply.ts`
| Regel | Code | Probleem |
|---|---|---|
| 32 | `> params.maxArmShift * 3 && shift > 8` | magische `*3` + vaste 8px |
| 53, 186, 192 | `* 1.5` | magische ratio |
| 213 | `dy > 2` | vaste 2px |
| 234 | `junctionDist > 4 && <= collapseShift * 1.35` | vaste 4px + magische 1.35 |
| 250 | `inc.lengthPx > 12` | vaste 12px |
| 360 | `> 2` | vaste 2px |
| 375 | `> maxConnectorPx * 2` | magische 2 |
| 390 | `Math.min(maxConnectorPx, 12)` | 12px cap |

### 2.6 `connector-detect.ts`
| Regel | Code | Probleem |
|---|---|---|
| 75 | `hAtT.length < 2` | topologie-telling (ok van aard) |
| 82 | `<= LAYER6_ENDPOINT_SNAP_PX * 2` | nabijheid als 2× epsilon |
| 140 | `< 4` | vaste 4px |
| 164–165 | `* 2`, `* 0.35` | magische ratio's |
| 173, 380 | `> maxConnectorPx \|\| < 1` | vaste 1px ondergrens |
| 306 | `maxConnectorPx * 2` | magische 2 |
| 464 | `> maxConnectorPx * 1.35` | magische 1.35 |

### 2.7 `arm-detect.ts`
| Regel | Code | Probleem |
|---|---|---|
| 97 | `offThrough > alongThrough * 0.45` | magische 0.45 |
| 152–153 | `dx > dy * 1.15` / `dy > dx * 1.15` | magische 1.15 H/V-beslissing |

### 2.8 `junction-repair.ts` (reeds bekend uit eerdere sessie)
| Regel | Code | Probleem |
|---|---|---|
| ~91 | `Math.max(12, maxConnectorPx * 0.35)` | vaste 12px vloer + magische 0.35 |
| ~175 | `Math.max(12, maxConnectorPx * 0.55)` | vaste 12px + magische 0.55 |
| ~274 | `Math.max(10, round(maxConnectorPx * 0.35))` | vaste 10px + 0.35 |

> **Patroon:** `12` (arm-minimum), `2`/`4` (jog-epsilon), `8` (H/V-band + arm), `×2` (nabijheid),
> `1.25/1.35/1.5/0.35/0.45/0.5/0.55/1.15` (ongenoemde ratio's), `36/40/48/200` (vaste lengtes).
> Vrijwel elk hiervan hoort een **functie van `referenceWallThicknessPx`** te zijn.

---

## 3. Cat C — over-fit vertakkingslogica (probe-ankers)

Deze takken zijn parametrisch maar hun conditie-combinatie/volgorde is afgestemd op specifieke
gevallen. Het `@`-anker in het commentaar = de enige bekende validatie.

| Locatie | Tak | Probe-anker | Generalisatie-risico |
|---|---|---|---|
| `chamfer-chain.ts` 471–500 | "inverted landing" (through-H op junction, V op landing) | `west @653` | volgorde vóór T-jog; ongetest op andere layout |
| `chamfer-chain.ts` 502–532 | "T-jog" (korte H+V stubs + lange V op landing) | `export 49 @660, y-jog` | 2px-uitzondering (regel 449) specifiek hiervoor |
| `chamfer-chain.ts` 544–557 | echte L vs. klassiek through-T | `BouwTek11 @1489` | telling `hAtLanding/vAtJunction` handmatig afgeregeld |
| `chamfer-chain.ts` 616–631 | simple-L blokkeren bij ≥2 H/V | `BouwTek11 @1489` | voorkomt T→I; grens is telling, niet geometrie |
| `chamfer-group-geometry.ts` 338–344 | ondiepe-jog/near-verticaal skip | `28°/75°` | vast hoek-venster, geen ref/context |
| `chamfer-group-geometry.ts` 405–429 | landing-brug bij korte V-jog of ≥2 H | `west @660` | 12px cap bepaalt "kort" |
| `chamfer-group-geometry.ts` 529–554 | "seed moet aan groep-touch hangen" | `geen T@572 via diag@587` | anti-false-positive guard, ongetest breed |
| `chamfer-group-apply.ts` 31–33 | `allowLongSegment` + `*3 && >8` | `export 47 oost-T 1058→1044` | voorkomt plat-trekken lange arm |
| `segment-ops` / `cleanup` | opposite T-arm ~180° niet matchen | `@645,243` | directed-angle guard |
| `chamfer-group-geometry.ts` 118–155 | trap vs. chamfer (draaizin) | (geen anker) | dit is een échte geometrische invariant — goed voorbeeld |

**Observatie:** de trap-detectie (draaizin wisselt = trap, gelijk = chamfer) is precies hoe het
hoort — een **geometrische invariant zonder coördinaat/schaal**. Dat is het model voor de rest.

---

## 4. Cat D — tests die de over-fit bevriezen

- `frontend/tests/cv/walls/pipeline-v3/layer-6-repair.spec.ts`
  - Fixtures = absolute-coördinaat segment-arrays van BouwTek11/2D_3E (regels 100–117, 320–324, …).
  - `describe`/`it` benoemd op probe: `@572`, `@587`, `@1489`, `@1509`.
  - Assert op specifieke coördinaten (`x: 645.37…`, `x: 1515.26`, …) i.p.v. op **invarianten**
    (aantal I/L/T/X-junctions, 0 diagonalen, convergentie ≤N iteraties).
- `frontend/tests/cv/walls/pipeline-v3/layer-6-report26-corners.spec.ts` — idem, fixture-gebonden.
- Fixture-bestand: `…/fixtures/BouwTek11-layer-debug-v2-47.json` (absolute snapshot).

**Gevolg:** je kunt de machinerie niet generaliseren zonder deze tests te herschrijven → ze werken
nu als *anti-refactor-slot* i.p.v. als vangnet.

---

## 5. Cat E — historische inventaris (opgelost in Fase 1)

| Locatie | Symbool | Status |
|---|---|---|
| `segment-classify.ts` 16–20, 88–90 | `normalizeUndirectedDeg`, `undirectedAngleDiffDeg` | **verwijderd in Fase 1** |
| `chamfer-chain.ts` 679–685 | `isShortDiagonalSegment` | **verwijderd in Fase 1** |
| (algemeen) | `LAYER6_ENDPOINT_SNAP_PX * 2`-idioom | 8+ keer gedupliceerd; hoort één benoemde `NEARBY_PX` te zijn |

> Losse dode restanten uit vorige sessie (`repairConnectors`, `countShortDiagonalSegments`,
> `resolveLayer6TopologyRefPx`, `collinearSealed`) zijn al verwijderd — zie `memory.mdc` 2026-07-15.

---

## 6. Voorgestelde oplosrichting (later, gefaseerd)

**Fase 1 — één schaal-bron (laagste risico, grootste winst).**
- Introduceer `Layer6Scale` (afgeleid van `referenceWallThicknessPx`) met **benoemde ratio's**:
  `armMinPx`, `jogEpsilonPx`, `nearbyPx`, `stubMaxPx`, `chainMaxPx`, `hvBandPx`, `shallowJogDeg`.
- Vervang élk kaal getal uit §2 door een veld van `Layer6Scale`. Geen losse `12`/`200`/`0.35` meer.
- Fallback-ref (nu ~30px) blijft, maar wordt de enige plek met een absoluut getal.

**Fase 2 — invariantie-tests vóór refactor van logica.**
- **Translatie-invariantie:** neem elke fixture, offset alle punten `+ (1234, 987)`, assert
  **identieke** junction-kind-telling + 0 diagonalen. (Zou nu al moeten slagen — legt de lat vast.)
- **Schaal-invariantie:** schaal fixture + ref met `×1.5` en `×0.6`, assert identieke topologie.
  Dit **faalt vermoedelijk nu** en maakt de §2-lekken hard zichtbaar.
- Herschrijf de bestaande asserts naar invarianten (kinds/convergentie), weg van coördinaten.

**Fase 3 — logica generaliseren.**
- Vervang probe-comment-ankers door benoemde geometrische invarianten (zoals de trap/draaizin-check).
- Voeg **meer plattegronden** als L5→L6-fixtures toe (niet alleen BouwTek11/2D_3E) om te zien of de
  guards generaliseren; pas condities aan tot ze schaal- én tekening-onafhankelijk zijn.

**Acceptatie-invarianten (moeten altijd gelden):**
1. Output-topologie is invariant onder translatie van de input.
2. Output-topologie is invariant onder uniforme schaal (input + `referenceWallThicknessPx` samen).
3. Geen enkel absoluut pixel-/hoekgetal in runtime buiten `Layer6Scale` + één ref-fallback.
4. Geen `@coördinaat` in commentaar als enige rechtvaardiging; alleen benoemde invarianten.

---

## 7. Snelle verificatie-commando's

```bash
# Cat A-check: letterlijke coördinaten in runtime (moet leeg blijven, alleen comments matchen)
rg -n "\b(572|660|1489|653|587|1509|1058|1044|645|1515)\b" frontend/src/cv/walls/rooms/pipeline-v3

# Cat B-check: kale magic numbers in connector-engine
rg -n "\?\?\s*\d|Math\.min\([^,]*,\s*\d|>=?\s*\d{2}|<\s*-?0\.\d" \
  frontend/src/cv/walls/rooms/pipeline-v3/engines/connector

# Cat D-check: absolute coördinaten in tests
rg -n "x:\s*\d{3,4}|@\d{3,4}" frontend/tests/cv/walls/pipeline-v3
```
