# Deur-/raam-`mirrored` semantiek (geverifieerd)

> Laatste update: 2026-07-03 — afgeleid uit Floorplanner editor-gedrag en
> visueel geverifieerd via `examples/FML(test)/test-doors.json.fml`.

Deze doc is de **single source of truth** voor hoe we `mirrored` lezen en
schrijven. Niet opnieuw raden — dit is empirisch vastgesteld, niet uit de
v3.0-spec (die alleen "vertical/horizontal flip" zegt en dubbelzinnig is).

## De regel

Een opening heeft `mirrored: [number, number]` (elk `0` of `1`).

| Flag            | Rol              | `0`                | `1`                |
|-----------------|------------------|--------------------|--------------------|
| `mirrored[0]`   | **Scharnier-einde** | start / muur-a   | eind / muur-b     |
| `mirrored[1]`   | **Zwaaizijde**    | −normaal (links)   | +normaal (rechts)  |

De **oriëntatie** komt volledig uit de muur-tekenrichting **a→b**
(`wallUnit`). De muurtekening bepaalt wat "links"/"rechts"/"start"/"eind"
betekent; `mirrored` draait alleen scharnier-einde en zwaaizijde om.

> Voorbeeld: een horizontale muur links→rechts geeft `s00 = [0,0]` =
> scharnier links (a) met boog boven. Dezelfde muur rechts→links getekend
> staat "op de kop": `s00` = scharnier aan a (=rechts). Dat zit al in
> `wallUnit`; geen extra logica nodig.

`+normaal` = `wallNormal` = rechtse normaal in schermcoördinaten (Y omlaag).

## Code

In `frontend/src/ui/components/fml-preview-doors.ts`:

- `resolveHingeAtStart(mirrored)` — `mirrored[0] !== 1` → scharnier aan start.
- `resolveSwingSign(mirrored)` — `mirrored[1] === 1` → `+1`, anders `-1`.
- `buildMirrored(hingeAtStart, swingRight)` — **inverse**, voor het SCHRIJVEN
  van `mirrored` bij het plaatsen van deuren/ramen. Zo blijft
  write → read → render consistent met Floorplanner.
- `SWING_NORMAL_SIGN` — conversie tussen zwaaiteken en `wallNormal`-richting.

## Door `kind` (data-gedreven)

Bepaald via `resolveOpeningCatalog` uit `opening-refid-catalog.json` veld `kind`,
niet via hardcoded refid-Sets.

| kind          | Weergave                                  |
|---------------|-------------------------------------------|
| `single`      | 90° blad + boog                           |
| `closet45`    | 45° blad + boog (kastdeur)                |
| `double_wide` | twee bladen, elk eigen scharnier/zwaaizijde |
| `sliding`     | schuifpui 2 delen + 2 pijlen naar elkaar  |
| `sliding_single` | schuifpui 2 delen + 1 pijl (links→rechts) |
| `sliding_pocket` | pocketdeur: 1 pijl (geen middenstreep)  |
| `passage`     | opening, geen blad                        |

Ramen: `single` / `multi` (paneel-count via catalogus-`panels`) / `round` / `half_round`.
Fixtures (keuken/sanitair/installaties): aparte catalogus `fixture-refid-catalog.json` — alleen display bij FML-import.

## Gap vs boog (kozijn-inset)

FML-viewer: **gap = volle `opening.width`**; boog/blad iets smaller via vaste
`swingInsetCm` per zijde uit de REF ID-catalogus (`swing_inset_defaults` of
per-entry override). Default draaideuren: **5 cm** per zijde. Niet uit gemeten
ref-framing — anders verschilt weergave per plattegrond.

## Schrijven (export / editor)

`buildFmlV3.ts` schrijft `op.mirrored ?? [0,0]` ongewijzigd door. De editor
moet bij het **plaatsen** van een deur `buildMirrored(hingeAtStart, swingRight)`
gebruiken op basis van de UI-keuze (scharnier-einde + zwaaizijde), zodat een
door de gebruiker geplaatste deur na export → Floorplanner.com import
identiek renderdt.

## Test-artefact

`examples/FML(test)/test-doors.json.fml` — 4 muren (hor/vert/links-diag/
rechts-diag) vanuit één junction, per muur 12 deuren (4×`single`,
4×`closet45`, 4×`double_wide`, elk met alle 4 `mirrored`-combo's `s00..s11`).
Labels `s00` etc. in de FML voor visuele verificatie in Floorplanner.com.

## Valkuilen (niet opnieuw maken)

- **Niet** `mirrored[0]`/`mirrored[1]` omgedraide rollen geven (oude bug:
  zwaaizijde en scharnier-einde zaten om — "1 en 4 omgedraaid, 2 en 3 goed").
- **Niet** hardcoded refid-Sets voor soorten; gebruik catalogus-`kind`.
- **Niet** de 45° `closet45` weghalen — dat is een echte Floorplanner-feature.
- **Niet** "area guided" logica of per-FML hacks; de regel hierboven is
  muur-richting-onafhankelijk en werkt voor alle wanden.
