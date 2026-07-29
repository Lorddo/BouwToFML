# V3 Laag 5 — decision

Status: **gate groen** (2026-07-12).  
Child-plan: [`.cursor/plans/v3-layer-5-cleanup-weld.plan.md`](../plans/v3-layer-5-cleanup-weld.plan.md)

## Interview

| Vraag | Antwoord |
|-------|----------|
| Wel | Copy(6) loop: same-line merge, T/X-micro, L+L-stair, micro-loops, zero-length+dedupe, dangling repair + near-endpoint weld |
| Niet | Seal-after-removal; I-junction rollback naar L4-baseline; Copy7 cluster-weld via L6; CURRENT topology/final-repair/collinear-weld stack |
| Criteria | Gebruiker bepaalt gate |
| Golden | **Copy(6)** L5 |
| Extra | Als tech goed werkt zijn seal/I-rollback niet nodig |

## Pick

- **Golden:** Copy(6) `runLayer5Cleanup` + dangling/near-weld
- **Policy:** `policies/layer-5.ts` — Copy6 constants (`repairMaxGapPx: 4`, `nearEndpointGapPx: 0.8`, `enforceINodeCheck: false`)
- **Anti-soup:** CURRENT seal/topology/final-repair; Copy7 `layer-6-weld`; mask-aware Copy7 micro/stair

## Integrate (gedaan)

- Engines: `segment-ops`, `weld` (near + dangling), `cleanup` (same-line/tx/stair/loops), `topology` (Copy6 guards)
- Orchestrator: `pipeline-v3/layer-5-cleanup.ts`
- `V3_NATIVE_THROUGH_LAYER = 5`
- Tests: `frontend/tests/cv/walls/pipeline-v3/layer-5-cleanup.spec.ts`
- Default V2 onaangeroerd
- Post-gate fix: `replaceEndpoint` snapshot + micro-loops directed angle + per-stub tx (BouwTek11 export-62 @645,243)

## Gate

- [x] Interview akkoord
- [x] Copy6 L5 native in V3
- [x] Geen L6-import vanuit L5
- [x] Default V2 onaangeroerd
- [x] **Gebruiker zegt OK** (2026-07-12, o.a. zone @645,243)
