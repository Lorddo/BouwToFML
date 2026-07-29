# V3 Laag 1 + 2 — decision (P8)

Status: gate klaar voor gebruiker (2026-07-12).  
Child-plan: [`.cursor/plans/v3-layer-1-2-audit.plan.md`](../plans/v3-layer-1-2-audit.plan.md)

## Interview

| Vraag | Antwoord |
|-------|----------|
| Wel | L1/L2 volledig native in `pipeline-v3/` (types + policies + orchestrators); regressie-probes; freeze gedrag |
| Niet | Geen extra prune/HV/weld in L1/L2; geen mask/skeleton-tweaks “om L3+ te helpen”; geen Copy6/7-afwijkingen |
| Criteria | Geen `pipeline-v2` imports in V3 types/L1/L2; BouwTek11 L2-probes groen; byte-stabiel gedrag t.o.v. CURRENT |
| Visueel | Geen voorkombare L1/L2-ruis → **geen gedragswijziging** |
| Golden | CURRENT copies, ongewijzigd |

## Pick

- **Golden:** CURRENT L1 (WASM + polyline + snap 2) / L2 (jitter-merge + exact dedupe)
- **Policy L1:** `policies/layer-1.ts` — `junctionGraphSnapPx: 2`
- **Policy L2:** `policies/layer-2.ts` — preserve 25° / structural 26° / tol 20% clamp 2–8 / T-arm 8px
- **Anti-soup:** geen L3-prune in L2; geen HV; geen V2 type-re-export

## Integrate

- `pipeline-v3/types.ts` — **eigen** L1–L10 result shapes (geen import uit `pipeline-v2/types`)
- Orchestrators: `layer-1-raw-wasm.ts`, `layer-2-raw-segments.ts` + policies
- Tests: `pipeline-v3/layer-2-*.spec.ts` (+ BouwTek11 probes)
- Shared ports (`wallSkeletonTrace`, `wallJunctionGraph`, `wall-segment-geometry`) blijven buiten pipeline — overleven V2-archive
- Default V2 onaangeroerd (`room-first` V2-pad gebruikt nog V2 L1)

## Gate

- [x] Interview akkoord (geen voorkombare ruis; volledige V3-split)
- [x] Types + policies frozen in V3
- [x] Suite groen (`pipeline-v3` 94/94)
- [x] **Gebruiker zegt OK** (+ Stage 5 cutover)
- Ink/FML-editor ongewijzigd; default nu **v3**
