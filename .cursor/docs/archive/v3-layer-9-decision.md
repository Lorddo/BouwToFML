# V3 Laag 9 (+ L10) — decision

Status: **gate groen** (2026-07-12).  
Child-plan: [`.cursor/plans/v3-layer-9-fml-prep.plan.md`](../plans/v3-layer-9-fml-prep.plan.md)

## Interview

| Vraag | Antwoord |
|-------|----------|
| Wel L9 | Chain-collapse + ortho stair-stub + **parallel-cover absorb** (zelfde as/coördinaten) |
| Wel L10 | Dunne FML-input: final chain + **chain-axis straighten** (≤2px, incl. 0px) vóór **micro corner-jog absorb** (0°-fake-L) + dedupe + rebuild; **enige** V3 FML-bron |
| Niet | L8 HV/prune; L6 chamfer; stub/cover in L7; V3 FML vanaf L8/L9 |
| Criteria | BouwTek11 ~(1514,892); suite; **gebruiker** |
| Golden | CURRENT L9 chain+stub **+** axis-cluster coverage absorb |

## Pick

- **L9 dissolve:** chain → topology-guard → stair-stub → guard → **parallelCoverAbsorb** → guard → dedupe → rebuild
- **L10 FML:** chain → **chainAxisStraighten** (H/V consensus ≤2px, 0px mee) → guard → **microCornerAbsorb** (hard-L↔fake-L ≤8px) → guard → dedupe → rebuild; `resolveFmlSourceLayer` → `layer10` als `fmlReady`
- **Cover:** segment redundant als `span ⊆ union(andere opzelfde as)`; split survivor op unieke eindpunten voor loodrechte armen
- **Anti-soup:** geen import V2 L9-modules in engines; geen cover in L7
- **NATIVE:** `V3_PIPELINE_LAST_LAYER = 10`; `V3_NATIVE_THROUGH_LAYER = 10`

## Probe BouwTek11 ~(1514, 892)

Na L8: through-V N+Z op x≈1515; short-V 907→886 opzelfde as; H west @886 (L); T@907 angle≈180°.

**Doel:** short-V weg; H = T op through @886; T@907 → through.

## Gate

- [x] Interview akkoord
- [x] Native L9+L10 + suite groen
- [x] **Gebruiker zegt OK** (2026-07-12)
