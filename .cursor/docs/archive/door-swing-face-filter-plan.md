# Deuren — draaiboog face-filter (plan)

> **Status:** plan / ontwerp (nog geen implementatie)  
> **Datum:** 2026-07-17  
> **UI-plek:** stap 3 tab **Deuren** (bouwt op Gaten; is **geen** Gaten-mirror meer)  
> **Parent:** `.cursor/docs/opening-detection-brainstorm.md`  
> **Voorbeeld-refs:** o.a. `2D_3E-referentie-analyse` (deur #2 volle sector vs deur #3 ondiepere sector — beide geldig)

---

## 1. Doel

Op de Deuren-tab een **eerste kandidaat-laag** bouwen die plattegrond-faces selecteert die **potentieel een draaicirkel/sector** zijn — **afgestemd op de deur-ref die de tekenaar in stap 1 heeft getekend**.

Daarna (fase 2) per kandidaat de bijbehorende muur/opening zoeken. Die stap mag ook faces meenemen die Gaten ten onrechte als `outside` heeft gezet.

**Niet het doel van fase 1:** complete deurdetectie, FML-plaatsing, stroke-bogen, of “perfecte gaten”.

---

## 2. Harde regels (niet onderhandelen)

1. **Zoeken op basis van de ref** — band, aspect en “hoe ziet een boog eruit” komen uit de **getekende deur-ref(s) van dit project/deze tekening**, niet uit een globale aanname “deuren zijn ~90° en bijna vierkant”.
2. **Ondiepe draaicirkels niet laten vallen** — als de ref een ondiepe / platte sector toont, moet de filter die geometrie meenemen. Een ondiepe boog is geen “randgeval om te tolereren”; het is een **geldige stijl** wanneer de ref dat zegt.
3. **Verschillend per plattegrond** — 2D_3E #2 (bijna R×R) en #3 (ondieper t.o.v. kozijnspan) zijn beide `draaicirkel=ja`. Eén hardcoded ratio past niet op beide; de ref wel.
4. **Beide assen** — een kandidaat moet op **lengte én breedte** (bbox width **én** height) binnen de uit ref+schaal afgeleide px-band vallen. Geen “één zijde genoeg”.
5. **Schaal → px** — runtime werkt in pixels via `confirmedPixelsPerMillimeterX/Y` (of equivalent). Geen cm-vergelijkingen in de CV-filter; cm alleen als menselijke band om naar px te mappen (of als de ref zelf px levert).
6. **Multi-parent toegestaan** — deur-hypothesen mogen surfaces **delen** (overlap). Dit is **niet** de muur-`parentMap` (exclusief). Model = lijst hypothesen met `faceIds[]`.
7. **Dubbele deuren** — elke vleugel heeft eigen boog → elk eigen kandidaat; niet forceren tot één label.
8. **Stroke-bogen** — voorlopig **buiten scope** (aparte evidence later).

---

## 3. Waarom deze volgorde

| Observatie | Gevolg |
|------------|--------|
| Gaten (Solid L1 demote) houdt muren niet altijd perfect overeind | Deuren-fase 1 **niet** laten afhangen van perfecte gat-muurresten |
| Gevulde draaibogen zijn op refs redelijk stabiel te zien | **Eerst** swing-kandidaten lokaliseren |
| Muurstrook / opening koppelen is lastiger + moet fout-`outside` meenemen | **Daarna** fase 2 |

```text
Stap 1  Deur-ref(s) tekenen (+ schaal bevestigd)
Stap 3  Gaten = face-demote (context / onderlegger)
Stap 3  Deuren fase 1 = draaiboog-kandidaten (dit plan)
Stap 3  Deuren fase 2 = muur/opening aan kandidaten (later)
```

---

## 4. Input-data (bestaand)

### 4.1 Faces op de plattegrond

Zelfde room-CC als Muren / Gaten:

- `RasterRoomComponent`: `label`, `areaPx`, `bbox {x,y,width,height}`, `touchesBorder`
- `labelsData`, muur-`parentMap`, classificatie na Gaten (`surface` / `outside` / …)

Fase 1 startset (richting):

- Primair: faces die Gaten als **niet-outside** heeft gelaten (vloer/gat/sector-achtig).
- Optioneel later in fase 1: ook kleine `outside`-pockets meenemen als de ref dat eist — **niet** verplicht voor v1 van de filter.
- Fase 2 **moet** fout-bestempelde `outside` wél in de muur-controle betrekken.

### 4.2 Schaal

- `confirmedPixelsPerMillimeterX` / `Y` (na stap-1 schaalbevestiging).
- Conversie: `px = mm × ppm` (kies X, Y, of mid — vastleggen bij implementatie; default: mid van X/Y).

### 4.3 Deur-ref (bron van waarheid voor vorm)

Uit stap-1 deur-LBE + `cv/refs` (o.a. `OpeningRefPrimitives`, `faceProfile`, unit faces):

| Signaal | Gebruik |
|---------|---------|
| `draaicirkel: true` | Deze filter is van toepassing; zonder draaicirkel → ander pad (later / skip fase 1) |
| Swing-sector face(s) in ref | **Bbox width/height**, aspect, eventueel area/compactness als prior |
| Kozijnspan / openingbreedte in ref | Context voor fase 2 (R ≈ opening); fase 1 gebruikt vooral **sector-bbox** |
| Meerdere deur-refs | Aggregatie: unie of per-ref clusters (voorkeur: band ruim genoeg voor alle refs met `draaicirkel`) |

**Afleiden uit ref (concept):**

```text
refSwingFaces = faces in deur-ref die als draaisector scoren
  (zelfde idee als detectDoorSwingSector / grootste geschikte sector-vlak —
   niet “grootste wit vlak = buiten”)

refW = bbox.width  van ref-swing (of mediaan over refs)
refH = bbox.height van ref-swing

aspectRef = max(refW, refH) / min(refW, refH)

// Absolute deur-grootteband in mm → px via schaal
// (typische fysieke deur 400–1200 mm; dit is een hard plafond/vloer,
//  géén vervanging van ref-aspect)
minDoorPx = 400 * ppm
maxDoorPx = 1200 * ppm

// Relatieve tolerantie rond de ref-bbox (per as), bv. ±25–40%
// Exacte % bij implementatie tunen op 2D_3E + BouwTek
sizeTol = …
aspectTol = …   // mag ondiepe ref (hoge aspectRef) niet platslaan naar ~1.0
```

**Kandidaat-accept (fase 1):**

```text
face is kandidaat als:
  minDoorPx ≤ bbox.width  ≤ maxDoorPx
  én
  minDoorPx ≤ bbox.height ≤ maxDoorPx
  én
  aspect(face) ligt bij aspectRef binnen aspectTol
  én (optioneel) area/compactness niet absurd t.o.v. ref
```

Zo blijft een **ondiepe ref** een **ondiepe zoekband** (aspect ≫ 1 toegestaan). Een **volle kwartcirkel-ref** zoekt dichter bij vierkant. Geen aparte “drop shallow”-tak.

---

## 5. Multi-parent / clustering

- Faces die alleen te klein zijn maar **buren** vormen waarvan de **union-bbox** wél voldoet aan de ref-band + aspect → één hypothese met meerdere `faceIds`.
- Een face mag in **meerdere** hypothesen (overlap / geneste radii / hoekdeuren).
- Geen merge terugschrijven naar muur-`parentMap`.

```text
DoorSwingHypothesis = {
  id
  faceIds: number[]      // multi OK; overlap tussen hypotheses OK
  unionBBox
  score                 // nabijheid tot ref-aspect / ref-size
  source: 'single' | 'cluster'
}
```

---

## 6. UI / workspace

| Tab | Rol |
|-----|-----|
| **Gaten** | Face-demote + overlay (bestaand); levert context |
| **Deuren** | Eigen pipeline: swing-filter + overlay van hypotheses; **niet** kopie van Gaten-output |
| **Ramen** | Later; rest na deuren |

Onderlegger mag muur-B/W blijven; overlay toont alleen swing-kandidaten (kleur/transparantie). Review/override mag later; niet nodig voor eerste filter-ship.

---

## 7. Fasen

### Fase 1 — Draaiboog-kandidaten (nu)

**Done when:**

- Deuren-tab toont eigen kandidaten i.p.v. Gaten-mirror.
- Band/aspect uit **deur-ref + schaal**; geen hardcoded “alleen ~90° / ~vierkant”.
- Ondiepe ref-bogen worden **niet** systematisch weggefilterd.
- Beide bbox-assen moeten in de px-band vallen.
- Multi-parent hypotheses mogelijk (minimaal: single-face + eenvoudige neighbor-cluster).
- Tests: synthetische faces + regressie op ref-afgeleide aspect (volle vs ondiepe fixture).

**Niet in fase 1:** muur koppelen, FML, stroke, exclusive face ownership.

### Fase 2 — Muur aan kandidaat (later)

Per swing-hypothese:

- Zoek aangrenzende muur / opening-interval (L10 of muur-faces).
- Betrek ook faces die Gaten als `outside` zette maar geometrisch bij de boog horen (fout-demote).
- Score: openingbreedte ↔ R / ref-kozijnspan; bladlijn later.

---

## 8. Wat we bewust níet doen

| Anti-pattern | Waarom |
|--------------|--------|
| Globale “alleen bijna-vierkant = deur” | Doodt ondiepe refs |
| Ondiepe bogen “als false positive laten vallen” | Ref zegt dat ze bestaan |
| Alleen cm hardcoden zonder ref-aspect | Mist tekenstijl per plan |
| Afhankelijk van perfecte Gaten-muurdemote voor fase 1 | Gaten is daarvoor te fragiel |
| Exclusive parentMap zoals muren | Overlap van deuren nodig |
| V1 archive full-image template als primary | Zie opening-detection-brainstorm |

---

## 9. Relatie tot bestaande code / docs

| Stuk | Relatie |
|------|---------|
| `useWorkspaceGapsFaces` | Gaten (+ nu nog Deuren-mirror) — Deuren splitst hier vanaf |
| `RasterRoomComponent` / room-classify | Face bbox + area bron |
| `cv/refs` + `detectDoorSwingSector` | Ref-swing metrics / `draaicirkel` |
| `useHScaleCalibration` | ppm → px-band |
| `opening-detection-brainstorm.md` | Overall opening-architectuur; dit plan = **concrete fase-1 Deuren** |
| Gaps `ref-face-size-cap` | Area-cap t.o.v. opening-ref — **niet** vervangen door dit; ander concern |

---

## 10. Open implementatiekeuzes (kort)

Vast te leggen bij code, niet blocker voor dit plan:

1. Exacte `sizeTol` / `aspectTol` en of X/Y-ppm mid of max.
2. Of fase-1 startset strikt non-outside is of al een subset outside meeneemt.
3. Neighbor-definitie voor clusters (8-connect via gedeelde rand / bbox-gap ≤ N px).
4. Meerdere deur-refs: één gecombineerde band vs per-ref parallelle filters.

---

## 11. Samenvatting

1. Deuren-tab: **draaiboog eerst**, ref-gestuurd.  
2. **Beide** bbox-assen in schaal→px band.  
3. **Aspect uit de ref** — ondiep blijft ondiep; nooit “ondiep droppen”.  
4. Multi-parent hypotheses.  
5. Muur + fout-`outside` = **fase 2**.  
6. Stroke later.  
7. Per plattegrond anders, omdat de **ref** anders is.
