# V3 Laag 6 — decision

Status: **gate groen** (2026-07-12).  
Child-plan: [`.cursor/plans/v3-layer-6-chamfer-group.plan.md`](../plans/v3-layer-6-chamfer-group.plan.md)

## Interview

| Vraag | Antwoord |
|-------|----------|
| Wel | CURRENT **multi-chamfer** voor **L, T én X**; assen → H×V → weld → drop diagonalen; landing + junction-repair; max 16 iter |
| Niet | Copy6/7 stitch/collapse/multi-weld; L5-merge in L6; seal + HV/orthogonal soup; L5 “repareren” vanuit L6 |
| Criteria | **Gebruiker checkt** (suite: export-47/49, 2D_3E koof @572) |
| Golden | **CURRENT** chamfer-group + **kind-accept i.p.v. connectivity** |
| Extra | Geen pre-L6 chain-collapse-laag tenzij later bewezen nodig |

## Pick

- **Golden:** CURRENT `layer-6-chamfer-{group,chain}` + connector + junction-repair (iteratieve loop)
- **V3 delta (kritiek):** face-/candidate-accept op **junction kind**, niet op `validateLayer5Connectivity`
  - L-chamfer → **L** junction
  - T-chamfer → **T** (skelet mag via andere arm doorlopen; connectivity is te streng)
  - X: kind behouden; geen T/X-downgrade
- **Policy:** `policies/layer-6.ts` — `maxIterations: 16`, `axisChainRatio: 3.5`
- **Anti-soup:** `stitchDangling`, `collapseDenseJunctionChains`, L5 same-line in L6, `layer-6-weld` in orchestrator, Copy7 seal/HV/orthogonal
- **Niet nu:** tussenlaag chain-collapse vóór L6

## Integrate (gedaan)

- Engines: `pipeline-v3/engines/connector/` — CURRENT chamfer/connector/junction modules (geen soup)
- Kind-accept: `kind-accept.ts`
  - **Per-candidate:** `validateJunctionKindsPreserved` — L/T/X positie + geen I-explosie / X-downgrade
  - **Face:** `acceptLayer6FaceKinds` — geen I-explosie / X-downgrade (T-count mag dalen bij consolidatie over de hele loop)
- Orchestrator: `pipeline-v3/layer-6-repair.ts` — loop zoals CURRENT, **geen** connectivity-rollback
- `V3_NATIVE_THROUGH_LAYER = 6`
- Tests: `frontend/tests/cv/walls/pipeline-v3/layer-6-repair.spec.ts` (doubleChamferL, export-47, west T-jog, koof-572, kind-gate, through-V T @1489)
- Post-gate fix: through-V T-chamfer niet als simple-L (BouwTek11 export-64 @1489)
- Default V2 onaangeroerd (geen runtime-import uit `pipeline-v2/layer-6-*`)

## Gate

- [x] Interview akkoord
- [x] Research-diff + reproduce (kind vs connectivity)
- [x] Native CURRENT chamfer + kind-accept
- [x] Geen Copy6/7 soup
- [x] Default V2 onaangeroerd
- [x] **Gebruiker zegt OK** (2026-07-12; o.a. through-V T @1489)

## Post-gate fix (2026-07-12, report 26)

2D_3E top-hoeken bleven L5→L9: face-gate `I explosion` rolde hele face terug na sanitize
(`dropZeroLength` op micro-stub → I 3→5), terwijl connector de chamfers wél had gefixt.

- Junction: all-or-nothing — geen arm-snap bij unretractable chamfer (verre tip > armDetect)
- Orchestrator: per-fase face-gate; bij sanitize-I-explosie raw behouden; geen blinde L5-rollback
- Tests: `layer-6-report26-corners.spec.ts` (cluster + SE + full L5 face)
