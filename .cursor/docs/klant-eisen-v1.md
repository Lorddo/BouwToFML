# Klanteisen V1 – aanvullend eisenpakket

Bron: klantwensen (juni 2026), `.cursor/docs/Wensen/Additional info.md` en `image.png`.
Context: eisenpakket van een mislukt AI-project; wij leveren **semi-automatisch** (OpenCV + train-by-example), geen AI.

---

## Samenvatting scope-afbakening

| Onderwerp | V1 | V2 / later |
|-----------|:--:|:----------:|
| Muren detecteren + wall graph | ✓ | |
| **Muurtype na detectie** (buiten / woningsscheidend / binnen) | ✓ | |
| **3 muurdiktes** (cm) als projectdefaults → per muur `thickness` | ✓ | |
| Deuren & ramen detectie + masking | ✓ | |
| Deuren & ramen **toevoegen** (icoon) + **refresh** (learn-by-example) | ✓ | |
| **Structureel openingstype** (refid: enkel/dubbel/schuif/schuifpui/garage/opening; raam 1/2/3-delig/rond) | ✓ | visuele stijl per makelaar V2 |
| **Slimme clustering** deuren/ramen (voorstel + batch-bevestiging) | ✓ | valideren in POC; fallback handmatig menu |
| **Deur-tags**: voordeur / achterdeur / binnendeur | ○ deferred (geen FML-veld) | roundtrip FP |
| **Bovenlicht** bij deur | ✓ export-only (40×10 cm boven deur; viewer toont niet) | |
| **Maatdefaults per deur-tag** (breedte, hoogte, z) | ✓ | |
| Per-opening vrij bewerken (alle maten los) | ○ minimaal bij tag | volledig V2 |
| **Roomtags** (`areas[]` naam uit vaste lijst) | ✓ gebouwd | House-catalogus NL; Ctrl+klik + surfaces; defaults in Instellingen |
| **FP-tags export** (deuren, later muren) | ○ roundtrip POC | |
| Keukenblok detectie (180 cm) | | ✓ |
| Sanitair detectie (toilet, fontein, wastafel, douche, bad) | | ✓ |
| Keuken/sanitair **icoon + plaatsen** (simpel menu) | ○ lichte V1? | primair V2 |

**Belangrijk principe (klant):** muurtype **niet** tijdens herkenning — buiten- en woningsscheidende muren zijn op tekening vaak identiek getekend (zonder arcering). Tekenaar classificeert **na** detectie in de editor.

---

## 1. Muurtypes en diktes

### Werkwijze

1. Detectie levert **generieke muren** (geen semantisch type).
2. Tekenaar selecteert muur(en) en kiest type:
   - **Buitenmuur**
   - **Woningsscheidende muur** (tussenmuur)
   - **Binnenmuur** (default voor niet-geclassificeerde muren)
3. Dikte komt uit **projectdefaults** (3 velden in cm), niet per muur handmatig intypen tenzij uitzondering.

### FML-export

- Per muur: `walls[].thickness` in cm (zoals in bestaande examples — variatie 10–45 cm).
- `settings.wallThickness` / `wallOuterThickness` als projectdefaults (binnen / buiten); woningsscheidend als derde default.
- **Muurtags in Floorplanner:** klant komt hier later op terug; V1-minimum = correcte dikte. Tag-export = onderzoek (zie open vragen).

### Train-by-example (wijziging t.o.v. eerdere docs)

- Voorbeelden voor **lijnpatroon / arcering** (massief, cross-hatch, diagonaal), **niet** voor semantisch buiten vs. tussenmuur.
- Optioneel: footprint-guide voor schuine buitenmuren (ongewijzigd).

---

## 2. Deuren en ramen

### Twee lagen: structureel type vs. semantische tag

Openingen hebben **twee onafhankelijke classificaties** — niet in één menu mengen:

| Laag | Bepaalt | Voorbeelden |
|------|---------|-------------|
| **Structureel type** → `refid` | FP-symbool / catalogus-item | Enkel draaideur, dubbel openslaand, schuifdeur, schuifpui, garagedeur, opening (zonder deur); raam enkel/dubbel/driedelig/rond |
| **Semantische tag** | Betekenis in dossier (FP-metadata) | Voordeur,  binnendeur, 
Structureel addons > bovenlicht 

Een schuifpui kan tegelijk **achterdeur** zijn. Tags gelden op **deuren met symbool**; een kale opening (uitsparing) heeft geen voor/achter/binnen-tag.

Refids per structureel type: **placeholders** in projectdefaults tot catalogus compleet is (roundtrip FP + analyse `FML(current)/`). Zie `fml-format.mdc` § Structurele openingstypes.

### Detectie & correctie (V1)

- Controle door tekenaar: ontbrekende openingen aanvullen.
- **Toevoegen:** icoon op canvas → learn-by-example refresh voor breedte (en hoogte waar relevant).
- **Draaien:** `mirrored` (bestaand V1).

**Werkwijze detectie → classificatie (niet omgekeerd):**

1. **Train-by-example** op **primitives** — start met weinig templates; uitbreiden bij missers (niet alle types vooraf verplicht).
2. **Template matching** levert losse hits (draaideur, schuifsymbool, kozijnstijl, …).
3. **Clustering** (automatisch voorstel) — zie hieronder.
4. **Review in editor** — batch-bevestiging of per item corrigeren vóór export.

### Train-by-example templates (progressief)

| Template | Wanneer |
|----------|---------|
| Standaard draaideur (draaicirkel) | Default — grootste deel van deuren |
| Schuifsymbool (`<` / `><`) | Optioneel, 1–2 voorbeelden als op tekening |
| Garagedeur | Apart symbool — apart template |
| Opening (streep/gat, geen deur) | Apart template of handmatig plaatsen |
| Raam: kozijnstijl | 1 stijl-template (hypothese B in `google-ai-cv-consultatie.md`) |
| Raam: rond / halfrond | Alleen als het voorkomt — apart template |

### Slimme clustering (na detectie)

Automatisch **voorstel**, nooit stilzwijgend definitief — tekenaar bevestigt bulk of past aan.

**Deuren**

| Signaal op tekening | Voorstel structureel type |
|---------------------|----------------------------|
| 2 draaideuren, zelfde muur, raken, spiegel draairichting | Dubbel openslaand |
| 2 schuifsymbolen `<` `>` naast elkaar | Schuifpui |
| 1 schuifsymbool `<` | Enkele schuifdeur |
| 1 zeer breed symbool (drempel ~150 cm, context buitenmuur) | Schuifpui of garagedeur |
| Geen deurlijn, alleen opening | Opening (geen deur) |

**Ramen** (kozijnstijl-clustering — zie `google-ai-cv-consultatie.md`)

| Signaal | Voorstel |
|---------|----------|
| 1 collineaire stijl / enkele kop | Enkel raam |
| 2 stijlen, zelfde lijn | Dubbel raam |
| 3+ stijlen, zelfde lijn | Driedelig raam → **één** brede `openings[]` |
| Rond / boogsymbool | Rond of halfrond raam — **geen** clustering; handmatig type |

**Mitigatie fouten:** alleen clusteren bij symmetrische draai of aangrenzende schuifparen; kleine afstandsdrempel tussen vleugels; visuele preview vóór export. **Fallback:** structureel type altijd handmatig wijzigbaar in editor-menu.

**POC:** clustering-regels valideren op Kinderdijkstraat + bouwtekeningen; bij te veel false positives terugvallen op handmatige keuze zonder detectie te blokkeren.

### Editor-menu bij selectie

**Deuren** — twee groepen in contextmenu:

*Structureel type (refid):* enkel draaideur · dubbel openslaand · schuifdeur · schuifpui · garagedeur · opening (geen deur)

*Semantische tag:* voordeur · achterdeur · binnendeur (default) · bovenlicht (○)

**Ramen** — alleen structureel: enkel · dubbel · driedelig · rond/halfrond

### Deur-tags (na selectie, vergelijkbaar met FP UI – `image.png`)

Contextmenu bij geselecteerde deur:

| Tag | Opmerking |
|-----|-----------|
| Voordeur | Exclusief t.o.v. achterdeur |
| Binnendeur | Default; resterende deuren |

Extra components
| Bovenlicht | Optioneel; vaak raam boven binnendeur — zie open vragen |

Referentie UI: Floorplanner toont “Front door” / “Internal door” checkboxes; wij breiden uit met **achterdeur** en **bovenlicht** conform klant.

### Maatvoering per deur-tag

Projectdefaults (cm), toegepast bij (de)selecteren van tag:

| Parameter | Voordeur | Achterdeur | Binnendeur |
|-----------|----------|------------|------------|
| Breedte (`width`) | invullen | invullen | invullen |
| Hoogte (`z_height`) | invullen | invullen | invullen |
| Raise from floor (`z`) | default 0 | default 0 | default 0 |

Individuele afwijking per deur: minimaal via tag + handmatige override op die opening (lichtgewicht, geen volledige V2 opening-editor).

### Ramen

- Zelfde patroon: detectie + toevoegen + refresh.
- Structureel type (enkel/dubbel/driedelig/rond) bepaalt **raam-refid**; pane-indeling uit clustering waar mogelijk.
- Hoogte + sill: per-verdieping defaults (V1); per-raam override = V2 tenzij nodig voor POC.
- FML v3 heeft **geen pane-count veld** — meerdelig raam = één opening met totale `width` + juiste refid.

---

## 3. Roomtags (ruimtebenaming)

Klant wil ruimtebenaming uit tekening verwerken in Floorplanner op basis van een **vaste lijst** (tekenprotocol).

FML: `areas[]` met `name` (standaardtype) en optioneel `customName` (vrije override, zie bestaande examples).

| Aspect | Aanpak |
|--------|--------|
| Detectie ruimtelabels op tekening | **Niet** in V1 (geen OCR) |
| Ruimtes genereren | Auto uit gesloten muurlussen (ná thickness/balance); IoU behoudt tags |
| Handmatig taggen per ruimte | Ctrl+klik: type (House-catalogus), customName, kleur; surfaces apart tekenen |
| Surfaces | Handmatige overlay-polygoon (balkon e.d.); nooit uit detectie |

**Status:** gebouwd (2026-08-17) — catalogus `roomtype-catalog.json`; settings default-kleur per role.

---

## 4. Floorplanner-tags export

Wens: tags die in onze app gezet worden (deurtype, later muurtype) ook in Floorplanner zichtbaar na import.

| Object | Bevinding examples (jun 2026) | Actie |
|--------|------------------------------|-------|
| Deur front/internal | **Niet** aangetroffen in persistent FML exports | Roundtrip POC: tag in FP → export FML → veld identificeren |
| Muur | Geen semantische tag in FML; wel `thickness` | Dikte is leidend V1 |
| Ruimte | `areas[].name` + `customName` | Wel aanwezig in examples |

Zie `.cursor/docs/floorplanner/fml-license-v01c-04102024.pdf` voor licentievoorwaarden export.

---

## 5. Keuken & sanitair (V2, lichte V1-optie)

Klant eisenpakket noemt detectie; wij schuiven **detectie** naar V2 (weinig per verdieping, hoge interpretatielast).

**V2:** keukenblok (standaard 180 cm), sanitair (toilet, fontein, wastafel, douche, badkuip) via train-by-example.

**Mogelijke lichte V1:** simpel menu **icoon + plaatsen** op canvas (geen detectie) — alleen als dit weinig extra werk kost t.o.v. editor-framework.

---

## 6. Voorbeeldmateriaal klant

Bronbestanden (ZIP): `examples/samplessourcefiles/` — bouwtekening-PDF + uitgewerkt FML per project.

| ZIP | PDF | FML | Opmerking |
|-----|:---:|:---:|-----------|
| Woonstichting Groninger Huis_FIN-0013 | 1 | 1 | Kleinste set; goed voor eerste fase D |
| Mooiland 2023_3090 | 4 | 1 | + 1 PNG |
| Acantus Complex 207 | 14 | 1 | Batch / meerdere types |
| Stichting Poort6 FIN-125 / FIN-511 | 5–8 | 1 | |
| Wonen Limburg CPX 300 | 16 | 1 | |
| Oosterpoort 14151 | 7 | 2 | 2 types (A/B) |
| Wonen Zuid 211033 | 3 | 1 | + images |
| Staedion FT-1378 | 39 | 1 | Groot; veel PDF's |
| Ymere Nibag 101015 | 38 | 1 | Groot complex |

Uitgepakte referentie: `examples/samplessourcefiles/_extract_groninger/` (Groninger Huis).

Bestaande makelaar-examples: `examples/FML(current)/` — zie `examples-inventory.md`.

---

## 7. Open vragen (beantwoorden vóór implementatie)

### Blokkerend / hoog

1. **FML-deurtags:** Welk JSON-veld gebruikt Floorplanner persistent voor “Front door” / “Internal door”? Geen veld in huidige exports → **roundtrip-test verplicht** (handmatig taggen in FP → FML downloaden).
2. **Achterdeur in FP:** Is dit een derde tag naast front/internal, of een `customName` / ander mechanisme?
3. **Bovenlicht:** ✅ Besloten 2026-08-02 — aparte window-opening bij export (`z = deur.z_height + 10`, `z_height = 40`, zelfde `width`/`t`); projectdefault + per-deur override; **niet** in FML-viewer.
4. **Vaste roomtag-lijst:** Graag tekenprotocol-document van klant (lijst + eventuele `role`-mapping).
5. **Default muurdiktes (cm):** Exacte waarden voor buiten / woningsscheidend / binnen voor dit klanttemplate?
6. **Default deurmaten (cm):** Breedte + hoogte voor voordeur / achterdeur / binnendeur?
7. **Refids structurele types:** Exacte catalogus-hashes voor dubbel openslaand, schuif, schuifpui, garage, opening, raam dubbel/driedelig/rond — deels uit `FML(current)/` (11 deur- + 3 raam-refids); rest via roundtrip of klant-FML.

### Medium

8. **Ruimtebenaming werkwijze:** Handmatig per gesloten ruimte in editor, of later (in FP)? Automatische label-detectie = buiten scope V1.
9. **Muurtags export:** Wat is minimum als FP geen muurtag-veld heeft? Alleen dikte voldoende?
10. **POC-volgorde:** Blijft Kinderdijkstraat fase A–C, daarna Groninger Huis als fase D, of direct bouwtekening-PDF?
11. **PDF in ZIP's:** V1 accepteert alleen PNG/JPG — PDF → PNG conversie door tekenaar vóór upload, of V2 pdfjs-dist eerder prioriteren?

### Laag / kan tijdens bouw

12. **Keuken/sanitair icoon-menu:** Wel of niet meenemen in V1 MVP?
13. **Template opslag:** Eén klanttemplate nu; persistente profielen blijven V2.
14. **Benedendorpsweg 51** in `FML(current)/` — hoort bij dit eisenpakket? Toevoegen aan inventaris.

---

## 8. Impact op documentatie

| Document | Wijziging |
|----------|-----------|
| `decisions.md` | Muurclassificatie post-detectie; structurele openingstypes; clustering; deur-tags |
| `project-brief.md` | Editor-stap muurtype + openingmenu (structureel + tags) |
| `poc-test-plan.md` | Clustering-validatie; criteria muurdiktes, deur-tags, fase D samples |
| `v2-roadmap.md` | Keuken/sanitair detectie |
| `examples-inventory.md` | `samplessourcefiles/` |
| `fml-format.mdc` | Structurele openingstypes, refid-placeholders, exportShape |
| `project-context.mdc` | Korte verwijzing klanteisen |

---

## Referenties

- UI-deurmenu: `.cursor/docs/Wensen/image.png`
- Klantnotities: `.cursor/docs/Wensen/Additional info.md`
- FML-licentie: `.cursor/docs/floorplanner/fml-license-v01c-04102024.pdf`
