# Deur pair/demote — open cases (inventaris)

Laatste update: 2026-08-24

Doel: **één voor één** vastleggen waar Stage-2 pair/demote (D-62) faalt op echte tekeningen.  
Nog **geen** oplossing hier — pas als alle voorbeelden binnen zijn, gezamenlijk aanpak kiezen.

Gerelateerd: [`door-detection-flow.md`](./door-detection-flow.md) (D-62), code `cv/doors/door-pair-demote.ts` (eigen soft between-check). D-40 bridge: streng predicaat in `door-bridge-wall-promote.ts`. Gepland alternatief voor hardnekkige paren: [`door-thin-mask-dedupe-plan.md`](./door-thin-mask-dedupe-plan.md).

## Huidige regel (kort)

Pair alleen als:

1. twee Stage-2 deur-hits **1-hop ink-adjacent**, én
2. **exact één** van de twee `betweenTwoWalls` (lange as: beide einden wallish).

Kozijn → `doorframe`; swing → `door`. Wees-kozijn → `wall`.  
`betweenTwoWalls` accepteert micro-walls (geen 3%-skip), maar **alle** sample-rays op een zijde moeten wallish zijn (0.25 / 0.5 / 0.75).

---

## Case 1 — H-opening onder (268 + 285)

| Veld | Waarde |
|------|--------|
| Tekening | WhatsApp Image 2026-08-24 at 12.55.59.jpeg |
| Plan | 2213×3012 px |
| Probe | (799,1901) 337×76 · midden (968,1939) |
| Status | **Open** — beide nog class `door` |

### Hypotheses (verwacht paar)

| Face | Class | Bbox (ink) | Rol-hypothese |
|------|-------|------------|---------------|
| **268** | door | 144×29 @ (947,1911) | Kozijn/stijl in horizontale muurstrook (H) |
| **285** | door | 101×37 @ (952,1928) | Draaiboog onder 268 (kamer/surface) |

Zelfde opening: 285 zit grotendeels **onder** 268 (y 1928 vs 1911), x-overlap groot → waarschijnlijk ink-adjacent. XOR zou moeten: 268 tussen muren, 285 niet.

### Omgeving (relevant)

| Face | Class | Bbox | Notitie |
|------|-------|------|---------|
| 275 | wall | 32×65 @ (1091,1912) | Rechts van 268 (x≈ einde 268) — sterke R-kandidaat |
| 264 | wall | 62×23 @ (883,1908) | Links van opening, micro-achtig |
| 271 | wall | 46×19 @ (799,1912) | Verder links |
| 272 | wall | 44×19 @ (842,1911) | Links, collineair met strook |
| 273 | wall | 9×20 @ (942,1911) | Mini tegen linker kozijnrand |
| 262 | wall | 20×10 @ (908,1903) | Mini boven strook |
| 274 | wall | 10×17 @ (1088,1913) | Mini bij 275 |
| 283 | surface | 297×48 @ (799,1929) | Grote kamerblob **onder** strook; y overlap met onderkant 268 |
| 216 | surface | 209×76 @ (927,1901) | Boven/naast |
| 173 | surface | 110×12 @ (799,1901) | Dunne strip boven |

Geen segmenten/junctions in bereik (masker/opening-gebied).

### Waarom pair vermoedelijk faalt (nog te bevestigen)

Voor **268** (H): `betweenTwoWalls` eist **links én rechts** wallish op **alle drie** sample-hoogtes.

- **Rechts:** 275 is plausibel → OK.
- **Links:** arcering is gefragmenteerd (271/272/273/264). Minstens één sample (zeker lager, y dichter bij 1929) kan **283 surface** raken i.p.v. een wall-mini — dan faalt de hele linkerzijde → 268 telt **niet** als tussen muren → geen xor met 285 → beide blijven `door`.

Dit is **niet** meer de oude “micro-skip ≤66 px”-bug (die micros zouden nu wél mogen); het is strenger: **unanieme** wallish samples per zijde. Één surface-lek langs de hatch breekt het kozijn-label.

Alternatieven om later te checken (niet nu fixen):

- 268/285 niet adjacent in ink-graph (onwaarschijnlijk gezien overlap).
- Beide `betweenTwoWalls` (285 links/rechts toevallig wall) → xor false.
- Class/space: white vs ink geom voor buren.

### Gewenst resultaat

- 268 → `doorframe` (+ IDs op 285)
- 285 → `door`
- Geen wees-doorframe

### Probe-dump (ruw)

Wall-ink + opening-wit zoals aangeleverd 2026-08-24 (gebied 799,1901 337×76). Zie chat / herhaal probe in app.

---

## Case 2 — V-opening rechts (246 + 248)

| Veld | Waarde |
|------|--------|
| Tekening | WhatsApp Image 2026-08-24 at 12.55.59.jpeg |
| Plan | 2213×3012 px |
| Probe | (1266,1559) 80×601 · midden (1306,1860) |
| Status | **Open** — beide nog class `door` |

### Hypotheses (verwacht paar)

| Face | Class | Bbox (ink) | Rol-hypothese |
|------|-------|------------|---------------|
| **246** | door | 32×143 @ (1295,1762) | Kozijn/stijl in verticale muurkolom (V) |
| **248** | door | 30×98 @ (1316,1767) | Draaiboog **rechts** van 246 (in surface 202) |

Zelfde opening: 248 overlapt x met de rechterkant van 246 en steekt de kamer in → ink-adjacent verwacht. XOR: 246 tussen muren (boven+onder), 248 niet.

### Omgeving (relevant)

| Face | Class | Bbox | Notitie |
|------|-------|------|---------|
| 233 | wall | 22×57 @ (1296,1704) | Direct **boven** 246 (zelfde kolom) |
| 224 | wall | 22×50 @ (1296,1657) | Verder boven |
| 284 | wall | 22×57 @ (1295,1927) | Onder 246; **~22 px gap** (246 eindigt y≈1905) |
| 289 | wall | 22×51 @ (1295,1982) | Onder 284 |
| 290 | wall | 22×56 @ (1295,2029) | Verder onder |
| 291 | wall | 22×50 @ (1295,2083) | Onderste in probe |
| 182 | wall | 74×79 @ (1272,1581) | Dik blok bovenaan kolom |
| 217 | surface | 31×543 @ (1266,1617) | Kamer **links** van kolom |
| 202 | surface | 30×557 @ (1316,1603) | Kamer **rechts** — swing 248 ligt hierin |
| 88 | surface | 80×41 @ (1266,1559) | Bovenkant probe |

Geen segmenten/junctions in bereik.

### Waarom pair vermoedelijk faalt (nog te bevestigen)

Voor **246** (V): `betweenTwoWalls` eist **boven én onder** wallish op alle drie sample-x’en.

- **Boven:** 233 in dezelfde kolom → waarschijnlijk OK.
- **Onder:** muurkolom is **arcering-ketting** (284→289→290→291) met een **gat** tussen 246 (y≈1905) en 284 (y=1927). Rays die door ink/white/surface lekken i.p.v. wall-mini → onderzijde faalt → 246 niet “tussen muren” → geen xor met 248.

Zelfde faalmodus-familie als case 1: niet micro-skip, maar **unanieme samples** + **onderbroken hatch** langs de lange as. Hier V i.p.v. H; swing aan de **kamer-rechterkant**.

Ook checken later: of bottom-samples surface **202** raken (rechts naast kolom, y-overlap met de gap).

### Gewenst resultaat

- 246 → `doorframe` (+ IDs op 248)
- 248 → `door`
- Geen wees-doorframe

### Probe-dump (ruw)

Wall-ink + opening-wit zoals aangeleverd 2026-08-24 (gebied 1266,1559 80×601).

---

## Case 3 — H-strook boven (178 · 179 + 193)

| Veld | Waarde |
|------|--------|
| Tekening | WhatsApp Image 2026-08-24 at 12.55.59.jpeg |
| Plan | 2213×3012 px |
| Probe | (892,1546) 450×75 · midden (1117,1584) |
| Status | **Open** — drie faces class `door` |

### Hypotheses

| Face | Class | Bbox (ink) | Rol-hypothese |
|------|-------|------------|---------------|
| **193** | door | 142×29 @ (1126,1592) | Kozijn in horizontale muurstrook (H), rechter opening |
| **179** | door | 67×39 @ (1130,1565) | Draaiboog **boven** 193 (in surface 87) |
| **178** | door | 105×36 @ (936,1565) | **Losse** linker opening in dezelfde strook — geen tweede deur-buur in probe |

Verwacht paar: **193 + 179** (xor: 193 tussen muren, 179 niet).  
**178** apart: geen adjacent deur-partner → ofwel wees-kozijn → `wall`, ofwel echte swing zonder gedetecteerd kozijn → mag `door` blijven (later bevestigen).

### Omgeving (relevant)

| Face | Class | Bbox | Notitie |
|------|-------|------|---------|
| 110 | wall | 52×74 @ (1074,1546) | Verticale muur **tussen** linker (178) en rechter (179/193) zone; raakt x-start 193 |
| 197 | wall | 104×22 @ (951,1599) | Onder/bij 178 |
| 211 | wall | 64×13 @ (940,1608) | Mini onder 178 |
| 177 | wall | 20×41 @ (908,1560) | Links van 178 |
| 182 | wall | 70×40 @ (1272,1581) | Rechts van 193 |
| 87 | surface | 91×52 @ (1105,1546) | Kamer boven 179/193 |
| 134 | surface | 153×52 @ (927,1546) | Kamer boven 178 |
| 88 | surface | 146×54 @ (1196,1546) | Rechtsboven |
| 173 | surface | 17×75 @ (892,1546) | Linkerrand |

Geen segmenten/junctions in bereik.

### Waarom pair vermoedelijk faalt (nog te bevestigen)

**179 + 193:** zelfde faalmodus als case 1 (H-kozijn).

- **193** (H): links ≈ 110 (wall), rechts ≈ 182 (wall) — op papier tussen muren.
- Hatch/minis + surface-lek langs de strook (of sample op 0.25/0.75 die **87/88** raakt) → niet alle L/R-samples wallish → 193 niet `betweenTwoWalls` → geen xor → beide `door`.

**178:** geen deur-sibling in adjacency → pair skip. Als 178 wél `betweenTwoWalls`: zou wees → `wall` moeten worden; blijft die `door`, dan faalt óók de wees-tak of 178 is géén betweenWalls (echte swing / eenzijdig muurcontact). Apart te verifiëren.

### Gewenst resultaat

- 193 → `doorframe` (+ IDs op 179)
- 179 → `door`
- 178 → bevestigen: of `wall` (wees-kozijn) of legitieme `door` (swing zonder frame in detectie)

### Probe-dump (ruw)

Wall-ink + opening-wit zoals aangeleverd 2026-08-24 (gebied 892,1546 450×75).

---

## Case 4+

_(volgende voorbeelden hieronder plakken — zelfde tabelstructuur)_

---

## Samenvatting open

| # | Opening | Faces | Symptoom | Verdachte blokkade |
|---|---------|-------|----------|--------------------|
| 1 | H-onder | 268 + 285 | beide `door` | L-zijde 268: niet alle samples wallish (surface 283 / hatch-gaten) |
| 2 | V-rechts | 246 + 248 | beide `door` | Onderzijde 246: gap/hatch-ketting (284…) / mogelijk surface 202 |
| 3 | H-boven | 179 + 193 (+ 178) | 179/193 beide `door`; 178 alleen | Zelfde unanieme L/R-samples op 193; 178 = wees vs lone swing |

## Pas later

Richting gekozen: **niet** D-62 betweenWalls verzwaren; wel [`door-thin-mask-dedupe-plan.md`](./door-thin-mask-dedupe-plan.md) (dun ≤ max muur-ref → mask + post-L11 dedupe). Cases hier blijven toetsmateriaal.
