# 01 — Muren L0–L10: produceert vs consumeert

**Datum:** 2026-07-26  
**Lens:** reverse consumer (zie [`README.md`](./README.md))  
**Downstream eis:** [`00-result-fml.md`](./00-result-fml.md) + L11/L14 segmentIndex op L10

## Verdict

Productie-eindpunt muren = **`roomWallMaskRle` (L0) + L10 segments (`fmlReady`) → `semanticWallGraph`**.  
L1–L9 zijn **noodzakelijke tussenstappen in-run** (G), na persist vooral **Layer Debug / overlays** (O). Face-classes bestaan alleen in L0 — V3 ziet binary mask.

```
effectiveBw / wallPreMat
  → L0 classify + finalize mask → roomWallMaskRle + roomClassifyState
  → V3 L1…L10 → pipelineV3Debug + fmlReady
  → buildSemanticWallsForOutput → semanticWallGraph
  → FML + L11 + L14
```

## Wat downstream écht nodig heeft (P)

| Output | Consument |
|--------|-----------|
| `meta.roomClassifyState` | Face-UI, deuren, ramen, dual-space, finalize |
| `roomWallMaskRle` | Semantic thickness; L2/L4/L7–L10 distance; L11/L14; door kept-mask purge |
| `pipelineV3Debug.layers.layer10` + `fmlReady` | `resolveFmlSourceLayer` → semantic graph |
| `semanticWallGraph.segments` | FML, L11, L14 |

## Pre-V3 / L0

### Classify (L0a)

| Produceert | Tag | Consument |
|------------|-----|-----------|
| labels, parentMap, components, classification | P | UI cache, dual, finalize |
| ink-resolve / enclosed merge | G | Betere classes → mask |
| reference/classified canvases op strategy | X | Gedropt vóór ExtractionOutput; UI gebruikt raster-cache |

### Finalize mask (L0c–d)

| Produceert | Tag | Consument |
|------------|-----|-----------|
| `keptWallMaskData` → `roomWallMaskRle` | P | Zie boven |
| `splitBlobs` → V3 L1 | P (in-run) | Pipeline |
| `lockedClassification` → state | P | Face-lock door/window/doorframe |
| `roomWallMergedCloseCanvas` e.d. | X | Niet op ExtractionOutput |
| Face-class → mask mapping (`window`/`doorframe`→wall, `door`→unknown) | G | Mask voor V3; openings blijven in UI-state |

**Face-class t.o.v. FML:** `wall`/`window`/`doorframe` in mask; `door` niet. Openings komen later via L12/L14, niet als V3-faces.

## V3 L1–L10

| Laag | In-run | Na persist | Tag na run |
|------|--------|------------|------------|
| L1 raw skeleton | → L2 | `pipelineV3Debug.layer1` | O (overlay) |
| L2 jitter merge | → L3 | layer2 | O |
| L3 I-spur prune | → L4 | layer3 | O |
| L4 H/V position | → L5 | layer4 | O |
| L5 cleanup/weld | → L6 | layer5 | O |
| L6 chamfer repair | → L7 | layer6 | O |
| L7 chain collapse | → L8 | layer7 | O |
| L8 finalize HV | → L9 | layer8 | O (niet FML) |
| L9 dissolve | → L10 | layer9 | O (V2-legacy FML-bron) |
| L10 FML input | → semantic | layer10 + fmlReady | **P** |

In-run: elke laag consumeert `faces*` + segments/junctions van de vorige.  
Persist: vooral `segments`/`junctions` per laag; `*Stats` / `faces*` L4+ verdwijnen (niet serialiseren).

`fmlReady`: vandaag effectief altijd true zodra native through ≥ 10; geen fallback L8/L9 bij incomplete V3.

## Orphans (X)

| Item | Evidence |
|------|----------|
| ~~`debugRoomWallFaces` / `Filtered` / `LayerC`~~ | **Ronde 1** weg |
| ~~Strategy canvases (`preview`, `roomReference`, skeleton, mergedClose)~~ | **Ronde 17** — geen alloc/return |
| ~~`parallelPairs: []`~~ | **Ronde 17** weg |
| Persistente per-laag `faces*` / stats | Bewust niet op ExtractionOutput |

## Debug-only maar nuttig (D/O — niet blind knippen)

- `pipelineV3Debug.layers.layer1`–`layer9` — Result toggles + layer-debug regressie  
- `pipelineV2Debug` dual-write + L10→L9 mirror — legacy readers / finalize gate (**ronde 18 kandidaat**)  
- Meta skeleton counts — UI/meta

## Wat L11/L14 nog van muren vragen

Naast FML-segments:

- Zelfde **segment-index** als semantic L10  
- `roomWallMaskRle` (contact / thickness / snap)  
- Ink/white labels uit classify-state (dual) voor Path A/B en hinge  
- `semanticWallGraph.junctions` + segment `junctionAId`/`junctionBId` (L14 junction-in-window)

Zonder L0-state + mask werkt openings-bind niet, ook al is L10 “klaar”.

## Cleanup-richting

1. ~~**Laag:** stop produceren/passen van `debugRoomWallFaces*`~~ **ronde 1**  
2. ~~**Laag:** geen canvas-alloc in finalize die sowieso gedropt wordt + `parallelPairs`~~ **ronde 17**  
3. **Mid + smoke:** `pipelineV2Debug` mirror alleen houden tot alle readers op V3 zitten (**ronde 18**).  
4. **NO-GO:** L1–L9 “overslaan” omdat FML ze niet leest — ze zijn G voor L10-kwaliteit.

## Volgende docs

Openings op deze muur-output → [`02-doors-stages.md`](./02-doors-stages.md), [`03-windows-stages.md`](./03-windows-stages.md).
