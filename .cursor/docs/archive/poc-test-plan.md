# POC testplan – JSON v3 FML → train-by-example

Eerste technische test vóór volledige app. Doel: aantonen dat learn-by-example + OpenCV een **hele verdieping** vectoriseert en exporteert naar geldig JSON v3 FML.

**Uitvoerbare spike-tests (vóór POC):** `.cursor/tests/` — o.a. learn-by-example telling (T01), FML import/export (T02–T03), editor (T04), bouwtekeningen-matrix (T05).

**Mijlpaal:** end-to-end bewijs op `Kinderdijkstraat 53 1` vóór bouwtekening-scans.

---

## Waarom deze test eerst?

| Input-type | Moeilijkheid | Reden |
|------------|:------------:|-------|
| **Onderlegger uit FML** (`drawing.url`) | Laag–middel | Zelfde project, bekende grondwaarheid in cm |
| Bouwtekening scan (eigen PNG) | Hoog | mm-maatketens, ruis — per project learn-by-example |
| Handschets | — | Buiten scope (ander project/tool) |

Examples in `examples/FML(current)/` zijn JSON v3 met `walls[]` + `openings[]` — objectief te meten.

Typische input: per appartement, niet megascans.

---

## Startcase

**Project:** `examples/FML(current)/Kinderdijkstraat 53 1, Amsterdam/`

| Bestand | Rol |
|---------|-----|
| `Kinderdijkstraat 53 1, Amsterdam.json.fml` | Grondwaarheid — 53 muren, 14 deuren, 6 ramen |
| `floors[0].drawing.url` | Onderlegger (externe PNG) — input voor detectie |

1 verdieping, 35 KB, `dimensionMode: interior`, onderlegger rotation 180°.

**Alternatief fase D:** eigen bouwtekening-scan per project.

**Alternatief multi-floor:** `Amstelveenseweg 1092 A` (2 verdiepingen).

---

## POC-fasen

### Fase A — Deuren + ramen (template matching)

| Item | Detail |
|------|--------|
| Input | Opgeschoonde B&W-onderlegger (PNG) |
| Train-by-example | 3–5 vakken per deur/raam |
| Output | Pixel-posities + rotatie; **masking** op werkkopie |
| Validatie | Recall openingen vs. FML (14 deuren, 6 ramen) acceptabel |

### Fase B — Muren + knooppunten

| Item | Detail |
|------|--------|
| Volgorde | Na fase A (op **gemaskeerde** tekening) |
| Train-by-example | 3–5 vakken muurlijn/arcering + deur/raam |
| Output | Wall graph: centerlines + knooppunten in **cm** |
| Validatie | ≥80% muurcount vs. FML (53 → min. ~42); hartlijnen ~10 cm |

### Fase B2 — Openingen op muur

| Item | Detail |
|------|--------|
| Volgorde | Na fase B |
| POC-start refids | Deur: `0434246537840a3326e305dbe7b9c355743e6e93` · Raam: `b88cd3f479455fbf57205a91c613c02b7e6dc2df` |
| Output | `openings[]` met `t`, `width`, `mirrored` op juiste muur |
| Validatie | Positie/breedte visueel acceptabel vs. grondwaarheid |

Hoogte/sill via **per-verdieping inputvelden** (V1). Intern model: `structuralKind` + `exportShape` — ook als POC nog maar één refid exporteert.

### Fase B3 — Clustering & structurele types (na B2 of parallel fase D)

| Item | Detail |
|------|--------|
| Doel | Automatisch voorstel dubbel openslaand, schuifparen, meerdelige ramen |
| Validatie | False-merge-rate vs. tijdwinst batch-bevestiging; fallback handmatig menu |
| Go/no-go | Clustering **optioneel** in export — bij falen blijft handmatige typekeuze voldoende |

Refid-catalogus per structureel type: placeholders tot roundtrip + `FML(current)/` analyse compleet is.

### Fase C — FML-export

| Item | Detail |
|------|--------|
| Motor | JSON v3 generator (`walls[]` + `openings[]`) |
| Output | Download `.fml` (JSON) + **onderlegger apart** (V1 — geen `drawing` in FML) |
| Validatie | Opent correct in Floorplanner |

FML-motor bouwen **vóór of parallel** met fase A. Crosscheck XML-motor is referentie voor intern model, niet voor exportformaat.

**Maatlijnen:** V2 — niet in POC/V1.

### Fase D — Echte bouwtekening

| Item | Detail |
|------|--------|
| Input | Bouwtekening-scan uit `examples/samplessourcefiles/` (PDF → PNG door tekenaar vóór upload in V1) |
| Startcase | **Woonstichting Groninger Huis FIN-0013** (kleinste ZIP) |
| Aanpak | Learn-by-example per project; muurclassificatie + deur-tags + **structurele openingstypes** handmatig of via clustering |
| Criteria | Lagere drempels acceptabel t.o.v. Kinderdijkstraat |

---

## Testscope (POC fase A–C)

### In scope

1. Onderlegger/PNG laden + zoom/pan (client-side)
2. **Voorbewerking → zwart-wit** (vlekken, kleur, ruis; rotatie)
3. Kalibratie X/Y (klik A→B + mm)
4. Train-by-example: 3–5 vakken per type
5. OpenCV detectie client-side: **deuren/ramen → muren**
6. Openingen op muur segmenteren → wall graph
7. Minimale editor: muurpunt, splitsen, muur toevoegen, **muurtype**, deur draaien, **deur/raam toevoegen**, **structureel type**, **clustering-review**, **deur-tags**
8. Projectdefaults: plafond, **3 muurdiktes**, **deurmaten per tag**, ramen per verdieping
9. Metrics vs. JSON v3 grondwaarheid
10. FML-download (+ onderlegger apart) en validatie in Floorplanner
11. **FML roundtrip:** deur-tags handmatig in FP → export → veld identificeren

### Buiten scope (POC)

- Maatlijnen (V2)
- Deurstijl per makelaar / visuele variant (V2)
- Clustering als verplichte pipeline-stap (blijft optioneel tot B3 go)
- Multi-verdieping
- Template opslag (V2)
- PDF-input, API-import (V2)
- areas, items, labels exporteren (roomtags = onderzoek — `klant-eisen-v1.md`)
- Keuken/sanitair detectie (V2)

---

## Pipeline

```
Onderlegger (PNG) per verdieping
       │
       ▼
[1] Voorbewerking ─────── B&W: vlekken, kleur, threshold, rotatie
       │
       ▼
[2] Kalibratie ────────── A→B + mm (X/Y apart)
       │
       ▼
[3] Train-by-example ──── 3–5 vakken per type (per project)
       │
       ▼
[4a] Deuren + ramen ───── template matching; masking (witgummen)
       │
       ▼
[4a2] Clustering (opt.) ─ voorstel structureel type; batch-review
       │
       ▼
[4b] Muren + knooppunten  Hough + diktefilter op gemaskeerde tekening
       │
       ▼
[4c] Openingen op muur ── t, width, refid op wall graph (cm)
       │
       ▼
[6] Preview + editor ──── correcties vóór export
       │
       ▼
[7] JSON v3 export ────── download .fml → valideer in Floorplanner
```

---

## Succescriteria

### Fase A (muren)

| Criterium | Doel |
|-----------|------|
| Muurcount | ≥ 80% van 53 (min. ~42) |
| Positie | Centerlines binnen ~10 cm |
| Geen AI | OpenCV + template matching |

### Fase B (deuren)

| Criterium | Doel |
|-----------|------|
| Plaatsing | `openings[]` op juiste muur, `t` + `width` redelijk |
| Concept | 1 refid end-to-end (POC); intern model klaar voor meerdere structurele types |

### Fase C (FML)

| Criterium | Doel |
|-----------|------|
| Import | Download opent in Floorplanner |
| Tijd | Merkbare besparing t.o.v. volledig handmatig |

---

## Grondwaarheid-extractie

Parse `examples/FML(current)/...json.fml`:

1. `floors[].designs[0].walls[]` → centerlines + thickness (cm)
2. `walls[].openings[]` → t, width, refid, type
3. Vergelijk: endpoint distance, muurcount, opening count

Nieuwe JSON v3-importer; geen Crosscheck XML-parser.

---

## Implementatie

| Fase | Aanpak |
|------|--------|
| FML-motor | JSON v3 `buildFmlV3()` — walls + openings in cm |
| Grondwaarheid | `importFmlV3()` uit examples |
| Detectie | Client-side OpenCV; UI-patronen uit Crosscheck |
| Onderlegger | `drawing.url` ophalen of lokale PNG |

---

## Volgende stappen

1. `importFmlV3` voor Kinderdijkstraat → `ground-truth.json`
2. `buildFmlV3` skeleton → roundtrip-test
3. Onderlegger laden → voorbewerking B&W → deuren/ramen fase A
4. Muren op gemaskeerde tekening → fase B → openingen op muur fase B2
5. Download → Floorplanner → fase C
6. Besluit: door naar bouwtekening (fase D)?

---

## Relatie tot examples-inventory

| POC (A–C) | Later (D+) |
|-----------|------------|
| Kinderdijkstraat | bouwtekening-scans per project |
| 1 verdieping | multi-floor (Amstelveenseweg) |
| 1 deur-refid POC | structurele types + refid-catalogus (11+3 uit examples) |
| muren + openingen | maatlijnen (V2) |
