# V2 – roadmap (meerprijs)

Functies bewust buiten V1. Kunnen apart worden aangeboden of gebundeld.

---

## Floorplanner API-import

| Feature | Beschrijving |
|---------|--------------|
| API-key | Enterprise/partner — na succesvolle demo |
| Import flow | `POST /projects/import.json` via backend |
| Embedded editor | **Niet standaard** — factureringsrisico bij foutieve renders; download + eigen preview blijft primair |
| Eenheden | API verwacht meters; conversielaag `cm → m` |

V1: alleen FML-download + **onderlegger apart downloaden** (niet in FML).

---

## Onderlegger in FML

| Versie | Gedrag |
|--------|--------|
| V1 | Opgepoetste tekening **apart downloaden** — FML zonder `floors[].drawing` |
| V2 | Online opslaan (backend/storage) + **meenemen in FML** als `floors[].drawing` |

V1-export blijft licht; tekenaar uploadt onderlegger handmatig in Floorplanner indien gewenst.

---

## PDF-upload

| Feature | Beschrijving |
|---------|--------------|
| PDF per verdieping | Pagina → afbeelding (pdfjs-dist patroon uit Crosscheck) |
| V1 | Alleen PNG/JPG/JPEG per verdieping |

---

## Makelaar Huisstijl

Per makelaar/kantoor configureerbare exportdefaults, zodat plattegronden visueel en inhoudelijk consistent zijn.

| Instelling | Voorbeeld |
|------------|-----------|
| Deurtype | `refid` per makelaar/kantoor — **visuele variant** (streep, kleur) bij **zelfde structureel type** |
| Raamtype | Standaard raam-asset per makelaar per structureel type |
| Muurdiktes | Buiten/binnen defaults (0.25 / 0.10 m) |
| Kleuren | Muurkleur, area-kleuren (indien later relevant) |
| Maatlijn-stijl | Font, kleur, **offset buiten footprint** |
| Vloerhoogte | Default 2.8 m |

**Werking:** profiel per makelaar → FML-generator past `refid`, kleuren en defaults toe bij export. Train-by-example blijft per tekening; huisstijl bepaalt *welk* symbool/type wordt gebruikt.

---

## Template opslag (train-by-example)

| Feature | Beschrijving |
|---------|--------------|
| Voorbeeld-templates | Opgeslagen selectievakken/thresholds per input-type |
| Hergebruik | Nieuwe projecten starten met bewezen voorbeeldset |
| Per verdieping | V1: optioneel herkenningen overnemen in sessie (geen persistente opslag) |

---

## Deurstijlen (per makelaar)

**Niet verwarren met structurele types (V1):** enkel/dubbel/schuif/schuifpui/garage/opening bepalen *wat* voor opening het is. Makelaar Huisstijl (V2) bepaalt *welk FP-symbool* daarvoor wordt gebruikt binnen die categorie.

| Versie | Scope |
|--------|-------|
| V1 | **Structurele types** in intern model + editor; refid-placeholders; POC start met standaard enkeldeur + standaard raam |
| V2 | **Visuele variant** per makelaar-template (andere refid, zelfde structureel type — streep, kleur, catalogusvariant) |

Werking V2: profiel per makelaar → FML-generator past **visuele** deur/raam-refid toe bij export. Train-by-example blijft per tekening; huisstijl bepaalt *welk symbool* binnen het gekozen structurele type.

---

## Opening-editor (deuren & ramen)

| Versie | Scope |
|--------|-------|
| V1 | Per verdieping: plafondhoogte, deurhoogte (0 cm vloer), raamhoogte + sill |
| V2 | **Snel per opening editen** in onze editor vóór export (breedte, hoogte, z, refid) |

---

## Maatlijnen

| Versie | Status |
|--------|--------|
| V1 | **Nee** |
| V2 | Automatisch op **binnenmaten**, **buiten** footprint geplaatst |

Footprint bekend uit wall graph of optionele guide door tekenaar.

---

## Aanzichten (elevations)

| Versie | Scope |
|--------|-------|
| V1 | **Geen** |
| V2 | Aanzichten uploaden, **schalen**, ramen/deuren meten met **square tool** (breedte × hoogte) |
| V3 | Herkenning ramen/deuren in aanzicht + hoogte verwerken in FML — **kleine kans** op uitvoering |

V2 meet handmatig; V3 zou detectie + hoogte-overname automatiseren.

---

## Trap in export

| Versie | Status |
|--------|--------|
| V1 | **Niet verplicht** — focus muren, deuren, ramen |
| V2 | **Mits mogelijk** — `refid` uit actuele FP-catalogus |

Detectie via train-by-example (1 voorbeeldtype) kan eerder dan export.

---

## Keuken & sanitair (klant eisenpakket)

| Versie | Scope |
|--------|-------|
| V1 | Optioneel: **icoon + plaatsen** (simpel menu, geen detectie) |
| V2 | Detectie train-by-example: keukenblok (180 cm), toilet, fontein, wastafel, douche, badkuip |

Reden V2: weinig objecten per verdieping; interpretatie zwaar. Zie `klant-eisen-v1.md`.

---

## Overige V2-kandidaten

- SSO / multi-account
- Backend server-side CV (indien client-side limieten bereikt)
- Bouwtekening-scans als volwaardige standaardflow na POC fase D

**Buiten scope (ander project):** handschetsen, point-cloud-verwerking.

---

## V1 vs V2 vs V3 samenvatting

| | V1 | V2 | V3 |
|---|----|----|-----|
| Muren, deuren, ramen | ✓ (standaard draaicirkel-deur) | Deurstijl per makelaar | — |
| Minimale editor (muren) | ✓ | — | — |
| Opening-editor | per-tag defaults + min. override | ✓ per opening | — |
| Muurclassificatie editor | ✓ post-detectie | — | — |
| Roomtags (`areas[]`) | ○ onderzoek | | |
| Keuken/sanitair | icoon? | ✓ detectie | |
| Onderlegger | apart download | in FML | — |
| Maatlijnen | ✗ | ✓ buiten footprint | — |
| Aanzichten | ✗ | upload + meten (square) | herkenning (onzeker) |
| Trap export | optioneel | ✓ mits mogelijk | — |
| Makelaar Huisstijl | | ✓ | |
| Template opslag voorbeelden | | ✓ | |
| Multi-verdieping | ✓ | | |
| FML download | ✓ | | |
| API-import | | ✓ | |
| PDF-upload | | ✓ | |
| Embedded FP-editor | ✗ | ✗ | ✗ |
