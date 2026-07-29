# V1/V2 dependency index — 2026-07-10

Post V1-archief inventaris. Actieve code = V2-only muur-finalize.

## Gedeeld (behouden — stap 1–4 + FML)

| Module | Stap | Besluit |
|--------|------|---------|
| `cv/preprocess/layer-preprocess.ts` | 2 | Behouden |
| `ui/composables/workspace/useWorkspacePreprocess.ts` | 2 | Behouden |
| `cv/walls/strategies/room-first.ts` (classify/recalculate) | 3 | Behouden |
| `cv/walls/rooms/room-raster*.ts`, `room-ink-*`, `room-refine-topology` | 3 | Behouden |
| `cv/walls/rooms/room-wall-finalize-shared.ts` | 3 finalize prep | Behouden |
| `cv/walls/rooms/pipeline-v2/**` | 3 finalize | Behouden |
| `cv/walls/rooms/pipeline-v2/layer-1-raw-wasm.ts` | 3 Laag 1 | Behouden |
| `cv/walls/rooms/wall-segment-geometry.ts` | V2 + dikte | Behouden (extract uit skeleton-cleanup) |
| `cv/walls/rooms/room-wall-skeleton-types.ts` | V2 types | Behouden (nieuw) |
| `cv/walls/rooms/build-semantic-walls-v2.ts` | 4/FML | Behouden |
| `cv/walls/rooms/build-semantic-walls-output.ts` | 4/FML | Behouden (V2-only wrapper) |
| `ui/composables/useWorkspaceFml.ts`, `fml-preview/*` | FML | Behouden |

## Gearchiveerd (`src/archive/walls/v1-room-pipeline/`)

| Module | Was | Tests |
|--------|-----|-------|
| `pipeline-v1/run-finalize-v1.ts` | V1 finalize | — |
| `room-wall-face-skeleton.ts` | A/B/C skeleton | `tests/archive/walls/v1/room-wall-face-skeleton.spec.ts` |
| `skeleton-cleanup/**` | Laag B/C polish | `tests/archive/walls/v1/room-wall-skeleton-cleanup.spec.ts` |
| `room-wall-skeleton-cleanup.ts` | Barrel | — |
| `semantic-graph/**` | Laag D graph | `tests/archive/walls/v1/room-wall-semantic-graph.spec.ts` |
| `room-wall-semantic-graph.ts` | Barrel | — |
| `LayerDebugPanel.vue` | V1 debug UI | — |

## Runtime (V2-only)

- `wall-pipeline-version.ts` → altijd `'v2'`
- `App.vue` — geen V1/V2 toggle
- Dev-snapshots met `v1` → restore als V2 replay
- `isFinalizeTabOutput` vereist `pipelineV2Debug.layers.layer1`

## Smoke-checklist (handmatig)

1. Upload → voorbewerking OCR + muren
2. Detectie: autoclass → face-toggle → Afronden
3. Resultaat: Vector/FML-tab, export FML
4. FML-editor: muur tekenen + download
