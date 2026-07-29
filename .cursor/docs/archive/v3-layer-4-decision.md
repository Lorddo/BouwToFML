# V3 Laag 4 — decision

Status: gate groen (2026-07-12).  
Child-plan: [`.cursor/plans/v3-layer-4-hv-endpoint-seal.plan.md`](../plans/v3-layer-4-hv-endpoint-seal.plan.md)

## Interview

| Vraag | Antwoord |
|-------|----------|
| Wel | Eindpunten verplaatsen + HV-positie |
| Niet | Afwijken van mask; **geen seal** |
| Criteria | Wanneer de gebruiker het zegt |
| Golden | Copy(6) / Copy(7) werkte beter dan CURRENT |
| Extra | Alles moet mee: junction + aangesloten eindpunten; geen T→I door lostrekken |

## Pick

- **Golden:** Copy6/7 bare `positionSegmentsHv` (geen post-snap / weld / seal-junction-herbouw)
- **Policy:** `policies/layer-4.ts` — `prePositionSnapPx: 2`, `postPositionSnapPx: 0`
- **Invariant:** junction count + kinds gelijk (Copy6/7 `assertLayer4Invariants`)
- **Anti-soup:** CURRENT endpoint-seal; `layer-5-weld` import; L4 weld-orchestratie

## Integrate

- Engine: `pipeline-v3/engines/hv` (qualify, axis-clusters, junction-position, position)
- Orchestrator: `pipeline-v3/layer-4-position-hv.ts`
- `V3_NATIVE_THROUGH_LAYER = 4`
- Tests: `frontend/tests/cv/walls/pipeline-v3/layer-4-position-hv.spec.ts`
- Default V2 onaangeroerd (CURRENT V2 mag seal houden)

## Gate

- [x] Interview akkoord
- [x] Copy6/7 bare HV native
- [x] Geen seal in L4
- [x] Default V2 onaangeroerd
- [x] **Gebruiker zegt OK** (2026-07-12)
