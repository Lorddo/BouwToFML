# Pipeline-V3 fragiliteits-audit (L1–L5, L7–L10) — "probe-tuning" & magic numbers

Status: **Fase 1-7 geïmplementeerd**. Datum: 2026-07-17.
Doel: dezelfde audit die voor L6 is gedaan (`.cursor/docs/l6-connector-fragility-audit.md`)
doortrekken naar **alle andere lagen** van `cv/walls/rooms/pipeline-v3/**`, zodat we ook daar
weten **waar** en **hoe** het niet schaal-/tekening-onafhankelijk is.
Deze audit blijft de inventaris; onderstaand updateblok markeert wat inmiddels is opgelost.

> Scope: L1 (raw-wasm), L2 (raw-segments), L3 (prune), L4 (HV-position), L5 (cleanup),
> L7 (align/collapse), L8 (finalize), L9 (dissolve), L10 (FML) + hun policies, engines en tests.
> **L6 valt buiten dit document** — die heeft zijn eigen audit + lopend `Layer6Scale`-refactorplan.

---

## Update 2026-07-17 — implementatie Fase 1-7

Uitgevoerd op basis van `.cursor/plans/pipeline_scale_invariance_8186ac3d.plan.md`:

- **Cat B (grootste structurele deel) opgelost:** gedeelde `PipelineScale` toegevoegd (`engines/scale.ts`) en beleidsdrempels in L1/L2/L3/L4/L5/L7/L8/L9/L10 via `resolvePipelineScale(ref)` aangesloten (byte-identiek op `ref=30`, schaalgedrag actief bij `ref!=30`).
- **Resolver-gap dicht:** `resolveLayer4HvPolicy(ref)`, `resolveLayer9DissolvePolicy(ref)`, `resolveLayer10FmlPolicy(ref)` en `resolveLayer8FinalizePolicy(ref)` consumeren nu allemaal daadwerkelijk `referenceWallThicknessPx`.
- **Shared-engine lek dicht:** `classifyLayer6Segment` gebruikt nu expliciet een geschaalde `hvBandPx` i.p.v. impliciete L6-default; hardcoded `incidentAt(...,1)` vervangen door policy-eps in weld/segment-ops.
- **Cat E opgeruimd (Fase 4):** dode `snapEndpointsToJunctions`, dode `layer4JunctionPolicy`, ongebruikte `layer2JitterPolicy`-import, ongebruikte L5 weld/topology velden en hardcoded L5 stats (`microWelded`/`weldedCluster`) verwijderd.
- **Cat D afgedekt voor invariantie (Fase 5-6):** nieuwe `tests/cv/walls/pipeline-v3/pipeline-invariance.spec.ts` (L2..L10, translatie + schaal x1.5/x0.6, topologie-signatuur), plus probe-asserts geüpdatet naar offset-invariante vorm.
- **Nazorg regressies na schaalrefactor:** L9 parallel-cover regressie opgelost door `hvBandPx` expliciet op `PrunePolicy`/`CollapsePolicy` te zetten en shared engines die policy-band direct te laten gebruiken (geen afleiding via `thicknessFallbackPx`). L4 HV gebruikt nu mask-first dikte (meerdere DT-samples + face-median fallback) zodat lokale mask-dikte leidend is en parallelle stukken niet onterecht samenvallen.
- **Fase 7 verificatie:** `tests/cv/walls/pipeline-v3` opnieuw groen na regressiefixes (**121/121**), `ReadLints` op gewijzigde paden zonder fouten.

Nog open na Fase 1-7: **Cat C generalisatie** (vooral L5 over-fit takken) en verbreding naar extra plattegrond-fixtures buiten BouwTek11/2D_3E.

---

## 0. Belangrijkste conclusie (lees dit eerst)

De L6-conclusie geldt **voor de hele pipeline**, alleen minder extreem:

1. **Cat A = 0 over álle lagen.** Er staat geen enkele letterlijke coördinaat in een runtime-`if`.
   Alle `@572`/`@645,243`/`@1354,1229`-ankers staan uitsluitend in **commentaar of tests**. De
   volledige pipeline is dus **translatie-invariant**: dezelfde tekening 1000px verschoven geeft
   identieke topologie. (Bevestigt de L6-bevinding op groter bereik.)

2. **De echte fragiliteit is opnieuw schaal, niet translatie.** Verspreid over de lagen staan
   **~90 vaste px/hoek-drempels** die NIET met `referenceWallThicknessPx` meeschalen. Dezelfde
   oorzaak als bij L6: stap 1 doet `normalizeWorkingCanvas` (whitespace-trim + upscale naar
   min. 2000px). Croppen/niet-croppen ⇒ andere content-bounds ⇒ **andere upscale-factor** ⇒ andere
   pixels-per-mm. De ref-geschaalde drempels passen zich aan, de kale getallen (`8px` H/V-band,
   `15px` junction-anchor, `5px` cross-axis, `1.5px` same-line, `25°/26°` hoeken, …) niet.

3. **De grootste systemische zwakte is nieuw t.o.v. L6: de policy-resolvers negeren `ref`.**
   L6 heeft (na het lopende plan) één schaalbron. De andere lagen hebben dat **niet**:
   - `resolveLayer4HvPolicy(_referenceWallThicknessPx?)` → **negeert ref volledig** (arg heet `_`).
   - `resolveLayer9DissolvePolicy()` / `resolveLayer10FmlPolicy()` → **nemen ref niet eens aan**.
   - `resolveLayer8FinalizePolicy(ref)` → schaalt **alleen** `prune.thicknessFallbackPx`; het hele
     `hv`-blok is een ongewijzigde kopie.
   - `resolveLayer3PrunePolicy(ref)` en `resolveLayer2*` → schalen **wel** (deels) → goede baseline.

   Kortom: de orchestrator (`index.ts`) geeft `referenceWallThicknessPx` netjes door, maar het lekt
   in L4/L9/L10 weg omdat de resolver het weggooit.

4. **Cat C (over-fit branch-logica) zit vooral in L5 (~8 takken) — en verder in policy-defaults, niet
   in runtime-guards.** L1–L4 en L7–L10 hebben nauwelijks probe-vertakkingen in runtime; hun over-fit
   leeft in **getunede policy-getallen + comments** (b.v. L10 `chainAxisMaxSpreadPx: 5` met comment
   "Cover BouwTek11 T/L micro-jog ~4.5px", en de 1°-gap `preserveMinAngleDeg 25` vs `structuralAngleDeg 26`).

5. **Cross-layer lek: L6-constants sturen andere lagen.** `classifyLayer6Segment(seg, index)` wordt
   met zijn **default `hvBandPx = 8` (LAYER6_HV_BAND_FALLBACK_PX)** aangeroepen vanuit de prune-engine
   (L3/L8) en de collapse-adjacency (L7/L9/L10). Eén L6-constante bepaalt dus stilzwijgend de H/V-band
   van vier andere lagen.

6. **De tests bevriezen de over-fit overal.** Vrijwel elke `*-probe.spec.ts` is een absolute-
   coördinaat-snapshot van BouwTek11 of 2D_3E, met `describe`/`it` benoemd naar de probe (`@645,243`,
   `(1273,1964)`, `@(1514,892)`). Ze asserten op exacte coördinaten i.p.v. invarianten.

**Fix-richting (identiek aan L6, generaliseren):** (a) elke laag krijgt een `LayerNScale` afgeleid
van `referenceWallThicknessPx` (of hergebruikt één gedeelde scale-bron), (b) de resolvers gaan `ref`
echt gebruiken, (c) de shared engines nemen band/anchor als parameter i.p.v. de L6-default, (d) de
probe-tests worden omgezet naar translatie-/schaal-invariante asserts.

---

## 1. Severity-overzicht per laag

| Laag | Cat A | Cat B (magic) | Cat C (over-fit) | Cat D (probe-tests) | Cat E (dood) | Ref-baseline |
|------|:---:|:---:|:---:|:---:|:---:|---|
| **L1** raw-wasm | 0 | ~1 | 0 | 0 (indirect) | 0 | n.v.t. (passthrough) |
| **L2** raw-segments | 0 | ~14 | 0 | 3 specs | 1 | deels (`resolveMergeTolerancePx`) |
| **L3** prune | 0 | ~5 | 0 | 1 spec | ~2 | **goed** (`resolveLayer3PrunePolicy`) |
| **L4** HV-position | 0 | ~15 | 0 | 1 spec | 2 | **slecht** (resolver negeert ref) |
| **L5** cleanup | 0 | ~35 | ~8 | 2 specs | 4 | deels (`microMaxPx`, `txZoneMaxPx`) |
| **L6** connector | 0 | ~50 | ~10 | 2 specs | 3 | *(eigen doc + `Layer6Scale`-plan)* |
| **L7** align/collapse | 0 | ~25 | ~0 | 1 spec | 0 (1 DRY-schuld) | deels (dikte/brug schaalt) |
| **L8** finalize | 0 | ~15 | 0 | 1 spec | 0 | deels (prune wel, hv niet) |
| **L9** dissolve | 0 | ~20 | ~1 | 1 spec | 0 | **slecht** (resolver zonder ref) |
| **L10** FML | 0 | ~10 | ~2 | (deelt L9-spec) | 0 | **slecht** (resolver zonder ref) |

> Cat B-tellingen overlappen deels: L7–L10 delen dezelfde `CollapsePolicy`-drempels, dus dezelfde
> `junctionAnchorPx: 15` telt in meerdere lagen. Zie §3 voor de gedeelde drempels.

---

## 2. Cross-cutting root cause — de policy-resolver schaal-gap

Dit is de belangrijkste structurele bevinding en het meest lonende fix-punt. Per laag: gebruikt de
`resolve…Policy(ref)` de `referenceWallThicknessPx` om zijn drempels te schalen?

| Resolver | Neemt `ref`? | Gebruikt `ref`? | Gevolg |
|---|:---:|:---:|---|
| `resolveLayer2JitterPolicy` + `resolveMergeTolerancePx` | ✓ | ✓ (deels) | tolerantie = ratio×dikte, maar geclamped 2–8px |
| `resolveLayer3PrunePolicy(ref)` | ✓ | ✓ | `thicknessFallbackPx ← ref` → prune-drempel schaalt — **goede baseline** |
| `resolveLayer4HvPolicy(_ref?)` | ✓ (genegeerd) | ✗ | **alle** ~15 HV-drempels vast; `_`-prefix bevestigt dead arg |
| `resolveLayer5CleanupPolicy(ref)` | ✓ | ✓ (deels) | `microMaxPx`/`txZoneMaxPx`/`endGapMax` schalen; weld/hoek niet |
| `resolveLayer8FinalizePolicy(ref)` | ✓ | ✓ (deels) | alleen `prune.thicknessFallbackPx`; `hv`-blok ongewijzigd |
| `resolveLayer9DissolvePolicy()` | ✗ | ✗ | neemt ref niet aan; alle collapse-drempels vast |
| `resolveLayer10FmlPolicy()` | ✗ | ✗ | idem — L10 is extra kwetsbaar (getunede 5px/8px jogs) |

**Nuance:** L9/L10 krijgen `referenceWallThicknessPx` wél apart doorgegeven aan
`collapseInterJunctionChains(..., ref)` en `buildThicknessBySegment(..., ref)`, dus de **dikte-band-
compat en DT-sampling schalen**. Maar de *geometrische* drempels (anchor/cross-axis/stub/spread/hoek)
komen uit de policy en blijven vast.

**Voorgestelde generalisatie:** trek het `Layer6Scale`-patroon door naar `LayerNScale` (of één gedeelde
`PipelineScale`) en laat elke resolver `ref` echt consumeren. Op `ref = 30` (de fixture-waarde) moet
alles byte-identiek blijven — precies de calibratie-eis die het L6-plan al hanteert.

---

## 3. Shared-engine drempels (gelden voor meerdere lagen tegelijk)

Deze modules worden door meerdere lagen aangeroepen; één vast getal hier raakt alle callers.

### 3.1 `engines/collapse/*` (L7 + L9 + L10)
| Bron | Drempel | Waarde | Herkomst |
|---|---|---|---|
| `adjacency.ts` 131,183 | `armDetectPx` | `policy.junctionAnchorPx` = **15** | I-arm detectie + span |
| `adjacency.ts` 143–154,184 | `crossAxisTolPx` | **5** | loodrechte arm nabijheidsband |
| `adjacency.ts` 195,206 | `structuralLDeg`/`collinearMaxDeg` | **26° / 25°** | hard-anchor vs fake-L |
| `adjacency.ts` 53 | `classifyLayer6Segment(seg, idx)` | **hvBand 8** | **L6-default lekt in L7/L9/L10** |
| `chain-collapse.ts` 124 | `collinearThicknessBypassDeg` | **3°** | dikte-ruis bypass |
| `chain-collapse.ts` 308–309 | `thicknessFallbackPx` | **10** | fallback zonder ref |
| `thickness.ts` 32–34 | `thicknessSampleInsetPx` | **6** (+`*2+1`/`0.5`) | DT-inset |
| `thickness.ts` 49–58 | `FML_BAND_MAX_RATIO × ref` | ratio | **goed — schaalt** |
| `validate.ts` 47–53 | topology-rollback radius | `junctionAnchorPx` = **15** | I/T/X moet ≤15px blijven |
| `stub-collapse.ts` 66,82,213 | `orthoStubMaxPx`/`TierMaxPx` | **8 / 8** | L9-only |
| `parallel-cover.ts` 135 | `axisCoverEpsPx` | **1** | L9-only |

### 3.2 `engines/prune/*` (L3 + L8)
| Bron | Drempel | Waarde | Opmerking |
|---|---|---|---|
| `index.ts` 41–43 | spur-threshold | `thicknessFallbackPx × maxPathLengthRatio` | **schaalt via L3/L8-resolver** |
| `index.ts` 70,89 | endpoint-groepering/weld | **1px** | los van `policy.endpointEpsPx` |
| `index.ts` 215 | `classifyLayer6Segment(seg, idx)` | **hvBand 8** | L6-default lek (alleen L8 protect-pad) |

### 3.3 `engines/segment-ops/*` + `engines/topology/*` + `engines/weld/*` (L4–L10)
| Bron | Drempel | Waarde | Opmerking |
|---|---|---|---|
| `segment-ops/index.ts` 21 | `DEFAULT_ENDPOINT_EPS_PX` | **1** | default voor incident/dedup/replace |
| `segment-ops/index.ts` 211 | `incidentAt(work, point, 1)` | **1px hardcoded** | i.p.v. policy-eps |
| `weld/index.ts` 74 | `incidentAt(work, ref.point, 1)` | **1px hardcoded** | i.p.v. `policy.endpointEpsPx` |
| `topology/index.ts` 53 | zero-length guard | **1px** | |

---

## 4. Per-laag bevindingen (Cat B / C / E)

### 4.1 L1 — `layer-1-raw-wasm.ts` + `policies/layer-1.ts`
Grotendeels WASM-passthrough: skeleton-trace → globale coördinaten → junction-graf. Geen merge/prune.

**Cat B**
| Regel | Code | Probleem |
|---|---|---|
| `policies/layer-1.ts:6` | `junctionGraphSnapPx: 2` | vaste cluster-snap na WASM; niet ref-geschaald |
| `layer-1-raw-wasm.ts:54` | `inkCoverageRatio: 1` | placeholder-constante (geen echte meting) |

Shared (`wallSkeletonTrace.compressPolylinePoints`) is richtingscompressie → **schaal-invariant, goed**.

### 4.2 L2 — `layer-2-raw-segments.ts` + `policies/layer-2.ts`
Eén algoritme: iteratieve degree-2 L-knik merge binnen dikte-tolerantie + T-arm-guard.

**Cat B**
| Regel | Code | Probleem |
|---|---|---|
| `policies/layer-2.ts:6` | `preserveMinAngleDeg: 25` | vaste hoek |
| `policies/layer-2.ts:7` | `structuralAngleDeg: 26` | 1° gap t.o.v. `preserveMinAngleDeg` = golden-copy tuning |
| `policies/layer-2.ts:8` | `tArmMinBranchPx: 8` | vaste px, niet ref-geschaald |
| `policies/layer-2.ts:10–11` | `mergeToleranceMinPx: 2` / `MaxPx: 8` | clamp-bypass: dooft ratio-schaling bij dunne/dikke muren |
| `policies/layer-2.ts:12–13` | `thicknessSampleInsetPx: 6` / `thicknessFallbackPx: 10` | vast |
| `policies/layer-2.ts:14` | `junctionGraphSnapPx: 0` | exact-endpoint modus (bewust) |
| `layer-2-raw-segments.ts:64` | `len > insetPx + 1 ? … : 0.35` | vaste `+1`px + `0.35` fallback-ratio |
| `layer-2-raw-segments.ts:218–224` | `hasPerpendicularBranchAt(..., 0, …)` | `snapPx: 0` → alleen exacte endpoint-match voor T-arm (jitter-fragiel) |

Baseline (goed): `resolveMergeTolerancePx` (21–35) = `ratio × max(local, ref, fallback)`, maar hard
geclamped 2–8px.

**Cat E**
| Regel | Symbool | Status |
|---|---|---|
| `layer-2-raw-segments.ts:19` | `layer2JitterPolicy` (import) | geïmporteerd maar nooit gebruikt (alleen `resolveLayer2JitterPolicy()`) |

### 4.3 L3 — `layer-3-prune.ts` + `policies/layer-3.ts` + `engines/prune`
Relatief robuust: de prune-drempel schaalt (`thicknessFallbackPx × maxPathLengthRatio`).

**Cat B**
| Regel | Code | Probleem |
|---|---|---|
| `policies/layer-3.ts:6` | `thicknessFallbackPx: 30` | fallback wanneer ref ontbreekt |
| `policies/layer-3.ts:8` | `endpointEpsPx: 1` | vaste 1px weld/match |
| `policies/layer-3.ts:9` | `junctionSnapPx: 0` | exact graph (bewust) |
| `policies/layer-3.ts:13` | `collinearMaxDeg: 25` | vaste hoek (alleen L8 protect-pad) |
| `engines/prune/index.ts:70,89` | `> 1` / `weldGapPx` | endpoint-groepering hard 1px |

**Cat E** (runtime dead voor L3-policy `protectStructuralTx: false`)
| Regel | Symbool | Status |
|---|---|---|
| `engines/prune/index.ts:220–257` | `shouldProtectTxFromSpurPrune` body | onbereikt bij L3 (immediate return) — wel L8-pad |
| `engines/prune/index.ts:325–366` | `pruneISpursOnce` | niet bereikt bij L3 (`mode: 'iterative-tx'`) — wel L8-dispatcher |

### 4.4 L4 — `layer-4-position-hv.ts` + `policies/layer-4.ts` + `engines/hv`
**Fragielste laag qua ref-gap:** `resolveLayer4HvPolicy(_referenceWallThicknessPx?)` negeert ref
volledig (regel 43–45, arg `_`-prefixed).

**Cat B**
| Regel | Code | Probleem |
|---|---|---|
| `policies/layer-4.ts:10` | `prePositionSnapPx: 2` | endpoint→junction snap vast |
| `policies/layer-4.ts:13` | `flatBandPx: 8` | **HV flat-band** voor `classifyHvOrientation`; niet ref-geschaald |
| `policies/layer-4.ts:14–15` | `thicknessFallbackPx: 10` / `SampleInsetPx: 6` | vast |
| `policies/layer-4.ts:17–18` | `repositionToleranceMinPx: 2` / `MaxPx: 12` | clamp-bypass op ratio-schaling |
| `policies/layer-4.ts:23` | `collinearChainMaxSpreadPx: 8` | vaste collinear spread |
| `policies/layer-4.ts:43–45` | `resolveLayer4HvPolicy(_ref?)` | **ref genegeerd — geen enkel veld schaalt** |
| `engines/hv/axis-clusters.ts:79–80,166–167` | `orientation==='H' ? collinearChainMaxSpreadPx : maxShiftPx` | **asymmetrie: H vast 8px, V thickness-geschaald** |
| `engines/hv/axis-clusters.ts:40,60` | `Math.max(2, …)` / `Math.max(1, …)` | vaste px-vloeren op shift |
| `engines/hv/position-segments-hv.ts:24` | `bestDistance = snapPx` (=2) | junction-map radius vast |

Baseline (goed): ratio-velden (`repositionToleranceRatio`, `junctionShiftMaxRatio`,
`maxAxisShiftFromOwnRatio`, `separateWallRatio`, `thicknessMatchMinRatio`) berekenen shifts t.o.v.
`max(local, ref, fallback)` — maar worden afgekapt door de vaste min/max px hierboven.

**Cat E**
| Regel | Symbool | Status |
|---|---|---|
| `engines/hv/index.ts:15–19` | `snapEndpointsToJunctions` | gedefinieerd, gooit `Error`, **nooit aangeroepen** |
| `policies/layer-4.ts:37–41` | `layer4JunctionPolicy` | niet geëxporteerd, nergens gebruikt |
| `policies/layer-4.ts:27–34` | `layer4WeldPolicy` | L4-orchestrator roept weld niet aan (alleen scaffold.spec leest layerId) |

### 4.5 L5 — `layer-5-cleanup.ts` + `policies/layer-5.ts` + weld/topology/segment-ops/cleanup
Kleiner dan L6 maar met de dichtste opeenhoping Cat C **buiten** L6.

**Cat B (selectie — ~35 totaal)**
| Regel | Code | Probleem |
|---|---|---|
| `policies/layer-5.ts:16` | `LAYER5_SAME_LINE_MAX_OFFSET_PX = 1.5` | collinear H/V offset + cluster-gap vast |
| `policies/layer-5.ts:21` | `nearEndpointGapPx: 0.8` | near-endpoint weld sub-pixel vast |
| `policies/layer-5.ts:25` | `endpointEpsPx: 1` | zero-length/dedup/incident eps |
| `policies/layer-5.ts:28` | `repairMaxGapPx: 4` | dangling-repair max gap (verhoogd 2.5→4 voor ~3.3px stub) |
| `engines/cleanup/index.ts:28–31` | `deg<=12 \|\| >=168` / `abs(deg-90)<=12` | H/V band vast 12° |
| `engines/cleanup/index.ts:216` | `if (len <= 3) return true` | tx-stub shortcut vast 3px |
| `engines/cleanup/index.ts:348,427` | `angleDiff <= 25` / `directedAbsDiffDeg > 25` | collinear/opposite-arm gate vast 25° |
| `engines/cleanup/index.ts:397` | `Math.max(4, Math.min(8, round(ref×0.25)))` | endGap-clamp 4–8px kapt ref af aan extremen |
| `engines/weld/index.ts:74` | `incidentAt(work, ref.point, 1)` | hardcoded 1px i.p.v. `policy.endpointEpsPx` |

Baseline (goed): `resolveLayer5MicroMaxPx` (ref×0.15, clamp 2–6), `resolveLayer5TxZoneMaxPx`
(ref×0.28, clamp 5–10), `endGapMax` (deels).

**Cat C (~8 probe-getunede takken)**
| Regel | Bestand | Anker | Probleem |
|---|---|---|---|
| 50–58 | `layer-5-cleanup.ts` | `@645,243` | `compactCandidate` vóór accept — bugfix voor elders-gecrushte micro |
| 88–91 | `engines/segment-ops/index.ts` | `@645,243` | `replaceEndpoint` snapshot from/to (live-ref bug mid-loop) |
| 187–189 | `engines/cleanup/index.ts` | `@1202–1203` | 1px mid-chain stub-recreatie-guard |
| 247–252 | `engines/cleanup/index.ts` | `2D_3E @(221.7,1355)` | hub↔hub micro-skip (opposite-T guard) |
| 261–278 | `engines/cleanup/index.ts` | export-62 | per-candidate clone + `validateConnectivity` + `moved<=1` |
| 426–427 | `engines/cleanup/index.ts` | `@645,243` | directed i.p.v. undirected angle (export-62 false-match) |
| 429–431 | `engines/cleanup/index.ts` | export-62 | `degA!==1 \|\| degB!==1` degree-check getuned |
| `policies/layer-5.ts:28` | comment "3.3px T-stub gap" | BouwTek11 | `repairMaxGapPx` op specifieke stub-lengte |

**Cat E**
| Regel | Symbool | Status |
|---|---|---|
| `policies/layer-5.ts:23–24` | `junctionClusterPx: 0`, `collinearGapMaxPx: 0` | weld-velden nooit gelezen door `engines/weld` |
| `policies/layer-5.ts:34` | `junctionAnchorPx: 8` | topology-veld; `validateConnectivity` leest het niet |
| `layer-5-cleanup.ts:201–204` | `microWelded: 0`, `weldedCluster: 0` | stats hardcoded 0 (Copy6-velden nooit gevuld) |

### 4.6 L7 — `layer-7-align.ts` + `policies/layer-7.ts` + `engines/collapse`
Zie §3.1 voor de gedeelde collapse-drempels. L7-specifiek:

**Cat B**
| Regel | Code | Probleem |
|---|---|---|
| `policies/layer-7.ts:11–13` | `collinearMaxDeg: 25`, `structuralLDeg: 26`, `collinearThicknessBypassDeg: 3` | vaste hoeken |
| `policies/layer-7.ts:16` | `junctionAnchorPx: 15` | I/T/X-anker + arm-detect (comment `L6(3)+12`) |
| `policies/layer-7.ts:17` | `crossAxisTolPx: 5` | loodrechte arm nabijheid |
| `policies/layer-7.ts:19–20` | `thicknessFallbackPx: 10`, `thicknessSampleInsetPx: 6` | vast |
| `layer-7-align.ts:73` | `dedupeExactSegments(..., 0)` | nul-tolerantie dedupe (sub-pixel gap-gevoelig na schaal) |

Baseline (goed): `isWallThicknessBridgeCandidatePx` (ref×4 + neighbor×0.4), `wallThicknessBandsCompatible`
(ref×0.4/0.85) — **schalen correct**.

**Cat E:** geen dode symbolen. Wel DRY-schuld: `validate.ts:12–20` `graphWeldPolicy` dupliceert
`policies/layer-7.ts:33–40` `layer7WeldPolicy`.

### 4.7 L8 — `layer-8-finalize.ts` + `policies/layer-8.ts`
`resolveLayer8FinalizePolicy(ref)` schaalt alleen `prune.thicknessFallbackPx`; `hv`-blok is vaste kopie.

**Cat B**
| Regel | Code | Probleem |
|---|---|---|
| `policies/layer-8.ts:16` | `prePositionSnapPx: 2` | vast |
| `policies/layer-8.ts:18` | `flatBandPx: 8` | H/V-band vast |
| `policies/layer-8.ts:22–23` | `repositionToleranceMinPx: 2` / `MaxPx: 12` | clamp-bypass |
| `policies/layer-8.ts:28` | `collinearChainMaxSpreadPx: 8` | vast |
| `policies/layer-8.ts:55` | `collinearMaxDeg: 25` | T/X-protect hoek vast |
| `layer-8-finalize.ts:82` | `dedupeExactSegments(..., 0)` | exact-dedup eps 0 |

### 4.8 L9 — `layer-9-dissolve.ts` + `policies/layer-9.ts`
`resolveLayer9DissolvePolicy()` neemt geen ref. Deelt collapse-engine (§3.1).

**Cat B (policy-specifiek)**
| Regel | Code | Probleem |
|---|---|---|
| `policies/layer-9.ts:14–15` | `junctionAnchorPx: 15`, `crossAxisTolPx: 5` | vaste anchors |
| `policies/layer-9.ts:23–24` | `orthoStubMaxPx: 8`, `orthoStubTierMaxPx: 8` | **L9 stair-stub** max lengte + tier vast |
| `policies/layer-9.ts:25` | `axisCoverEpsPx: 1` | parallel-cover slack vast |
| `layer-9-dissolve.ts:122` | `dedupeExactSegments(..., 0)` | exact-dedup eps 0 |

**Cat C:** `chain-axis-straighten.ts` bridge-pass gebruikt `microCornerMaxPx (8px)` als "kort" — generiek
algoritme, drempel gekoppeld aan BouwTek11 via L10-policy (zie L10).

### 4.9 L10 — `layer-10-fml.ts` + `policies/layer-10.ts` + micro-corner + chain-axis-straighten
Extra kwetsbaar: getunede micro-jog drempels, resolver zonder ref.

**Cat B**
| Regel | Code | Probleem |
|---|---|---|
| `policies/layer-10.ts:26` | `microCornerMaxPx: 8` | **L10 micro-corner-jog** max stub, vast |
| `policies/layer-10.ts:28` | `chainAxisMaxSpreadPx: 5` | **L10 chain-axis-straighten** spread, vast (bewust > L9's 2px) |
| `engines/collapse/micro-corner.ts:60` | `stubLen > microCornerMaxPx` | vast 8px |
| `engines/collapse/chain-axis-straighten.ts:109,147` | `spread <= maxSpreadPx` | ≤5px consensus vast |
| `engines/collapse/chain-axis-straighten.ts:121` | `stubLen > maxBridgePx` (=microCornerMaxPx) | bridge ≤8px vast |
| `layer-10-fml.ts:111` | `dedupeExactSegments(..., 0)` | exact-dedup eps 0 |

**Cat C**
| Regel | Anker | Probleem |
|---|---|---|
| `policies/layer-10.ts:27–28` | comment "Cover BouwTek11 T/L micro-jog (~4.5px)" | `chainAxisMaxSpreadPx: 5` expliciet op BouwTek11 getuned |
| `chain-axis-straighten.ts:114–121` | BouwTek11 V—H5—V | bridge-drempel 8px gekoppeld aan ~5px jog |

---

## 5. Cat D — tests die de over-fit bevriezen

Dezelfde structuur als L6: absolute-coördinaat-fixtures + probe-benoemde blokken + coördinaat-asserts.

| Testbestand | Probe-ankers | Aard |
|---|---|---|
| `layer-2-raw-segments.spec.ts` | `(1513,44)`, `(1517,1518)`, T `(1520,1222)` | absolute fixtures + exacte junction-lookup |
| `layer-2-bouwtek11-1964-probe.spec.ts` | `describe (1273,1964)` | volledige L1-snapshot BouwTek11 |
| `layer-2-bouwtek11-1965-probe.spec.ts` | `(1126,1965)`, T `(1132,1963)`, `(1116,1964)` | dubbele probe-asserts op exacte T-locaties |
| `layer-3-prune.spec.ts` | `it('BouwTek11 probe (230,248)…')` | absolute coords + `pathLengthPx === 33` |
| `layer-4-position-hv.spec.ts` | `(1129,1964)` export-zone | absolute snapshot; kind-counts (deels invariant) + policy-literals |
| `layer-5-cleanup.spec.ts` | `@1202–1203`, `@645,243`, export-62 | float-exacte coords `645.3675…` |
| `layer-5-2d3e-opposite-t-probe.spec.ts` | `describe (234,1285)`, x≈221.7/230.9 | 14-seg 2D_3E-snapshot + zone-bbox filters |
| `layer-7-chain-collapse.spec.ts` | `it('BouwTek11 … probe 1081,53')`, `1060.44`, `1523.12` | absolute snapshot + `abs(x-1060.44)<=1` |
| `layer-8-finalize.spec.ts` | T `@(1138,43)`, parallel L/T `@(1515,895)` | probe-benoemd + export-coords |
| `layer-9-dissolve.spec.ts` | `@(1514,892)`, `@572`, `@(1354,1229)`, `@(970,655)` | export-frozen fixtures voor L9 én L10 |
| `scaffold.spec.ts` | — | bevriest golden policy-literals (`junctionGraphSnapPx: 2`, `25`, `26`) → blokkeert policy-refactor |

**Gevolg (identiek aan L6):** de tests werken als *anti-refactor-slot*. Elke generalisatie van de
schaal of de logica breekt ze, ook als het resultaat objectief beter is.

---

## 6. Cat E — dode code (over alle lagen samengevat)

| Locatie | Symbool | Status |
|---|---|---|
| `engines/hv/index.ts:15–19` | `snapEndpointsToJunctions` | throwt, nooit aangeroepen |
| `policies/layer-4.ts:37–41` | `layer4JunctionPolicy` | niet geëxporteerd, ongebruikt |
| `policies/layer-4.ts:27–34` | `layer4WeldPolicy` | L4 roept weld niet aan |
| `layer-2-raw-segments.ts:19` | `layer2JitterPolicy` (import) | ongebruikte import |
| `policies/layer-5.ts:23–24,34` | `junctionClusterPx`/`collinearGapMaxPx`/`junctionAnchorPx` | policy-velden nooit gelezen |
| `layer-5-cleanup.ts:201–204` | `microWelded`/`weldedCluster` stats | hardcoded 0, nooit gevuld |
| `engines/prune/index.ts:220–257,325–366` | `shouldProtectTxFromSpurPrune` body / `pruneISpursOnce` | runtime-dead voor L3-policy (wel L8) |

> DRY-schuld (geen dode code, wel opruimwaardig): `validate.ts` `graphWeldPolicy` dupliceert
> `layer7WeldPolicy`; het `LAYER6_ENDPOINT_SNAP_PX * 2`-idioom en de losse `incidentAt(…, 1)`-hardcodes
> horen benoemde constanten te zijn.

---

## 7. Voorgestelde oplosrichting (later, gefaseerd — parallel aan L6-plan)

**Fase 1 — resolvers laten schalen (grootste winst, laagste risico).**
- Geef `resolveLayer4HvPolicy`, `resolveLayer9DissolvePolicy`, `resolveLayer10FmlPolicy` een echte
  `referenceWallThicknessPx` en leid px-drempels af via een `LayerNScale`/gedeelde `PipelineScale`
  (analoog aan het `Layer6Scale`-plan). `resolveLayer8FinalizePolicy` uitbreiden naar het `hv`-blok.
- Calibratie-eis: op `ref = 30` moet elke laag **byte-identiek** blijven → alle bestaande tests
  blijven groen; alleen gedrag bij `ref != 30` verandert (= de winst).

**Fase 2 — shared engines parametriseren.**
- `classifyLayer6Segment(seg, idx)` overal een expliciete `hvBandPx` meegeven (uit de laag-scale),
  zodat L3/L7/L8/L9/L10 niet stiekem op `LAYER6_HV_BAND_FALLBACK_PX` leunen.
- `incidentAt(…, 1)`-hardcodes en het `endpointEps`-idioom vervangen door de policy-eps.
- De `dedupeExactSegments(…, 0)`-keuze bewust documenteren of ref-koppelen.

**Fase 3 — invariantie-tests vóór logica-generalisatie.**
- **Translatie-invariantie:** offset elke fixture `+ (1234, 987)` → identieke junction-kind-telling
  + 0 diagonalen. (Zou nu al moeten slagen — legt de lat vast.)
- **Schaal-invariantie:** schaal fixture + `ref` met `×1.5` en `×0.6` → identieke topologie.
  Faalt vermoedelijk nu en maakt de §2/§3-lekken hard zichtbaar.
- Herschrijf de probe-asserts naar invarianten (kinds/convergentie), weg van exacte coördinaten.

**Fase 4 — over-fit branch-logica (vooral L5) generaliseren.**
- Vervang de L5 probe-ankers (`@645,243`, `@1202`, opposite-T) door benoemde geometrische invarianten,
  zoals de L6 trap/draaizin-check het goede voorbeeld is.
- Voeg meer plattegronden dan BouwTek11/2D_3E toe als L4→L10-fixtures.

**Acceptatie-invarianten (moeten altijd gelden, hele pipeline):**
1. Output-topologie is invariant onder translatie van de input.
2. Output-topologie is invariant onder uniforme schaal (input + `referenceWallThicknessPx` samen).
3. Geen absoluut pixel-/hoekgetal in runtime buiten een `LayerNScale`/`PipelineScale` + één ref-fallback.
4. Geen `@coördinaat` in commentaar als enige rechtvaardiging; alleen benoemde invarianten.

---

## 8. Snelle verificatie-commando's

```bash
# Cat A-check: letterlijke coördinaten in runtime (moet leeg blijven, alleen comments/tests matchen)
rg -n "\b(572|645|660|970|1058|1132|1202|1273|1354|1489|1514|1515|1964|1965)\b" \
  frontend/src/cv/walls/rooms/pipeline-v3 --glob '!**/*.spec.ts'

# Cat B-check: kale magic numbers in policies + engines (buiten connector = L6)
rg -n ": \d+,|>=?\s*\d{1,3}\b|Math\.(min|max)\([^,]*,\s*\d" \
  frontend/src/cv/walls/rooms/pipeline-v3/policies \
  frontend/src/cv/walls/rooms/pipeline-v3/engines/{hv,prune,collapse,cleanup,weld,topology,segment-ops}

# Resolver-gap check: welke resolvers negeren ref?
rg -n "resolveLayer(4|8|9|10).*referenceWallThicknessPx|resolveLayer(9|10).*\(\)" \
  frontend/src/cv/walls/rooms/pipeline-v3/policies

# Cat D-check: absolute coördinaten / probe-namen in tests
rg -n "x:\s*\d{3,4}|@\d{3,4}|probe \(\d" frontend/tests/cv/walls/pipeline-v3
```
