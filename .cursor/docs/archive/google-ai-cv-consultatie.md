# Externe consultatie – CV-patroonherkenning (Google AI)

> **Bron:** gesprek geëxporteerd naar `googleAI.txt` (juni 2025).  
> **Doel:** referentie voor BouwToFML — klassieke Computer Vision (geen AI), train-by-example per tekening.

---

## Samenvatting

Een extern gesprek over het omzetten van bouwtekeningen naar vectoren via **deterministische patroonherkenning** (OpenCV). Kernideeën:

- **2–3 voorbeelden per elementtype** per tekening volstaat (template matching + muurdikte)
- **Client-side** OpenCV.js (WASM) voor instant feedback zonder serverbelasting
- **Gelaagde pipeline:** eerst voorbewerking (B&W) → deuren/ramen (templates + masking) → muren (lijnen)
- **Interactieve feedback-loop:** tekenaar ziet direct wat herkend is en vult gaten aan
- **Anisotropische schaal** (X/Y apart) voor scan/printfouten
- **Doel:** ~30 min → ~2 min per tekening (ruim boven de 30–50% tijdwinst)

---

## Context & schaal

| Parameter | Waarde |
|-----------|--------|
| Gebruikers | ~50 tekenaars |
| Volume | ~40.000 tekeningen/jaar (~160/dag) |
| Output | Vector — in BouwToFML: **FML JSON v3** (cm), niet het generieke JSON uit het gesprek |
| Platform | Webapplicatie, berekening in de browser |

---

## Voorbewerking (BouwToFML)

Vóór kalibratie en detectie: tekening opschonen tot **zwart-wit** werkbasis (vlekken, kleur, ruis, rotatie). Alle CV-stappen draaien op deze opgeschoonde afbeelding. Dit staat los van het Google AI-gesprek (daar werd schaal tijdens opschoon genoemd) maar sluit aan op dezelfde gedachte: eerst een schone rasterbasis, dan herkenning.

---

## Belangrijke correctie: geen AI

Het gesprek begon met AI/few-shot terminologie; dat was **niet** de bedoeling. De aanpak is puur **klassieke CV**:

- Template matching (pixelcorrelatie)
- Feature matching (ORB/SIFT) als alternatief
- Hough line transform
- Morfologische operaties (erode/dilate)
- Wiskundige vector-intersecties voor hoeksnapping

Geen trainingsset, geen neurale netwerken.

---

## Methode 1: Deur- en raamherkenning (Template Matching)

Deuren en ramen zijn vaste symbolen (CAD-blocks) — één voorbeeld kan al volstaen; 2–3 voorbeelden dekken rotatievarianten.

### Logica

1. **Template opslaan** — tekenaar selecteert symbool; software slaat uitsnede op als matrix
2. **Varianten genereren** — automatisch roteren, spiegelen en schalen (niet handmatig per variant)
3. **Scannen** — templates over tekening schuiven; correlatiescore (bijv. `TM_CCOEFF_NORMED`); drempel ~85%
4. **Masking** — gevonden deuren/ramen witgummen op werkkopie vóór muurdetectie

### Snelheid

| Stap | Tijd |
|------|------|
| Template extractie | Direct (0 ms) |
| Template matching | 50–500 ms per tekening (resolutie-afhankelijk) |

### Multi-scale, rotatie & spiegeling

> **Status:** onderstaande waarden zijn **startpunten uit het gesprek** — geen vaste beslissing. In de POC vergelijken we varianten op snelheid, recall en aantal tekenaar-klikken. Zie [Te testen: rotatiestrategie deuren](#te-testen-rotatiestrategie-deuren) en [Te testen: raamherkenning](#te-testen-raamherkenning).

**Deuren (referentie — optie A)**

| Parameter | Waarde |
|-----------|--------|
| Rotatie | Elke **45°** (0°, 45°, … 315°) |
| Spiegeling | Horizontaal per rotatie (openslagrichting) |
| Schaal | **80%–120%** (stappen van ~5%) |

→ ~8 rotaties × 2 spiegels × 9 schalen ≈ **144 varianten** per deurtemplate.

**Ramen (referentie — optie A: heel raam)**

| Parameter | Waarde |
|-----------|--------|
| Spiegeling | Niet nodig (symmetrisch) |
| Schaal | **50%–150%** |

### Performance: pyramide-scannen

Bij veel varianten niet 144× volledige resolutie scannen:

1. Tekening verkleinen naar ~25% (`cv.pyrDown`)
2. Snel grove kandidaat-locaties vinden
3. Alleen op kandidaten full-res match uitvoeren

→ Met ~144 varianten blijft totale tijd ~1–2 seconden. Bij **5°-stappen** (1296+ varianten) is pyramide-scannen **onvoldoende** — zie rotatiestrategie hieronder.

---

## Te testen: rotatiestrategie deuren

### Waarom niet standaard 5°-stappen?

| Strategie | Templates (1 voorbeeld) | Verwacht gedrag |
|-----------|----------------------:|-----------------|
| **45°** + spiegel + schaal | ~144 | Instant met pyramide (~1–2 s) |
| **5°** + spiegel + schaal | ~**1.296** | Merkbare vertraging op grote/resolutie-tekeningen; breekt “instant” flow |

5°-stappen zijn **wiskundig mogelijk**, maar waarschijnlijk te zwaar voor de live feedback-loop. **Uittesten** of 45° + 2e voorbeeld volstaat vóór 5° ooit in scope komt.

### Optie A — Vaste hoeken (45°)

Eerste (en eventueel tweede) voorbeeld → automatisch roteren per 45°, spiegelen, schalen 80–120%.

- **Pro:** Weinig templates; snel
- **Con:** Schuine deuren (erker, schuine gevel) missen tenzij toevallig op 45°-multiples

### Optie B — Fijne hoeken (5°)

Alle rotaties 0°–355° per 5° + spiegel + schaal.

- **Pro:** Geen extra klik voor schuine hoeken
- **Con:** ~1.296 templates/voorbeeld; waarschijnlijk te traag zonder merkbare vertraging

### Optie C — Haakse loop + 2e voorbeeld schuin *(hypothese: ergonomisch beste)*

Gebaseerd op patroon in bouwtekeningen: ~95% deuren haaks (0°, 90°, 180°, 270°); schuine deuren delen vaak **dezelfde schuine hoek** (bijv. 30° of 45°).

**Standaard loop (1e klik):**

- Alleen **0°, 90°, 180°, 270°** + schaalstappen + spiegeling
- ~4 × 2 × 9 ≈ **72 templates** → verwacht **< 300 ms** scan

**Schuine loop (2e klik, indien nodig):**

- Tekenaar ziet gemiste schuine deuren (grijs) → klikt **één schuin voorbeeld**
- Software leidt **basishoek** af uit dat voorbeeld
- Roteert **datzelfde template** ook met **90°-stappen** vanaf die hoek  
  (voorbeeld op 30° → zoek ook 120°, 210°, 300°)
- Geen scan over 5°, 10°, 15°, … — alleen relevante hoeken

**Pro:** 2 klikken dekt typisch alle deuren; geen template-explosie  
**Con:** Tekenaar moet schuine missers actief aanwijzen (past in bestaande feedback-loop)

### POC-vergelijking deuren

| Meting | Optie A (45°) | Optie C (90° + 2e schuin) | Optie B (5°) |
|--------|:-------------:|:-------------------------:|:------------:|
| Templates (1 klik) | ~144 | ~72 | ~1.296 |
| Scan-tijd (richtlijn) | < 1 s | < 300 ms | ? (verwacht > 2 s) |
| Recall haakse deuren | | | |
| Recall schuine deuren | | | |
| Gem. tekenaar-klikken | | | |

**Besluit na POC:** welke combinatie haalt 80% recall met acceptabele snelheid en minste klikken.

---

## Te testen: raamherkenning

Ramen wijken af van deuren: symmetrisch (geen spiegeling nodig), **enorme breedtevariatie** (toiletraam tot schuifpui).

### Optie A — Heel raam-template + schaal 50–150%

Template matching op volledige raamrechthoek; schaalstappen 50%–150%.

- **Pro:** Eenvoudig; één selectie
- **Con:** `cv.resize` verdikt ook lijnen → bij grote schaalverschil faalt correlatie (lijndikte matcht niet meer)

### Optie B — Kozijnstijl-template *(hypothese: robuuster)*

Zoek niet het hele raam, maar **herhaalde kozijnstijlen** (kop óf tussenstijl — op tekeningen vaak **geometrisch identiek**: parallelle lijnen loodrecht op gevel).

**Stappen:**

1. Tekenaar selecteert **één stijl** (verticale kop, horizontale kop, of tussenstijl)
2. Template match (+ rotaties haaks/schuin via deuren-strategie) → alle stijlen oplichten als losse punten
3. **Geometrische clustering:**
   - Stijlen op **één lijn** (zelfde richting, collinear) groeperen
   - Tussenliggende afstanden meten
   - Afstand **> drempel** (bijv. 2,5–3 m in werkelijke schaal) → nieuw raam; anders zelfde raam
4. **Samenvoegen:** buitenste stijlen van een groep = raam begin/eind; tussenliggende stijlen = pane-indeling (2-/3-/5-delig)

**Koppen dubbel gebruiken:** ja — hetzelfde stijl-template matcht linker kop, rechter kop én tussenstijlen. Dat **vermindert** template-count; het script bepaalt rol (buiten/tussen) uit positie in de groep.

**UI:** alle stijlen oplichten → software tekent **magenta balk** van eerste naar laatste stijl per groep (hele driedelig raam in één visuele hit).

**Pro:** Geen schaalstappen nodig; vangt meerdelige ramen; lijndikte blijft consistent  
**Con:** Clustering-drempels (max pane-afstand, max raam-lengte) moeten getuned worden; tussenstijl ≈ kop moet visueel kloppen per tekeningstijl

### Tussenstijlen en meerdelige ramen

| Risico | Mitigatie |
|--------|-----------|
| Alleen buitenkoppen → tussenstijlen gemist | Match op **stijl-template**, niet op hele raam → tussenstijlen zijn expliciet hits |
| Tussenstijl lijkt op kop | Vaak gewenst — zelfde template; groepering + afstand bepaalt raamgrenzen |
| Tussenstijl visueel anders dan kop | Tekenaar klikt **tweede voorbeeld** (zelfde patroon als schuine deuren) |

### POC-vergelijking ramen

| Meting | Optie A (heel raam + schaal) | Optie B (kozijnstijl) |
|--------|:----------------------------:|:---------------------:|
| Recall enkel raam | | |
| Recall 3-delig / tussenstijlen | | |
| False positives (muur/T-kruising) | | |
| Scan-tijd | | |
| Templates nodig | veel (schaal) | weinig (1 stijl) |

### FML-export (meerdelige ramen)

V1 FML: raam als `openings[]` op muur met `t`, `width`, refid — **geen verplichte pane-count** in v3. Kozijnstijl-clustering levert:

- **Export:** start/eind op muur (of `t` + `width` in cm)
- **Structureel type:** enkel/dubbel/driedelig bepaalt refid — zie `klant-eisen-v1.md` §2 en `fml-format.mdc`
- **Optioneel intern/V2:** aantal panes, posities tussenstijlen — alleen als downstream dat nodig heeft

**Deuren:** zelfde principe — clustering na detectie (dubbel openslaand, schuifparen); exportvorm kan 1 brede of 2 smalle openings zijn per refid-type.

---

## Methode 2: Muurherkenning

Muren hebben geen vaste lengte — **symbool-template matching** (zoals deuren) werkt niet op een hele muur. Wel op **arceringstextuur** per muurtype.

### Uitdagingen

- Maatlijnen, stramienlijnen, vouwlijnen
- Onderbroken arceringen door deuren/ramen (masking lost deels op)
- Hoekpunten waar arceringen overlappen (L- en T-vormen)
- **Niet-lineaire arcering:** kruisling (cross-hatch), enkele diagonaal, massief zwart (spouw/tussenmuur) — zie referentie-afbeelding toiletruimte

```
Referentie: examples/Bouwtekeningen/muur-arcering-snippet.png
(cross-hatch buitenmuur, diagonaal binnenmuur, dunne scheidingswand — toiletruimte)
```

> Pure `HoughLinesP` op gearceerde muren ziet **honderden arceerlijntjes**, geen doorlopende muur. Pure **kernel/erode** op gearceerde muren **gummt de arcering weg** en verliest de muur. Voor enterprise-bouwtekeningen is textuur-matching **waarschijnlijk nodig** — te vergelijken met kernel-only in POC.

### Pipeline (basis — na deuren/ramen masking)

```
Tekenaar: muurtype(s) + dikte per type
    ↓
Stap A: (reeds gedaan) deuren/ramen gemaskeerd
    ↓
Stap B–E: zie optie A of B hieronder
    ↓
Stap F: Hoeksnapping (vector-intersectie)
    ↓
Output: centerlines + dikte per type → FML walls[]
```

---

## Te testen: muurherkenning

### Optie A — Kernel + Hough (massief zwart/wit)

Geschikt als muur **massief** zwart of wit is (geen zichtbare arcering tussen lijnen).

1. Dikte-filter (`erode`/`dilate`, kernel = muurdikte) → maatlijnen weg
2. `HoughLinesP` + `maxLineGap` → gaten over deuren heen
3. Hoeksnapping

| Pro | Con |
|-----|-----|
| Snel, eenvoudig | Faalt op cross-hatch / diagonale arcering |
| Kinderdijkstraat-onderlegger mogelijk voldoende | Bouwtekeningen met diverse arcering → recall laag |

**Hartlijn:** Hough op dikke muur geeft **twee randlijnen** (links + rechts) — extra stap nodig om centerline te bepalen.

### Optie B — Texture-to-mask + close + skeleton *(hypothese voor gearceerde muren)*

Tekenaar klikt op **arcering** (niet op hele muur): klein patch (~30×30 px) als **textuur-template**.

**Stap 1 — Textuur template matching**

- `matchTemplate` op patch (kruisjes, diagonaal, massief blok)
- Hoge correlatie → regio’s markeren op tijdelijke laag als **massief zwart**
- Per muurtype aparte laag (“Type A: cross-hatch buitenmuur”, “Type B: diagonaal binnenwand”)

**Stap 2 — Morfologische sluiting (`MORPH_CLOSE`)**

- Arcering = zwarte lijntjes + witte tussenruimte → na match nog “gaten”
- `morphologyEx(..., MORPH_CLOSE, kernel 5×5–7×7)` = digitale plamuur: vult tussenruimte, rand blijft
- Resultaat: **massieve balk** per muurregio, arceringstype-onafhankelijk verder verwerken

**Stap 3 — Dikte-filter (optioneel)**

- Op massieve banen: kernel scheiden buiten- vs binnenmuur (dikte uit tekenaar-voorbeeld)

**Stap 4 — Hartlijn via skeleton**

- Skelet-algoritme op massief vlak → **1 px centerline** door geometrisch midden
- Voorkomt dubbele lijnen (links/rechts) van Hough op dikke muur
- **`dikte_pixels` / `dikte_meters`** apart bewaren (gemeten vóór skeleton) → FML centerline + dikte

**Stap 5 — Lijnextractie**

- `HoughLinesP` op 1 px-skelet → strakke segmenten
- `maxLineGap` + hoeksnapping zoals eerder

| Pro | Con |
|-----|-----|
| Cross-hatch, diagonaal, massief in één flow | Extra templates + close-kernel tunen per scan-kwaliteit |
| Eén centerline per muur | Skeleton-loop: iteraties / performance meten |
| Muurtype = arcering → dikte/eigenschap in export | Textuur kan op andere elementen matchen (false positives) |

### UI: groeisysteem per textuur

1. Tekenaar klikt cross-hatch buitenmuur → geel Type A
2. Tekenaar klikt diagonale binnenwand → geel Type B (andere laag)
3. Gemiste stukken → extra klik (zelfde patroon als deuren/ramen)
4. Live: semi-transparante centerlines + dikte per type

### POC-vergelijking muren

| Meting | Optie A (kernel+Hough) | Optie B (textuur+close+skeleton) |
|--------|:----------------------:|:--------------------------------:|
| Recall buitenmuur cross-hatch | | |
| Recall binnenmuur diagonaal | | |
| Recall massief/zwart blok | | |
| Centerline-fout (cm) | | |
| Dubbele randlijnen? | | |
| Scan-tijd (s) | | |
| Iteraties skeleton (gem.) | n.v.t. | |

**Referentiecase:** bouwtekening-snippet met toiletruimte (meerdere arceringstypes); daarnaast Kinderdijkstraat (eenvoudiger arcering?) voor baseline optie A.

### FML-export (muurtypes)

V1 FML: `walls[]` met centerline-coördinaten (cm) + `thickness`. Arceringstype hoeft **niet** in FML v3 — wel intern koppelen:

| Intern (POC) | FML v3 |
|--------------|--------|
| `wall_texture_type` (A/B/…) | optioneel metadata |
| `dikte_meters` uit tekenaar + meting | `thickness` in cm |
| skeleton centerline | wall segment punten |

---

### Detail: klassieke stappen (optie A of na textuur-close)

#### Masking (vóór muurdetectie)

Coördinaten van gevonden deuren/ramen → witgummen op werkkopie.

#### Gaten dichten (Probabilistic Hough)

`maxLineGap` overbrugt deurgaten op geschaalde tekening.

#### Hoeksnapping

Vector-intersectie; deuren in hoek; schuine muren — ongewijzigd t.o.v. eerdere beschrijving.

---

### Code-voorbeeld: textuur close + skeleton (OpenCV.js)

```javascript
function verwerkMuurTextuurEnHartlijn(gray, muurDiktePixels) {
    let binary = new cv.Mat();
    cv.threshold(gray, binary, 200, 255, cv.THRESH_BINARY_INV);

    // Plamuur: arcering dichtsmeren tot massief vlak
    let plamuurKernel = cv.Mat.ones(7, 7, cv.CV_8U);
    let solidWalls = new cv.Mat();
    cv.morphologyEx(binary, solidWalls, cv.MORPH_CLOSE, plamuurKernel);

    // Skeleton-loop → 1 px centerline
    let skel = cv.Mat.zeros(solidWalls.rows, solidWalls.cols, cv.CV_8UC1);
    let temp = new cv.Mat();
    let eroded = new cv.Mat();
    let skelKernel = cv.getStructuringElement(cv.MORPH_CROSS, new cv.Size(3, 3));

    let done = false;
    for (let iter = 0; iter < 100 && !done; iter++) {
        cv.erode(solidWalls, eroded, skelKernel);
        cv.dilate(eroded, temp, skelKernel);
        cv.subtract(solidWalls, temp, temp);
        cv.bitwise_or(skel, temp, skel);
        eroded.copyTo(solidWalls);
        if (cv.countNonZero(solidWalls) === 0) done = true;
    }

    let lines = new cv.Mat();
    cv.HoughLinesP(skel, lines, 1, Math.PI / 180, 20, 15, 30);

    let muren = [];
    for (let i = 0; i < lines.rows; ++i) {
        muren.push({
            type: 'wall_centerline',
            dikte_pixels: muurDiktePixels,
            start: { x: lines.data32S[i * 4],     y: lines.data32S[i * 4 + 1] },
            end:   { x: lines.data32S[i * 4 + 2], y: lines.data32S[i * 4 + 3] }
        });
    }

    binary.delete(); plamuurKernel.delete(); solidWalls.delete();
    skel.delete(); temp.delete(); eroded.delete(); skelKernel.delete(); lines.delete();
    return muren;
}
```

**Opmerking POC:** textuur-`matchTemplate` vóór threshold/close nog toevoegen; close-kernel (5 vs 7) en skeleton-max-iteraties tunen op scan-kwaliteit. Crosscheck `normalization.ts` hergebruiken voor B&W-input.

---

## Interactieve workflow (live feedback)

Herkenning is snel genoeg voor een **feedback-loop** — tekenaar werkt als kwaliteitscontrole, niet als data-invoerder.

### Ramen & deuren — "wegstreep-systeem"

1. Tekenaar selecteert 1 voorbeeld
2. Software markeert alle matches met gekleurde kaders (~500 ms)
3. Gemiste exemplaren blijven zichtbaar
4. Tekenaar klikt gemist voorbeeld → template toegevoegd → rescan
5. Na 2–3 klikken: alles gevonden

### Muren — "groeisysteem" (per textuur/dikte)

1. Tekenaar klikt op **arcering** van buitenmuur (bijv. cross-hatch) → Type A + dikte meten
2. Alle regio’s met die textuur lichten op; centerlines (skeleton of Hough) semi-transparant geel
3. Tekenaar klikt diagonale binnenwand → Type B
4. Gaten bij deuren al gemaskeerd; `maxLineGap` sluit rest

**Voordeel:** software als assistent; tekenaar wijst alleen gaten aan (~20 s i.p.v. ~1 uur handmatig).

---

## Architectuur (webapplicatie)

### Client-side berekening

| Keuze | Reden |
|-------|-------|
| **OpenCV.js + WASM** | CV op CPU van tekenaar; geen netwerklatency |
| Server | Alleen opslag/export; geen beeldverwerking |

50 tekenaars tegelijk belasten de server niet.

### UI — 3 canvaslagen

| Laag | Inhoud |
|------|--------|
| 1 | Originele bouwtekening (PNG/WebP) |
| 2 | Interactie (tekenaar trekt kaders/lijnen) |
| 3 | Live resultaat (vectoren, bounding boxes) |

Library-opties: HTML5 Canvas, Konva.js of PixiJS.

### Pixel → vector

| Element | CV-output | Vector-output |
|---------|-----------|---------------|
| Deur/raam | Pixel (X,Y), rotatie | Invoegpunt + rotatie + breedte |
| Muur | Lijn (X1,Y1)–(X2,Y2) | Centerline + `dikte_meters` |

---

## Schaalcorrectie (anisotropisch)

Scan/print kan X- en Y-schaal verschillend maken. Tijdens opschoonproces:

1. Tekenaar trekt **horizontale** referentielijn → werkelijke meters
2. Tekenaar trekt **verticale** referentielijn → werkelijke meters

```
SF_x = werkelijke_meters_horizontaal / pixels_horizontaal
SF_y = werkelijke_meters_verticaal   / pixels_verticaal
```

Export: `(X_pixel × SF_x, Y_pixel × SF_y)`.

---

## JSON-exportstructuur (voorbeeld)

```json
{
  "metadata": {
    "drawing_id": "40k_project_12345",
    "scale_x_meters_per_pixel": 0.0105,
    "scale_y_meters_per_pixel": 0.0102
  },
  "layers": {
    "muren": [
      {
        "type": "wall_segment",
        "dikte_meters": 0.30,
        "start": { "x": 1.25, "y": 4.50 },
        "end": { "x": 8.50, "y": 4.50 }
      }
    ],
    "deuren": [
      {
        "type": "door_single",
        "positie": { "x": 3.40, "y": 4.50 },
        "rotatie_graden": 90,
        "breedte_meters": 0.90
      }
    ],
    "ramen": [
      {
        "type": "window_standard",
        "start": { "x": 5.10, "y": 4.50 },
        "end": { "x": 6.60, "y": 4.50 },
        "breedte_meters": 1.50
      }
    ]
  }
}
```

**Designkeuzes:**

- Muren als centerlines + dikte (downstream kan 3D opdikken)
- Deuren als invoegpunt + rotatie + breedte (CAD laadt eigen symbool)
- Ramen als lijnsegment (start/end)

> **BouwToFML:** V1-export is FML JSON v3 (cm), niet dit generieke formaat — zie `decisions.md` en `project-brief.md`. Structuur hierboven is conceptueel bruikbaar.

---

## Code-voorbeeld (OpenCV.js)

Gecombineerde pipeline: template matching → masking → muurdetectie → hoeksnapping.

```javascript
function verwerkBouwtekening(src, deurVoorbeeldCoords, muurDiktePixels) {
    let graySrc = new cv.Mat();
    cv.cvtColor(src, graySrc, cv.COLOR_RGBA2GRAY);

    // --- Template matching (deuren) ---
    let rect = new cv.Rect(
        deurVoorbeeldCoords.x, deurVoorbeeldCoords.y,
        deurVoorbeeldCoords.w, deurVoorbeeldCoords.h
    );
    let template = graySrc.roi(rect);
    let matchResult = new cv.Mat();
    let mask = new cv.Mat.zeros(graySrc.rows, graySrc.cols, cv.CV_8UC1);

    cv.matchTemplate(graySrc, template, matchResult, cv.TM_CCOEFF_NORMED);

    const threshold = 0.85;
    for (let r = 0; r < matchResult.rows; r++) {
        for (let c = 0; c < matchResult.cols; c++) {
            if (matchResult.floatAt(r, c) > threshold) {
                cv.rectangle(
                    mask,
                    new cv.Point(c, r),
                    new cv.Point(c + deurVoorbeeldCoords.w, r + deurVoorbeeldCoords.h),
                    new cv.Scalar(255, 255, 255, 255),
                    -1
                );
            }
        }
    }

    // --- Masking: deuren witgummen ---
    let cleanSrcForWalls = graySrc.clone();
    cleanSrcForWalls.setTo(new cv.Scalar(255), mask);

    // --- Dikte-filter ---
    let filteredWalls = new cv.Mat();
    let M = cv.Mat.ones(muurDiktePixels, muurDiktePixels, cv.CV_8U);
    cv.erode(cleanSrcForWalls, filteredWalls, M);
    cv.dilate(filteredWalls, filteredWalls, M);

    // --- Hough lines (maxLineGap = 60 overbrugt deurgaten) ---
    let lines = new cv.Mat();
    cv.HoughLinesP(filteredWalls, lines, 1, Math.PI / 180, 50, 40, 60);

    let muurVectorenJSON = [];
    for (let i = 0; i < lines.rows; ++i) {
        muurVectorenJSON.push({
            start: { x: lines.data32S[i * 4],     y: lines.data32S[i * 4 + 1] },
            end:   { x: lines.data32S[i * 4 + 2], y: lines.data32S[i * 4 + 3] }
        });
    }

    let strakkeMuren = losHoekpuntenOp(muurVectorenJSON);

    // Geheugen opruimen (cruciaal in OpenCV.js/WASM)
    graySrc.delete(); template.delete(); matchResult.delete();
    mask.delete(); cleanSrcForWalls.delete(); filteredWalls.delete();
    M.delete(); lines.delete();

    return strakkeMuren;
}
```

### Hoeksnapping — intersectieberekening

```javascript
function berekenSnijpunt(lijn1, lijn2) {
    let A1 = lijn1.end.y - lijn1.start.y;
    let B1 = lijn1.start.x - lijn1.end.x;
    let C1 = A1 * lijn1.start.x + B1 * lijn1.start.y;

    let A2 = lijn2.end.y - lijn2.start.y;
    let B2 = lijn2.start.x - lijn2.end.x;
    let C2 = A2 * lijn2.start.x + B2 * lijn2.start.y;

    let det = A1 * B2 - A2 * B1;
    if (det === 0) return null; // parallel

    return {
        x: (B2 * C1 - B1 * C2) / det,
        y: (A1 * C2 - A2 * C1) / det
    };
}
```

Snapping: als eindpunten van twee lijnen binnen `snappingAfstand` (bijv. 15 px) van elkaar of van het berekende snijpunt → coördinaten gelijk trekken.

---

## UI/UX-concept: Smart Overlay HUD

Extern voorstel dat aansluit bij BouwToFML-flow (kalibratie → voorbeelden → accorderen → export).

### No-sidebar

Volledig schermvullend; menu's als zwevende HUD onderin of contextmenu op muiscoördinaat.

### Drie fasen

**Fase 1 — Kalibratie**

- Banner: "Trek horizontale en verticale referentielijn"
- Tekenaar trekt lijn → typt meters → Enter
- X/Y-schaal in ~5 seconden; tekening gaat van grijs naar kleur

**Fase 2 — Magic Marker (deuren & ramen)**

- Toolbar: `[1] Deuren` (cyaan), `[2] Ramen` (magenta), `[3] Muren` (geel)
- 1 box trekken → binnen ~500 ms pulseren alle matches
- Gemiste exemplaren: klik op gemist item → rescan
- Sneltoetsen 1/2/3

**Fase 3 — Wall heatmap**

- Klik op muur → dikte meten → gele vectorlaag over alle muren van die dikte
- Tweede klik voor andere dikte (binnenwanden)

### Micro-interacties

| Actie | Gedrag |
|-------|--------|
| **Space** (ingedrukt) | Origineel 10% zichtbaar; alleen vectoren — kwaliteitscontrole |
| **Alt + hover** | Foutieve lijn rood → klik verwijdert |
| **Ctrl+Enter** | Export JSON; volgende tekening uit wachtrij |

---

## Afstemming met BouwToFML

| Onderwerp | Google AI-gesprek | BouwToFML (project) |
|-----------|-------------------|---------------------|
| AI | Aanvankelijk genoemd; **afgewezen** | Geen AI — OpenCV only |
| Voorbeelden | 2–3 per type per tekening | Train-by-example per project (3–5 per type) |
| Client-side | OpenCV.js + WASM | OpenCV client-side (V1) |
| Canvas | 3 lagen | KonvaJS (V1) |
| Schaal | Anisotropisch X/Y | Kalibratie (Crosscheck-patroon) |
| Export | Generiek JSON (geen FML) | **FML JSON v3** (cm) — zie `decisions.md` |
| Detectievolgorde | Deuren/ramen → muren | **Overgenomen** — masking vóór lijndetectie |
| Voorbewerking | Tijdens opschoon (kalibratie) | **Vóór detectie:** altijd B&W; vlekken/kleur/ruis |
| Deur/raam params | 45° / 5° / 2e-voorbeeld; raam heel vs kozijnstijl | **Te testen in POC** — zie consultatiedoc |

**Status (juni 2025):** detectievolgorde en CV-pipeline uit dit gesprek zijn **vastgelegd** in `decisions.md` en `project-brief.md`. Alleen het exportformaat wijkt af — BouwToFML exporteert naar FML v3, niet naar het generieke JSON-voorbeeld hierboven.

### Waarom deuren/ramen vóór muren

1. **Masking** — deursymbolen en raamarceringen zijn stoorzenders voor Hough/lijndetectie
2. **Muurinformatie** — bij openingen worden muurrichting en -dikte deels al zichtbaar
3. **Schonere basis** — gemaskeerde B&W-tekening vereenvoudigt muurdetectie (maatlijnen, arcering-gaten)

Na muurdetectie worden openingen alsnog als `openings[]` op het wall graph geprojecteerd (`t`, `width`, FML-refid).

---

## PoC-checklist (uit gesprek)

- [ ] OpenCV.js/WASM initialisatie in Vue/Quasar
- [ ] Template matching deuren — **vergelijk** optie A (45°), C (90° + 2e schuin), eventueel B (5°)
- [ ] Template matching ramen — **vergelijk** optie A (heel raam + schaal) vs B (kozijnstijl + clustering)
- [ ] Pyramide-scannen voor performance
- [ ] Masking van deuren/ramen vóór muurdetectie
- [ ] Muur-detectie — **vergelijk** A (kernel+Hough) vs B (textuur+close+skeleton)
- [ ] Close-kernel tunen (5×5 vs 7×7) op gearceerde scans
- [ ] HoughLinesP met `maxLineGap`
- [ ] Hoeksnapping via lijn-intersectie
- [ ] Anisotropische kalibratie (2 referentielijnen)
- [ ] Live canvas-feedback (3 lagen)
- [ ] Export naar FML v3 (BouwToFML-specifiek)

Zie ook: `poc-test-plan.md` (Kinderdijkstraat end-to-end).
