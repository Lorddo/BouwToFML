# 02 — Deuren stages: produceert vs consumeert

**Datum:** 2026-07-27 (sync)  
**Lens:** reverse consumer (zie [`README.md`](./README.md))  
**Downstream eis:** L12 openings in [`00-result-fml.md`](./00-result-fml.md); muren L10+mask in [`01-walls-l0-l10.md`](./01-walls-l0-l10.md)  
**Flow-doc:** `../../door-detection-flow.md`

## Verdict

FML leest **geen** Stage-1/2 hypotheses. Alleen **L12** (`openingStart/End`, `segmentIndex`, `fmlRefId`, `mirrored`).  
Stages + L11 zijn **gates en meetpad** (G): zonder hen geen betrouwbare L12. Veel velden op resolved/bound zijn overlay of dood (O/X).

```
Door-refs (stap 2) + FaceDualSpace + classify
  → Stage1 filter → Stage2 (fill → surround → angle-rescue → wall-touch)
  → bridge/doorframe → resolve/attach → (post-L0 kept-mask purge)
  → L11 BoundDoor → L12 OrientedDoor (+ morph-close hinge / framing) → FML
```

## Minimale productieketen (P)

1. Stage-2 accepted faces → class `door` (+ sticky `doorframe`)  
2. `ResolvedDoorCandidate`: `faceIds`, `bbox`, `doorframeFaceIds`, overhangs/framing, `kind`/`fmlRefId`  
3. L10 segments + `roomWallMaskRle` + ink/white labels  
4. L11 clear opening / Path A–B → L12 span (+ mirrored; FML-breedte = clear + REF framing)

## Per stage

| Stage | Produceert | Tag | Follow-up |
|-------|------------|-----|-----------|
| REF `DoorSwingRefBand` | size/fill/framing/angle/`fmlRefId` | P/G | Match, resolve, angle-rescue |
| Bootstrap dual + merge | pipeDual, components | P | Alles hierna |
| Stage 1 swing filter | hyps + diagnostics | G (+ O cache) | Fill; hyps zelf niet naar FML |
| Stage 2 wall-fill | extra hyps / rejects | G | Surround-input |
| Stage 2 surround | kept / rejects | G | Angle-rescue claim-set |
| Stage 2 angle-rescue | injected hyps | **P/G** | Twins e.d. → wall-touch → FML; `existingDoorsOnly` alleen class=`door` |
| Stage 2 wall-touch | kept / `no_wall_touch` | G | Bridge/resolve (skip existingDoorsOnly) |
| Bridge / doorframe attach | `doorframeFaceIds`, class push | P | L11 Path A; sticky na window |
| Resolve | `ResolvedDoorCandidate` | P (deels O) | L11/L12 |
| Kept-mask purge | filtered + unpin | G | L11 vóór finalize (na L0 mask) |
| L11 snap | `BoundDoor` | G (+ O) | Alleen input L12; Path A segment-first; Path B ink-adjacent wall |
| L12 orient | `OrientedDoor` | P (openings) / O (symbols) | FML + overlay; multi-face hinge = morph-close white mask |

## ResolvedDoorCandidate — veldniveau

| Veld | Tag | Consument |
|------|-----|-----------|
| `faceIds`, `bbox` | P | L11 |
| `doorframeFaceIds` | P | L11 Path A |
| overhangs / framing px | P | L12 Path B / framing add |
| `kind`, `fmlRefId` | P | L12 → FML refid |
| matchedRef → `swingAngleDeg` | G | Angle-rescue accept; **niet** L12-hinge prior |
| `widthPx`/`widthCm`/`score`/`source`/`swingSpanPx`/`ratioBlade` | G/O | Ranking/UI; FML herberekent span |
| `centroidPx` | O | Debug unbound |
| ~~`arcCentroidPx`~~ | — | Verwijderd (was X) |

## L11 / L12 — veldniveau

| Veld | Tag | Consument |
|------|-----|-----------|
| L11 clear / Path A doorframe opening | P | L12 span (clear = deurblad) |
| L11 `contactScore` | O/D | Overlay / layer-debug |
| L12 `openingStartPx`/`EndPx`, `mirrored`, `fmlRefId`, `segmentIndex` | P | FML (= clear + framing) |
| L12 `display*` | O | Overlay = clear blad |
| L12 hinge, leaf/arc/arrow | O | Overlay; hinge via morph-close + tight face AABB; geen `expectedAngleDeg` |
| L12 `snappedBBox` | O / X→FML | Overlay + zwakke FML-DTO copy |

## Preprocess-inputs (openings)

| Input | Nodig? | Notitie |
|-------|--------|---------|
| Deur LBE-refs | Ja | Zonder refs: lege stage |
| wallLayer (kleur→B/W crop) | Ja voor REF | Niet live `effectiveBw` |
| effectiveBw / dual | Ja voor floor faces | Via classify |
| ocrMask | Indirect | Alleen als in compose vóór classify |
| ppm + wall thickness | Ja | Bands, snap, cm |

## Orphans / dunner maken (X / O)

| Item | Tag | Richting |
|------|-----|----------|
| Stage-1 hyp-cache na Stage-2 | O | Houden zolang stage-slider; anders droppen |
| Reject/diagnostics bundles | D | Rapport/export; uit hot path later |
| L11 surface als “FML input” behandelen | — | Fout mental model: L12 is FML |

## Bewust geen orphan (lijken “extra”)

Angle-rescue, wall-touch, bridge/doorframe, kept-mask purge, L12 morph-close, sticky reattach — allemaal G/P voor juiste L12. Schrappen = detectie-semantiek, geen cleanup.

## Cleanup-richting

1. **Laag:** ~~`arcCentroidPx`~~ — gedaan (type + resolve + fixtures).  
2. ~~**Mid:** documenteer “FML contract = L12 openings only”~~ **ronde 17** (`OrientedDoor` / `Layer12DoorForFml` JSDoc).  
3. **Later:** Stage-1 cache alleen bij UI stage-toggle.  
4. Past bij production-refactor ronde 4 (doors), niet big-bang.

## Volgende

Ramen parallel → [`03-windows-stages.md`](./03-windows-stages.md). Upstream refs → [`04-stap2-voorbewerking.md`](./04-stap2-voorbewerking.md).
