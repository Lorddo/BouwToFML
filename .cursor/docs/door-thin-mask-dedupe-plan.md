# Deuren: dun → mask + R-28-achtige dedupe

Laatste update: 2026-08-25  
Status: **live** (D-63)

Gerelateerd: [`door-detection-flow.md`](./door-detection-flow.md), [`window-detection-flow.md`](./window-detection-flow.md) (R-28).

## Intent

1. **Per face** (eigen bbox + L1/L2/L3). Cluster kozijn+swing in één hyp → alleen kozijn in mask.
2. Als `depth ≤ max muur-ref` → die face **in het muurmasker** bij finalize (raam-semantiek).
3. Hyp blijft één `door` voor L11/L12 (geen demote/split).
4. Na L11-bind: **dedupe** overlappende deuren op hetzelfde segment → 1 hit (spiegel R-28).

## Guard

```
depthPx(hyp) = min(unionBBox.width, unionBBox.height)
eligible = referenceWallThicknessPx > 0 && depthPx <= referenceWallThicknessPx
```

Geen muur-ref → niemand via deze regel in mask (fail-closed).  
90°-boog met depth ≫ muurdikte → punch zoals voorheen.

**Between-walls keep-poort (per dunne face, niet per pair/hyp) — Laag 1:**

- As uit **eigen** face-bbox (niet union kozijn+boog van de hyp).
- H-muur: stompen links én rechts; V: boven én onder. Eén kant (boog de kamer in) → geen keep.
- Start **streng** (directe cardinale stompen, micro overslaan, max-march ~8 px gap).
- Anders **soft** (D-62-achtig): micro/arcering + `window`/`doorframe` als stomp; max-march orde muurdikte (`1.5×ref`), niet image-breed.
- Per zijde **majority** (≥2/3 samples wallish) — één lek (boog-uitstolpsel) OK.
- Pair-orakel blijft D-62 (`doorframe` class); Laag 1 zegt alleen: mag in masker.

**Pair-conflict / som-dikte:** overlappende L1-kandidaten → hoogstens één (dunnere depth wint).

**Vleugel-brug — Laag 2** (alleen faces die L1/conflict anders droppen):

- Bouw L0 zonder kandidaat-deuren; tel grote wall-blobs (zelfde idee als keepLargest).
- Dry-run: verf één hyp + gap-slack dilate (≤8 px / 0.15×ref vanaf hyp). Worden ≥2 grote blobs één? → keep.
- Groeit maar één blob / uitsteeksel → geen keep.

**Polylijn-kozijn — Laag 3** (alleen wat 1+2 niet durven: schuin/arcering/binnenface):

- Één L1-meetlint op skelet **zonder** kandidaat-deuren (geen tweede volle V3).
- Keep: in-band (afstand ≲ 0,25× dikte **én** as mee) **of** bridge (twee I-einden → één segment).
- Reject: T / zijwaarts (blad raakt muur maar trekt hartlijn) — boog blijft punch.
- Niet: “swing toevoegen die de polylijn raakt”.

## Stap A — thin → mask

- `collectThinDoorMaskFaceIds` / push zet `cache.maskKeepDoorFaceIds`.
- Volgorde: Laag 1 → pair-conflict → Laag 2 → Laag 3; daarna **één** finalize met keep-set.
- Modules: `door-thin-mask.ts`, `door-thin-mask-between-walls.ts`, `door-thin-mask-wing-bridge.ts`, `door-thin-mask-polyline-keep.ts`.

## Stap B — dedupe (D-63)

- Na `snapDoorsToWalls`, vóór `orientBoundDoors`: `dedupeOverlappingBoundDoors`.
- Per `segmentIndex`; overlap → **merge**: dunnere hit = clear/`doorframeClearOpening` (virtueel kozijn), dikkere = swing-`doorId` (L12 hinge). Opening volgt kozijn-maat, niet de hele swing-bbox.
- Module: `cv/doors/door-wall-dedupe.ts`; wiring: `door-faces-snap.ts`.

## Non-goals

- Hypotheses splitsen / D-62 verzwaren.
- Shared betweenTwoWalls D-40↔D-62.
- R-27-analoog voor deuren.
