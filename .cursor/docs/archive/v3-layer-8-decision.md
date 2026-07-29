# V3 Laag 8 — decision

Status: **gate groen** (2026-07-12).  
Child-plan: [`.cursor/plans/v3-layer-8-finalize.plan.md`](../plans/v3-layer-8-finalize.plan.md)

## Interview

| Vraag | Antwoord |
|-------|----------|
| Wel | **HV-reposition** (op muurmask / distance map) + **één I-prune-sweep** (CURRENT L8) |
| Niet | L4 endpoint-seal (post-snap 6 / near 1.25 / cluster 5); L3 iteratieve I→T/X-only prune; stub-collapse (L9) |
| Criteria | Suite `layer-8-prune` + gebruiker; BouwTek11 @(234,506) restje L7 |
| Golden | **CURRENT** `layer-8-finalize` + `layer-8-prune` |
| Extra (1D) | Parallel L+T opzelfde as (BouwTek11 ~(1515,895): korte V tussen T@907 en L@886, H aan L) → **niet in L8**; acceptatie voor **L9 stub/absorb** |

## Pick

- **Golden:** CURRENT finalize-volgorde: micro-weld → HV (mask) → micro-weld → L8-prune once → drop-zero → dedupe → rebuild
- **HV policy:** bare zoals L4 (`prePositionSnapPx: 2`, `postPositionSnapPx: 0`); `layerId: 8`; distance map uit `maskRle`
- **Weld:** alleen graph-prep **1px** (≠ L4/L5 seal)
- **Prune policy:** I→**L/T/X**, single sweep, T/X structural guard (25° + min arms); drempel = ref-dikte / fallback 30
- **Anti-soup:** geen import `layer-4-*` / `layer-5-*` / V2 L8-modules; geen L9 stub hier
- **Door naar L9:** collinear overlap short-V (T↔L) → één T op through-V (`enableStubCollapse` / absorb)

## Probe BouwTek11 ~(1514, 895)

Na L7:

- Through-V op x≈1515: `#19` (907→567) overlapt y-span met korte `#34` (907→886)
- L @886 (H `#64` west) + T @907 (angle≈180°)
- Gewenst: H als **één T** op through-V; korte parallelle tak weg; oude T@907 lost op in through

Huidige L8-prune raakt dit niet (geen I-spur; pad is L↔T). Hoort bij L9.

## Integrate

- Engines: `engines/hv` + `engines/prune` (L8 once-mode) + `engines/weld` (1px) + `engines/segment-ops`
- Orchestrator: `pipeline-v3/layer-8-finalize.ts`
- `V3_NATIVE_THROUGH_LAYER = 8`
- Tests: `frontend/tests/cv/walls/pipeline-v3/layer-8-finalize.spec.ts`
- Default V2 onaangeroerd

## Gate

- [x] Interview akkoord (1D + 2A)
- [x] Native L8 + suite groen
- [x] **Gebruiker zegt OK** (2026-07-12; UI L8 overlay OK na debug-fix)
