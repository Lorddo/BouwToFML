# 05 — Stap 1 onderlegger: handoff naar voorbewerking

**Datum:** 2026-07-26  
**Lens:** reverse consumer (zie [`README.md`](./README.md))  
**Downstream:** [`04-stap2-voorbewerking.md`](./04-stap2-voorbewerking.md); contract `../../workspace-flow.md`

## Verdict

Stap 1 levert een **stabiel kleurcanvas + bevestigde schaal** (rotatie/crop/gum ingebakken bij «Volgende»).  
Geen refs, geen B/W, geen detectie-output. Weinig echte orphans — vooral ephemeral rotatie/mask state na commit.

```
upload → (opt) rotate/crop/gum → commitInputStepImage
+ scale confirmed (px/mm)
    → stap 2 wallLayer / refs op dit beeld
    → … → FML underlay = zelfde kleurbeeld
```

## Minimale handoff 1 → 2 (hard) — P

| Levering | Consument |
|----------|-----------|
| `imageSrc` / `originalImageEl` (gebakken) | Preprocess B/W, refs, Int muur, later detectie + FML-underlay |
| `scale.confirmed` + `pixelsPerMillimeterX/Y` | Gate 1→2; extract; FML cm |
| Typisch: ≥3000px optimization base | Canvas/CV resolutie |

Optioneel tot commit: live `eraserMask` / `maskedWorkingCanvas` / rotatievelden — na `commitInputStepImage` ingebrand en gereset/leeggemaakt.

## Produceert → wie

| Product | Stap 2 | Stap 3 | Stap 4 / FML |
|---------|--------|--------|--------------|
| Bevestigde schaal | Gate | Gate + px→cm openings | **Verplicht** `extractionToPlan` |
| Werkbeeld (≥3k) | baseBw-bron, refs | Classify/OCR/openings | Kleur-underlay (`workingImageSrc`) |
| Rotatie | Tot bake | — | In pixels |
| Eraser/crop/polygon | Live tot bake | Residual zelden | Gum in kleurpixels |

**Niet in stap 1:** LBE muur/deur/raam — dat is stap 2 (oud anti-pattern in docs over “refs op stap 1” negeren t.o.v. huidige code).

## Ephemeral / geen follow-up na commit (verwacht, geen X-bug)

| Item | Gedrag |
|------|--------|
| `rotate180` / `rotationDeg` / `autoRotationDeg` | Gereset na bake |
| Live `eraserMask` | `clearMaskAfterCommit` — consumers houden param voor residual/dev |
| `maskedWorkingCanvas` | Vervangen door gebakken image |

Dit is correcte lifecycle, geen orphan-productie.

## Wat later nog van stap 1 hangt

| Consument | Veld |
|-----------|------|
| Hele pipeline | Gebakken pixels |
| FML preview/download underlay | Kleur `workingImageSrc` — **niet** wall B/W |
| Alle cm-metingen | px/mm |

Zonder schaal: geen legitieme FML. Zonder stabiel beeld: stap 2/3 ongeldig.

## Orphans

Praktisch **geen** stap-1 schema-orphans vergelijkbaar met preprocess `doorLayer`.  
Eventuele cleanup zit in UI-composables (god-files) — dat is production-refactor UI-ronde, geen consumer-gap.

## Cleanup-richting (nog geen go)

1. Docs: anti-pattern “refs op stap 1” blijven markeren als fout t.o.v. huidige flow.  
2. Geen consumer-driven delete in stap 1 zonder UI-smoke.  
3. Residual eraser-pad alleen aanraken bij expliciete dev-session cleanup.

## Terug naar index

Hele keten → [`README.md`](./README.md). Vooruit (code-kwaliteit) → [`../README.md`](../README.md).
