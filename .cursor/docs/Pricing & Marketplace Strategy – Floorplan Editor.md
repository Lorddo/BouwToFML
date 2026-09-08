# Prijs & marketplace — losstaande plattegrond-editor

**Bevroren 2026-08-31.** Canonieke bron voor seats, richtprijzen en uitbesteden.

Overschrijft het creditmodel in [product-idee-self-serve-plattegrond.md](./product-idee-self-serve-plattegrond.md) (21 aug). Productzin, contract en catalogus daar blijven gelden.

Geen juridisch advies. Geen bouwspec.

---

## Wat we verkopen

Geen Floorplanner-kloon, geen CAD-light, geen FML-bestand naar de klant.

**2D-plan-dienst** (later eigen 3D): editor als trechter, tekenbureau als knop. Hero = ZZP / architect-voorwerk. Consument is bijzaak, geen homepage. Nederlandse makelaardij en woningcorporaties blijven **dicht**.

Drie kopers, geen vijf SKU’s:

| Koper | Wat ze kopen |
|---|---|
| ZZP / architect | **Solo** — 1 stoel |
| Klein kantoor | **Kantoor** — N stoelen, gedeelde projecten |
| go2scan / partner | **API-tenant** — contract, geen rij in de publieke prijstabel |

---

## Verdienmodel: seats

Credits zijn **achterhaald**. Geen €2 per PDF, geen drie creditsoorten.

De stoel is de licentie om te *werken*. Zoals andere tekenprogramma’s: SketchUp-achtig **alles-in-de-stoel**, geen quota op PDF of aanzichten.

| In de stoel | Los, per keer | Niet van ons (nu) |
|---|---|---|
| Tekenen, opslaan, verdiepingen, aanzichten | Bureau “laten tekenen” (offerte) | Inspectie-flows (go2scan) |
| PDF/PNG mét maten, titelblok, geen watermerk | Extra stoel | Detectie in de klantapp |
| Deel-link naar opdrachtgever | | `.fml` / Floorplanner-account |

Licentie = **persoon**, niet device. Desktop + laptop + tablet mag. Desnoods gelijktijdige sessies begrenzen. Geen device-lock.

---

## Treden (Studio bestaat niet)

Geen Studio. Aanzichten en lijn/PDF-export horen in Solo, niet achter een tweede betaalde trede.

### Gratis — trechter, geen verdienmodel

- 1 gebruiker
- Beperkt aantal projecten (richting: 1–2)
- Schetsen in de editor
- Export: JPG **zonder** maten en/of watermerk
- **Mag een tekenopdracht bestellen** (account verplicht bij bestellen)

Na een geleverde opdracht: de klant moet het resultaat professioneel kunnen exporteren. Daarom **één maand Solo cadeau** bij de eerste (of elke) betaalde tekenopdracht vanuit Gratis. Daarna vervalt de stoel tenzij ze zelf verlengen.

### Solo — richtprijs €29 / maand

- 1 stoel
- Onbeperkt (of ruim) projecten
- PDF/PNG mét maten
- Aanzichten (genereren + bewerken, synchroon met plattegrond)
- Deel-link
- Offline later mogelijk; geen launch-eis
- Jaar ~10× maand → **€290 / jaar** (geen 12×)

### Kantoor — richtprijs €199–249 / maand (5 stoelen)

- 5 stoelen inbegrepen (niet 5× Solo: samenwerking zit in de prijs)
- Extra stoelen: nader, richting zelfde stoelprijs of custom
- Gedeelde projecten, overdracht binnen de workspace
- Rollen: `owner` / `editor` / `viewer`
- **Project lock:** één actieve editor; anderen kijken tot vrijgave
- Jaar ~10× maand

Viewer (opdrachtgever die alleen kijkt) hoeft geen teken-stoel; factureren of gratis is later.

### Partner / API — custom

go2scan (en later anderen) is **geen** Solo in Stripe. Eigen dashboard bij hen, onze data/editor via API. White-label, subdomain, SSO: partnercontract, geen publieke Enterprise-rij tot iemand het vraagt.

---

## Gratis mag bestellen

Workflow:

1. Gast mag schetsen. Account verplicht bij bewaren, betalen of bureau.
2. Gratis-account uploadt scan / schets / PDF / foto + grove m² / verdiepingen.
3. Platform toont schatting (prijs + doorlooptijd) — staffel met bureau afstemmen.
4. Klant accepteert → opdracht naar het **partnerbureau** (geen marketplace).
5. Resultaat in hetzelfde account.
6. **Maand Solo cadeau** zodat PDF-met-maten en aanzichten van die levering werken.

Revisie: 1 ronde “dit klopt niet” in de opdrachtprijs; daarna extra. Slechte scan = toeslag of globale uitwerking. Zonder revisieregel brandt het bureau.

Bureau is **leverancier**, geen teammember. Detectie blijft bureau-only.

---

## Wat niet in de winkel

- Credits / munten per export
- Studio-trede
- Makelaars of corporaties als persona
- Marketplace of bidding bij launch
- Detectie / “foto wordt muren” in de klantapp
- `.fml`-download
- Inspectie-flow in *deze* stoel (dat is go2scan)
- DXF/IFC, eigen 3D, white-label: later of partner

---

## Uitbesteden nu, marketplace later

**Nu:** “Laat ons tekenen” → één partnerbureau. Vaste of band-prijs, gegarandeerde kwaliteit, gevulde capaciteit.

**Later, pas bij bewezen volume:**

- gestandaardiseerde staffel (woning &lt;100 m², huis &lt;250 m², …)
- daarna eventueel netwerk + reviews
- bidding alleen als supply/demand het dwingt — ander bedrijf, geen launch-doel

Geen hybrid Express + marketplace tot de interne flow data heeft (prijs, doorlooptijd, herwerk).

---

## CAD-vergelijking (alleen positionering)

Richtgetallen per gebruiker per jaar: AutoCAD ~$2k, Revit ~$3k, Archicad ~€2,8k. Wij zijn **geen** “goedkoper dan CAD”.

> Professioneel woning-voorwerk zonder CAD/BIM-complexiteit, met een bureau-knop als je het niet zelf tekent.

---

## Bevroren vs. nog open

**Bevroren**

- Seats, geen credits
- Solo = alles in de stoel (PDF + aanzichten)
- Geen Studio
- Gratis mag bestellen; maand Solo cadeau bij levering
- Richtprijzen: Gratis / Solo €29 / Kantoor €199–249 (5) / partner custom
- Licentie per gebruiker, multi-device
- Bureau = offerte, één partner, geen marketplace dag 1
- go2scan = API, geen publieke Enterprise-SKU
- Contractkader uit het productidee (geen FML naar klant, geen makelaarsmarkt)

**Nog afstemmen (operatie)**

- Exacte Gratis-plafond (1 vs 2 projecten, verdiepingen)
- Tekenopdracht-staffel (m², verdiepingen, leesbaarheid, spoed)
- Cadeau-Solo: alleen eerste opdracht of elke opdracht vanuit Gratis
- Extra stoel boven de 5, viewer wel/niet factureren
- Offline + lock: launch of fase 2
