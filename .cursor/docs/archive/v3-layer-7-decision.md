# V3 Laag 7 — decision

Status: **gate groen** (2026-07-12).  
Child-plan: [`.cursor/plans/v3-layer-7-chain-collapse.plan.md`](../plans/v3-layer-7-chain-collapse.plan.md)

## Interview

| Vraag | Antwoord |
|-------|----------|
| Wel | Alleen **inter-junction chain-collapse** (H/V-ketens tussen hard-ankers) + thickness-compat / dik-dun-dik bridge |
| Niet | Stub-collapse (L9); L6-chamfer repareren; Copy6/7 dense-junction soup; HV/prune van L8 |
| Criteria | **Gebruiker checkt** + suite `layer-7-chain-collapse` (o.a. BouwTek11 @1081,53) |
| Golden | **CURRENT** chain + validate + thickness/bridge |
| Extra | Topology-guard V2 behouden (T/X niet dalen; I/T/X-ankers blijven) |

## Pick

- **Golden:** CURRENT `pipeline-v2/layer-7-*`
- **Engine:** `engines/collapse` (gedeeld met L9 later)
- **Policy L7:** `enableStubCollapse: false`
- **Anti-soup:** geen stub vooruittrekken; geen L6/L8-operaties in L7
- **Accept:** `layer7TopologyPreserved` (zelfde als V2)

## Integrate (gedaan)

- Engines: `pipeline-v3/engines/collapse/{adjacency,thickness,validate,chain-collapse}`
- Orchestrator: `pipeline-v3/layer-7-align.ts`
- `V3_NATIVE_THROUGH_LAYER = 7`
- Tests: `frontend/tests/cv/walls/pipeline-v3/layer-7-chain-collapse.spec.ts`
- Default V2 onaangeroerd

## Bekende restjes (niet L7-scope)

BouwTek11 @(234,506): na L7 blijft ~5px H-stub vóór echte L-hoek @~(240,505).
Lange H collapsed tot x=235; short H + V-hoek blijven.
Oorzaak: `isPerpendicularArmNearChainPoint` / cross-axis ≤5px ziet nabije V @x≈240 → hard stop op fake-L @235 (zelfde familie als I-arm-guard @1081,53).
**Door:** L8 HV + L9 stub-collapse (`enableStubCollapse`) — niet in L7 forceren.

## Gate

- [x] Interview akkoord
- [x] Research + integrate CURRENT
- [x] Suite groen
- [x] **Gebruiker zegt OK** (2026-07-12; restjes bewust naar L8/L9)
