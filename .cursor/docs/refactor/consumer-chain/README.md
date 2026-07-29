# Consumer-chain — reverse necessity audit

**Datum:** 2026-07-28 (sync na ronde 17)  
**Status:** inventaris + **ronde 17 hot-path X gedaan**; mid follow-up = `pipelineV2Debug`  
**Lens:** wat heeft de **volgende** stap écht nodig? Niet: dode exports / magic numbers (dat blijft in de production-refactor rapporten).

## Waarom apart

De bestaande refactor-rapporten (`../stap*-2026-07-25.md`) kijken **vooruit**: code-kwaliteit, god-files, knip.  
Deze set kijkt **achteruit**: Resultaat/FML → wat moet detectie leveren → wat moet voorbewerking leveren → …

Doel: lagen/stages die wél iets produceren maar die **geen follow-up** meer nodig heeft (overlay-only, debug-only, schema-ruis, of legacy passthrough).

## Leesvolgorde (achteruit)

| # | Document | Vraag |
|---|----------|--------|
| 0 | [`00-result-fml.md`](./00-result-fml.md) | Wat consumeert FML/vector écht? |
| 1 | [`01-walls-l0-l10.md`](./01-walls-l0-l10.md) | Welke muur-lagen zijn productie vs debug? |
| 2 | [`02-doors-stages.md`](./02-doors-stages.md) | Welke deur-stage outputs raken L11/L12/FML? |
| 3 | [`03-windows-stages.md`](./03-windows-stages.md) | Idem ramen → L14/FML |
| 4 | [`04-stap2-voorbewerking.md`](./04-stap2-voorbewerking.md) | Minimale handoff 2→3 |
| 5 | [`05-stap1-onderlegger.md`](./05-stap1-onderlegger.md) | Minimale handoff 1→2 |

Gerelateerd (niet vervangen): [`../README.md`](../README.md), [`../../workspace-flow.md`](../../workspace-flow.md).

## Classificatie per output

| Tag | Betekenis | Actie-richting |
|-----|-----------|----------------|
| **P** | Productie — volgende stap / FML leest het | Behouden |
| **G** | Gate — filtert/kiest wat productie wordt; payload zelf niet in FML | Behouden (logica); payload mag dunner |
| **O** | Overlay / UI review — tekenaar of Layer Debug | Bewust houden of later achter flag |
| **D** | Debug/export/rapport only | Mag later uit hot path |
| **X** | Geen consumer (orphan / schema-ruis) | Knip-kandidaat |

**Niet verwarren:** een Stage die alleen **G** is, is niet “onnodig” — zonder die gate zou FML verkeerde openings krijgen. Alleen de **payload** (hypotheses-cache, reject-lijsten, extra velden) kan overbodig zijn.

## Cross-cutting top orphans (X)

| Item | Waar | Evidence |
|------|------|----------|
| ~~`ResolvedDoorCandidate.arcCentroidPx`~~ | — | **Verwijderd** 2026-07-26 |
| ~~`debugRoomWallFaces*`~~ | — | **Verwijderd** ronde 1 (2026-07-27) |
| ~~`doorLayer` / `windowLayer`~~ | — | **Verwijderd** ronde 1 |
| ~~`ocrMaskTextForGeometry`~~ | — | **Verwijderd** ronde 1 |
| ~~`lineDetectorMode`~~ | — | **Verwijderd** ronde 1 (profiles + preprocess) |
| ~~Finalize canvases + `parallelPairs`~~ | room-first / strategy | **Ronde 17** — geen alloc/return meer |
| ~~`openingBBox` op FML-DTO~~ | layer-openings / types | **Ronde 17** — BoundWindow behouden (merge/overlays) |
| `snappedBBox` op FML-DTO / BoundDoor | L11 + double-merge + overlays | **F** — nodig voor merge/overlay/layer-debug |
| ~~Semantic segment `lengthPx`/`angleDeg`~~ | build-semantic | **Ronde 17** — `junctions[]` + junction ids **blijven** (L14) |

## Cross-cutting “nodig in-run, niet in FML” (G/O)

| Item | Rol |
|------|-----|
| V3 L1–L9 segments | Pipeline-tussenstappen → L10; daarna vooral Layer Debug |
| Door Stage-1 hyps na Stage-2 | Gate + stage-slider overlay |
| Window Stage 1–3 hyps | Gate → Stage-4; L14 ziet alleen resolved |
| L11 `BoundDoor` | Input voor L12; FML leest L12 openings |
| L12 display/hinge/arc geometry | Overlay (+ editor herberekent elders) |
| `pipelineV3Debug` L1–L9 | Result walls-tab / layer-debug |
| `mergeTabOutputs` debug passthrough | Result overlays, niet `extractionToPlan` |

## Minimale productieketen (samenvatting)

```
Stap1: kleurbeeld + schaal (+ gum bake)
    →
Stap2: wallLayer→baseBw(+ink bake) + wall-ref→thickness + door/window refs + wallStyle(profile)
    →
Stap3 muren: classify state + roomWallMaskRle + L10 (fmlReady) → semanticWallGraph
Stap3 deuren: class door(+doorframe) → resolve → L11 → L12 openingStart/End
Stap3 ramen: class window → Stage-4 → L14 openingStart/End
    →
Result: semantic segments + L12 + L14 + schaal + kleur-underlay → buildFmlV3
```

## Relatie tot production-refactor batches

| Consumer-chain finding | Past bij refactor-ronde |
|------------------------|-------------------------|
| X orphans (debugFaces, preprocess schema) | ~~Ronde 1~~ **gedaan** |
| Finalize canvases / parallelPairs / FML `openingBBox` / semantic length+angle | ~~Ronde 17~~ **gedaan** |
| merge debug passthrough scheiden van FML-input | ~~Ronde 6~~ **gedaan** (gedocumenteerd; runtime-strip = F) |
| Stage caches / L11 surface dunner | Later (Stage-1 cache bij stage-slider) |
| L1–L9 UI defaults / dual `pipelineV2Debug` | **Ronde 18 kandidaat** — aparte go + smoke |

**NO-GO hier:** detectie-tuning, L6 Cat C, stages skippen “omdat FML ze niet leest” (ze zijn G).
