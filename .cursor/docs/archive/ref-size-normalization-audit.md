# Audit: ref-maten + normalisatie in detectieflow

**Datum:** 2026-07-21  
**Scope:** lokaliseren (geen opruimen). Actieve CV-paden muren → gaten → deuren → ramen.  
**Buiten scope:** `src/archive/**`, pure vector-`normalize` (richting/hoek), preprocess-config normalisatie, deskew-hoek.

---

## 0. Normalisatiecontract + status

| Type | Contract | Status |
|------|----------|--------|
| **Anker (abs px)** | meten bij ref-build; niet runtime “oplossen” | **KEEP** |
| **Feature (ratio)** | berekenen bij ref-build; consumer alleen denormaliseren | **FIX ongoing** |
| **Pipeline thresholds** | `refPx × ratio` in policy/engine | **KEEP** |

| Onderdeel | Status | Notitie |
|-----------|--------|---------|
| Muren `PipelineScale` / L6 / ink-morph | **KEEP** | Correct ankerpatroon (`referenceWallThicknessPx`) |
| Gaten face-area cap (`maxRefFaceArea × 3`) | **KEEP** | Zelfde plan-px; demote-cap, geen grootte-match |
| `OpeningRefPrimitives.kozijn*` | **KEEP** | Alleen rapport, niet detectieconsumer |
| Ramen Stage-3 evidence | **DONE** | ref-range ratio’s + `denormalizeSizeRange` in filter |
| Deuren ratio-centrische consumers | **FIX** | ref-ratio’s uitbouwen + consumers op denormalisatie |
| Ramen Stage-1 strip-target | **FIX** | ratio naar lokale as-band doortrekken |

---

## 1. Samenvatting

Er zijn **drie schaalbronnen** in de detectieflow:

| Bron | Waar gemeten | Wat normaliseert |
|------|--------------|------------------|
| `referenceWallThicknessPx` | Stap 1 muurvak (`measureReferenceWallThicknessPx`) | Muren-pipeline L1–L10, ink-resolve, morph, deur wall-snap |
| Deur-ref band (`DoorSwingRefBand`) | Stap 1 deurvak → `analyzeDoorSwingRef` | `ratioBlade` + size-ratio’s (`wall/depth`, `area/span²`, clear-overhang/span) |
| Raam-ref band (`WindowAxelRefBand`) | Stap 1 raamvak → `analyzeWindowAxelRef` | size-ranges op `axisBandHeightPx`, strip-target + ratio |

**Kernpatroon:** maten uit de ref worden óf als **ratio** opgeslagen (deur `ratioBlade`, raam `normalizeSizeRange`), óf als **absolute px** die runtime met `kandidaat/ref` worden herschaald, óf als **policy-thresholds** = `refPx × ratio` (muur `PipelineScale`).

---

## 2. Flow-context (waar refs binnenkomen)

```
Stap 1  measureReferenceWallThicknessPx  → referenceWallThicknessPx
        analyzeDoorSwingRef / analyzeWindowAxelRef → refBands
Stap 3  Muren: room-first + V3(L1–L10) met referenceWallThicknessPx
        Gaten: demoteOversizedFacesByRefCap (opening-ref face area × 3)
        Deuren: swing-filter → resolve (L11/L12) met refBands + wall thickness
        Ramen: axel-filter → door-arc → evidence-filter met refBands
```

Contract: `.cursor/docs/workspace-flow.md`.

---

## 3. Muren — `referenceWallThicknessPx` als schaalanker

### 3.1 Meting (stap 1)

| Functie | Bestand | Normalisatie? |
|---------|---------|---------------|
| `measureReferenceWallThicknessPx` | `cv/walls/measure-reference-wall.ts` | Nee — meet ink-band in LBE-vak → absolute px |

### 3.2 Centrale schaal-engine

| Functie | Bestand | Wat |
|---------|---------|-----|
| `resolvePipelineReferencePx` | `cv/walls/rooms/pipeline-v3/engines/scale.ts` | ref of fallback **30** |
| `resolvePipelineScale` | idem | **alle** L1–L5/HV/collapse thresholds = `refPx × (n/30)` via `scaleRounded` / `scaleFloat` |
| `resolveLayer6ReferencePx` / `resolveLayer6Scale` | `…/engines/connector/constants.ts` | L6 apart: connector/arm/chain = `ref × ratio` |
| `resolveLayer6ThicknessMarginPx` | idem | marge ≈ volle ref-dikte |
| `resolveLayer6ConnectorMaxPx` | idem | `ref × 1.2` clamped |
| `resolveLayer6AxisChainPx` | idem | `ref × 3.5` |
| `resolveLayer6ArmDetectPx` | idem | `ref × 1` clamped 22–50 |
| `resolveLayer6MaxAttachmentShiftPx` | idem | `ref × 0.4` |

**Policy-entrypoints** (allen: `resolvePipelineScale(referenceWallThicknessPx)` of L6-variant):

| Functie | Bestand |
|---------|---------|
| `resolveLayer1RawPolicy` | `policies/layer-1.ts` |
| `resolveLayer2JitterPolicy` | `policies/layer-2.ts` |
| `resolveLayer3PrunePolicy` | `policies/layer-3.ts` |
| `resolveLayer4HvPolicy` | `policies/layer-4.ts` |
| `resolveLayer5CleanupPolicy` (+ helpers met `.refPx`) | `policies/layer-5.ts` |
| `resolveLayer6RepairPolicy` | `policies/layer-6.ts` |
| `resolveLayer7AlignPolicy` | `policies/layer-7.ts` |
| `resolveLayer8FinalizePolicy` | `policies/layer-8.ts` |
| `resolveLayer9DissolvePolicy` | `policies/layer-9.ts` |
| `resolveLayer10FmlPolicy` | `policies/layer-10.ts` |

Pipeline-orchestratie: `pipeline-v3/index.ts` + per-layer `layer-N-*.ts` geven `referenceWallThicknessPx` door.

### 3.3 Room-first / ink / morph (vóór of naast V3)

| Functie | Bestand | Formule / rol |
|---------|---------|---------------|
| `resolveReferenceRemoveHolesPx` | `room-reference-preprocess.ts` | `thickness × 0.45|0.5` clamp |
| `resolveReferencePrefilterThickenPx` | idem (private) | `thickness × 0.08|0.1` clamp |
| `buildRoomReferenceMat` | idem | gebruikt bovenstaande |
| `resolveMergedWallCloseRadiusPx` | `room-wall-close-radius.ts` | `thickness × 0.03|0.04` clamp 1–5 |
| `resolveInkEatRadii` | `room-ink-resolve.ts` | wall `×0.5`, outside `×0.15` clamp |
| `resolveInkProcessMarginPx` | `room-ink-process.ts` (private) | `max(32, thickness×2)` |
| `resolveInkPatchMarginPx` | idem (private) | `max(8, thickness)` |
| finalize keepLargest-achtig | `room-wall-finalize-shared.ts` | `max(24, thickness²)` als min-area |

`resolveWallInkReach` neemt thickness als param maar **schaalt niet** (vaste booster/bonus).

---

## 4. Deuren — ref-maten + schaal

### 4.1 Ref-build (maten + ratio’s vastleggen)

| Functie | Bestand | Output / normalisatie |
|---------|---------|------------------------|
| `analyzeDoorSwingRef` | `door-swing-ref.ts` | absolute ankers + ratio’s (`wall/depth`, `area/span²`, clear-overhang/span) |
| `resolveReferenceSizing` | idem | `ratioBlade` + clear-overhang ratio’s; degenerate fallback via `sizingFromSwingSpan` |
| `sizingFromSwingSpan` | idem (private) | fallback met `ratioBlade=1`, clear-ratio along=1, opposite=0 |

**Ratio in de ref:** `ratioBlade`, `wallRatio`, `depthRatio`, `areaSpan2Ratio`, `clearOverhang*Ratio`.

### 4.2 Matching / filter (ratio-denormalisatie)

| Functie | Bestand | Normalisatie |
|---------|---------|--------------|
| `orientedWallDepth` | `door-swing-filter-matching.ts` | W/H → wall/depth as |
| `fitsSizeBandForRef` | idem | ratio’s → ref-anker px-band × relax ∩ absolute mm-band |
| `matchesSingleRef` / `bestAspectRef` / `wallRescueMatch` | idem | aspect-relatief + size-band |
| `expectedSwingAreaPx` | idem | **`areaSpan2Ratio × candSpan²`** |
| `isWallRescueCandidate` / `clippedArcRescueMatch` | idem | expected area + fill t.o.v. ref |
| `orientedRefTarget` | `door-swing-filter.ts` | ratio’s → ref-span anker, georiënteerd naar union |
| `growClusterForRef` / absorb-paden | idem | groeit naar ref-bbox / area |
| `runDoorFillFilter` / `refFillRatio` | `door-fill-filter.ts` | fill-band = `refFill × 0.8…1.2` |

Absolute muur-band (géén deur-ref): `resolveDoorSizeBandPx` in `door-scale-band.ts` (250–1200 mm → px via ppm). Diepte komt wél uit ref ± relax.

### 4.3 Resolve (openingmaat schalen)

| Functie | Bestand | Normalisatie |
|---------|---------|--------------|
| `resolveDoorCandidates` | `door-resolve.ts` | `overhang = clearRatio × candSpan + framingAbs`; fallback `ratioBlade`; **framing blijft vast** |

### 4.4 Wall-snap (muur-ref-dikte, niet deur-ref)

| Functie | Bestand | Gebruik `referenceWallThicknessPx` |
|---------|---------|-------------------------------------|
| snap-budget helpers | `door-wall-snap.ts` | `×0.5`, `×1.25`, `×1.75`, `×2.5`, `×4.5` op dikte voor toleraties/caps |

---

## 5. Ramen — ref-maten + normalisatie

### 5.1 Ref-build

| Functie | Bestand | Normalisatie |
|---------|---------|--------------|
| `normalizeFaceProfile` | `window-axel-ref.ts` | rotatie V→H meetruimte |
| `rangeFromFaces` | idem | `expandSizeRange` (±20%) → **`normalizeSizeRange(…, axisBandHeightPx)`** (÷ as-band → ratios) |
| `analyzeWindowAxelRef` | idem | `targetStripHeightPx`, `axisBandHeightPx`, framing/top/bottom ranges |

Helpers in `window-size-range.ts`:

| Functie | Rol |
|---------|-----|
| `expandSizeRange` | absolute px ± marge |
| `normalizeSizeRange` | ÷ `axisBandHeightPx` → schaal-invariante ratios |
| `denormalizeSizeRange` | × lokale as-band → px (**gedefinieerd; geen caller gevonden in actieve flow**) |
| `fitsSizeRange` | bbox in range |

### 5.2 Stage-1 filter (strip-hoogte t.o.v. ref)

| Functie | Bestand | Ref-schaling |
|---------|---------|--------------|
| `resolveReferenceTargetStripHeightPx` | `window-axel-filter.ts` | lokale kalibratie dicht bij ref-vak; jump-guard `>1.5×` → blijf bij ref |
| `groupCandidateClusters` / `scoreCluster` | idem | tol = `targetStripHeightPx × 0.5` e.d. |
| `filterWindowsByAxelRefs` | idem | `minSpan = max(ref×1.4, scale-min)`; `maxHeight = ref×1.8` |

### 5.3 Stage-3 evidence (size-range denormalisatie)

| Functie | Bestand | Normalisatie |
|---------|---------|--------------|
| `denormalizeSizeRange` | `window-evidence-filter.ts` | ratio-range × lokale as-band |
| `normalizeSizeForOrientation` | idem | swap W/H bij verticale oriëntatie |
| `selectFramingEvidence` / `selectTopBottomEvidence` | idem | denormalized ranges + lokale band-afstanden |

**Status:** DONE — Stage-3 gebruikt geen `resolveHypothesisScale/scaleRange` meer.

---

## 6. Gaten — opening-ref face-area cap

| Functie | Bestand | Normalisatie |
|---------|---------|--------------|
| `resolveMaxOpeningRefFaceAreaPx` | `gaps/ref-face-size-cap.ts` | max face-area over deur/raam-refs |
| `demoteOversizedFacesByRefCap` | idem | **`areaCap = maxRefFaceAreaPx × OPENING_REF_FACE_SIZE_MULTIPLIER` (3)** |

Geen dikte-schaal; zelfde px-schaal als plattegrond (crop = source).

---

## 7. Inventaris per normalisatie-type

### A. Ratio in ref, toepassen op kandidaat

| Iets | Functie |
|------|---------|
| `ratioBlade` | `resolveReferenceSizing` → `resolveDoorCandidates` |
| Deur size-ratio’s (`wall/depth`, `area/span²`, clear-overhang/span) | `analyzeDoorSwingRef` → deur-filters/resolve |
| Raam size-ratios | `normalizeSizeRange` in `rangeFromFaces` |
| Fill-band | `runDoorFillFilter` (`refFill × 0.8…1.2`) |

### B. Absolute ref-px × (kandidaat/ref)

| Iets | Functie |
|------|---------|
| Deur legacy fallback (oude ref-data zonder ratio-velden) | derive uit absolute ref-velden |

### C. Muur-ref-dikte × vaste ratio → threshold

| Iets | Functie |
|------|---------|
| Hele V3 L1–L10 | `resolvePipelineScale` + `resolveLayerN*Policy` |
| L6 connector | `resolveLayer6Scale` e.a. |
| Ink/morph/preprocess | `resolveInkEatRadii`, `resolveMergedWallCloseRadiusPx`, `resolveReferenceRemoveHolesPx`, … |
| Deur snap-budget | `door-wall-snap.ts` multipliers |

### D. Alleen meten / doorgeven (geen schaal)

| Functie | Opmerking |
|---------|-----------|
| `measureReferenceWallThicknessPx` | bronanker |
| `analyzeDoorSwingRef` / `analyzeWindowAxelRef` | schrijven band (met ratios waar van toepassing) |
| `resolveDoorSizeBandPx` | ppm×mm, geen opening-ref |

---

## 8. Niet-meegenomen “normalize”-treffers

Bewust uitgesloten (geen ref-maat → detectieschaal):

- `normalizeVector` / `normalizeDirection` / `normalizeAngleDeg` (richting)
- `normalizeStoredPreprocess` (UI-config)
- `normalizeLabelsArray` / mask-RLE / deskew
- `useExtraction.scaleSignatureToWork` — legacy geometric-signature downscale naar work-canvas; niet de huidige Stage-2/3 opening-flow

---

## 9. Snelzoekpad (bestanden)

```
Muren schaal:     cv/walls/rooms/pipeline-v3/engines/scale.ts
                  cv/walls/rooms/pipeline-v3/engines/connector/constants.ts
                  cv/walls/rooms/pipeline-v3/policies/layer-*.ts
                  cv/walls/rooms/room-reference-preprocess.ts
                  cv/walls/rooms/room-wall-close-radius.ts
                  cv/walls/rooms/room-ink-resolve.ts
                  cv/walls/rooms/room-ink-process.ts
                  cv/walls/measure-reference-wall.ts

Deuren schaal:    cv/doors/door-swing-ref.ts
                  cv/doors/door-swing-filter-matching.ts
                  cv/doors/door-swing-filter.ts
                  cv/doors/door-resolve.ts
                  cv/doors/door-fill-filter.ts
                  cv/doors/door-scale-band.ts
                  cv/doors/door-wall-snap.ts

Ramen schaal:     cv/windows/window-axel-ref.ts
                  cv/windows/window-size-range.ts
                  cv/windows/window-axel-filter.ts
                  cv/windows/window-evidence-filter.ts
                  cv/windows/types.ts

Gaten cap:        cv/gaps/ref-face-size-cap.ts
```

---

## 10. Conclusie

- **Muren:** één anker (`referenceWallThicknessPx`) → systematische `ref × (n/30)` via `PipelineScale` / L6-scale + diverse ink/morph helpers.
- **Deuren:** ref-build levert ratio’s voor size/area/clear-overhang; consumers denormaliseren daarop, framing blijft bewust absoluut.
- **Ramen:** Stage-3 DONE op ratio + denormalisatie; Stage-1 gebruikt strip-ratio + lokale band en houdt lokale kalibratie.
- **Gaten:** opening-ref max-face × 3 als demote-cap.

Geen code gewijzigd in deze audit.
