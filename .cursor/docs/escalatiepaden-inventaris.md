# Escalatiepaden — inventaris

Peildatum: 2026-07-29 · Aanleiding: risico 5 uit `audit-2026-07-29.md`

**Living doc (aanpak + verdicts):** [`escalatie.md`](escalatie.md). Dit bestand is een **bevroren** momentopname — geen voorstellen of besluiten hier bijwerken.

**Anker:** elke ID als `// ESC:<ID> (<Cat>)` in de code. Regelnummers hier zijn historisch; actuele vindplaats = [`archive/escalatie/tagindex.md`](archive/escalatie/tagindex.md) (`npm run esc:index`). CI: `npm run esc:check`.

**Flowcharts (archief):** [`archive/escalatie/lagen-diagrammen.md`](archive/escalatie/lagen-diagrammen.md).

---

## 1. Wat is een escalatiepad

Een escalatiepad is code die pas gaat lopen als de hoofdweg niet oplevert wat werd verwacht. Niet elke `??` of default is dat — een schaal-afhankelijke epsilon of een lege array voor een HTML-tabel is gewoon programmeren. Wat het tot een escalatiepad maakt is dat er een *tweede oordeel* wordt geveld over hetzelfde stuk beeld, met andere drempels dan het eerste.

Zes categorieën, in aflopende mate van zorgelijkheid:

| Cat | Naam | Kenmerk |
|---|---|---|
| **A** | Relax-retry | Dezelfde logica opnieuw met lossere constanten na een miss |
| **B** | Guard/rollback | Resultaat wordt achteraf gekeurd en bij afkeur teruggedraaid |
| **C** | Alternatieve meetruimte | Faalt in `white` → probeer `ink` (of omgekeerd) |
| **D** | Compensatie-orkestratie | UI-laag repareert of bewaart detectieresultaat rond een her-run |
| **E** | Meting weggegooid | Er *is* een gemeten waarde, maar een vaste waarde gaat naar buiten |
| **F** | Goedaardige default | Ontbrekend veld → literal; geen tweede oordeel over het beeld |

Categorie F staat er alleen in om te kunnen zeggen dat het is bekeken en niet meetelt. De rest van dit document gaat over A–E.

**Uitgesloten van de telling:** display-defaults in rapport-HTML (`?? '—'`, `?? 'onbekend'`), `localStorage`-parse-catches, en `?? []` op inputs van debug-exports.

---

## 2. Het beeld in cijfers

| Cluster | A relax | B guard | C ruimte | D orkestratie | E weggegooid | Totaal A–E |
|---|---|---|---|---|---|---|
| Muren (`cv/walls`) | ≈12 | ≈24 | — | — | ≈13 | **≈49** |
| Deuren (`cv/doors`) | ≈17 | ≈9 | ≈13 | — | ≈4 | **≈43** |
| Ramen (`cv/windows`) | ≈9 | ≈4 | ≈6 | — | ≈5 | **≈24** |
| Referentie (`cv/refs`) | ≈6 | ≈2 | ≈2 | — | ≈8 | **≈18** |
| Orkestratie (`ui/composables`) | ≈3 | ≈8 | ≈2 | ≈22 | ≈15 | **≈50** |
| Conversie/export (`core/fml`) | ≈4 | ≈1 | — | — | ≈14 | **≈19** |
| **Totaal** | **≈51** | **≈48** | **≈23** | **≈22** | **≈59** | **≈203** |

De aantallen zijn benaderingen: sommige items zijn één functie met drie takken, andere drie functies met dezelfde tak. Wat telt is de orde van grootte — er zijn ruim tweehonderd plekken waar het systeem een tweede of derde poging doet, en dat is geen randverschijnsel maar een dragend ontwerpprincipe geworden.

**Twee observaties die de rest van het document verklaren:**

Ten eerste zit de zwaarte niet in de CV-kern maar in de randen. Muren en orkestratie zijn samen bijna de helft. De orkestratielaag is opvallend: die zou detectie moeten *aanroepen*, niet *repareren*, en doet inmiddels vooral het laatste.

Ten tweede is categorie E (meting weggegooid) de grootste categorie, en dat is de categorie die niemand als escalatiepad ziet. Er wordt gemeten, en de meting haalt de uitgang niet.

---

## 3. De over-fit-ankers

Dit is de belangrijkste lijst in dit document: escalatiepaden waar een specifieke tekening, coördinaat of waargenomen geval letterlijk in de code of het commentaar staat. Dit zijn de plekken waar niet te voorspellen is wat er op tekening nummer vier gebeurt, omdat de drempel is gekozen op tekening nummer één.

| Tekening | Escalatiepad | Locatie | Bewijs uit de code |
|---|---|---|---|
| 2D_3E | `shallowRescueAxisMinRelaxRatio` = 0.5 | `cv/doors/door-swing-filter-matching.ts:19-21` | *"Ondiepe plan-fragmenten liggen vaak ~55% van de ref-swing (2D_3E kast). 0.55 liet 44px net zakken (0.55×81=44.55) terwijl 45px wel door kwam."* |
| 2D_3E | Endpoint-unificatie vóór graph-rebuild | `cv/walls/.../engines/segment-ops/index.ts:300-361` | *"2D_3E @726.64,516 after same-line rewrite"* |
| 2D_3E | L6 face-accept i.p.v. volledige rollback | `cv/walls/.../layer-6-repair.ts:5-6` | *"bij I-explosie na junction niet de hele face naar L5 terugrollen — behoud laatste connector-only state die wél face-ok is (2D_3E top-chamfers)"* |
| 2D_3E | TX-micro hub↔hub skip | `engines/cleanup/tx-micro.ts:66-84` | Coördinaat in comment: `@(221.7,1355)↔(230.9,1355)` |
| 2D_3E | Chamfer verre-hit snap guard | `engines/connector/chamfer-group-apply.ts:54-55` | *"2D_3E: H@587→hit@572"* |
| 2D_3E | Seed-op-groep-touch guard | `chamfer-group-geometry-resolve.ts:460-483` | *"geen T@572 repareren via diag@587"* |
| 2D_3E | Strip-hoogtetolerantie 70% | `cv/windows/window-axel-cluster.ts:248-249` | *"Ruimere hoogteband: ~70% afwijking (2D_3E dunne verticals ~2px vs target ~6)"* |
| 2D_3E | Raam-merge dubbel/drievoudig | `cv/windows/window-wall-merge.ts:113-154` | Test-comment *"Zoals 2D_3E ondergevel"* |
| BouwTek11 | `compactCandidate` pre-pass vóór guard | `pipeline-v3/layer-5-cleanup.ts:27-36` | *"useful T-stub reconnect never lands (BouwTek11 @645,243)"* |
| BouwTek11 | Micro-loop verwijdering | `engines/cleanup/micro-loops.ts:58-65` | `@645,243`, *"BouwTek11 export-62"* |
| BouwTek11 | Same-line merge alleen bij kort segment | `engines/cleanup/same-line.ts:143-144` | *"BouwTek11 @1202–1203"* |
| BouwTek11 | L9 parallel-cover pass | `engines/.../parallel-cover.ts` (header) | *"BouwTek11 short-V on through-V"* |
| BouwTek11 | L10 as-rechttrekking zonder guard | `policies/layer-10.ts:17-18` | *"Cover BouwTek11 T/L micro-jog (~4.5px)"* |
| Project4 | Asymmetrische rails → `strip_stack` | `cv/windows/window-axel-ref.ts:327-343` | *"asymmetrisch OK"*; memory 2026-07-23 *"Project4 raam REF alleen-top"* |
| Project4 | Wall-fill aspect-tolerantie 18% | `door-swing-filter-matching.ts:28-31` | *"Otsu-ingekleurde deuren zijn vaak iets 'dikker' in bbox dan de ref-swing"* |
| Project4 | Full-width swing-blob reject | `cv/refs/ref-swing-arc.ts:142-154` | *"Project4 Otsu-deur: 4915 vs 1072"* |
| Project4 | Angle-rescue ink-hinge fallback | `door-swing-angle-rescue.ts:104-107` | *"wall-fill seeds zoals face 262"* |
| Project4 | Path A bind langs doorframe-segment | `door-wall-snap-doorframe.ts:313-365` | Test *"Project4 twin angle-rescue-32"* |
| De Roemer | Geen strip-kalibratie bij één strip | `window-axel-strip-geometry.ts:311-312` | *"De Roemer-probleem (13px -> ~8.9px drift)"* |
| De Roemer | 4-lid ink-keten → Stage 4 merge | `window-evidence-stack.ts:105-273` | Test *"Hal: 4 ink-faces adjacency-keten"* |
| probe-1 | Cluster-groei overshoot guard | `door-swing-filter-matching.ts:23-27` | *"dubbele-deur vrije tip … (probe-1 rechter vleugel)"* |

**Eenentwintig escalatiepaden met een tekeningnaam of een coördinaat erin.** Vier tekeningen, drie pipelines. Geen van deze paden is fout — elk is toegevoegd omdat er iets misging dat de gebruiker zag. Het punt is dat de som ervan een systeem is waarvan het gedrag op nieuwe input niet is af te leiden uit het ontwerp, alleen uit het uitproberen. En dat uitproberen kan nu niet geautomatiseerd (bevinding B4 in de audit).

Belangrijk detail: **de coördinaten staan in commentaar, niet in `if`-condities.** De L6-fragiliteitsaudit stelde dat al vast en het blijft gelden. De code is dus niet letterlijk hardgecodeerd op een tekening; de *drempelwaarde* is dat wel.

---

## 4. Inventaris — muren (`cv/walls`)

### 4.1 Vóór L1: raster, classificatie, finalize-prep

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| W-01 | `keepLargestOnly` blob-filter | `rooms/room-wall-connected-blobs.ts:160-166`, aanroep `room-wall-finalize-shared.ts:108-118` | E | Meerdere componenten → alleen grootste blijft. *Bewuste keuze* (audit §5.0), staat nergens uitgelegd |
| W-02 | Buiten-pocket demote | `rooms/room-exterior-pocket.ts:33-105` | A | Klein vlak, 4 cardinale buren allemaal `outside` → class `outside`. `EXTERIOR_POCKET_REF_FALLBACK_PX = 30` |
| W-03 | Tweede inkt-resolve (wall-booster) | `strategies/room-first.ts:157-172`, `room-refine-topology.ts:67-84` | A | Na eerste resolve → labels/parentMap opnieuw berekenen met booster |
| W-04 | `claimWallishAfterInherit` | `rooms/face-parent-claim.ts` | A | Wallish children geërfd → losgemaakt tot eigen roots |
| W-05 | Preview-kleur fallback | `rooms/room-raster.ts:131-143` | F | 24 zout-pogingen raken reserved hue → `[140,105,185,255]` |
| W-06 | Class onbekend → `'surface'` | `rooms/room-exterior-pocket.ts:27-30` | E | Geen directe class op label |

### 4.2 L2 — jitter merge

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| W-07 | Dikte-fallbackketen | `layer-2-raw-segments.ts:132-140,243-247` | E | Geen DT-sample op knik → `referenceWallThicknessPx ?? 0`, tolerantie clamp 2–8px |
| W-08 | Relaxed hoekdrempel | `layer-2-raw-segments.ts:249-251` | A | Hoek tussen 25° en 26° én kleine spreiding → merge alsnog toegestaan |
| W-09 | T-arm branch guard | `layer-2-raw-segments.ts:253-265` | B | Perpendiculaire tak op knik → merge overslaan (voorkomt T→I) |
| W-10 | Iteratieve merge-loop | `layer-2-raw-segments.ts:220-272` | A | `while(changed)`, één merge per sweep |
| W-11 | `unifyNearEndpoints` bake | `engines/segment-ops/index.ts:300-361` | B | ULP-nabije hubs byte-identiek maken i.p.v. weld-skip · **over-fit anker 2D_3E** |

### 4.3 L3 / L4

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| W-12 | Iteratieve I→T/X prune | `engines/prune/index.ts:289-339` | A | `mode: 'iterative-tx'` → herhaald kortste I-pad weg tot convergentie |
| W-13 | Spur-drempel via fallback-dikte | `engines/prune/index.ts:41-43` | E | `thicknessFallbackRefPx` als er geen gemeten dikte is |
| W-14 | Dikte-fallbackketen H/V | `engines/hv/position-segments-hv.ts:55-110` | E | sampled → face-mediaan → referentie → `policy.thicknessFallbackPx` (vier niveaus) |
| W-15 | Vrij eindpunt: alleen as-update | `engines/hv/position-segments-hv.ts:140-142` | B | Endpoint niet binnen `prePositionSnapPx` → geen junction-snap |

### 4.4 L5 — cleanup (8 takken, tweede-dichtste laag)

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| W-16 | `compactCandidate` pre-pass | `layer-5-cleanup.ts:27-36` | B | Micro-ruis wegnemen zodat de guard niet onterecht afkeurt · **over-fit anker BouwTek11** |
| W-17 | `tryAcceptStep` rollback | `layer-5-cleanup.ts:38-47,79-147` | B | `validateConnectivity` faalt → stap genegeerd, vorige `work` blijft |
| W-18 | Final face rollback naar L4 | `layer-5-cleanup.ts:154-161` | B | Eindguard faalt → hele face terug naar L4-toestand |
| W-19 | `repairDanglingConnections` | `engines/weld/index.ts:67-117` | A | Dangling endpoints binnen `repairMaxGapPx` (~4px @ref30) → verbinden |
| W-20 | TX-micro per-stub guard | `engines/cleanup/tx-micro.ts:66-84` | B | Stub alleen toepassen bij OK connectivity · **over-fit anker 2D_3E** |
| W-21 | Micro-loop removal guards | `engines/cleanup/micro-loops.ts:58-65` | B | Twee korte parallellen met gedeeld start → kortste weg, tenzij degree≥2 · **anker BouwTek11** |
| W-22 | Same-line merge alleen bij kort segment | `engines/cleanup/same-line.ts:143-144` | A | `hasShort` → merge + sub-eps spans skippen · **anker BouwTek11** |
| W-23 | LL-stair micro-collapse | `engines/cleanup/ll-stair.ts:30-94` | A | Micro tussen twee langere armen → weg, armen samentrekken |
| W-24 | Iteratie-loop max 20 | `layer-5-cleanup.ts:72-151` | A | `LAYER5_MAX_ITERATIONS = 20` |

### 4.5 L6 — connector/junction repair (dichtste laag: 19 takken)

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| W-25 | Face-accept `bestFaceOk` | `layer-6-repair.ts:99-125,141-167,178-191` | B | Face-gate faalt → terug naar laatste face-OK state, niet naar L5 · **anker 2D_3E** |
| W-26 | Sanitize-skip | `layer-6-repair.ts:106-119` | B | Sanitized faalt, raw OK → raw houden (*"would I-explode"*) |
| W-27 | Iteratieve repair-loop | `layer-6-repair.ts:127-175` | A | connector → landing → junction, tot `maxIterations` |
| W-28 | Per-candidate kind-validatie | `engines/connector/kind-accept.ts:15-49` | B | I-explosie / X-downgrade / T-positieverlies → candidate geweigerd |
| W-29 | Chamfer-groep multi-guard | `engines/connector/chamfer-group.ts:38-84` | B | Vijf afzonderlijke afkeurredenen → `segments: before` |
| W-30 | Extras sweep na detect-miss | `engines/connector/connector-repair.ts:90-109` | A | Volledige pass → tot 64 extra korte diagonalen die primary detect miste |
| W-31 | Seed re-index op geometrie | `connector-repair.ts:122-142` | A | `connectorIndex` stale → seed zoeken op coördinaat <0.5px |
| W-32 | Landing-only sub-loop | `connector-repair.ts:177-227` | A | Eén landing per iteratie, `maxIter = max(8, axisChainPx/8)` |
| W-33 | Detect-cascade | `connector-detect.ts:75-115` + `connector-detect-chain-pass.ts` | A | primary → H/V-bridge → chain-tip synthetische V (drie niveaus) |
| W-34 | Geometry resolve-prioriteit | `chamfer-group-geometry-resolve.ts:164-247` | A | landing → simple-L → multi, met shallow/steep jog skips |
| W-35 | `hvIncidentsNearGroup` | `chamfer-group-geometry-resolve.ts:57-102` | A | Geen H of geen V op endpoints → zoeken binnen `maxNearPx` |
| W-36 | `seedOnGroupTouch` guard | `chamfer-group-geometry-resolve.ts:460-483` | B | Seed raakt groep niet → `null` · **anker 2D_3E** |
| W-37 | Verre-hit snap guard | `chamfer-group-apply.ts:54-55,100` | B | Shift te groot → snap skippen · **anker 2D_3E** |
| W-38 | Lang-segment shift guard | `chamfer-group-apply-snap.ts:27-32` | B | Lang segment + shift >8px → geen snap tenzij expliciet toegestaan |
| W-39 | Junction-repair splice-rollback | `engines/connector/junction-repair.ts:122-131` | B | Validatie faalt → `work` terug naar `before`, tellers omlaag |
| W-40 | L-repair skip bij landing-chamfer | `junction-repair.ts:65-77` | B | `isChamferLandingForTNode` → geen L-snap |
| W-41 | Unretractable diagonal skip | `junction-repair-diagonals.ts:46-99` | B | Verre chamfer-tip → diagonaal blijft staan |
| W-42 | `repairLAtPoint` landing guard | `junction-repair-l.ts:31-48` | B | Lange landing-diagonaal → geen wijziging |
| W-43 | `LAYER6_HV_BAND_FALLBACK_PX` | `engines/connector/constants.ts` | E | `scale.hvBandPx` undefined → vaste 8px band |

### 4.6 L7 t/m L10

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| W-44 | `withTopologyGuard` op chain collapse | `layer-7-align.ts:54-72`, `engines/collapse/validate.ts:75-100` | B | T/X daalt of endpoint verdwijnt → input-clone terug |
| W-45 | Dikte-brug in `pickChainExtension` | `engines/collapse/chain-collapse.ts:151-208` | A | Meerdere compatibele → collapse via dunne tussenbrug |
| W-46 | Dikte-fallback bij collapse-sampling | `engines/collapse/thickness.ts:24-41` | E | Geen DT → referentie → `thicknessFallbackPx` |
| W-47 | Tweede HV-pass met distance map | `layer-8-finalize.ts:62-74` | A | L7-output opnieuw positioneren |
| W-48 | L8 I-prune met T/X-bescherming | `layer-8-finalize.ts:77-79`, `prune/index.ts:228-266` | B | `mode: 'once-ltx'` + `shouldProtectTxFromSpurPrune` |
| W-49 | L9 drie geneste guarded passes | `layer-9-dissolve.ts:61-109` | B | chain / stub / parallel-cover, elk eigen skip-teller · **anker BouwTek11** |
| W-50 | L10 chain guard | `layer-10-fml.ts:61-78` | B | Zelfde patroon als L7/L9 |
| W-51 | **L10 as-rechttrekking zónder guard** | `layer-10-fml.ts:81-88` | A | `straightenCollinearAxisChains` — geen rollback · **anker BouwTek11** |
| W-52 | Micro-corner absorb guard | `layer-10-fml.ts:90-103` | B | Topologie-degradatie → micro-pass overslaan |
| W-53 | Geen L8/L9-fallback voor FML | `rooms/build-semantic-walls-source.ts:17-31` | B | `fmlReady !== true` → `undefined`, bewust geen lagere laag |

**Wat opvalt aan de muur-pipeline:** L5 en L6 bevatten samen 27 van de 49 escalatiepaden. Dat is consistent met de bestaande fragiliteitsaudits. W-51 is het enige transformatiepad in L7–L10 zonder rollback-guard, terwijl alle buren er wel een hebben — dat is een asymmetrie die uitleg verdient.

---

## 5. Inventaris — deuren (`cv/doors`)

De deur-pipeline is het duidelijkste voorbeeld van een cascade: bij een miss wordt niet één alternatief geprobeerd maar een keten van vier tot zes, elk met eigen drempels.

### 5.1 Meetruimte-beleid (categorie C, centraal)

`DOOR_SPACE_POLICY` (`door-space-policy.ts:10-46`) legt per stap vast of in `ink` of `white` wordt gemeten. Dertien keys, dus dertien plekken waar een verkeerde ruimte-keuze een stille miss oplevert:

| ID | Key | Waarde | Wat het mogelijk maakt |
|---|---|---|---|
| D-01 | `stage1Measure` | `white` | Primaire maat; muur alleen via rescue |
| D-02 | `stage1ClusterBridge` | `ink` | Wit–inkt–wit hop tussen deurbladen |
| D-03 | `wallRescueMeasure` | `ink` | Wall-ink componenten in de merge |
| D-04 | `wallRescueMatchSpaces` | `['ink','white']` | **Wall-rescue Either** — twee volledige pogingen |
| D-05 | `wallFillMeasure` | `ink` | Stage-2 kandidaten uit Otsu-vlakken |
| D-06 | `surroundLabels` / `wallTouchLabels` / `bridgeBetweenWalls` | `ink` | Drie gates op ink-adjacency |
| D-07 | `refSwingMeasure` / `refFramingMeasure` | `white` / `ink` | REF gesplitst over twee ruimtes |
| D-08 | `angleRescueMeasurePrefer` | `white` | Hoek/hinge op wit, ink als terugval |

### 5.2 Stage 1 — seed en match

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| D-09 | Size-near match, aspect 18% | `door-swing-filter-seed.ts:55-61`, tuning `:31` | A | Strikte 5% faalt → 18% toegestaan · **anker Project4 Otsu** |
| D-10 | Shallow-under-min rescue | `door-swing-filter-seed.ts:63-76`, tuning `:19-22` | A | Onder `wallMinPx` → axis-relax 0.5, absolute min uit · **anker 2D_3E kast** |
| D-11 | `wallRescueMatch` axis 0.65 | `door-swing-filter-matching.ts:232-241` | A | Derde poging na strict + sizeNear + shallow |
| D-12 | `isWallRescueCandidate` area/fill-gate | `door-swing-filter-matching.ts:265-285` | B | Vier drempels (0.52 / 0.45 / 0.9 / 0.18) keuren de rescue |
| D-13 | Wall-rescue Either (ink→white) | `door-swing-filter-seed.ts:102-137` | C | Class `wall` → volledige match in beide ruimtes, eerste wint |
| D-14 | Clipped-arc rescue | `door-swing-filter-matching.ts:287-337` | A | Aspect tot 1.3× ref, score-vloer 0.55 · **anker dubbele deur** |
| D-15 | Non-wall match-cascade | `door-swing-filter-seed.ts:219-227` | A | strict → clippedArc → sizeNear → shallow (vier niveaus) |
| D-16 | White-geom override in rootFaces | `door-swing-filter-seed.ts:269-279` | C | Either koos white terwijl aggregate ink was → remap |
| D-17 | Undersized single → cluster-retry | `door-swing-filter-seed.ts:331-348` | A | Union <0.55× ref-area → clusteren en opnieuw matchen |
| D-18 | `refAxisMin/MaxRelax` band | `door-swing-filter-matching.ts:12-17` | A | Muur-as ∩ ref×[0.75, 2.0] · **anker 222×123 vs 70×39** |

### 5.3 Stage 1 — cluster

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| D-19 | Ink-bridge buren | `door-swing-filter-cluster.ts:16-30` | C | Adjacency via ink als wit niet verbindt |
| D-20 | Clipped-arc in cluster-groei | `door-swing-filter-cluster.ts:233-248` | A | Union mag ook via clipped-arc matchen |
| D-21 | Overshoot tip-guard | `door-swing-filter-cluster.ts:60-82` | B | Buur rekt bbox >1.2× → skip · **anker probe-1** |
| D-22 | Absorb buren, aspect +8% | `door-swing-filter-cluster.ts:118-180` | A | Kleine buren (≤50% area) alsnog opslokken |
| D-23 | Best-score i.p.v. grootste union | `door-swing-filter-cluster.ts:250-264` | B | Voorkomt middenstrook tussen dubbele deurbladen |

### 5.4 Stage 2 — fill, surround, wall-touch

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| D-24 | Wall-fill pass A | `door-swing-fill-stage.ts:10-54` | A | Stage-1 `rejected_outside_or_wall` + class wall → nieuwe poging zonder area/fill-check |
| D-25 | Fill-band 0.8–1.2 | `door-fill-filter.ts:9-10,29-105` | B | `too_empty` / `too_full`; angle-rescue omzeilt dit |
| D-26 | Merge unclaimed wall-fill | `door-swing-fill-stage.ts:57-69` | A | Extras toevoegen aan fill-pool |
| D-27 | Room-surround reject | `door-room-surround.ts:90-119` | B | Alles rondom room of alles wall → drop |
| D-28 | `no_wall_touch` gate | `door-room-surround.ts:141-177` | B | Geen ink-adjacent wall/window/doorframe → drop; **overgeslagen bij `existingDoorsOnly`** |

### 5.5 Stage 2 — angle-rescue (elf takken in één module)

`door-swing-angle-rescue.ts` is een escalatiepad met eigen interne escalatiepaden. Vier accept-gates, vijf reject-redenen, twee meetruimtes.

| ID | Tak | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| D-29 | Ref-eligibility ≤60° | `:76-82,204-208` | B | Alleen ondiepe refs mogen escaleren |
| D-30 | `allowedClasses` filter | `:211-228` | B | `existingDoorsOnly` → alleen class `door` scannen |
| D-31 | Height-gate Either ±15% | `:109-124` | C | Korte as in ink **of** white |
| D-32 | Ink-hinge fallback | `:104-107,282-295` | C | Geen white-geom → hinge op ink · **anker face 262** |
| D-33 | `rejected_too_long` | `:253-264` | B | Lange as > `wallMaxPx` |
| D-34 | `rejected_fill_cap` 0.80 | `:267-279` | B | Dichte blob krijgt geen tweede kans |
| D-35 | `rejected_no_hinge` | `:282-306` | B | Geen hinge berekenbaar |
| D-36 | `rejected_angle_mismatch` 10° | `:310-322` | B | Hoekafwijking te groot |
| D-37 | Inject `angle_rescue` hypothese | `:325-345` | A | Alle gates OK → **omzeilt fill- en surround-filter**, wall-touch geldt wel |
| D-38 | `keepBetterDiag` ranking | `:150-181` | B | Meerdere refs per root → beste diagnose houden |
| D-39 | H/V-prefer + `expectedAngleDeg` | `:100-102` | A | Verwachte hoek uit ref stuurt hinge-keuze |

### 5.6 Stage 2 — bridge-promote en sticky doorframe

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| D-40 | Bridge-promote BFS | `door-bridge-wall-promote.ts:119-281` | A | surface/unknown tussen twee muren, span ±15% → promote naar doorframe |
| D-41 | Sticky doorframe niet herpromoten | `door-bridge-wall-promote.ts:245-267` | D | *"niet opnieuw promoten (geen allFaceIds — pin blijft sticky)"* |
| D-42 | Post-bridge attach | `run-door-stage-pipeline.ts:259-267`, `door-attach-doorframes.ts:191-261` | D | Sticky pins koppelen zonder Stage-2 her-run |
| D-43 | Resolve width-fallbacks | `door-resolve.ts:34-54,100-107` | E | Ontbrekende ref-overhangs → `ratioBlade` 1, legacy overhang, swing-span |

### 5.7 L11 — snap (negenvoudige cascade)

Dit is de langste keten in de codebase. Eén deur wordt via maximaal negen opeenvolgende strategieën aan een muur geprobeerd te binden:

| ID | Stap | Locatie | Cat |
|---|---|---|---|
| D-44 | Path A: expliciete `doorframeFaceIds` | `door-wall-snap.ts:91-96` | — (primair) |
| D-45 | Path A: directioneel 1-hop doorframe | `door-wall-snap.ts:98-109` | A |
| D-46 | Path A: multi-hop groei langs as | `door-wall-snap.ts:111-125` | A |
| D-47 | Path A bind: segment-first → bounds | `door-wall-snap-doorframe.ts:313-365` | A · **anker Project4 twin** |
| D-48 | Path B: swing-mask zijcontact | `door-wall-snap-path-b.ts:36-174` | A |
| D-49 | Path B: relaxed segment-match | `door-wall-snap-scoring.ts:193-259`, tuning `door-wall-snap-tuning.ts:8-25` | A |
| D-50 | Path B: wall-union anchor segment | `door-wall-snap.ts` | A — **VERWIJDERD 2026-07-31** |
| D-51 | Path B: wallMask op union-bounds | `door-wall-snap.ts` | A — **VERWIJDERD 2026-07-31** |
| D-52 | Legacy: wallMask op deur-bbox | `door-wall-snap.ts` | A — **VERWIJDERD 2026-07-31** |
| D-53 | Anchor relaxed fallback | `door-wall-snap-bind.ts:117-131` | A |
| D-54 | Cluster morph-close | `door-swing-mask.ts:161-183` | A |
| D-55 | Dubbele afstandsmeting `min(mask, bbox)` | `door-swing-mask.ts:293-305` | C |

D-50..D-52 zijn **verwijderd 2026-07-31** (0/6 E2E + kill-switch gelijk); Path B is alleen D-48.

### 5.8 L12 en orkestratie-gate

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| D-56 | Post-L0 kept-mask purge | `door-kept-wall-mask-contact.ts:45-132` | B | Geen contact binnen `max(4, dikte×0.2)` → reject + unpin |
| D-57 | 180° swing-oriëntatie | `door-l12-hinge.ts:118-139` | A | Meer massa boven dan onder (×1.08) → mask roteren |
| D-58 | Path A vs B opening-resolve | `door-wall-orient.ts:296-313` | A | Twee verschillende breedte-afleidingen naast elkaar |
| D-59 | L12 hinge hard gate | `door-wall-orient.ts:273-283` | B | Geen hinge → deur verdwijnt uit FML |
| D-60 | Degenerate blade → swing-span | `door-swing-ref.ts:91,177-180` | E | `blade < 0.5× span` → maat uit swing i.p.v. kozijn |
| D-61 | `existingDoorsOnly` multi-skip | `run-door-stage-pipeline.ts:170,185,216,231` | D | Slaat wall-fill, surround, wall-touch én bridge over |

**D-61 is een sleutelitem voor een later plan:** één boolean schakelt vier gates uit. Dat betekent dat de deurdetectie in demote-modus een fundamenteel ander systeem is dan in normale modus, met andere false-positive-eigenschappen.

---

## 6. Inventaris — ramen (`cv/windows`)

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| R-01 | Dual-rebind na detach | `rooms/opening-pipe-dual.ts:26-44` | C | White parentMap/geom herbinden vóór Stage 1 |
| R-02 | Asymmetrische rails | `window-axel-ref.ts:89-121,327-343` | A | Eén rail buiten as-band → `strip_stack` met halve informatie · **anker Project4** |
| R-03 | As-band uit rails | `window-axel-ref.ts:262-271` | A | Geen kopeinde-kozijnen → band uit top/bottom rail |
| R-04 | Ink-vs-white rail-metriek | `window-axel-ref.ts:344-356` | C | Ink prefereren, anders white |
| R-05 | `fullStripHeightsPx` fallback | `window-axel-ref.ts:310` | E | Leeg → terug naar `stripHeightsPx` |
| R-06 | Orientatie-retry H↔V | `window-axel-filter.ts:55-56,64-183` | A | Tweede volledige pass met geroteerde ref-params |
| R-07 | `fallbackToPrimaryTarget` | `window-axel-filter.ts:95-101` | E | Secundaire orientatie hergebruikt primaire kalibratie |
| R-08 | Bounded strip-kalibratie | `window-axel-strip-geometry.ts:303-356` | A | Mediaan → clamp [0.7×, 3.0×]; **overgeslagen bij één strip** · **anker De Roemer** |
| R-09 | Strip-sample band→centroid | `window-axel-cluster.ts:225-228` | A | Center-band plakt strips → centroid-sample als alternatief |
| R-10 | Relaxed hoogtetolerantie 70% | `window-axel-cluster.ts:248-249` | A | `max(2, target×0.7)` · **anker 2D_3E** |
| R-11 | Px-vloeren 2/3/4 | `window-axel-cluster.ts:42-43` | E | `max(3, axisBand)`, `max(2, …)` — schalen niet mee (audit E5) |
| R-12 | As-span spreidingsguard 1.5 | `window-axel-cluster.ts:334-348` | B | Lange rail × kort glas → reject |
| R-13 | Wall-ink bridge relaxed | `window-axel-cluster.ts:65-69` | C | Overlapdrempel naar 0.1, centerDelta ×1.6 |
| R-14 | Deurboog ink-adjacency | `window-door-arc-filter.ts:84-87,198-233` | C | Wit niet genoeg → 1-hop via wall-ink |
| R-15 | Directionele boog-propagatie | `window-door-arc-filter.ts:235-269` | A | Buren in zelfde as-band → `aligned_with_rejected_arc_band` |
| R-16 | Evidence pad-cascade | `window-evidence-filter.ts:104-184` | A | `strip_stack` → `framing` → passthrough (drie niveaus, derde zonder bewijs) |
| R-17 | Stack-groei via ink-bruggen | `window-evidence-stack.ts:105-273` | C | BFS over ink · **anker De Roemer Hal/mk** |
| R-18 | Framing dual-space OR | `window-evidence-framing.ts:140-201` | C | White faalt → retry op ink, specifiekste faalreden wint |
| R-19 | Framing soft-min 25% | `window-size-range.ts:83-86` | A | Binnen band maar onder minH → toch door boven 25% |
| R-20 | Stack-groei early exit | `window-evidence-stack.ts:133-135` | B | Geen span/heights → alleen seed |
| R-21 | Stage-3 late retarget | `window-stage3-retarget.ts:27-84` | D | Geaccepteerd raam raakt deurboog → verplaatst naar doorframes |
| R-22 | Stage-4 bbox-prefers | `window-resolve.ts:47-51` | C | Glas `whiteThenInk`, kozijn `inkThenWhite` |
| R-23 | Measure-bbox fallback | `window-resolve.ts:71-88` | E | Geen dual-geom → `unionBBox`. Comment: *"tests / ontbrekende dual-geom"* |
| R-24 | Cross-ref stack-merge | `window-resolve.ts:190-236` | A | Zelfde strips onder ref0 en ref1 → één raam |
| R-25 | Framing de-dupe op score | `window-resolve.ts:209-214` | B | Hoogste score claimt glas-faces |
| R-26 | L14 breedte-fallback | `window-wall-bind.ts:196-197` | E | `widthPx ≤ 0` → geprojecteerde bbox-span |
| R-27 | Aangrenzende ramen mergen | `window-wall-merge.ts:113-154` | A | 2–3 buren, ≤5% maatverschil → double/triple refid · **anker 2D_3E** |

**R-16 verdient aparte aandacht:** het derde niveau van die cascade laat Stage-1-vlakken door *als `strip_stack` zonder dat er rails of framing in de referentie zijn gevonden*. Dat is een escalatiepad dat het bewijs waar de hele stage om draait, overslaat.

---

## 7. Inventaris — referentie-analyse (`cv/refs`)

Train-by-example is de basis van het hele systeem: alle drempels hierboven zijn ratio's ten opzichte van een referentievak. Als de referentie-extractie escaleert, escaleren alle afgeleide drempels mee.

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| REF-01 | B/W-bron cascade | `ref-crop-bw.ts:220-254` | A | `baseBw` → `sharedWallBwMat` → volledige rebuild uit kleur |
| REF-02 | As-align cascade | `ref-axis-align.ts:85-114,147-156` | A | Hough-spanning → langste lijn → ink edge-heights → `0` |
| REF-03 | Window PCA-deskew | `ref-straighten.ts:262-279` | A | Line-deskew <0.15° én PCA ≥2.5° → PCA gebruiken |
| REF-04 | Opening-units cascade | `ref-blob-units.ts:188-254`, `ref-blob-kozijn.ts:205-258` | A | kozijn-posts → verticale scan → primary blob + kopeinde → component-bbox |
| REF-05 | `singleUnit` merge | `ref-stages.ts:250`, `ref-blob-units.ts:277-315` | E | Eén unit → hele crop als één opening |
| REF-06 | Crop-fallbacks (5 takken) | `ref-face-crop.ts:296-307,332-339,347-350,387-388` | E | Geen inkt in mask → ruwe data; bbox-miss → `findInkBounds` of volledig beeld |
| REF-07 | Alle ink-labels behouden | `ref-face-crop.ts:231-233` | E | Geen inkt raakt mask → *alles* meenemen |
| REF-08 | Alle rollen behouden | `ref-face-crop.ts:162-166` | E | Geen target labels → interior/head/outside allemaal |
| REF-09 | Kleine interior faces demoten | `ref-pipeline.ts:235-259` | A | <75% gem. kozijn-area → rol `outside` |
| REF-10 | Polygon pool fallback | `ref-pipeline.ts:404-406` | E | Geen `on_axis` parts → alle parts |
| REF-11 | Muurstijl-fallback | `classify-wall-ref-style.ts:56-90` | A | Geen `baseBw` → lokale rebuild |
| REF-12 | Swing-sector pool-verfijning | `ref-swing-arc.ts:102-154` | A | `below` → `on_axis` → alle faces; full-width reject · **anker Project4** |
| REF-13 | Hinge as-paar rescue | `ref-swing-hinge-resolve.ts:255-258` | A | Corner-hinge faalt → klassieke as-paar picker |
| REF-14 | Band-afleiding default | `core/fml/fml-wall-thickness-tiers.ts:89-97` | E | Ongeldige ref/schaal → vaste 12/23 cm |

### 7.1 Geen ondergrens op train-by-example

`project-brief.md` adviseert 3–5 voorbeelden per type. Er is geen code die dat afdwingt of signaleert (audit A5). Concreet:

| Waar | Gedrag |
|---|---|
| `build-window-pipeline-from-workspace.ts:31-48` | Pipeline draait bij `refBands.length >= 1` |
| `window-axel-ref.ts:318-326` | `stripCount = 1` is een geldige uitkomst |
| `window-axel-strip-geometry.ts:311-313` | Bij één strip: kalibratie volledig overgeslagen |
| `window-evidence-filter.ts:173-184` | Ref zonder rails én zonder framing → passthrough |

Bij één referentievak is het systeem dus geen train-by-example meer maar template-matching op één voorbeeld — met alle escalatiepaden hierboven nog wél actief, en dus met de volle relax-marge bovenop een ongevalideerde basis.

---

## 8. Inventaris — orkestratie (`ui/composables/workspace`)

Dit cluster is kwalitatief anders. Waar de CV-lagen escaleren om *iets te vinden*, escaleert deze laag om *iets niet te verliezen*. Vrijwel elk item hier is ontstaan uit een waargenomen regressie waarbij handmatig of eerder werk werd weggegooid.

### 8.1 Sticky-overrides: het asymmetrie-probleem

`face-override-sync.ts` centraliseert het model netjes, maar de regels per klasse verschillen zonder gemeenschappelijk principe (audit A6):

| ID | Klasse | Locatie | `removeClasses` | `upgradeFrom` |
|---|---|---|---|---|
| O-01 | Deur | `face-override-sync.ts:95-108` | `['door']` | `['wall','unknown','surface']` |
| O-02 | Bridge | `:119-132` | `['wall']` — géén doorframe | — |
| O-03 | Raam | `:143-154` | `['window']` | — |
| O-04 | **Doorframe** | `:164-176` | **`[]`** — nooit auto-remove | `['window']` |

O-04 geverifieerd in de code: *"Sticky: geen auto-remove — eens doorframe blijft doorframe tot handmatige override."* Vier klassen, vier verschillende regels. Elk afzonderlijk verdedigbaar, samen niet uitlegbaar — en dat maakt de volgende bugfix in dit gebied duur.

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| O-05 | previousAuto-only remove | `face-override-sync.ts:36-80` | D | Alleen overrides die eerder automatisch waren mogen weg |
| O-06 | `replace-all` vs `replace-auto` | `door-faces-auto-pass.ts:39-50,60-67` | D | Twee invalidatiemodi met verschillend wisgedrag |
| O-07 | Window-invalidate behoudt `lastAuto` | `window-faces-auto-pass.ts:44-50` | D | *"anders previousAuto=[] en kan een lege herdetectie … alles wissen"* |
| O-08 | Lege herdetectie → hergebruik IDs | `window-faces-auto-pass.ts:95-102` | D | Window én doorframe pins overleven een lege pass |
| O-09 | Bestaande doorframe-overrides mergen | `window-faces-auto-pass.ts:85-89` | D | Compenseert stale stage-cache |
| O-10 | Sticky reattach na window-pass | `door-faces-snap.ts:53-86` | D | `attachDoorframesToResolvedDoors` zonder Stage-2 her-run |
| O-11 | Snap-volgorde sticky-eerst | `door-faces-snap.ts:155-163` | D | reattach → class-still → mask-purge → snap |
| O-12 | Commit vóór preview | `useWorkspaceWindowFaces.ts:140-144` | D | *"anders tekent preview op stale cache zonder doorframes"* |
| O-13 | Tab-sticky redirects | `constants.ts:42-50` | D | `ocr`/`gaps` → `walls` omdat die tabs verborgen zijn |

### 8.2 Prune-only demote (de demote-wipe-keten)

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| O-14 | Deur-demote = alleen prune | `useWorkspaceDoorSwingFaces.ts:392-428` | D | *"Alleen prune — geen Stage-herdetectie (voorkomt lege pipeline → door-arc wipe → window re-run)"* |
| O-15 | Window-demote = alleen prune | `useWorkspaceWindowFaces.ts:191-216` | D | Zelfde contract |
| O-16 | Demote-guards klik/box | `useWorkspaceRoomFaces.ts:447-453,481-498` | D | Prunen alleen bij class-transitie |
| O-17 | Lege-pipeline abort | `useWorkspaceDoorSwingFaces.ts:316-336` | B | `existingDoorsOnly` + leeg → refresh afbreken, prior cache houden |
| O-18 | Dual-cache bypass | `useWorkspaceDoorSwingComputationCache.ts:71-79` | B | Live cache → altijd `ensureFaceDualSpace`, *"geen tweede signature/epoch-laag"* |
| O-19 | Offline dual signature-cache | `useWorkspaceDoorSwingComputationCache.ts:82-110` | D | Aparte cache voor het export/rapport-pad |
| O-20 | Class-still filter deuren | `door-faces-snap.ts:27-46` | B | Stale Stage-2-hits weren bij afronden |
| O-21 | Kept-mask purge + override-sync | `door-faces-snap.ts:176-195` | B | Orphan auto-deuren unpinnen |
| O-22 | Class-still filter ramen | `window-faces-bind.ts:17-34` | B | Filter vóór L14 bind |

### 8.3 Cascades tussen detectietypes

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| O-23 | Deurboog-signatuur → volledige raam-herdetectie | `useWorkspaceWindowFaces.ts:535-543` | D | Elke wijziging in de boog-facesset triggert de hele window-pipeline |
| O-24 | Phase `classifying`→`review` | `useWorkspaceDoorSwingFaces.ts:579-593` | D | Start deur-pass |
| O-25 | Classify-state watch | `useWorkspaceWindowFaces.ts:495-503` | D | Labels/parentMap wijziging → raam-refresh |
| O-26 | Rect/ppm watches | `useWorkspaceDoorSwingFaces.ts:622-643` | D | Met `devSessionRestoring`-guard |
| O-27 | Finalize → snap + bind | `useWorkspace.ts:316-319` | D | Compenseert dat L11/L14 tijdens review niet liepen |
| O-28 | Debounce 80 ms + coalesce | `useWorkspaceDoorSwingFaces.ts:102-105` | D | Snelle demote-kliks samenvoegen |
| O-29 | DevSession replay = existing-doors-only | `workspace-dev-session-restore-detection.ts:128-136` | D | Restore herbouwt alleen uit bestaande deur-vlakken |
| O-30 | DevSession exact: Stage-2 blokkeren | `workspace-dev-session-restore-detection.ts:94-102` | D | *"annuleer geplande Stage-2 vóór awaits"* |

### 8.4 Stille fallbacks (fouten die niemand ziet)

| ID | Locatie | Wat wordt verborgen |
|---|---|---|
| O-31 | `useWorkspaceDetection.ts:252-254` | Muurstijl-classificatie faalt — *"stijl optioneel"* |
| O-32 | `useWorkspaceDetection.ts:407-414` | Finalize mislukt → vorige `tabOutputs.walls` teruggezet |
| O-33 | `useWorkspaceDetection.ts:419-421` | Elke detectiefout → `false`, geen stack |
| O-34 | `useWorkspaceDoorSwingFaces.ts:380-386` | Pipeline-fout → volledige state-reset |
| O-35 | `useWorkspaceWindowFaces.ts:412-416` | Idem, inclusief `lastAuto`-arrays |
| O-36 | `door-faces-snap.ts:227-242` | `orientBoundDoors` faalt → `oriented = []` (L12 leeg, geen melding) |
| O-37 | `useWorkspaceRoomFaces.ts:134-136` | Preview-mask fout — *"loopt via detectiepipeline"* |
| O-38 | `workspace-fml-generate.ts:125-127` | FML-generatie faalt → `null`, lege preview zonder uitleg |
| O-39 | `useWorkspaceDebugProbe.ts:120-125` | Dual-resolve faalt → ink-only |
| O-40 | `assembleWorkspaceFacadeReturn.ts:237-274` | Facade vóór init → `fallbackDoorSwingStage` / `fallbackWindowAxelStage` |
| O-41 | `workspace-export-door-swing-report.ts:175-222` | Lege live L12 → snap+orient opnieuw in het rapport |

### 8.5 Gates

| ID | Gate | Locatie | Opmerking |
|---|---|---|---|
| O-42 | "Volgende" alleen op Muren-tab | `useWorkspaceFlow.ts:88-92` | Test *waar de gebruiker staat*, niet *of het werk klaar is* (audit A2) |
| O-43 | Initial-detection overlay | `workspace-view-visibility.ts:21-46` | Blokkeert face-tools tot eerste pass klaar |
| O-44 | `initialDetectionSettled` latch | `useWorkspaceViewUi.ts:40-64` | Eenmalige latch zodat latere invalidatie de overlay niet terugbrengt |
| O-45 | `shouldRunDoorSwingPass` / `shouldPushWindowClasses` | `useWorkspaceDoorSwingFaces.ts:130-135`, `useWorkspaceWindowFaces.ts:131-133` | Scope-beperking op tab en phase |
| O-46 | `GAPS_TAB_VISIBLE = false` | `constants.ts:35` | Verborgen tab met sticky redirect erbij |

**Dood pad gevonden:** `WorkspaceSidebarTemplatesStep.vue:108` definieert een emit `redetectRenderStyle` waarvoor geen handler bestaat in de workspace-composables.

---

## 9. Inventaris — conversie en export (`core/fml`, `platform/export`)

Dit cluster bestaat bijna volledig uit categorie E: er *is* gemeten, en er gaat iets anders naar buiten.

| ID | Escalatiepad | Locatie | Cat | Trigger → actie |
|---|---|---|---|---|
| X-01 | **`balance: 0.5` overschrijft meting** | `harmonize-fml-wall-thickness.ts:223` | E | Elke muur, altijd. `resolveBalance` rekent de gemeten balans uit (`extractionToPlan.ts:149`, clamp 0.25–0.8) en harmonize gooit die weg. Tweede laag: `buildFmlV3.ts:135` `wall.balance ?? 0.5` |
| X-02 | Dikte: band → vaste tier | `harmonize-fml-wall-thickness.ts:192-222` | E | *"Ruwe meting bepaalt alleen de band; exportedikte komt altijd uit limits"* → 10/20/30 cm |
| X-03 | Keten-band op lengte | `harmonize-fml-wall-thickness.ts:157-176` | E | Geen lengte → gemiddelde raw; leeg → `10` |
| X-04 | Dik-dun-dik brug | `harmonize-fml-wall-thickness.ts:105-138` | A | Collineaire brug ≤40 cm, ratio ≤0.4 → ketens samenvoegen |
| X-05 | `roundFmlThicknessCm` niet-finiet | `harmonize-fml-wall-thickness.ts:187-189` | E | → `10` |
| X-06 | Graph-bron hiërarchie | `extraction-to-plan-walls.ts:19-29` | A | `semanticWallGraph` → `wallGraph` → `segments` → `buildJunctionGraph` |
| X-07 | Dikte-cascade in conversie | `extractionToPlan.ts:111-148` | E | semantic → kernel → `defaultThicknessCm` |
| X-08 | Node-fallback op edge | `extractionToPlan.ts:94-95` | E | Junction-node ontbreekt → `edge.segment.a/b` |
| X-09 | Opening segment-index fallback | `extraction-to-plan-edge-openings.ts:16-21` | E | `semanticSegmentIndex == null` → edge-index |
| X-10 | Double_wide twin-merge | `extraction-to-plan-doors.ts:14,78-116` | A | Twee deuren, gat ≤24 px → één `DOUBLE_WIDE_DOOR_REFID`. Geen review (eis "clustering-voorstel" is niet gebouwd) |
| X-11 | **Ramen zonder `mirrored`** | `extraction-to-plan-windows.ts:34-42` | E | Veld wordt niet gezet; export altijd `[0,0]` via `buildFmlV3.ts:147`. Voor deuren wél geïmplementeerd |
| X-12 | Deur `mirrored` flip | `extraction-to-plan-doors.ts:161-163` | A | Opening-as tegen muur-as → flip |
| X-13 | Hardcoded metadata | `buildFmlV3.ts:50,95,99-100,105` | E | project `900000001`, floor `900000010`, design `1`, timestamps `2026-01-01T00:00:00.000Z` |
| X-14 | Lege collecties | `buildFmlV3.ts:107-111` | E | `areas`, `surfaces`, `labels`, `dimensions` altijd `[]` |
| X-15 | Hardcoded project settings | `buildFmlV3.ts:57-92` | E | `wallThickness: 10`, `wallOuterThickness: 30`, `wallSectionHeight: 150` |
| X-16 | Muurhoogte `−14` | `buildFmlV3.ts:132-133` | E | `h: floor.height - 14` zonder uitleg |
| X-17 | Opening-defaults | `buildFmlV3.ts:143-147` | E | Raam 150/70, deur 220/0 |
| X-18 | `INK_THICKNESS_FACTOR` 0.9 | `measure-underlay-wall-thickness.ts:8,432` | E | *"Neem 90% van de gemeten dikte"* |
| X-19 | Ortho→diagonale sampling | `measure-underlay-wall-thickness.ts:276-295` | A | Buiten ±15° van H/V → diagonale meting |
| X-20 | Px→cm fallback `10` | `measure-underlay-wall-thickness.ts:326-343` | E | Ongeldige schaal → 10 cm |
| X-21 | `hasFmlSemanticSource` gate | `build-semantic-walls-source.ts:21-31` | B | `fmlReady !== true` → geen semantic build, expliciet **geen** L8/L9-fallback |
| X-22 | `thicknessPxMax → 0` | `build-semantic-walls-source.ts:62-65` | E | Geen positieve dikte op L10-segment |
| X-23 | OpenCV-load stil falen | `build-semantic-walls-output.ts:50-54` | E | `catch` → geen distance-map diktemeting, geen melding |
| X-24 | Opening-span gate 0.5 cm | `layer-openings-to-fml.ts:7-22` | B | Te kleine span → opening verdwijnt uit FML |
| X-25 | Import-defaults | `importFmlV3.ts:86-180` | F | thickness 10, height 280, naam `'Onbekend'` |
| X-26 | L12-skip-inferentie | `platform/export/.../build-layer-debug-report.ts:108-116` | E | Bound zonder oriented → reden `orient_failed` geraden |
| X-27 | `semanticUsedLayerBFallback` | `build-semantic-walls-output.ts:41,88` | — | **Dode vlag**: altijd `false`, geen setter; wel een waarschuwingsbanner in `format-layer-diff-markdown.ts:120-121` |

**X-01 en X-11 zijn de twee items in dit cluster waar detectie-informatie aantoonbaar verloren gaat** en die niet als bewuste keuze zijn gedocumenteerd. Ze staan ook in de audit (E6); hier is de keten bevestigd: berekend in `extractionToPlan.ts:149`, weggegooid in `harmonize-fml-wall-thickness.ts:223`.

---

## 10. Structurele patronen

Los van de individuele items zijn er vijf patronen die verklaren waarom dit systeem moeilijk voorspelbaar is.

### 10.1 Geneste retries

Retries binnen retries, waardoor de effectieve iteratieruimte een product van lussen is:

| Waar | Nesting |
|---|---|
| L5 | Buitenlus ≤20 × {same-line, tx-micro, ll-stair, micro-loop, compact, dangling-repair} |
| L6 | Buitenlus `maxIterations` × {connector-pass × per-candidate guards, landing sub-loop ≥8, junction node-pass} |
| L6 detect | primary-loop → bridge-fallback → chain-tip second pass |
| L6 geometry | landing-try → simple-L-try → multi met near-group scan |
| L9 | Drie opeenvolgende guarded passes met eigen skip-tellers |
| Deur Stage 1 | Per root: 4-traps match-cascade × 2 meetruimtes (Either) |
| Deur L11 | 9-traps bind-cascade per deur |
| `unifyNearEndpoints` | `while(changed)` binnen de L5-lus |

### 10.2 Cascades zonder gedeelde drempel-herkomst

De langste cascades (deur L11 met negen stappen, deur Stage-1 match met vier niveaus, raam-evidence met drie) hebben per stap eigen constanten uit eigen tuning-objecten: `DOOR_SWING_TUNING`, `DOOR_ANGLE_RESCUE_TUNING`, `DOOR_WALL_SNAP_TUNING`, `WINDOW_EVIDENCE_TUNING`, `LAYER6_*`. Er is geen plek waar staat hoe die zich tot elkaar verhouden, dus een verandering in stap 2 kan stap 7 stilzwijgend onbereikbaar maken.

### 10.3 Guard zonder rollback

Alle transformatiepassen in L7–L10 zitten in `withTopologyGuard`, op één uitzondering: **W-51** (`layer-10-fml.ts:81-88`, as-rechttrekking). Die staat er expliciet om een BouwTek11-micro-jog van ~4,5 px te dekken.

### 10.4 Escalatie die de eigen gates omzeilt

Twee plekken waar een rescue-pad de filters overslaat die het normale pad wél moet passeren:

- **D-37** angle-rescue injecteert een hypothese die fill- en surround-filter omzeilt (wall-touch geldt wel).
- **D-61** `existingDoorsOnly` schakelt vier gates tegelijk uit (wall-fill, surround, wall-touch, bridge).
- **R-16** derde niveau van de evidence-cascade laat vlakken door zonder rails- of framing-bewijs.

### 10.5 Compensatie in plaats van correctheid

De hele orkestratielaag (O-01 t/m O-30, ≈30 items) bestaat om resultaten *rond* een her-run te beschermen. Dat is een symptoom van een dieper punt: her-detectie is niet idempotent, en in plaats van dat op te lossen is er een tweede systeem gebouwd dat het effect ervan repareert. De asymmetrie in O-01 t/m O-04 is daar het bewijs van — vier klassen met vier verschillende bewaarregels, elk uit een aparte bugfix.

---

## 11. Concentratie: waar het het dichtst zit

| Rang | Locatie | Items | Waarom het opvalt |
|---|---|---|---|
| 1 | `cv/walls/.../pipeline-v3` L5+L6 | ≈27 | Twee lagen, meer dan de helft van alle muur-escalaties; 10 over-fit-ankers |
| 2 | `ui/composables/workspace` (deur/raam faces) | ≈30 | Compensatie-laag; geen enkele geautomatiseerde E2E eronder |
| 3 | `cv/doors` Stage 1 + L11 | ≈27 | Twee cascades van 4 en 9 niveaus met eigen tuning per stap |
| 4 | `cv/refs` | ≈18 | Voedt alle ratio's elders; geen ondergrens op aantal voorbeelden |
| 5 | `core/fml` harmonize + build | ≈19 | Bijna volledig categorie E; twee bewezen informatieverliezen |

**Bestanden met de hoogste dichtheid:**

| Bestand | Escalatie-takken |
|---|---|
| `cv/doors/door-swing-angle-rescue.ts` | 11 |
| `cv/doors/door-wall-snap.ts` (+ helpers) | 12 |
| `cv/walls/.../layer-6-repair.ts` (+ connector-engines) | 19 |
| `cv/walls/.../layer-5-cleanup.ts` (+ cleanup-engines) | 9 |
| `cv/doors/door-swing-filter-seed.ts` | 10 |
| `ui/.../useWorkspaceDoorSwingFaces.ts` | 9 |

---

## 12. Wat dit document niet doet

Er staat hier geen oordeel over welke escalatiepaden weg moeten. Dat kan ook niet los van bevinding B4 uit de audit: **zonder fixture-tests op echte scans is het verwijderen van een escalatiepad niet te onderscheiden van het introduceren van een regressie.** Elk pad in sectie 3 is toegevoegd omdat iemand een fout zag; wie het weghaalt zonder meetinstrument haalt ook die correctie weg.

Wat dit document wél oplevert voor een later plan:

- **Stabiele ID's** (W-, D-, R-, REF-, O-, X-) om per pad een besluit vast te leggen
- **De categorie-indeling A–F**, waarmee een plan per *type* kan worden opgezet in plaats van per bestand. Categorie E (meting weggegooid) is bijvoorbeeld grotendeels los oplosbaar en raakt geen detectie-tuning; categorie A raakt die per definitie wel
- **De over-fit-ankerlijst** (sectie 3) als concrete testbehoefte: eenentwintig paden met een bekende tekening erachter zijn eenentwintig kandidaat-fixtures
- **De structurele patronen** (sectie 10) als de plekken waar één ingreep meerdere items dekt

---

## Bijlage — methode en verificatiestatus

**Zoekwijze:** systematische scan van `frontend/src` op de patronen `rescue`, `fallback`, `retry`, `relax`, `repair`, `salvage`, `promote`, `retarget`, `rebind`, `guard`, `skip`, `sticky`, gevolgd door gerichte doorlezing van de gevonden modules per cluster (muren, deuren, ramen+refs, orkestratie, conversie/export). Docs meegenomen voor herkomst: `door-detection-flow.md`, `window-detection-flow.md`, `l6-connector-fragility-audit.md`, `pipeline-v3-fragility-audit.md`, de per-laag beslisdocumenten en `memory.mdc`.

**Verificatiestatus:** de vijf meest dragende claims zijn direct in de code gecontroleerd:

| Claim | Bestand | Status |
|---|---|---|
| `shallowRescueAxisMinRelaxRatio` 0.5 + 2D_3E-comment | `door-swing-filter-matching.ts:19-21` | bevestigd, letterlijk geciteerd |
| Doorframe `removeClasses: []` | `face-override-sync.ts:164-176` | bevestigd |
| 70%-tolerantie + 2D_3E-comment | `window-axel-cluster.ts:248-249` | bevestigd |
| L6 face-accept i.p.v. rollback, 2D_3E top-chamfers | `layer-6-repair.ts:1-7` | bevestigd |
| `balance: 0.5` overschrijft `resolveBalance` | `harmonize-fml-wall-thickness.ts:223` | bevestigd |

De overige regelnummers komen uit de clusterscan en zijn een momentopname; ze schuiven bij elke wijziging in het betreffende bestand. Gebruik ze als aanwijzing, niet als anker — de ID's en de labels zijn wat stabiel moet blijven.

**Bekende onvolledigheid:** `cv/port` (OCR, lijndetectie, binaire polariteit) is niet systematisch meegenomen; daar zitten volgens de eerste scan nog fallbacks in `ocrTextFilters.ts`, `lineDetect.ts` en `binaryPolarity.ts`. Ook `cv/preprocess` is buiten deze ronde gebleven.
