# Examples – inventaris

Referentieprojecten in `examples/FML(current)/`. Enterprise Floorplanner-exports (juni 2026).

**Laatste analyse:** 2026-06-22

---

## Klant bouwtekeningen (`examples/samplessourcefiles/`)

ZIP-leveringen: bouwtekening-PDF + uitgewerkt FML (doelresultaat). Zie `klant-eisen-v1.md` §6.

| ZIP | PDF | FML | Aanbevolen voor |
|-----|:---:|:---:|-----------------|
| Woonstichting Groninger Huis_FIN-0013 | 1 | 1 | **Eerste fase D** (klein) |
| Mooiland 2023_3090 | 4 | 1 | Standaard woningtype |
| Stichting Poort6 FIN-125 / FIN-511 | 5–8 | 1 | Corporatie plattegrond |
| Wonen Limburg CPX 300 | 16 | 1 | Limburg template |
| Oosterpoort 14151 | 7 | 2 | 2 woningtypes (A/B) |
| Acantus Complex 207 | 14 | 1 | Batch / complex |
| Wonen Zuid 211033 | 3 | 1 | + losse images in ZIP |
| Staedion FT-1378 | 39 | 1 | Groot dossier |
| Ymere Nibag 101015 | 38 | 1 | Groot complex |

Uitgepakt voor inspectie: `samplessourcefiles/_extract_groninger/` (Groninger Huis).

**V1-input:** PDF's uit ZIP handmatig naar PNG converteren, of V2 pdfjs-dist.

---

## Overzicht

| # | Project | Verdiepingen | Muren | Deuren | Ramen | Ruimtes | Meubels | KB |
|---|---------|:------------:|:-----:|:------:|:-----:|:-------:|:-------:|:--:|
| 1 | Kinderdijkstraat 53 1 | 1 | 53 | 14 | 6 | 12 | 15 | 35 |
| 2 | Kromme-Mijdrechtstraat 61 3 | 2 | 55 | 14 | 5 | 12 | 14 | 39 |
| 3 | Amstelveenseweg 1092 A | 2 | 88 | 12 | 13 | 18 | 13 | 55 |
| 4 | Van Ostadestraat 139 1 | 4 | 153 | 48 | 16 | 30 | 42 | 114 |
| 5 | Anna van den Vondelstraat 13 D | 3 | 186 | 39 | 17 | 37 | 56 | 129 |
| 6 | Benedendorpsweg 51, Oosterbeek | 1 | — | — | — | — | — | — |

**Totaal:** 6 projecten in `FML(current)/` (+ 10 klant-ZIP's in `samplessourcefiles/`). Rij 6: nog niet geïnventariseerd.

Alle bestanden zijn **JSON v3** (ook met extensie `.fml` — geen XML).

---

## Formaat

| Eigenschap | Waarde |
|------------|--------|
| Formaat | **JSON v3** (persistent) |
| Extensie | `.fml` of `.json.fml` — inhoud altijd JSON |
| Eenheden | **Centimeters** (coördinaten, diktes, openingen) |
| Exportdatum | Juni 2026 |
| Editor | Floorplanner enterprise (RFFLS-huisstijl) |

### Top-level structuur

```json
{
  "id": 186515206,
  "name": "Kinderdijkstraat 53 1, Amsterdam",
  "settings": { "wallHeight": 280, "wallThickness": 10, "wallOuterThickness": 30, "dimensionMode": "interior" },
  "floors": [ { "name": "...", "level": 0, "height": 280, "drawing": { ... }, "designs": [ ... ] } ]
}
```

### Per verdieping (`floors[]`)

| Onderdeel | In export | BouwToFML export |
|-----------|:---------:|:----------------:|
| `designs[0].walls[]` | ✓ | ✓ |
| `walls[].openings[]` (deuren/ramen) | ✓ | ✓ |
| `dimensions[]` | ✓ | Fase C |
| `areas[]` | ✓ | ✗ (FP genereert) |
| `items[]` | ✓ | ✗ |
| `labels[]` | ✓ | ✗ |
| `lines[]` | ✓ | ✗ |
| `surfaces[]` | ✓ | ✗ |
| `drawing` (onderlegger) | ✓ | Input-referentie (URL) |

### Muren (`walls[]`)

Muur = centerline `a` → `b` + `thickness` (cm) + `balance` + ingebedde `openings[]`.

```json
{
  "a": { "x": 0, "y": 1047.7 },
  "b": { "x": 231.1, "y": 1047.7 },
  "thickness": 30,
  "balance": 0.5,
  "az": { "z": 0, "h": 266 },
  "bz": { "z": 0, "h": 266 },
  "openings": [
    {
      "refid": "b88cd3f479455fbf57205a91c613c02b7e6dc2df",
      "t": 0.456,
      "type": "window",
      "width": 139.9,
      "z_height": 150,
      "z": 70,
      "mirrored": [0, 1]
    }
  ]
}
```

- **`t`:** relatieve positie opening op muur (0 = bij `a`, 1 = bij `b`)
- **Gebogen muur:** optioneel `c` (bezier control point)
- **Standaard diktes:** binnen 10 cm, buiten 30 cm; woningsscheidend = derde default (klanttemplate)

### Deuren en ramen

Openingen zitten **in** de muur, niet als los object. Types via SHA-`refid` (catalogus-hash).

| Type | Unieke refids (over alle 5 projecten) |
|------|---------------------------------------|
| Deuren | 11 — o.a. `0434246537840a3326e305dbe7b9c355743e6e93` (standaard enkel) |
| Ramen | 3 — o.a. `b88cd3f479455fbf57205a91c613c02b7e6dc2df` (standaard) |

**Exportpatronen (jun 2026 analyse):**

- **Dubbel openslaand:** vaak **twee** `openings[]` op dezelfde muur, **zelfde refid**, naast elkaar (bijv. `df95e84f…`, ~74 cm per vleugel).
- **Brede deuren** (schuifpui/garage): vaak **één** opening, `width` > ~150 cm, ander refid (bijv. `5ae0ee3c…`, `1cdb4e60…`).
- **Meerdelige ramen:** één brede opening; geen pane-count in FML — breder refid (bijv. `bbf86e13…`).

Zie `klant-eisen-v1.md` §2 en `fml-format.mdc` § Structurele openingstypes.

**Concept-deurtype:** `0434246537840a3326e305dbe7b9c355743e6e93` (komt in elk project voor).

Deuren hebben `mirrored: [0|1, 0|1]` voor draairichting.

### Maatlijnen (`dimensions[]`)

```json
{ "type": "custom_dimension", "a": { "x": 716.7, "y": 1084.1 }, "b": { "x": 716.7, "y": 502.4 } }
```

- Alleen eindpunten in cm; tekstwaarde niet in JSON
- `settings.dimensionMode: "interior"` — binnenmaten
- Visueel vaak **buiten** footprint (grote offset-coördinaten)

### Onderlegger (`floors[].drawing`)

Scan/PNG geüpload in Floorplanner — bruikbaar als train-by-example input:

```json
{
  "x": -210.8, "y": 480.1,
  "width": 1721.8, "height": 1315.0,
  "rotation": 180,
  "url": "https://d273csydae9vpp.cloudfront.net/uploads/drawings/..."
}
```

Afmetingen in **cm**. Geen lokale afbeelding in de projectmap — URL ophalen of aparte PNG leveren.

---

## Bestandslocaties

Twee naamconventies:

```
Patroon A (plat):
  examples/FML(current)/Kinderdijkstraat.../Kinderdijkstraat....json.fml

Patroon B (genest):
  examples/FML(current)/Van Ostadestraat.../Van Ostadestraat.../Van Ostadestraat....json.fml
```

| Project | Pad |
|---------|-----|
| Kinderdijkstraat 53 1 | `Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam.json.fml` |
| Kromme-Mijdrechtstraat 61 3 | `Kromme-Mijdrechtstraat 61 3, Amsterdam/.../....json.fml` |
| Amstelveenseweg 1092 A | `Amstelveenseweg 1092 A, Amsterdam/Amstelveenseweg 1092 A, Amsterdam.fml` |
| Van Ostadestraat 139 1 | `Van Ostadestraat 139 1, Amsterdam/.../....json.fml` |
| Anna van den Vondelstraat 13 D | `Anna van den Vondelstraat 13 D, Amsterdam/Anna van den Vondelstraat 13 D, Amsterdam.fml` |

---

## Aanbevolen referentieprojecten

| Doel | Project | Reden |
|------|---------|-------|
| **POC / MVP** | `Kinderdijkstraat 53 1` | 1 verdieping, 53 muren, 35 KB, `drawing` aanwezig |
| **Multi-floor** | `Amstelveenseweg 1092 A` | 2 verdiepingen, compact |
| **Complex** | `Anna van den Vondelstraat 13 D` | 3 verdiepingen, penthouse, 186 muren |
| **Split plan** | `Van Ostadestraat 139 1` | 4 verdiepingen (voor/achter/alternatief) |

**Let op:** Kromme-Mijdrechtstraat verdieping `"H"` is leeg (0 muren). Van Ostadestraat `"Eerste verdieping achter"` heeft geen `drawing`.

---

## Grondwaarheid-extractie

Voor validatie: parse `designs[0].walls[]` → intern model (cm):

1. Centerlines `a`/`b` + `thickness` + `balance`
2. `openings[]` → `t`, `width`, `refid`, `type`, `mirrored`
3. Vergelijk met detectie: muurcount, endpoint-afstand, opening-posities

Crosscheck `importfml.ts` is **XML legacy** — niet direct bruikbaar. Nieuwe JSON v3-importer bouwen.

Spec: `.cursor/docs/floorplanner/v30-specification.md`

---

## BouwToFML export-scope vs. examples

| Element | In examples | Onze export |
|---------|:-----------:|:-----------:|
| Muren | ✓ | ✓ |
| Deuren/ramen (`openings[]`) | ✓ | ✓ |
| Onderlegger (`floors[].drawing`) | ✓ | ✗ V1 (apart download) / ○ V2 |
| Ruimtes (`areas[]`) | ✓ | ○ roomtags (klantlijst) |
| Meubels (`items[]`) | ✓ | ✗ |
| Keuken/sanitair | ✓ | ✗ V2 / ○ icoon V1 |
| Maatlijnen (`dimensions[]`) | ✓ | ✗ V1 / ○ V2 |
| Labels / disclaimer | ✓ | ✗ |
