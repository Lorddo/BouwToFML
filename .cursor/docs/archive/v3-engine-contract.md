# V3 engine-contract

Status: Stage 1 — 2026-07-12.  
Zie ook [`v3-baseline-index.md`](v3-baseline-index.md) en meta-plan V3.

## Doel

Operaties bestaan **één keer** als engine. Lagen leveren alleen **policy + volgorde**.  
Geen `layer-N` → `layer-M` imports.

## Map

```
frontend/src/cv/walls/rooms/pipeline-v3/
  engines/
    weld/          near-endpoint, junction-cluster, collinear-gap
    hv/            qualify, axis-cluster, position, endpoint-snap
    junction/      graph build, kind counts, rebuild face junctions
    connector/     detect + chamfer-group repair
    collapse/      inter-junction chain + stub collapse
    prune/         I-spur paths
    topology/      connectivity guard, accept/rollback
    geometry/      re-exports van wall-segment-geometry (geen V1 archive)
    segment-ops/   clone, dedupe, rebuild face (was layer-5-segment-ops)
  policies/
    layer-1.ts … layer-10.ts
  layer-*.ts       dunne orchestrators (L1–L10 native)
  index.ts
  run-finalize-v3.ts
  types.ts         eigen L1–L10 result shapes (geen pipeline-v2 import)
```

## Import-regels (hard)

| Mag | Mag niet |
|-----|----------|
| `engines/*` ← geen imports uit `layer-*` of `policies/*` | `layer-N` → `layer-M` (N≠M) |
| `policies/layer-N` configureert engine calls | Gedeelde magische constante zonder policy |
| `layer-N` → `engines/*` + `policies/layer-N` | Import uit `archive/walls` of Copy6 `skeleton-cleanup` |
| Shared ports (`wallSkeletonTrace`, `wallJunctionGraph`, …) | `pipeline-v3/**` → `pipeline-v2/**` (types of layer-*) |

## Policy-vorm

Elke engine-call krijgt een typed policy (geen bare numbers uit een andere laag):

```ts
export type LayerId = 3 | 4 | 5 | 6 | 7 | 8 | 9

export interface WeldPolicy {
  layerId: LayerId
  nearEndpointGapPx: number
  junctionClusterPx: number
  collinearGapMaxPx: number
}

export interface HvPolicy {
  layerId: LayerId
  prePositionSnapPx: number
  postPositionSnapPx: number
  flatBandPx: number
}
```

Voorbeeld: L4 seal en L8 finalize gebruiken dezelfde `weldNearEndpoints(segments, policy)` met **andere** `WeldPolicy`.

## Runtime-toggle

- `WallPipelineVersion = 'v2' | 'v3'`
- Default **`v3`** (Stage 5 cutover)
- localStorage key: `bouwtofml.wallPipelineVersion`
- Finalize: `room-first` → `runFinalizePipelineV3` (default) of archive V2
- Debug: `pipelineV3Debug` / `pipelineV2Debug`; overlays lezen actieve versie

## Native status (nu)

`runPipelineV3` draait native L1–L10 (`V3_NATIVE_THROUGH_LAYER = 10`, `fmlReady`).

- **Default runtime = v3** (Stage 5 cutover 2026-07-12)
- L1–L10: native engines + policies; zie decision docs
- V2: `src/archive/walls/v2-room-pipeline/` + Layer Debug toggle
- FML via L10 wanneer `fmlReady`


## Exit Stage 1

- Toggle schakelt zonder crash
- Default v2: geen detectie-regressie
- V3 incomplete: overlays t/m laatste native laag; geen FML
- Geen ink/FML-editor-wijzigingen
