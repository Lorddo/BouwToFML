# Clear height (1,50 / 2,00 m) + dakkapel

Intern referentiedoc bij de editor-feature (2026-09-11). Meetstaat-tab / NEN-tabellen blijven buiten scope.

## Formule

`poly.z` is de **onderkant** van de dakplaat (plafond), t.o.v. vloer-Z 0 van de actieve verdieping (niet `az.z` van een muur):

```
vrijeHoogte = dakplafondZ − liningCm
snedeZ      = floorZ0 + heightCm + liningCm
```

- `dakThicknessCm` = project/stack (`dakThicknessCmForPlan`) — plaatdikte in aanzicht (omhoog vanaf onderkant)
- `liningCm` = `area.liningCm` onder het samplepunt, anders **0**
- Clamp: `liningCm >= −dakThicknessCm` (negatief = bruikbare zone ruimer, tot in de dakplaat)
- Goot-Z mag tot `−slabThicknessCm` (onderkant vloerplaat)

## Sampler

`sampleCeilingRoofAtPoint`: ligt XY in een dormer → **kind-Z**; anders plane (min bij meerdere planes).

Bind (`bindFloorWallsToRoofs`) deelt dezelfde interpolatie; in dormer-voetafdruk schrijft `{ z: ouderZ, h: kindZ }`.

## Contour / bands

- Module: `frontend/src/core/fml/roof-clear-height.ts`
- Contour live; niet in `.plg`/`FML` schrijven
- Override-slot: `plan.roof.clearHeightOverride` (of options); leeg tot lijn-editor
- Fill = gebieden met vrije hoogte **onder** `heightCm` (onder de 1,50-lijn)
- Parent-fill zonder dakkapel-voetafdruk (geen overlap-arcering)
- Parent-snede wordt geknipt rond kindvlakken (lijn blijft naast/tussen)
- **Per-area `liningCm`:** snede-segmenten en fill worden geknipt op ruimtegrenzen (geen middenpunt over twee kamers)

## Weergave (Settings → Dak + topbar)

Twee lagen, zelfde patroon als het hulpraster:

| Laag | Waar | Wat |
|---|---|---|
| **Master** | Topbar (icoon `roof`, naast grid) | `showRoofOverlayOnPlan` (default aan): hele dak-overlay op de plattegrond |
| **Inhoud** | Settings → Dak | Wat er *in* die overlay zit |

Zichtbaar op de plattegrond alleen als master **en** de betreffende inhoud-vlag:

- dakvlak-omtrek ← `showRoofPlanesOnPlan` (default aan) — stippellijn `[12,6]`, hoofddak `#c4a36a` / dakkapel `#a67c52`, `listening: false`
- 1,50-lijn ← `showClearHeight150` (aan)
- 2,00-lijn ← `showClearHeight200` (uit)
- 1,50-arcering ← `showClearHeightPlanFill` (uit) + `clearHeightFillColor` (`#6366F1`)

Noklijn-display: `showRidgeDisplay` (default aan) — blijft Dak-tab, geen overlay op de plattegrond.

Dak-tab: volle vlakken; 1,50-fill uit dezelfde inhoud-vlaggen, **niet** via de master.

Teken-tool **Dakvlak** (`draw_roof`) op de verdieping (editor, niet inspect/stap-4). Schrijft `isRoof` + `roofKind` op het sibling Dak-design. Master gaat aan na plaatsen. Muur-tekenen snapt op dakvlak-randen (8 cm) als master én omtrek aan staan; Ctrl = uit. Converter stap 4: geen knop, geen overlay.

Buiten scope: nok-overlay op plattegrond; vertex-edit van dakvlakken op de verdieping.

## Persist

| Veld | Waar |
|------|------|
| `roofKind` / `roofParentId` | `FloorSurface` (.plg) |
| `liningCm` | `FloorArea` (.plg) |
| FML fallback | `settings.roofPlanes.kinds` (lossy als Floorplanner stript) |

Geen PLG-versiebump zolang er geen gebruikersbestanden in het wild zijn.
