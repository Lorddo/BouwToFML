# Escalatie — doorspreken 0/N & rest (per cascade)

Peildatum: 2026-08-01 · Bron: grootboek 6 fixtures · Aanpak: [`escalatiepaden-aanpak.md`](escalatiepaden-aanpak.md) · Diagrammen: [`escalatiepaden-lagen-diagrammen.md`](escalatiepaden-lagen-diagrammen.md)

**Doel:** één cascade / één laag per sectie bespreken. Geen mengeling van L2 + L5 + L7 in één vraagblok.

**Spelregels:** nog niets knippen tot go per cascade. Verdicts: PROMOVEREN · HERLEIDEN · AFBAKENEN · VERWIJDEREN · BEHOUDEN (F). Kill-switch vóór code-VERWIJDEREN.

---

## Hoe dit document lezen

1. Elke **sectie = één cascade** (één laag of één FML-keten).
2. Eerst **omringende techniek** (wat de laag doet), dan de 0/N-ID’s.
3. Antwoorden / open vragen onderaan de sectie.
4. Secties die al klaar zijn: kort + verdict, niet opnieuw.

Pipeline-volgorde (alleen muren L2–L10 relevant voor open 0/N):

```text
L2 jitter → L3 prune → L4 HV → L5 cleanup → L6 connector
  → L7 chain align → L8 finalize HV → L9 dissolve → L10 fmlReady
```

---

## Status-overzicht

| Sectie | Cascade | Open ID’s | Status |
|---|---|---|---|
| 1 | L2 jitter | W-09 | **AFBAKENEN** (2026-08-01) |
| 2 | L5 parallel / micro-loop | W-21 | **AFBAKENEN** (2026-08-01) — same-line ≠ parallel-cover (zie §2) |
| 3 | L7 chain + dikte | W-46 | zero-length **weg**; DT-miss = echte fallback (**AFBAKENEN**) |
| 4 | L8 finalize | — | geen 0/N; context voor L7/L9 |
| 5 | L9 parallel-cover | — | relevant t.o.v. W-21; geen 0/N |
| 6 | Semantic / fmlReady-gate | W-53 | **AFBAKENEN**; X-21 = alias (**DRY**) |
| 7 | FML conversie-fallbacks | X-03…05,07…09,12,24 | **AFBAKENEN** (alle) |
| 8 | Deuren L11/L12 guards | D-42, D-56, D-59 | **AFBAKENEN** (alle) |
| 9 | REF band-default | REF-14 | **hard fail** (stille 12/23 weg) |
| 10 | Dode niveaus in levende paden | W-07, W-14 | W-07 laten; W-14 dode niveaus **weg**; X-22 ok |
| 11 | Buiten scope / niet bereikt | zie §11 | afgevinkt |
| 12 | Gedeeltelijk k/N | 7 ID’s | **klaar** — alle AFBAKENEN |

---

## 11 — Buiten scope (afvinken, niet knippen-discussie)

| ID | Reden |
|---|---|
| D-45, D-49…53, R-26 | Al VERWIJDEREN → weg |
| X-17 | Al BEHOUDEN (F) |
| X-18, X-19, X-20 | Underlay-meting **niet in E2E-pad** → 0 ≠ dood |
| X-23 | OpenCV-fail; E2E laadt altijd CV → niet bereikt |
| X-11, X-13…15, X-17 | Al FML-batch BEHOUDEN (F) |
| X-16 | Was −14 vloerdikte; **nu** az/bz = floor.height (2026-08-01) |

---

## 1 — Cascade L2: jitter-merge

### Omringende techniek

L2 merget knikken die te dicht op elkaar zitten (jitter). Per kandidaat-paar:

1. Optioneel dikte uit distance-map (anders W-07 fallback — die vuurt alleen `sampled` in E2E).
2. Hoek/spread-check; soms **W-08** relax.
3. **W-09**: als er een loodrechte T-arm op de knik zit → **merge overslaan** (voorkomt T→I).
4. Anders merge (**W-10**).

Zie diagram L2 in `escalatiepaden-lagen-diagrammen.md`.

### 0/N

| ID | Cat | E2E | Betekenis |
|---|---|---|---|
| **W-09** | B | 0/6 | `branch_guard_skip` — T-arm aanwezig → geen merge |

### Besluit

| ID | Verdict | Datum | Notitie |
|---|---|---|---|
| **W-09** | **AFBAKENEN** | 2026-08-01 | Mag blijven (safety-net bij rare T-knoop). |

---

## 2 — Cascade L5: parallel / same-line / micro-loop

**Dit is de juiste thuis van W-21** — niet “L2/L5 gemengd”.

### Omringende techniek (L5 cleanup-lus, ≤20 iteraties)

Volgorde in `layer-5-cleanup.ts` per iteratie:

| Stap | Functie | ESC | Wat |
|---|---|---|---|
| 1 | `mergeSameLineSegments` | **W-22** | H/V-segmenten op **dezelfde as** (offset ≤ `sameLineMaxOffsetPx`) → cluster merge; alleen als er een **kort** segment in de cluster zit |
| 2 | `cleanupTxMicroSegments` | W-20 | Micro T/X stubs |
| 3 | `cleanupLlStairs` | W-23 | LL-stair collapse |
| 4 | `cleanupMicroLoops` | **W-21** | Twee **korte** segmenten die een start delen, bijna dezelfde richting, beide verre einden = leaf → **kortste weg** |
| 5 | dangling weld | W-19 | … |

Elke stap door **W-16/W-17** accept-grid + connectivity-guard.

L4 (vóór L5) en L8 (ná L6/L7) duwen segmenten op H/V-assen — daardoor komen “bijna parallel, net niet exact collinear” situaties dichter bij elkaar. Dat is precies het scenario dat jij beschrijft.

### Parallel-technieken naast elkaar

| Techniek | Laag | Input-patroon | Actie | Verschil t.o.v. W-21 |
|---|---|---|---|---|
| **Same-line (W-22)** | L5 | Meerdere H of V op **zelfde cross** (y of x), overlap/aaneengesloten | Herschrijf tot één lijn / cuts | Vereist echte H/V + gedeelde as; geen “Y met 25° lens” |
| **Micro-loop (W-21)** | L5 | Gedeeld startpunt, hoek ≤25° directed, lengte ≤ ref, beide einden degree=1 | Verwijder kortste segment | Juist voor **net-niet-zelfde-lijn** na eerdere druk; guard degree≥2 (BouwTek11) |
| **HV position** | L4 / L8 | Segmenten + DT | As verschuiven | Geen delete; maakt same-line/micro-loop later makkelijker |
| **Chain collapse (W-45)** | L7 | Collinear ketens tussen junctions + dikte-compat | Collapse keten | Junction-graph, niet “twee korte parallelle leaves” |
| **Parallel-cover** | **L9** | H/V wiens span al **volledig gedekt** wordt door andere same-axis segmenten | Verwijder (of split) redundant | Later; “korte V op through-V” (BouwTek11) — **overlap-cover**, geen gedeeld start + leaf-guard |

### Same-line (W-22) vs parallel-cover — niet hetzelfde

Kort antwoord: **nee, niet hetzelfde**, en **niet zomaar tot één algoritme te maken** zonder gedrag te veranderen. Ze raken soms dezelfde *klasse* “twee H/V op één as”, maar met andere preconditie en andere output.

| | **Same-line (L5 / W-22)** | **Parallel-cover (L9)** |
|---|---|---|
| **Wanneer** | Vroeg in cleanup, vóór L6 connector | Laat, ná L7/L8; graph is al “af” |
| **Trigger** | Cluster op dezelfde as **én** minstens één **kort** segment (`≤ thicknessFallback`) | Iemands **hele span** zit in de **unie** van de andere same-axis spans (cover) |
| **Actie** | Cluster **herschrijven**: cuts op alle eindpunten + loodrechte aansluitingen → nieuwe segmenten op één `cross` | **Victim weg**; survivors desnoods **splitsen** op unique endpoints zodat T’s op de through-line blijven |
| **Doel** | Gefragmenteerde / overlapping same-line **samenvoegen tot nette as** | Redundante parallel die al **dubbel** ligt t.o.v. een langere lijn **absorberen** |
| **Typisch beeld** | Twee korte stukjes + overlap → één lijn met knoop-cuts | Korte V die volledig “onder” een langere V ligt → korte weg, lange krijgt T-splits |
| **Gate** | Zonder kort segment: `skip_no_short` (W-22) — lange parallelle muren met klein offset blijven | Geen “kort”-eis; cover is genoeg (eps/band) |
| **Policy** | Altijd in L5 | Alleen L9 (`enableParallelCover: true`); L7/L10 hebben die flag uit |

**Waarom niet “hetzelfde maken”:**

1. **Timing:** same-line in L5 beïnvloedt wat L6 connector ziet. Parallel-cover in L9 mag pas als junctions/HV al gestabiliseerd zijn — anders breek je T/X die L6 net heeft gezet.
2. **Operatie:** merge-herschrijf ≠ cover-delete+split. Same-line *creëert* een canonieke lijn; cover *verwijdert* een overbodige.
3. **Preconditie:** W-22 weigert clusters zonder kort segment (bewust, BouwTek11). Cover zou die lange-dubbel-rails wél raken als span covered is — agressiever / ander risico.
4. **Gemeenschappelijke kern (optioneel later lean):** “cluster H/V binnen axis-eps” is wel DRY-baar als **helper**, maar de *beslisregel* (short-merge vs cover-absorb) blijft twee policies.

Concreet: ze zijn **zusjes in clustering**, **neven in intentie** — niet elkaars vervanger, en W-21 blijft een derde (near-parallel leaf-pair).

### 0/N

| ID | Cat | E2E | Niveaus (als die vuren) |
|---|---|---|---|
| **W-21** | B | **0/6** | `removed` / `guard_degree` — geen van beide in snapshots |

Anker in inventaris: **BouwTek11**. Fixture `bouwtek11` zit in de 6 — toch 0 hits. Plausibel: onderlegger/preprocess + L4 HV hebben het patroon al weg vóór L5, of same-line pakt het eerder, of anker is verouderd.

### Jouw input (2026-08-01)

> Parallelle lijnen ergens weghalen; W-21 vooral skeletten die net niet exact dezelfde lijn lopen (X/T rare hoeken). Voorgaande lagen drukken ze dichter zonder junctions te breken. Onderlegger aangepakt → misschien minder/niet meer. Vergelijk met andere parallel-techniek.

> W-21 blijft. Vraag: same-line en parallel-cover hetzelfde / hetzelfde te maken?

### Besluit

| ID | Verdict | Datum | Notitie |
|---|---|---|---|
| **W-21** | **AFBAKENEN** | 2026-08-01 | Blijft (zeldzame rest-guard na betere onderlegger). |

Same-line ≠ parallel-cover; niet samenvoegen tot één pad zonder aparte lean-besluit (hooguit gedeelde cluster-helper).

---

## 3 — Cascade L7: chain align + diktemeting

**W-46 hoort hier**, niet bij L5. L8 is een andere laag (sectie 4).

### Omringende techniek (L7)

Per face (`layer-7-align.ts`):

1. **`buildThicknessBySegment`** — per segment dikte uit wall distance-map (DT×2), anders fallback.
2. **`collapseInterJunctionChains`** — collinear ketens tussen junctions inklappen; **W-45** bij dunne tussenbrug.
3. **`withTopologyGuard` (W-44)** — als T/X-count daalt of endpoint verdwijnt → rollback naar input.

Dikte wordt gebruikt om te bepalen of twee collinear kandidaten **compatible** zijn (zelfde band) of via een **brug** (W-45).

### Wat W-46 is (na 2026-08-01)

In `engines/collapse/thickness.ts` → `sampleSegmentThicknessPx`:

| # | Situatie | Resultaat | Journaal |
|---|---|---|---|
| ~~1~~ | ~~zero-length~~ | — | **weg** — L5/L6 droppen zero-length al |
| **2** | DT-sample ok | gemeten dikte | geen W-46 |
| **3** | DT mist / geen map / dt≤0 | `reference ?? thicknessFallbackPx` | **`tally('W-46', sample_miss\|no_map)`** |

Zelfde helper in L7 / L9 / L10.

### Besluit

| Deel | Verdict | Datum | Notitie |
|---|---|---|---|
| Zero-length-tak | **VERWIJDEREN** → **weg** | 2026-08-01 | Code geknipt |
| DT-miss (echte fallback) | **AFBAKENEN** | 2026-08-01 | Blijft; nu wél geteld |

---

## 4 — Cascade L8: finalize (context, geen open 0/N)

Kort, zodat L7 niet met L8 verward wordt:

1. Weld → **HV reposition** met DT (**W-47**, dikte via **W-14**).
2. **I-spur prune** eens (**W-48**).
3. Drop zero-length + dedupe.

Geen W-46 hier. Parallel-lijnen worden hier niet “weggehaald”, alleen op as gezet.

---

## 5 — Cascade L9: parallel-cover (context t.o.v. W-21)

L9 dissolve: chain + stub + **`parallelCoverAbsorb`** (alleen L9 policy `enableParallelCover: true`).

- Verwijdert H/V waarvan de **span al gedekt** is door andere same-axis segmenten.
- Anker-achtig: BouwTek11 short-V op through-V.
- Journaal via **W-49** cover-takken (niet 0/N).

Relevant als je W-21 wilt “vervangen”: L9 dekt **cover-redundantie**, niet micro-loop leaf-pairs.

---

## 6 — Cascade semantic / fmlReady-gate

### Wat er gebeurt (omringende techniek)

Na muren-pipeline L1–L10 wil FML een **semantic wall graph** (segmenten + junctions + dikte). Die mag **alleen** uit L10 komen, en alleen als de run `fmlReady` is.

```text
pipeline V3 klaar?
  └─ summary.fmlReady === true  (nu: native through L10)
        └─ layer10.segments.length > 0
              └─ build semantic graph → FML
        anders: géén semantic → géén FML-muren uit deze bron
  anders: idem — géén L8/L9 als stille vervanger
```

Code: `resolveFmlSourceLayer` in `build-semantic-walls-source.ts`.  
`hasFmlSemanticSource` = die resolve levert minstens één segment.  
`buildSemanticWallsForOutput` stopt meteen als de gate faalt.

`fmlReady` zelf (`native-layers.ts`): true wanneer `V3_NATIVE_THROUGH_LAYER >= 10`. Vandaag staat die constant op **10**, dus na een normale V3-run is fmlReady altijd true. De gate is er voor:

- incomplete / progressive V3 (historisch: native nog niet tot L10);
- ontbrekende `pipelineV3Debug`;
- L10 leeg (0 segmenten) terwijl fmlReady wel true is.

Bewust **geen** fallback naar L8/L9 — dat was vroeger “layer B”; vlag `semanticUsedLayerBFallback` bestaat nog maar wordt altijd `false` gezet (X-27 / dood spoor).

### 0/N

| ID | Cat | E2E | Niveau | Betekenis |
|---|---|---|---|---|
| **W-53** | B | 0/6 | `not_ready` / `empty_layer10` | Bron geweigerd |
| **X-21** | B | — | — | Alias van W-53 — **geen aparte telsite** (DRY) |

Waarom 0: alle 6 fixtures draaien L10 met segmenten → gate open. Reject-tak niet geraakt = gezond (geen fixture nodig; moet gewoon falen).

### Besluit (2026-08-01)

| ID | Verdict | Notitie |
|---|---|---|
| **W-53** | **AFBAKENEN** | Gate blijft; geen L8/L9-fallback |
| **X-21** | **DRY → W-53** | Skip-loud alias; dubbele tally weg |

---

## 7 — Cascade FML: conversie-fallbacks (0/6)

**Eén keten** ná semantic muren: graph → walls in cm → dikte-harmonize → openings op edges. Geen muurlaag L2–L10.

### Omringende techniek (volgorde)

```text
resolveGraph (X-06, vuurt wél)
  → per edge: endpoints (X-08?) + dikte semantic of kernel (X-07?)
  → openings filter op edge (X-09?) + span-gate (X-24?)
  → deuren mirrored vs muur-as (X-12?)
  → harmonize dikte: ketens + banden (X-03/04/05?) + X-01/02 (al AFBAKENEN)
```

| ID | Cat | E2E | Wat precies | Wanneer zou hij vuren? |
|---|---|---|---|---|
| **X-03** | E | 0/6 | Keten heeft geen positieve lengte-som per band → gem. raw / `10` | Lege/degeneratieve keten na grouping |
| **X-04** | A | 0/6 | Dik-dun-dik brug ≤40 cm, ratio ≤0.4 → ketens samen | Kozijn/ruis tussen twee gelijke dikke muren |
| **X-05** | E | 0/6 | `roundFmlThicknessCm` niet-finiet → `10` | NaN/Inf dikte |
| **X-07** | E | 0/6 | Geen/ongeldige kernel of schaal → `defaultThicknessCm` | Semantic dikte ontbreekt (ná X-22: ook bij ≤0) |
| **X-08** | E | 0/6 | Junction-node mist in graph → `edge.segment.a/b` | Kapotte node-refs |
| **X-09** | E | 0/6 | Geen semantic segment-index → match op edge-index | Openings plakken zonder semantic match |
| **X-12** | A | 0/6 | Opening-as tegen muur-as → `mirrored` flip | Deur-vector anti-parallel aan wall |
| **X-24** | B | 0/6 | Opening-span &lt; 0.5 cm → drop uit FML | Kapotte/miniscule L12/L14 span |

Al besloten elders: X-17 BEHOUDEN (F); X-18…20 / X-23 niet bereikt; X-01/02/11 AFBAKENEN of F.

**X-07 vs X-22:** X-22 zero-fallback op semantic dikte is weg; als measured ≤0 valt conversie door naar X-07 (kernel/default). X-07 0/6 betekent: op deze fixtures had elke muur bruikbare semantic dikte of kwam X-07-tally niet (check: tally zit in `resolveThicknessCm`, alleen aangeroepen als semantic null).

### Besluit (2026-08-01)

| ID | Verdict | Notitie |
|---|---|---|
| X-03, X-05, X-07, X-08, X-09, X-24 | **AFBAKENEN** | Safety-nets; 0/6 = niet geraakt, niet dood beleid |
| **X-04** | **AFBAKENEN** | Dik-dun-dik brug blijft |
| **X-12** | **AFBAKENEN** | `mirrored` flip hangt af van muur-bouwrichting vs opening-as |

---

## 8 — Cascade deuren L11/L12 (0/6 in harnas)

Gebakken doors in E2E → L11 wall-snap + L12 orient. Stage 1/2 draait niet live (buiten harnas).

### Omringende techniek

```text
gebakken OrientedDoor / BoundDoor-lijst
  → L11 Path A (doorframe sticky D-44/47) of Path B (swing-mask D-48)
  → D-46 as-grow (gedeeltelijk 2/6)
  → D-42 post-bridge sticky attach?
  → L12 hinge / orient (D-57/58 vuren wél)
  → D-56 kept-mask purge?  D-59 geen-hinge gate?
```

Path A/B en hinge-orient **vuren overal**. De drie 0/N-ID’s zijn guards/orkestratie eromheen.

| ID | Cat | E2E | Wat | Waarom 0 plausibel |
|---|---|---|---|---|
| **D-42** | D | 0/6 | Sync: peel + ink-adjacency → `doorframeFaceIds` op resolved deur | E2E bakt doors al met IDs; live vooral ná window-pass / UI reattach |
| **D-56** | B | 0/6 | Kept-mask: geen wall-contact → reject | Gebakken doors raken altijd muur |
| **D-59** | B | 0/6 | L12 geen hinge → deur uit FML | Op deze 6 altijd hinge |

### D-42 vs window-sticky vs D-46 grow

**Niet hetzelfde als grow.** Drie stappen:

| Stap | Wat | Wanneer |
|---|---|---|
| Window / bridge | Faces class=`doorframe` (+ bridge kan al IDs op hypothesis zetten) | Stage 2 / raam-pass |
| **D-42 attach** | Zet die classes om naar `door.doorframeFaceIds`: peel frames uit `faceIds` + directionele ink-buren; gooit stale IDs weg | Eind Stage-2 + UI `door-faces-snap` (reattach zonder Stage-2) |
| **D-44** L11 | Sticky IDs al op deur → Path A bind | Finalize |
| **D-46** L11 | **Geen** sticky IDs → as-grow langs as → bij hit sticky maken | Finalize fallback |

Dus: window sticky alleen is niet genoeg voor L11 — L11 Path A leest **`door.doorframeFaceIds`**. D-42 is de sync die classes → IDs op de deur zet (en cluster-kozijn uit swing `faceIds` peelt). D-46 is pas nodig als die sync niets opleverde.

0 in E2E: fixtures leveren resolved doors al met juiste IDs → attach wijzigt niets → geen tally. Live na raam-pass kan D-42 wél vuren.

### Besluit (deels)

| ID | Verdict | Datum | Notitie |
|---|---|---|---|
| **D-56** | **AFBAKENEN** | 2026-08-01 | Na largest-blob: kleine blobs met wall+door niet uitwerken in finalize |
| **D-59** | **AFBAKENEN** | 2026-08-01 | Geen hinge → geen FML-deur |
| **D-42** | **AFBAKENEN** | 2026-08-01 | Sync class→`doorframeFaceIds` (≠ grow); 0 E2E = fixtures al gevuld |

---

## 9 — Cascade REF-14 (band-default)

### Omringende techniek

FML muur-diktebanden (min/mid/max cm) komen normaal uit **muur-refs + schaal**. `fml-wall-thickness-tiers.ts` bouwt die grenzen.

**REF-14:** als ref/schaal ongeldig is → vaste defaults **12 / 23 cm** (in plaats van gemeten banden).

Dit is Cat E: gemeten/afgeleide banden weg, vaste getallen erin. Los van pipeline L2–L10; hangt aan FML-tier setup bij conversie/export.

### 0/N

| ID | Cat | E2E | Wat |
|---|---|---|---|
| **REF-14** | E | 0/6 | Ongeldige ref/schaal → 12/23 cm banden |

Waarom 0: alle 6 fixtures hebben geldige muur-refs + schaal → echte banden worden gebruikt; default-tak niet geraakt.

### Besluit (2026-08-01)

| ID | Verdict | Notitie |
|---|---|---|
| **REF-14** | **VERWIJDEREN** stille default → **hard fail** | Zonder geldige ref/schaal geen banden; throw i.p.v. 12/23. UI-watch roept derive al niet aan zonder geldige input. `DEFAULT_FML_BAND_BOUNDARIES` blijft alleen als sessie-seed / localStorage tot refs er zijn. |

---

## 10 — Dode niveaus in levende paden

Niet 0/N-ID’s, maar **niveaus binnen** een pad dat wél vuurt.

| ID | Laag | Levend (E2E) | Dood (E2E) | Status |
|---|---|---|---|---|
| **W-07** | L2 | `sampled` (veel) | `reference` / `zero` | PROMOVEREN; **safety-net laten** (2026-08-01) |
| **W-14** | L4/L8 | `sampled` + `faceMedian` | `reference` / `policyFallback` | Dode niveaus **weg** (2026-08-01); floor = `thicknessFallbackPx` zonder W-14-teller |
| **X-22** | FML semantic | `measured` | zero | zero-fallback **al weg** — ok |

### Besluit (2026-08-01)

| ID | Verdict | Notitie |
|---|---|---|
| W-07 dode niveaus | **laten** | Safety-net mag blijven |
| W-14 dode niveaus | **VERWIJDEREN → weg** | Alleen sampled + faceMedian geteld; geen reference/policyFallback-escalatie |
| X-22 | ok | Al gedaan |

---

## 12 — Gedeeltelijk k/N (2…5 van 6 fixtures)

Dit is **niet** de over-fit-interviewbucket. Aanpak §4:

| Hits | Betekenis | Interview? |
|---|---|---|
| 0/N | dood / niet bereikt | knip of “niet bereikt” |
| 1/N | over-fit-verdacht | **ja** — tekening-interview |
| k/N (2…N−1) | legitiem op sommige tekeningen | documenteren / AFBAKENEN, geen “weg omdat niet overal” |
| N/N | overal | AFBAKENEN of PROMOVEREN |

Op peildatum: **1/N-bucket is leeg**. Wel 7× gedeeltelijk:

| ID | k/6 | Niveaus (totaal) | Wat | Context |
|---|---|---|---|---|
| **D-46** | 2 | path_a_hit=5 | L11 as-grow → sticky doorframe | **AFBAKENEN** |
| **D-54** | 3 | multi_face_closed=12 | Swing-mask multi-face closed | **AFBAKENEN** |
| **R-27** | 3 | pair=7, triple=1 | Raam merge pair/triple | **AFBAKENEN** |
| **W-25** | 3 | accepted_sanitized=12 | L6 face-accept / bestFaceOk | **AFBAKENEN** |
| **W-35** | 5 | endpoint / near_scan / incomplete | L6 H/V bij chamfer-groep | **AFBAKENEN** |
| **W-36** | 4 | accepted / reject_seed | L6 seed-on-touch | **AFBAKENEN** |
| **X-10** | 5 | double_wide_merged=8 | FML twin → één double_wide | **AFBAKENEN** |

### Besluit (2026-08-01)

| ID | Verdict | Notitie |
|---|---|---|
| D-46 | **AFBAKENEN** | As-grow + sticky; 2/6 legitiem |
| D-54 | **AFBAKENEN** | Multi-face closed; 3/6 |
| R-27 | **AFBAKENEN** | Pair/triple merge; later settings-toggle |
| W-25 | **AFBAKENEN** | L6 bestFaceOk gate |
| W-35 | **AFBAKENEN** | near_scan laten; `maxNearPx` later evt. HERLEIDEN |
| W-36 | **AFBAKENEN** | seed-on-touch guard |
| X-10 | **AFBAKENEN** | Twin→double_wide in FML-conversie; later settings aan/uit (zelfde geest als R-27) |

§12 klaar — alle 7 k/N **AFBAKENEN**.

---

## Voorgestelde bespreekvolgorde (herzien)

1. ~~§1 L2 W-09~~ klaar (AFBAKENEN)  
2. ~~§2 L5 W-21~~ klaar (AFBAKENEN)  
3. ~~§3 L7 W-46~~ zero-length weg; DT-miss AFBAKENEN  
4. ~~§6 semantic gates~~ W-53 AFBAKENEN; X-21 DRY  
5. ~~§7 FML-blok~~ alle AFBAKENEN (X-03…05,07…09,12,24)  
6. ~~§8 deuren L11/L12~~ alle AFBAKENEN  
7. ~~§9 REF-14~~ hard fail (stille 12/23 weg)  
8. ~~§10 dode niveaus~~ W-07 laten; W-14 knip; X-22 ok  
9. ~~§12 gedeeltelijk k/N~~ alle 7 AFBAKENEN (incl. X-10) — **ronde klaar** 

---

## Sessie-notities

### 2026-08-01

- Eerdere “Cascade A = L2/L5/L7” was fout gegroepeerd → dit document splitst per laag.
- W-09 → **AFBAKENEN**.
- W-21 → **AFBAKENEN** (blijft). Same-line (W-22) ≠ parallel-cover (L9): zusjes in H/V-cluster, andere trigger/actie/timing — niet tot één algoritme maken zonder gedragswijziging.
- W-46: zero-length-tak **weg**; DT-miss = echte fallback (**AFBAKENEN**), nu geteld als `sample_miss` / `no_map`.
- §6: W-53 **AFBAKENEN**; X-21 **DRY → W-53** (skip-loud, geen dubbele tally).
- §7 FML: X-03…05, X-07…09, X-12, X-24 alle **AFBAKENEN** (safety-nets + brug + mirrored).
- §8 deuren: D-42/56/59 alle **AFBAKENEN**.
- §9 REF-14: stille 12/23 → **hard fail** (throw); sessie-seed defaults blijven tot refs er zijn.
- §10: W-07 dode niveaus **laten**; W-14 reference/policyFallback **weg**; X-22 ok.
- §12: D-46/54, R-27, W-25/35/36, X-10 alle **AFBAKENEN** — 0/N + k/N doorspreek-ronde klaar.
- X-16: −14 vloerdikte weg; az/bz = `floor.height` (280); tally `full_height`.
