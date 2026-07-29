# 03 — Ramen stages: produceert vs consumeert

**Datum:** 2026-07-27 (sync)  
**Lens:** reverse consumer (zie [`README.md`](./README.md))  
**Downstream eis:** L14 openings in [`00-result-fml.md`](./00-result-fml.md); muren in [`01-walls-l0-l10.md`](./01-walls-l0-l10.md)  
**Flow-doc:** `../../window-detection-flow.md`

## Verdict

FML leest **geen** Stage 1–3 objecten. Alleen **L14** (`openingStart/End`, `segmentIndex`, `fmlRefId`).  
Stage 1–3 + Stage-4 resolve zijn gates/meetpad (G). Stage-4 `height*` en diverse evidence-velden raken FML niet (O/X). Doorframes uit window-pass zijn **class-only** voor deuren — geen L14-opening.  
Demote (Shift-klik/box window→wall): live prune hypotheses + overlay + `boundWindows` (geen Stage-herdetectie). Stage-3 doorframe-retarget: alleen `hypothesis.faceIds` + as-overlap met deur (niet `evidenceFaceIds`).

```
Raam-refs (stap 2) + FaceDualSpace + classify (+ doorArcFaceIds uit deuren)
  → Stage1 axel → Stage2 door-arc split → Stage3 evidence (+ doorframe retarget faceIds-only)
  → Stage4 resolve (windows + doorframes)
  → class push → L14 bind/merge → FML
  (demote: prune stage-cache/overlay/boundWindows + class pin)
```

## Minimale productieketen (P)

1. Stage-4 **window** candidates (`bbox`, `width*`, `orientation`, `faceIds`, evidence voor merge)  
2. L10 segments/junctions + mask context  
3. L14 bind → span op segment; merge → double/triple `fmlRefId`  
4. Class `window` (finalize → wall in mask); Stage-4 doorframes → class `doorframe` voor deur Path A

## Per stage

| Stage | Produceert | Tag | Follow-up |
|-------|------------|-----|-----------|
| REF `WindowAxelRefBand` | strips/framing/rails/orient | P/G | Evidence Stages 1–3 |
| Bootstrap dual | pipeDual | P | Stages |
| Stage 1 axel filter | hyps + rejects | G (+ O) | Stage 2; niet L14 |
| Stage 2 door-arc | kept windows + doorframeCandidates | G | Stage 3; cross-link deuren |
| Stage 3 evidence | accepted + evidenceFaceIds; framing doorframes | G/P | Stage 4 + class push |
| Stage 4 resolve windows | `ResolvedWindowCandidate` | P (deels X) | L14 |
| Stage 4 doorframes | aparte lijst | P class / **geen** L14 | Sticky deur Path A |
| L14 bind + merge | `BoundWindow` | P openings / O extras | FML |

## ResolvedWindowCandidate / BoundWindow — veldniveau

| Veld | Tag | Consument |
|------|-----|-----------|
| `faceIds`, `bbox`, `centroid`, `widthPx`/`widthCm`, orientation | P | L14 bind / gate |
| `evidence` / evidenceFaceIds | G/O | Class/filter + merge/debug; FML negeert |
| `fmlRefId` na merge | P | FML (tot merge: concept-refid) |
| **`heightPx` / `heightCm`** | **D/O** | DevPanel / window-face-report; FML gebruikt default z_height |
| `score`, `sourceHypothesisId`, `matchedRefIndex` | O/D | Geen per-ref Template ID in FML nog |
| BoundWindow `t`, `openingBBox` | O / X→FML | Overlay; bbox niet in Opening |

## Preprocess-inputs

| Input | Nodig? | Notitie |
|-------|--------|---------|
| Raam LBE-refs | Ja | Zonder refs: lege stage |
| wallLayer REF-crop | Ja | Zelfde asymmetrie als deuren |
| dual / effectiveBw faces | Ja | White Stage 1; ink framing |
| `doorArcFaceIds` | Ja Stage 2 | Uit deur Stage-2 |
| Per-ref Template ID | Nee (nog) | Concept-refid tot productbesluit |

## Orphans / dunner (X / O)

| Item | Tag | Richting |
|------|-----|----------|
| Stage-4 height op candidate | D/O | Markering ronde 17; niet L14/FML-input |
| Stage 1–3 hyp-caches | O | Stage-slider; anders drop |
| ~~`openingBBox` op FML-DTO~~ | — | **Ronde 17** weg; BoundWindow behouden |
| Stage4 doorframes als “openingslijst” | — | Geen orphan: class-pad voor deuren |

## Bewust geen orphan

Stage 2 door-arc split, Stage 3 evidence, Stage 4 doorframe class-push, demote live-prune, Stage-3 faceIds-only retarget — sturen mask/class, deur Path A, en schone FML na demote. Geen “skip omdat FML ze niet leest”.

## Cleanup-richting

1. ~~**Laag:** FML-DTO zonder `openingBBox`~~ **ronde 17**  
2. ~~**Laag:** height-velden als D/O markeren~~ **ronde 17** (geen strip — DevPanel/report lezen nog)  
3. **Product:** per-ref Template ID (nu bewust half) — niet cleanup.  
4. Past bij production-refactor ronde 5 (windows).

## Upstream

Wat stap 2 moet leveren → [`04-stap2-voorbewerking.md`](./04-stap2-voorbewerking.md).
