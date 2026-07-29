# V3 Stage 4 — end-to-end + side-by-side

Status: **klaar 2026-07-12** → Stage 5 cutover uitgevoerd.

## Wat werkt

1. **Toggle** V2/V3 in Layer Debug (`bouwtofml.wallPipelineVersion`)
2. **Default = V3** (na Stage 5) — native L1–L10 + FML via L10
3. V2 = archive-pad (`src/archive/walls/v2-room-pipeline/`) voor rollback
4. Debug/overlays: L1–L10; hint “V3 compleet t/m L10”
5. Probes: `frontend/tests/cv/walls/pipeline-v3/` (94+)

## Handmatige checklist (gedaan / keep)

1. Finalize V3 — L1–L10 + FML
2. Overlay lagen; Vector/FML OK
3. Optioneel toggle V2 — archive finalize werkt nog

Zie ook [`v3-dependency-index.md`](v3-dependency-index.md) en [`v3-cutover-checklist.md`](v3-cutover-checklist.md).
