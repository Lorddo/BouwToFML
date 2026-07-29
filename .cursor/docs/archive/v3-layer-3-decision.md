# V3 Laag 3 — decision

Status: gate groen (2026-07-12).  
Child-plan: [`.cursor/plans/v3-layer-3-prune.plan.md`](../plans/v3-layer-3-prune.plan.md)

## Interview

| Vraag | Antwoord |
|-------|----------|
| Wel | Alleen korte I-spurs verwijderen |
| Niet | Geen verplaatsen / toevoegen / L-T repareren |
| Criteria | Universele logic; V2 `layer-3-prune` suite 1:1 — geen visuele gate |
| Golden | CURRENT (`prune-i-spurs.ts`); Copy7 identiek; Copy6 niet meenemen |

## Pick

- **Golden:** CURRENT iteratieve I→T/X prune, `pathLengthPx < REF` (ratio 1), fallback 30px
- **Policy:** `policies/layer-3.ts` — `endpointEpsPx: 1`, `junctionSnapPx: 0`
- **Anti-soup:** geen Copy6 `pruneISpursOnce`; geen V1 `skeleton-cleanup`; geen `layer-5-*` import

## Integrate

- Engine: `pipeline-v3/engines/prune` (`pruneISpurs`, `tracePathFromIToFirstTx`)
- Orchestrator: `pipeline-v3/layer-3-prune.ts`
- `V3_NATIVE_THROUGH_LAYER = 3`
- Tests: `frontend/tests/cv/walls/pipeline-v3/layer-3-prune.spec.ts`
- Default V2 onaangeroerd

## Gate

- [x] Interview akkoord
- [x] CURRENT golden frozen in policy
- [x] V3 L3 native; incomplete = `[4…9]`; FML nog dicht
- [x] Default V2 ongewijzigd
