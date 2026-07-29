# Deur- en raamdetectie — brainstorm & richting

> **Status:** brainstorm / werkrichting (nog geen implementatiebesluit in code)  
> **Datum:** 2026-07-14  
> **Scope:** deuren eerst (meeste ruis); ramen als vervolg op rest-gaten; specials (kale opening, schuif) bewust later  
> **Context:** walls-only V3 (L10) is de actieve muurpipeline; oude opening-code staat in `frontend/src/archive/openings/**` en is **geen** uitgangspunt voor deze aanpak  
> **Vervolg (2026-07-17):** concreet Deuren fase-1 plan → [`.cursor/docs/door-swing-face-filter-plan.md`](./door-swing-face-filter-plan.md) (ref-gestuurde draaiboog face-filter; ondiepe bogen niet droppen)

Dit document vat het ontwerpgesprek samen: wat algoritmisch kan, wat niet, en welke ontwikkelvolgorde we aanhouden.

---

## 1. Probleem (waarom niet V1-achtig)

- V1/archive: vooral full-image template/pixel-match + gap-hybrid; boog was slechts een ja/nee-flag (`HoughCircles` in ROI).
- Resultaten waren **niet consistent** over tekenstijlen.
- Huidige werkwijze is anders: room-first faces → ink → **V3 L10** muren als structurele waarheid.
- Globaal cirkels zoeken faalt op: overlappende bogen, verschillende radii, lijnen door bogen, aliasing, filled vs stroke-symbolen.

**Besluit:** V1 opening-pad niet als blauwdruk hergebruiken. Nieuwe aanpak bouwt op **muren eerst + lokale opening-evidence**.

---

## 2. Kernarchitectuur

### 2.1 Twee maskers, twee jobs

Het finalize-muurmasker is bewust “dicht” (ink-resolve, close, corridor) — goed voor skeleton/L10, slecht om openingen te zien.

| Bron | Rol |
|------|-----|
| L10 / semantic muren | Waar de muur *hoort* te lopen (as + dikte); **niet breken** door deur/raam |
| Opening-preprocess (eigen B/W, lichter dan muren) | Waar kozijn/blad/boog-inkt zichtbaar blijft |
| Diff | Muurmodel verwacht inkt, opening-laag heeft onderbreking / opening-symbool → **gat-kandidaat** |

Opening-mask kan starten vanuit Otsu of onderlegger, maar hoort als **eigen tune** (stap 2), analoog aan muur-B/W. Minder close/thicken dan muren, anders belichten kleine bogen weg.

### 2.2 Geometrie vs semantiek vs export

| Laag | Wat | Mag “breken”? |
|------|-----|----------------|
| **Geometrie (L10)** | Doorlopende muurassen | Nee |
| **Semantiek (stap 3 review)** | “Hier zit een opening” (kleur/tag) | Ja — annotation, geen topologie-break |
| **Export (L11 deuren / L12 ramen)** | Opening op muur (`t`, `width`, type, mirrored) | Plaatst *op* L10 |

**Besluit:** deur/raam in voordetectie = andere kleur op of langs de muur (en optioneel sector-overlay). L10 blijft heel. L11/L12 plakken openingen achteraf.

### 2.3 Overlap van draaisectoren

Bij muren: faces exclusief (één label per pixel).  
Bij deuren: **vlakken/sectoren mogen dubbel gebruikt worden** (dubbele deuren, hoekdeuren met geneste radii).

- Review-model = lijst **deur-hypothesen** (scharnier, straal, sweep, muur-interval), niet exclusive face-ownership van de sector.
- Muurstrook-labels per subinterval mogen wel exclusief zijn; sector-overlay is uitleg.

---

## 3. UX-flow (richting)

```text
Stap 1  Onderlegger (+ refs: muur, later deur/raam)
Stap 2  Voorbewerking (muur-B/W + opening-B/W; afgestemd op ref-stijl)
Stap 3  Voordetectie + manual check/override (muren én openingen)
Stap 4  Resultaat / FML
```

- Refs vroeg (stap 1): tekenstijl en preprocess sturen; niet per se full-image template-scan in stap 3.
- Stap 3: tekenaar kan muur-, deur- en raamvoorslag verbeteren (zelfde feedback-loop als face-correctie nu).
- Visualisatie:
  - **Source of truth:** gekleurde muurstrook (blauw deur / paars raam) — selecteerbaar/editbaar.
  - **Uitleg (toggle):** sector/cirkelvlakken meekleuren, semi-transparant, overlap toegestaan.

---

## 4. Algoritmische bouwstenen

### 4.1 Gat → schaal (sterkste prior)

```text
gatbreedte W ≈ deuropening ≈ straal R (enkel)
dubbel in één gat → vaak R ≈ W/2 per vleugel, of twee subgaten
hoek: vaak twee gaten (H-muur + V-muur), elk eigen W → eigen R
```

- Absolute maat komt uit het **gat** (en schaal px/mm), niet uit één globale template-maat.
- Sectoroppervlakte `A ≈ (sweep/2)·R²` is een **score**, geen primaire meter.
- Ref op 80 cm-deur schaalt naar 85 cm via `s = W/W_ref`; features normaliseren op `R` of `W` (`A/R²`, sweep, bladlengte/`R`). Absolute px-oppervlakte niet overdragen.

### 4.2 Deur-signatuur (lijncompositie)

Kenmerkend voor draaideur:

1. **Eén haakse lijn** op het gat (blad): vanuit scharnier, ≈ loodrecht op muur, lengte ≈ `R`.
2. Bij draaibogen: **boog die terugkomt naar het gat** (strikant / andere openingseinde).
3. Optioneel: kozijnblokjes als eindankers van het gat.

Dit onderscheidt deuren beter van ramen dan face-oppervlakte alleen.

### 4.3 Sweep / tekenstijl

| Stijl | Evidence |
|-------|----------|
| Gevuld kwartvlak | Sector-face / ink-dichtheid in ROI |
| Lijnboog (stroke) | Contour/RANSAC in sector-ROI; faces vaak nutteloos (boog snijdt parallelle muurlijnen) |
| ~90° | Default-hypothese |
| ~30° ondiep | Zelfde `R` uit gat; kortere sweep; makkelijker “wegbelicht” → lichte preprocess + blad+korte-boog score |
| Geen boog | Later (schuif / kale opening) — buiten huidige scope |

**Face-shape alleen** is onbetrouwbaar bij stroke-over-hatch. Beter: **hypothese-ROI** (kwartcirkel uit scharnier + `R`) en daarin inkt/rand/blad scoren.

### 4.4 Multi-signaal score (niet één detector)

Per gat-kandidaat hypothesen ranken, o.a.:

- Gat (muurmodel vs opening-B/W) → waar + `W` → `R`
- Haakse bladlijn (Hough/vector)
- Boog-fit / sector-inkt
- Kamerzijde uit face-labels (zoekrichting)
- Ref-stijl als prior (niet als enige bron)
- Kozijnblokjes als eindpunten

Hypothesen mogen overlappen; beste set behouden + UI-override.

### 4.5 Samengestelde openingen

Niet één label op een breed interval, maar **parsen**:

```text
breed gat / muur-interval
  → subintervallen (stijl, blokje, verticale inkt)
  → per stuk: deur-scorer vs raam-scorer
  → composities als voorstel: [deur], [deur|deur], [raam], [raam|deur], …
```

Rest na deur-filter → raam-kandidaten (kozijnstijlen / clustering).

### 4.6 Wat níet als primary

- Globale onbegrensde `HoughCircles`
- Exclusive face-classifier zoals bij muren voor alle deurstijlen
- Full-image template-scan als enige recall-pad
- Absolute face-oppervlakte “zelfde als ref” zonder normalisatie
- Gat zoeken in het dichte finalize-muurmasker

---

## 5. Rol van referenties

### 5.1 Vroeg (stijl / 4light) — wél vóór of tijdens gaten

Uit muur- (+ deur/raam-)refs op het origineel, nog zonder volledige ontleding:

- Muur: solid vs parallel/open → hoe gaten gedefinieerd worden
- Deur: zie **§5.5** (opening-primitives + draaicirkel; geen muurdikte-stap-1)
- Raam: zie **§5.4** (primitive lijst; geen muurdikte-stap-1)
- Preprocess-agressie (opening-laag lichter houden als bogen dun zijn)
- Gap-policy (blokjes als einden, beide parallelle lijnen bij open walls)

**Besluit:** refs in stap 1 helpen al bij **localiseren van gaten**, niet pas bij ranking.

### 5.2 Laat (full match / fase 5)

- Genormaliseerde shape/lijn/oppervlakte-features uit ontleed ref-model
- Scoren van gevonden gaten tegen die modellen
- 80 cm-ref → 85 cm via schaal `W`/`R`

### 5.3 Wat ref níet hoeft

- Elke deurafmeting als apart template
- Globale multi-scale pyramid-scan over heel beeld (tenzij later als tie-break in ROI)
- Exacte kozijnmaat in px/mm (alleen indicatie via primitives)
- Koppeling deur-/raam-ref ↔ `referenceWallThicknessPx` uit stap 1 (meerdere muren/stijlen; opening ≠ gemeten muur; muur-ref niet bruikbaar voor afscheiding in de crop)

### 5.4 Raam-ref ontleding — primitives (afgesproken)

LBE-selectie mag een stukje muur mee hebben; dat is OK. Doel is **niet** een pixel-perfect “puur raam”-crop, maar een korte feature-lijst uit de crop zelf.

**Niet gebruiken:** muurdikte / muurstijl uit stap-1 muur-ref. Alle signalen komen uit de **raam-LBE** (en later uit het gat-ROI bij match).

**Primitive model (voldoende):**

| Feature | Type | Betekenis |
|---------|------|-----------|
| `kopeinde` | yes / no | Zijn eindkozijnen (koppen) getekend aan de openinguiteinden? |
| `parallelLinesBetweenHeads` | `#` (int) | Aantal parallelle lijnen **tussen** de kopeinden (glas/sash / body van het raam) |
| `parallelLinesRef` | `#` (int) | Aantal parallelle lijnen in de **ref als stijlkenmerk** (zoek-/cluster-signature) |

```text
raam-LBE (+ optioneel muurrest)
  → kopeinde: yes|no
  → parallelLinesBetweenHeads: N
  → parallelLinesRef: M
```

**Gebruik:**
- **4light:** `kopeinde` stuurt gap-einden; lijn-tellingen sturen “wel/geen tussenstijlen” / preprocess-prior.
- **Fase 3 / 5:** zoeken en scoren in rest-gaten op dezelfde primitives (geen full-window multi-scale template als primary).
- Exacte kozijnbreedte/diepte: bewust **niet** in dit model; later alleen als optionele ratio als nodig.

**UI:** één raamvak blijft genoeg; geen handmatige “muur eruit gummen”. Optioneel later: tweede klik als kop ≠ tussenstijl — niet in dit primitive-minimum.

### 5.5 Deur-ref ontleding — primitives (afgesproken)

Zelfde uitgangspunt als ramen: LBE mag muurrest meenemen; **geen** “puur deur”-crop verplicht; **geen** stap-1 muur-ref voor afscheiding. Basis = dezelfde opening-primitives als §5.4, plus draaicirkel-features.

**Primitive model (voldoende):**

| Feature | Type | Betekenis |
|---------|------|-----------|
| `kopeinde` | yes / no | Zijn eindkozijnen (koppen) getekend aan de openinguiteinden? |
| `parallelLinesBetweenHeads` | `#` (int) | Aantal parallelle lijnen **tussen** de kopeinden (opening-body / kozijnprofiel) |
| `parallelLinesRef` | `#` (int) | Aantal parallelle lijnen in de **ref als stijlkenmerk** |
| `draaicirkel` | yes / no | Is er een draaicirkel / boog (stroke of gevuld) getekend? |
| `draaicirkelGraden` | `#` (int) | Indicatieve sweep in graden (bijv. ~90, ~30); alleen relevant als `draaicirkel` = yes |

```text
deur-LBE (+ optioneel muurrest)
  → kopeinde: yes|no
  → parallelLinesBetweenHeads: N
  → parallelLinesRef: M
  → draaicirkel: yes|no
  → draaicirkelGraden: D   (indien draaicirkel=yes; anders weglaten / 0)
```

**Gebruik:**
- **4light:** `draaicirkel` + graden → filled vs stroke / ~90 vs ~30 prior; preprocess lichter houden bij dunne bogen; `kopeinde` → gap-einden.
- **Fase 2 / 5:** deur-scorer in gaten (blad + optioneel boog-ROI); primitives als stijlprior / ranking, niet als enige detector.
- Bladlijn (haakse lijn) blijft algoritmische evidence in het gat (§4.2); hoeft niet als aparte ref-primitive zolang `draaicirkel`+opening-lijnen genoeg discriminatie geven.

**UI:** één deurvak genoeg; geen handmatige muur-eruit-gum. Schuif / kale opening zonder boog: later (`draaicirkel` = no is al een haak).

---

## 6. Ontwikkelvolgorde (afgesproken richting)

Onderscheid **stijlprior** vs **volledige model-match**:

```text
Refs tekenen (stap 1: muur + optioneel deur/raam)
  → 4light: tekenstijl afleiden
  → preprocess + gap-policy afstemmen
  → 1:  alle gaten consistent lokaliseren (stijlgevoelig)
  → 2:  deuren uit gaten filteren (lijncompositie + stijlprior)
  → 3:  raamindelingen in rest-gaten (kozijnstijlen)
  → 5:  gaten testen/ranken tegen ontlede ref-modellen
```

Numerieke lezing die we aanhouden: **`1 (start) → 4light → 1 (af) → 2 → 3 → 5`**, oftewel gebruikersformulering **`1 → 4 → 2 → 3 → 5`** met afspraak dat 4 vroeg = stijl voor gaten, en full match = 5 laat.

**Fase 0 (UI-shell, 2026-07-14):** stap-1 deur/raam-refs + snapshot; stap 2 tabs OCR / Muur / Int muur (Otsu read-only) / Gaten (`gapsLayer` tune); stap 3 tab Gaten = read-only muur-mirror. Nog geen gat-algoritme.

**Solid L1 face-demote (2026-07-14):** stap 3 Gaten = zelfde room-faces als Muren; `gapsLayer` (zwart=muur) demoteert muurvlakken → `outside` (zoals Otsu ink-coverage, omgekeerd). Vloeren/gaten blijven gekleurd. `frontend/src/cv/gaps/` engines + `policies/solid`. Geen L10; wel Muren-classify. Geen `tabOutputs.gaps`. Alleen Solid (hardcoded).

~~**Solid L1 mask-cut (2026-07-14):** pixel residual wall-cut — vervangen door face-demote.~~

**Niet:** `5` helemaal vooraan (niets te matchen zonder gaten).  
**Wel:** stijl vooraan.

### Fase-definition of done (richting)

| Fase | Klaar als |
|------|-----------|
| Gaten | Stabiel op meerdere tekeningen; pinholes eruit; solid + open walls; breedte ≈ echt |
| Deuren | Enkele/dubbel/hoek via blad±boog; overlap toegestaan; geen L10-break |
| Ramen | Rest-intervallen → stijlcluster-voorstel |
| 4light | Stijl stuurt preprocess/gap-policy merkbaar |
| 5 full | Genormaliseerde ref-score verbetert ranking; override blijft |

### Bewust later

- Schuifdeuren, kale openingen zonder deur
- Perfecte auto-recall op alle ondiepe 30°-kastjes
- Harde auto-composities raam+deur (eerst voorstel + review)
- Visuele deurstijl per makelaar (bestaande V2-roadmap)

---

## 7. Pipeline-lagen (conceptueel)

```text
… → L10 fmlReady muren (ononderbroken)
    → L11 deuren (gap + lijn/boog-score + review-tags)
    → L12 ramen (rest-gaten + kozijnclustering)
```

Namen L11/L12 zijn werklabels; exacte module-indeling volgt bij implementatie.

---

## 8. Voorbeelden die de brainstorm stuurden

Observaties uit gedeelde crops (niet als golden tests vastgelegd):

- Gevulde sector-faces vs lijnbogen; ruis/blob op boog.
- Twee deuren met geneste/overlappende radii op een hoek — exclusive faces onmogelijk.
- Rij ondiepe ~30°-bogen naast één 90°-hoekdeur; dubbele vleugels die naar elkaar zwaaien.
- Boog die door parallelle muur-/kozijnlijnen snijdt → faces splitsen; blad + boog-ROI blijft bruikbaar.
- Kozijnblokjes als gat-einden.

---

## 9. Relatie tot bestaande docs

| Document | Relatie |
|----------|---------|
| `.cursor/docs/workspace-flow.md` | Huidige 4-stappen; stap 3 heeft Deuren/Ramen UI-shell (nog leeg) |
| `.cursor/docs/decisions.md` | Oudere detectievolgorde openingen→muren; deze brainstorm **heroverweegt** naar muren→openingen voor classical CV + L10 |
| `.cursor/docs/google-ai-cv-consultatie.md` / archive openings | Historische template/gap-ideeën — referentie, geen verplicht pad |
| `.cursor/docs/floorplanner/door-mirrored-semantics.md` | Export/preview `mirrored` — ná detectie relevant |
| `.cursor/docs/fml-layer8-conversion-plan.md` | Muren→FML; openingen haken later op wall `openings[]` |

Bij implementatie: `decisions.md` bijwerken als muren→openingen + L11/L12 formeel wordt vastgelegd.

---

## 10. Samenvatting beslissingen

1. **Niet** V1 full-image opening-detectie als basis.
2. **Muren eerst (L10 heel)**; openingen als annotation + L11/L12 plaatsing.
3. **Eigen opening-B/W** (lichter); gaten = diff t.o.v. muurmodel, niet t.o.v. dicht finalize-masker.
4. **Gatbreedte → R**; ref schaalt via normalisatie, niet via gelijke px-oppervlakte.
5. **Deur** = haakse bladlijn + (indien aanwezig) boog terug naar gat; overlap van sectoren toegestaan.
6. **Raam** = na deur-filter, kozijnstijlen in rest-(sub)gaten.
7. **Refs vroeg** voor tekenstijl/preprocess/gap-policy; **full match laat**.
8. **Voordetectie in stap 3** met override; muurstrook = truth, sector = uitleg.
9. **Ontwikkelvolgorde:** stijl-light → gaten stabiel → deuren → ramen → ref-ranking.
10. Specials (schuif, kale opening) en perfecte 30°-recall: later.
11. **Raam-ref primitives:** `kopeinde` yes/no + `#` parallel tussen koppen + `#` parallel ref; **geen** stap-1 muurdikte.
12. **Deur-ref primitives:**zelfde opening-basis als raam + `draaicirkel` yes/no + `draaicirkelGraden` `#`; **geen** stap-1 muur-ref voor afscheiding in de crop.

---

## 11. Referentie-extractie (2026-07-14) — interview + extract-only

**Scope:** info uit stap-1 refs halen + HTML-devtool. Geen gat-detectie / match / Floorplanner.

### Interview-antwoorden

| # | Keuze |
|---|--------|
| 1 Primitives | **A** auto uit de crop |
| 2 B/W | **A** lokaal Otsu op onderlegger-crop |
| 3 Multi-opening | **A** auto-split; kozijnen detecteren indien aanwezig → unit-crop **kozijn→kozijn** (beide koppen mee) |
| 4 Type=profiel | **A** elk LBE = eigen exportsectie; multi-unit = subsections |
| 5 Vlakken | **één label per wit vlak** (gescheiden door inkt); exclusive faces, geen overlap |
| 6 Trigger | **A** expliciete knop «Exporteer referentie-analyse (HTML)» |

### Code

- `frontend/src/cv/refs/**` — blob / lijn / vlak / primitives / muur `renderStyle`
- `frontend/src/platform/export/reference-analysis-report.ts` — self-contained HTML + embedded PNG’s
- UI: **Debug-sidebar** knop → `exportReferenceAnalysis` (ook zichtbaar op stap 1)

### Iteratie 2026-07-14 (na 2D_3E HTML)

- Crops **rechtzetten** naar horizontaal vóór analyse
- Alleen **grootste ink-blob**; restjes weg
- Units via **kozijn-posts** (post→post = 1 opening met beide koppen)
- Lijnprofiel = **ruwe ink-lijnen** (`extractInkLineSegments` / zelfde pad als muur raw-ink) — géén left/top-only polish
- Ref-crop polariteit: **nooit** inverteren op majority-dark (solid muur bleef anders wit → valse parallel)
- Muur: ink-fractie ≥35% → force **solid** + dikte uit ink-band
- Draaicirkel uit ruwe diagonalen / sector-inkt
