# **Offerte – IFC-import (Revit)**

Vervolg op Bouwtekening naar FML Conversietool / Editor

## **1. Gegevens**

**Opdrachtnemer:** dhr. Jordi Baudoin  
**Opdrachtgever:** Pranimate  
**Contactpersoon klant:** dhr. Sono  
**Offertenummer:** SW-0006  
**Datum:** 15-09-2026  
**Geldig tot:** 15-10-2026

---

## **2. Inleiding**

Hartelijk dank voor het vertrouwen in de editor en de conversietool.

Deze offerte beschrijft een vervolgoplevering:

**"IFC-import (Revit) → plattegrond"**

Doel is dat de tekenaar een IFC uit Revit opent zoals hij nu een FML opent: bestand kiezen, plattegrond in de editor, controleren en verder tekenen. Vanuit die plattegrond blijft **FML-download** beschikbaar voor Floorplanner — hetzelfde als bij een getekende of gedetecteerde plattegrond.

Dit is een **standaard import** in de editor, geen detectie en geen tweede app. DWG/PDF blijft buiten deze opdracht (aparte offerte; die route loopt via de detectie-app).

Intern landt het model in het eigen plattegrondformaat (`.plg`). FML is daar een export van, geen apart intern model. U merkt dat als: openen → bewerken → FML of `.plg` downloaden.

Het vooronderzoek is gedaan op een Revit-IFC van het tekenbureau (IFC2X3, Coordination View, millimetermodel). Deze offerte geldt voor **dat dialect**: Revit-IFC’s van dezelfde exporteur / dezelfde werkwijze. Dat is iets anders dan “wij ondersteunen IFC” in het algemeen.

---

## **3. Doel & Probleemstelling**

Een deel van de aangeleverde bronbestanden is geen scan of PDF, maar een BIM-model (IFC uit Revit). Die bestanden gaan nu nog via een omweg (afbeelding / detectie / overtekenen), terwijl de muren, diktes, ruimtenamen en openingsmaten er al in zitten.

Dit vervolg richt zich op:

* IFC openen in de bestaande **editor**, naast `.plg` en `.fml`
* Muren, verdiepingen en ruimtes 1-op-1 uit het model — geen herschatten van diktes; muurhoogtes uit het model
* **Dakvlakken** uit de dakplaten in het model (één of meer schilden)
* Deuren en ramen **op de juiste plek**, elk als eigen object
* Daarna dezelfde editor als correctiestoel, en dezelfde **FML-download** naar Floorplanner
* Een leesbaar importverslag als het bestand afwijkt, door te sturen naar het tekenbureau

Volume is klein t.o.v. scans (tientallen tot honderden per maand, geen tientallen per dag). De winst is **compleetheid** (geen “stuur maar een plaatje”) en **kwaliteit** (op deze bestanden is bijna-100% haalbaar, in plaats van ~80% bij detectie).

De tekenaar blijft verantwoordelijk voor controle. De import zet het model over; hij tekent niet opnieuw.

---

## **4. Wat u krijgt**

Oplevering in de bestaande **editor**. Geen wijziging aan de detectie-pijplijn (die blijft voor scans / PDF). Geen nieuwe hosting, geen extra licentie.

Getoetst tegen het al onderzochte voorbeeldmodel; tijdens de testfase komt daar minimaal één tweede woningtype bij.

---

### **Mijlpaal 1 — Muren, verdiepingen, ruimtes, dakvlakken**

Eerste werkende import. Nog geen deuren en ramen. Demonstreerbaar resultaat: het onderzochte huis open in de editor, muren, kamers en dakvlakken kloppen, FML is te downloaden.

* **Openen van `.ifc`** in de editor, hetzelfde pad als `.fml` / `.plg` (bestandskiezer; daarna plattegrond op het canvas)
* **Verdiepingen** uit het model (begane grond, verdieping, dakverdieping, …), met vloerhoogte
* **Muren:** as, lengte, dikte en ligging van de as t.o.v. het muervlak  
  * Spouwmuur 300 mm → **30 cm** (totaaldikte, geen losse spouwbladen)  
  * Dikte uit het model, ook als die alleen op het muúrtype staat  
  * **Hoogte** (onder- en bovenkant) uit het model — niet afgeleid van een dak  
  * Minieme muurfragmenten (modelleerartefacten van enkele centimeters) worden weggelaten
* **Ruimtes** met de Nederlandse naam uit het model, gekoppeld aan de bestaande roomtypes / Floorplanner-rollen (woonkamer, keuken, slaapkamer, …)
* **Dakvlakken** uit de dakplaten in het model (omtrek + hoogte, onderkant van de plaat)  
  * Eén schild = één vlak; zadeldak, T-dak of dakkapel = meerdere platen → meerdere vlakken  
  * Geen nokbalk uit de IFC — in de editor is de nok alleen een hulplijn; die zet de tekenaar desgewenst zelf  
  * Muurhoogtes blijven uit de wand komen, niet uit het dak
* Resultaat is een gewone plattegrond: selecteren, verschuiven, dikte, undo — dezelfde editor
* **FML-download** en **`.plg`-download** van die plattegrond, dezelfde knoppen als nu
* **Importverslag** vóór/bij het openen: eenheden, aantal verdiepingen, aantal muren, ontbrekende diktes — in leesbare taal, bedoeld om door te sturen als het bestand afwijkt
* Identiteit van IFC-elementen wordt bewaard in het interne formaat (voor later terugvinden / eventuele latere export). In de FML-download naar Floorplanner blijven die gegevens achterwege of gaan ze mee als extra, zonder de import te breken

---

### **Mijlpaal 2 — Deuren en ramen**

Openingen op de juiste muur, op de juiste plek. Dit is het kritieke pad: zonder dit is de import niet bruikbaar voor Floorplanner.

* Elke **deur** en elk **raam** een eigen object — geen bovenlicht-verpakking bij import. Samenvoegen kan later in de editor
* **Plek en maat:** breedte × hoogte van het **gat** (niet het kozijnprofiel). Kozijnmaten zijn voor FML niet nodig; die bewaren we intern wél, ze komen niet als extra muurstukken op de plattegrond
* Revit-werkwijze waarbij kozijnen als **vliesgevel-assemblage** in de IFC staan: wél de opening, **niet** de stijlen als muur. Geen muur in IFC = geen muurstrookje in de plattegrond. Subvakken sluiten aan of overlappen licht (tot ca. 5 cm)
* Waar het IFC wél een gat in de muur heeft, gebruiken we dat gat. Waar het gat ontbreekt (gemeten: een deel van de kozijnen), de maat uit paneel + kozijnprofiel — die twee kwamen op het onderzochte bestand exact overeen
* Openingen hangen aan de **gastheermuur** (niet zwevend in de kamer)
* Meenemen in FML-download: zelfde openingobjecten als bij een getekende plattegrond (type, breedte, hoogte, positie op de muur)
* De editor blijft de correctiestoel: type wijzigen, spiegelen, kopiëren, verwijderen

---

### **Mijlpaal 3 — Test + feedback**

* Gezamenlijk toetsen op representatieve Revit-IFC’s: het onderzochte model **plus** minimaal één tweede woningtype van hetzelfde bureau
* Feedback verwerken **binnen de scope** van deze offerte (mapping, gaten zonder openingselement, dikte via type, namen → roomtype, dakvlakken)
* Kleine bijstellingen van de roomtype-koppeling na eerste gebruik
* Opleveringsdemo / walkthrough: IFC openen → controleren → FML downloaden
* Korte aanvulling op de gebruikershandleiding (Revit-export, wat de import wél en niet overneemt, importverslag)
* Afronding en acceptatie

Deze mijlpaal omvat een **test- en feedbackperiode van vier weken**.

---

## **5. Afbakening (Scope)**

### **Wel inbegrepen**

* `.ifc` openen in de editor, naast `.plg` en `.fml`
* Revit-IFC (IFC2X3 / Coordination View, millimetermodel) van de onderzochte exporteur / werkwijze
* Verdiepingen, muren (as, dikte, ligging, **hoogte**), ruimtes + roomtypes
* Dakvlakken uit de dakplaten (één of meer vlakken; geen nok uit de IFC)
* Deuren en ramen op de juiste plek, elk als eigen object, gatmaat naar FML
* Geen detectie, geen dikte-afronding, geen “opschonen” alsof het een scan is — de IFC-geometrie is exact
* Importverslag in leesbare taal
* FML-download en `.plg`-download vanuit de editor (bestaande knoppen)
* Test, vier weken feedback, demo en handleiding-aanvulling (mijlpaal 3)

### **Niet inbegrepen**

* **DWG / DXF / DWF / native AutoCAD** — volgt in een **aparte offerte**. Die bestanden hebben geen muren-als-object; die route hoort bij de detectie-app (PDF), niet bij deze import
* IFC uit andere exporteurs (ArchiCAD, Solibri, “willekeurige IFC”), IFC4 als belofte, of “wij ondersteunen IFC” in het algemeen
* **IFC-export** (plattegrond → IFC) — buiten de vraag; zie optioneel meerwerk §7
* Nokbalk / hulpnok automatisch uit de IFC (niet nodig; de tekenaar kan die in de editor zetten)
* Gevelgroepen automatisch uit de IFC
* Installaties, meubels, sanitair, lagenopbouw of kozijn als zichtbaar FML-object
* Wijzigingen aan de detectie-/conversie-app (geen CV-stappen, geen harmoniseren van muurdiktes)
* Appartementencomplexen / IFC’s van 100+ MB (browser-import is getoetst op woningformaat, ~2 MB)
* Doorlopend onderhoud / support na acceptatie (tenzij apart overeengekomen)

Verzoeken buiten deze scope worden beschouwd als meerwerk en worden uitsluitend uitgevoerd na schriftelijke goedkeuring van opdrachtgever.

---

## **6. Prijs & Mijlpalen**

Vaste prijs met deelbetalingen per mijlpaal.  
Bedragen zijn **vrijgesteld van BTW** (opdrachtnemer is niet btw-plichtig).

| Mijlpaal | Omschrijving | Bedrag |
| ----- | ----- | ----- |
| 1 | Muren, verdiepingen, ruimtes, dakvlakken (IFC openen, diktes/as/hoogte, roomtypes, importverslag, FML/`.plg`-download) | €1.500 |
| 2 | Deuren en ramen (juiste muur en plek, elk eigen object, gatmaat, vliesgevel-kozijnen) | €2.000 |
| 3 | Test + feedback (vier weken, tweede woningtype, demo, handleiding) | €1.000 |

**Totaal projectbedrag:** €4.500

Facturatie per mijlpaal bij oplevering van die mijlpaal.  
Betaling binnen 14 dagen na factuurdatum.

Licentiekosten voor het lezen van IFC: **€0** (geen ODA, geen Autodesk-per-bestand).

---

## **7. Optionele Uitbreidingen**

Niet inbegrepen in het vaste projectbedrag. Uitvoering na schriftelijk akkoord.

### **DWG / vector-PDF (aparte offerte)**

Geen onderdeel van deze opdracht. DWG van het tekenbureau is plat lijnwerk, geen BIM. De bedoelde route is: bureau exporteert PDF (één verdieping per pagina) → bestaande detectie-app. Native DWG-parsing valt af (licentie derden).

Wordt apart geoffreerd wanneer u daar aan toe bent.

**Investering:** nader te bepalen (aparte offerte)

---

### **IFC-export (plattegrond → IFC)**

Niet gevraagd in deze opdracht. De import legt wél een vaste mappingtabel aan (verdieping, muur, opening, ruimte, identiteit). Die tabel is de voorbereiding om later dezelfde kant op te schrijven: bewerken in de editor en een IFC teruggeven die tegen hun BIM te matchen is.

Zonder deze uitbreiding blijft de keten: IFC in → plattegrond → FML uit.

**Investering:** nader te bepalen

---

## **8. Planning**

| Fase | Doorlooptijd |
| ----- | ----- |
| Muren, verdiepingen, ruimtes, dakvlakken | ± 2–3 weken |
| Deuren en ramen | ± 2–3 weken |
| Test, feedback & afronden | ± 4 weken |

Totale indicatieve doorlooptijd:

**± 8–10 weken**

Start na schriftelijk akkoord.  
Planning houdt rekening met parallelle werkzaamheden aan andere projecten.

---

## **9. Wat wij van u nodig hebben**

* **Revit IFC-exportinstellingen** van het tekenbureau (het exportprofiel / instellingenbestand — enkele minuten werk voor hen)
* **Eén extra IFC** van een ander woningtype, zelfde bureau — bevestigt of de naamgeving (wand / deur / raam / kozijn in de typenaam) hun standaard is of toevallig netjes in het onderzochte project
* Bevestiging dat IFC’s **altijd uit Revit** komen, van deze partij (of schriftelijk welke andere bron u wilt meenemen — dat is meerwerk)
* Eén vast inhoudelijk aanspreekpunt
* Tijdige feedback tijdens de testperiode (mijlpaal 3, vier weken)

Testdata wordt tijdens de uitvoering afgestemd. Het al onderzochte voorbeeldmodel is de eerste referentie.

---

## **10. Aannames**

* IFC komt uit **Revit**, Coordination View-achtige export, eenheid millimeter, woningformaat
* Zelfde exporteur / dezelfde modelleerafspraak als het onderzochte bestand (o.a. kozijnen als vliesgevel-assemblage, dikte in materiaal of typenaam)
* Derde partij levert het bestand; terugkoppeling is traag. Het importverslag is de mitigatie, geen garantie dat elk willekeurig IFC opent
* Geometrie uit IFC is **exact** — we ronden muurdiktes niet af naar de catalogus en “lassen” geen knopen alsof het meetruis is
* Muurhoogtes komen uit de wand in het model, niet uit het dak
* Dakvlakken komen uit de dakplaten (1-op-1 per plaat). Een nok uit de IFC wordt niet gezet; die is in de editor alleen een hulplijn
* Kozijnmaten gaan niet naar Floorplanner; wel het gat. Intern blijven profiel / laagopbouw bewaard
* Elk raam en elke deur blijft een los object bij import
* De editor is de correctiestoel; dit wordt geen 100% hands-off import
* FML-download is een **export** van de plattegrond (lossy t.o.v. `.plg`: Floorplanner kent niet alles wat IFC wel heeft)
* Eindgebruikers werken met een moderne browser; geen extra server voor deze import
* Geen wijziging aan de detectie-app in deze opdracht
* Acceptatie is het Revit-dialect van dit bureau (onderzocht bestand + tweede woningtype). Andere exporteurs of “IFC in het algemeen” vallen buiten deze opdracht — dat is later eigen productwerk, geen onderdeel van de acceptatie

---

## **11. Voorwaarden**

### **Acceptatie**

Een mijlpaal wordt geacht te zijn geaccepteerd wanneer de beschreven functionaliteit is gedemonstreerd en opdrachtgever niet binnen vijf werkdagen schriftelijk gemotiveerd bezwaar maakt.

Referentie voor mijlpaal 1 en 2 is het onderzochte voorbeeldmodel, plus tijdens mijlpaal 3 het tweede woningtype. Afwijkende IFC’s van een andere exporteur vallen buiten acceptatie van deze opdracht.

---

### **Wijzigingen**

Aanpassingen buiten de scope van deze offerte worden beschouwd als meerwerk.

---

### **Gebruiksrecht & broncode**

Na volledige betaling verkrijgt de opdrachtgever het gebruiksrecht op de voor hem ontwikkelde applicatie binnen de overeengekomen scope.

Overdracht van broncode is **niet standaard inbegrepen** in deze offerte en kan desgewenst nader schriftelijk worden overeengekomen.

Opdrachtnemer behoudt het recht om generieke technische kennis, herbruikbare componenten en niet-klantspecifieke softwarepatronen in andere projecten toe te passen.

---

### **Data-eigenaarschap & export**

Bronbestanden (waaronder `.ifc`) en projectbestanden (`.plg` / `.fml`) blijven eigendom van de opdrachtgever — **niet** van de opdrachtnemer als softwareleverancier.

---

### **Hosting**

Eventuele kosten voor hosting, domeinen, opslag, bandwidth of diensten van derden zijn voor rekening van opdrachtgever tenzij schriftelijk anders overeengekomen.

---

### **Onderhoud**

Onderhoud en support na acceptatie van de eindoplevering zijn niet inbegrepen en kunnen separaat worden geoffreerd.  
De opleveringsfase (mijlpaal 3) omvat wel een test- en feedbackperiode van **vier weken** vóór afronding.

---

### **Aansprakelijkheid**

De aansprakelijkheid van opdrachtnemer is beperkt tot het bedrag dat voor de betreffende mijlpaal is gefactureerd en betaald.

De import is een hulpmiddel. Opdrachtgever blijft verantwoordelijk voor de plattegrond en de FML die naar Floorplanner of derden gaat. Kwaliteit van de IFC (modelleerafspraken, ontbrekende gaten, andere exporteur) ligt bij de aanleverende partij.

---

## **12. Akkoord**

**Opdrachtgever						Opdrachtnemer**

Naam:								Naam:

Datum:								Datum:

Handtekening:							Handtekening:
