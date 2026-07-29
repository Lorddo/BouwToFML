# 04 — Stap 2 voorbewerking: handoff naar detectie

**Datum:** 2026-07-26  
**Lens:** reverse consumer (zie [`README.md`](./README.md))  
**Downstream:** muren/deuren/ramen docs 01–03; contract `../../workspace-flow.md`

## Verdict

Stap 3/4 lezen uit stap 2 vooral: **muur-B/W (+ gebakken inkt), muurdikte, profile-wallStyle, deur-/raam-refs**.  
Veel preprocess-schema (`doorLayer`, `windowLayer`, `lineDetectorMode`, …) heeft **geen** room-first consumer.

```
wallLayer → baseBw ⊕ ink(bake @2→3) [⊕ ocrMask later in stap 3]
wall-ref → referenceWallThicknessPx (+ gapsInkMode hint)
door/window refs → Stage pipelines
wallStyle(profile) → Otsu room-reference / finalize
```

## Minimale handoff 2 → 3 (hard) — P

| Levering | Consument |
|----------|-----------|
| Zelfde kleur-werkbeeld (geen ink in kleur) | Classify input-bron; FML-underlay later |
| `preprocess.wallLayer` | `buildBaseWallBw` / ref-crops / OCR-scan deelt tune |
| ≥1 wall-rect | Gate + diktemeting |
| `referenceWallThicknessPx > 0` | Room-first, deur snap/touch, FML bands — gemeten op **baseBw ná bake** (wall + gebakken ink; geen OCR) |
| `wallStyle` uit drawing profile | Room-reference / close-radius |
| Ink gebakken in `baseBw` (+ `bakedInkOverlay` voor retune) | First-pass classify ziet vaste inkt |
| Scale nog confirmed | Extract + cm |

## Zacht / later in stap 3

| Levering | Tag | Consument |
|----------|-----|-----------|
| Deur-refs + `fmlRefId` | P | Stage-2 / L12 |
| Raam-refs | P | Stage 1–4 / L14 |
| `ocrEnabled` + OCR-params | O/G | Tab + scan; default uit |
| `ocrMask` | P na scan | Compose → effectiveBw (**niet** stap-2 product) |
| `gapsLayer` / `gapsInkMode` | Dormant/O | Gaten-tab hidden (`GAPS_TAB_VISIBLE = false`) |
| Int muur-tab preview | O | Zelfde Otsu die classify sowieso bouwt — geen persistente laag |
| Vector-cache / signatures | O | Openings/LBE; walls room-first skip |

## Produceert → wie (kort)

| Product | Stap 3 | Stap 4 / FML |
|---------|--------|--------------|
| `baseBw` + baked ink | `precomposedWallBw` | Indirect via muren-output |
| Wall-ref dikte | Classify/finalize/openings | Thickness tiers |
| Style→`gapsInkMode` only | Gaps-pad | — |
| Deur/raam refs | Stages | Via L12/L14 objecten |
| `ocrEnabled` | Tab-volgorde | — |

**Asymmetrie (bewust):** REF-analyse herbouwt B/W vanaf **kleur + wallLayer-tune**; floor faces komen uit **effectiveBw/dual**. OCR/inkt in compose zitten in faces, niet automatisch in REF-crops.

## Orphans / schema-ruis (X)

| Item | Evidence | Tag |
|------|----------|-----|
| `doorLayer` / `windowLayer` | Types only; geen runtime-reads | X |
| `ocrLayer` als aparte tune | `resolveLayerPreprocess('ocr')` → walls; storage + fingerprint legacy (Batch 3 2026-07-28) | H/X storage (gedocumenteerd) |
| `ocrMaskTextForGeometry` | Deprecated defaults | X |
| `lineDetectorMode` | Profiles + preprocess pass-through; geen `cv/walls/**` | X t.o.v. room-first |
| Root-mirror B/W velden | Legacy export; pipeline leest `wallLayer` | H |
| `noiseReduction` | Mapped in normalize | Legacy input |
| `expectedWallStyles` | Signature preview; muren skip LBE-examples | O/legacy |
| `gapsLayer` + Gaten-tab | Hidden; sticky restore → walls | Dormant |
| Style-classify → alleen `gapsInkMode` | Zet **niet** `wallStyle` | **F** — `wallStyle` = drawing profile; geen codekoppeling |

## Wat stap 4 **niet** opnieuw uit stap 2 haalt

- wallLayer-PNG / live ink / Int-muur-preview  
- OCR-params (alleen effect via gemaskeerde B/W in detectie)  
- gapsLayer  

Wel: schaal, kleur-underlay, thickness, opening-objecten (al gebonden).

## Cleanup-richting

1. ~~**Laag:** schema-knip `doorLayer`/`windowLayer`/`ocrMaskTextForGeometry`~~ **ronde 1**
2. ~~**Laag:** `lineDetectorMode`~~ **ronde 1 / F**
3. ~~**Mid:** meetpad DRY op post-bake `baseBw`~~ **ronde 3**
4. ~~**Docs:** style-classify → alleen `gapsInkMode`; `wallStyle` = drawing profile (**F**)~~ **ronde 17**
5. ~~**Mid:** `ocrLayer` legacy docs + `layer-preprocess` split + fingerprint DRY~~ **Batch 3 2026-07-28**
6. **Niet:** gaps-code hard deleten zonder besluit Gaten-tab terug/weg.

## Volgende

Stap 1 → [`05-stap1-onderlegger.md`](./05-stap1-onderlegger.md).
