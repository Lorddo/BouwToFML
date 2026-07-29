# V3 baseline-index

Status: Stage 0 freeze — 2026-07-12.  
Backups in `.cursor/PREVIOUS BUILD/` zijn **read-only**.

## Bronnen

| Id | Pad | Rol |
|----|-----|-----|
| **CURRENT** | `frontend/src/cv/walls/rooms/pipeline-v2/` (61 `.ts`) | Runtime keep-basis: ink + FML + L1–L9 |
| **V3 (progressief)** | `frontend/src/cv/walls/rooms/pipeline-v3/` | Native L1–L5; L6–L9 incomplete; geen V2-bridge; FML pas bij L9 |
| **Copy(6)** | `.cursor/PREVIOUS BUILD/BouwToFMLSidetrack - Copy (6)/frontend/src/cv/walls/rooms/pipeline-v2/` (44) | Pre-finish; V1 dual-toggle actief elders; L6 junction incompleet |
| **Copy(7)** | `.cursor/PREVIOUS BUILD/BouwToFMLSidetrack - Copy (7)/frontend/src/cv/walls/rooms/pipeline-v2/` (51) | After-party; L5↔L6 weld-coupling; geen chamfer-group / L9 |
| **STAGE** | Huidige workspace (git working tree) | Keep-basis; aparte STAGE-map buiten repo niet gevonden |

## File-inventaris (pipeline-v2)

### Alleen CURRENT

`layer-4-endpoint-snap.ts`, `layer-5-topology.ts`, `layer-5-junction-graph.ts`, `layer-5-weld.ts`, `layer-5-collinear-weld.ts`, `layer-5-final-repair.ts`, `layer-6-chamfer-chain.ts`, `layer-6-chamfer-group.ts`, `layer-9-chain-collapse.ts`, `layer-9-stub-collapse.ts`

### Copy(7) t.o.v. Copy(6) (niet in 6)

`layer-5-chamfer-guard.ts`, `layer-6-collinear-chain.ts`, `layer-6-orthogonal-crossing.ts`, `layer-6-junction-guard.ts`, `layer-6-hv-crossing.ts`, `layer-8-prune.ts`, `pipeline-v2-collinear-weld.ts`

### Depth

| Bron | Lagen | Opmerking |
|------|-------|-----------|
| CURRENT | L1–L9 | FML leest L9 |
| Copy(6)/Copy(7) | L1–L8 | Geen L9 |

## Coupling-matrix (CURRENT V2 — probleem V3 oplost)

| Van → Naar | Koppeling | Ernst |
|------------|-----------|-------|
| L4 → `layer-5-weld` | Endpoint-seal na HV | Hoog |
| `pipeline-v2-junction-graph` → `layer-5-weld` | Pre-graph weld | Middel |
| L6 → `layer-5-segment-ops` / `layer-5-connectivity` | Segment CRUD + guard | Hoog |
| L6 → `layer-4-hv-qualify` | Segment classify | Middel |
| L6 → `layer-7-validate` | Topology guard in junction repair | Middel |
| L7/L8/L9 → `layer-5-segment-ops` | rebuild/dedupe | Middel |
| L8 → L5 constants + L6 classify + L7 constants | I-prune | Middel |
| L9 → L7 chain-collapse / thickness / validate | FML prep | Hoog |
| L7 → L4 thickness constants / L6 weld cluster const | Shared numbers | Laag–middel |

### Copy(7) extra (niet in CURRENT)

| Koppeling | Ernst |
|-----------|-------|
| L5 cluster-weld → `layer-6-weld` | **Kritiek** (“welding fucked”) |
| L6 orchestrator → L5 same-line merge + meervoudige weld | Hoog |

### Copy(6) extra

| Koppeling | Ernst |
|-----------|-------|
| V2 layers → V1 `skeleton-cleanup/geometry` | Hoog (te vermijden in V3) |

## Keep-list (V3 mag niet breken)

### Ink / room faces (stap 3)

- `cv/walls/rooms/room-ink-*.ts`, `room-refine-topology.ts`, `room-raster*.ts`
- `ui/composables/workspace/useWorkspaceRoomFaces.ts`, ink-edit / verwerk-inkt
- Dev snapshot room-state / face-overrides

### FML / resultaat (stap 4)

- `ui/composables/useWorkspaceFml.ts`, `fml-preview/*`
- `core/fml/*` (`buildFmlV3`, `harmonizeFmlWallThickness`, mirrored-semantiek)
- Semantic graph entry blijft “laatste pipeline-laag” (nu L9)

### Workspace flow

- `layer-flow.ts`, preprocess, OCR-tab, finalize entry via `room-first` → mask-prep
- Alleen de **pipeline-backend** wisselt (v2 ↔ v3)

## Fixtures & probes

Pad: `frontend/tests/cv/walls/pipeline-v2/`

| Categorie | Bestanden |
|-----------|-----------|
| Fixtures | `fixtures/BouwTek11-layer-debug-v2-{47,48,49}.json` |
| L2 | `layer-2-*.spec.ts` |
| L3 | `layer-3-prune.spec.ts` |
| L4 | `layer-4-position-hv.spec.ts`, `layer-4-export-56-diagnostic.spec.ts` |
| L5 | `layer-5-*.spec.ts` (cleanup, chamfer-guard, 2d3e, export-48/50) |
| L6 | `layer-6-*.spec.ts` (chamfer, export 36/37/47/49, probes) |
| L7–L9 | `layer-7-chain-collapse`, `layer-8-prune`, `layer-9-2d3e-probe` |

V3-tests: `frontend/tests/cv/walls/pipeline-v3/` (nieuw; fixtures mogen symlink/copy van v2 JSON).

## Exit Stage 0

- Geen edits in PREVIOUS BUILD.
- Ink/FML blijven ongewijzigd tot Stage 5 cutover (expliciet OK).
- Research voor child-plans gebruikt deze drie bomen als ankers.
