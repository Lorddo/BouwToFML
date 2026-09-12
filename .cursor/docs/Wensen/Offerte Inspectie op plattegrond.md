# **Offerte – Inspectie op plattegrond (FML)**

Vervolg op Vastgoed Opname App

## **1. Gegevens**

**Opdrachtnemer:** dhr. Jordi Baudoin  
**Opdrachtgever:** Pranimate  
**Contactpersoon klant:** dhr. Sono  
**Offertenummer:** SW-0004  
**Datum:** 18-08-2026  
**Geldig tot:** 18-09-2026

---

## **2. Inleiding**

Hartelijk dank voor het vertrouwen in de Vastgoed Opname App.

Deze offerte beschrijft een vervolgoplevering op dat platform:

**"Inspectie op plattegrond (FML)"**

Doel is dat de inspecteur op locatie werkt op de tekening: tikken op kamer, gevel, deur, raam of installatie opent de bestaande vragenlijst. De plattegrond kleurt mee (open / klaar). Ramen en deuren kunnen in het veld van maten worden voorzien, worden toegevoegd of worden verwijderd. Afronden levert dezelfde observations als nu, plus een stabiele koppeling naar objecten op de tekening en een bijgewerkte FML (via export en API).

Dit is een plattegrond-laag op de bestaande opname-app, geen tweede inspectie-applicatie. Rapportgeneratie blijft bij uw bestaande dashboard en tools.

---

## **3. Doel & Probleemstelling**

De opname-app legt gegevens gestructureerd vast, maar de pandstructuur (verdiepingen, ruimtes, gevels, openingen) wordt in het veld nog handmatig opgebouwd. Daardoor is de koppeling tussen wat op de tekening staat en wat is opgenomen niet vanzelfsprekend.

Dit vervolg richt zich op:

* Een FML-bestand (Floorplanner-formaat: geometrie + stabiele IDs) als ruimtelijke index  
* Inspectie op de plattegrond in plaats van een losse structuurstap  
* Zicht op wat nog openstaat, direct op de tekening  
* Stabiele ID-koppeling zodat gegevens later herleidbaar blijven (o.a. richting Vabi / IFC)  
* Ramen en deuren in het veld: maten, toevoegen en verwijderen; bijgewerkte FML terug naar export/API  
* Roomtypes in de opname 1-op-1 gelijk aan Floorplanner-rollen  

**Twee schakels, één keten:**

* **FML-editor (desktop):** tekening → FML. Detectie en tekenen blijven daar. Geen veldinspectie in de editor.  
* **Opname-app (PWA):** inspectie op locatie op een geüploade / meegeleverde FML. Geen detectie, geen FML-generatie vanaf een tekening. Wél gerichte veld-edits op ramen en deuren; die komen in een nieuwe FML.  

De FML is de ruimtelijke index (geometrie + IDs). Observations in de PWA blijven de bron van waarheid voor antwoorden. Maten van ramen en deuren staan in de FML-geometrie, niet als aparte maattabel in de observations.

---

## **4. Wat u krijgt**

Voortbouwen op de bestaande PWA (iOS, Android, tablet waaronder iPad, desktop). Talen en huisstijl ongewijzigd t.o.v. de eerdere oplevering: Nederlands en Engels, functionele default (geen extra branding in deze offerte).

---

### **Mijlpaal 1 — FML-editor upgrade**

De editor/viewer wordt geschikt gemaakt als bron voor veldinspectie en als herbruikbare plattegrond in de PWA.

* **Vloeren / areas in de FML:** kamers en verdiepingen staan met stabiele IDs in het bestand; export wist deze gegevens niet. Zonder areas is er geen kamer-tik in het veld.  
* **Inspectiemodus:** tikken op de bestaande plattegrond-canvas (kamer, gevel/muur, deur, raam, installatie/fixture). Geen muren tekenen, geen muurdikte, geen nulpunt of rotatie. Pan en zoom blijven.  
* **Ramen en deuren (veld-edit, in de module):** maten (breedte/hoogte) schrijven naar de FML-geometrie; ramen/deuren toevoegen en verwijderen. Niet verslepen. Nieuwe opening krijgt een nieuwe stabiele ID; bestaande IDs blijven.  
* **FML-export met edits:** de module kan een nieuwe FML serialiseren waarin deze opening-wijzigingen zijn meegenomen (voor editor én later de PWA/API).  
* **Roomtypes 1-op-1:** Floorplanner-rollen en roomtypes in de opname zijn dezelfde catalogus, geen ruwe eigen mapping ernaast.  
* **Statuskleuren vanaf de PWA:** open / incompleet vs. klaar; selectie blijft visueel herkenbaar.  
* **Gevel-groepering:** een gevel is vaak meerdere muursegmenten. In de editor worden segmenten tot één gevel gegroepeerd, zodat de inspecteur op elk segment dezelfde gevel opent.  
* **Touch:** pinch-zoom en grotere trefvlakken, zodat de canvas op tablet bruikbaar is.  
* **Module-knip:** types, import/export (incl. writeback van openingen) en de viewer (inspectie-API) als herbruikbaar pakket voor de PWA. Detectie, OpenCV en de teken-stappen van de editor gaan niet mee naar de veldapp.  

---

### **Mijlpaal 2 — PWA-upgrade (plattegrondgestuurde opname)**

De bestaande opname-app krijgt de plattegrond als sturende laag. Templates (welke onderdelen vragen hebben) blijven zoals ze zijn; deze mijlpaal voegt geen nieuw inspectietype toe.

* **FML openen in de opname:** bestand lokaal bewaren (offline). Bij afronden gaat de bijgewerkte FML mee (download + API), niet alleen het origineel.  
* **Schema-uitbreiding:** ruimtes en assets krijgen een FML-koppeling (`fmlGuid`, soort, verdieping). Gevel extra: lijst muursegment-IDs (`fmlWallGuids`). Interne observation-IDs blijven ongewijzigd.  
* **Subjects bij openen:** bij het laden van de FML worden alle relevante kamers, gevels, deuren, ramen en fixtures aangemaakt die de geselecteerde templates kennen — niet pas bij de eerste tik. Heropenen maakt geen duplicaten.  
* Tik op de plattegrond opent de bestaande vragenlijst van dat onderdeel. Tik op een gevel-segment opent de gegroepeerde gevel.  
* **Compleetheid op de tekening:** alle inspecteerbare onderdelen kleuren (open / klaar). Onderdelen zonder vragen in de gekozen templates tellen als klaar (groen), geen blokkade.  
* **Veld-layout:** op tablet plattegrond + vragen naast elkaar; op telefoon de vragen als sheet over de plattegrond.  
* **Ramen en deuren in het veld:** inspecteur voert maten in, voegt ramen/deuren toe of verwijdert ze (via de module uit mijlpaal 1). Geen verslepen. Geen her-detectie.  
* **Bij afronden:** observations zoals nu, plus de bijgewerkte FML downloaden en doorsturen naar de API.  
* **Mappen aan bestaande inspecties:** huidige inspectie-opnames koppelen aan de ruimtes, muren, ramen, deuren en installaties.  
* Muren, kamers en overige geometrie blijven bevroren zodra een inspectie loopt; alleen ramen/deuren mogen in het veld wijzigen.  

---

### **Mijlpaal 3 — Test en afronden**

* Gezamenlijk testen op realistische tekeningen / opnames  
* Feedback verwerken binnen de scope van deze offerte  
* Opleveringsdemo / walkthrough  
* Korte aanvulling op de gebruikershandleiding (inspectie op plattegrond)  
* Afronding en acceptatie  

---

## **5. Afbakening (Scope)**

### **Wel inbegrepen**

* FML-editor: areas/vloeren in FML + behoud bij export  
* Inspectiemodus op de plattegrond  
* Ramen/deuren: maten in FML-geometrie, toevoegen en verwijderen (niet verslepen)  
* Nieuwe FML exporteren waarin deze edits zijn meegenomen  
* Roomtypes 1-op-1 gelijk aan Floorplanner-rollen  
* Touch-bediening op de plattegrond-canvas  
* Gevel-groepering in de editor (meerdere segmenten = één gevel)  
* Viewer als module voor de PWA (zonder detectie / OpenCV)  
* PWA: FML openen, schema-koppeling, subjects bij openen, tikken → vragenlijst, statuskleuren  
* Mappen van bestaande inspecties (BBMI, WWS, EPA)  
* Bij afronden: bijgewerkte FML downloaden en naar de API sturen  
* Test, feedback, demo en handleiding-aanvulling (mijlpaal 3)  

### **Niet inbegrepen**

* Detectie of FML-generatie vanaf een tekening in de PWA  
* Volle editor in het veld (muren tekenen, knopen, dikte, nulpunt, rotatie)  
* Verslepen / verplaatsen van ramen en deuren  
* Surfaces (overlay-vlakken) als inspectie-onderdeel  
* Automatische koppeling of export naar Vabi of IFC (zie optioneel meerwerk Vabi)  
* Nieuw inspectietemplate of uitbreiding van bestaande checklists  
* Native App Store / Google Play publicatie  
* Bouw of aanpassing van uw bestaande dashboard  
* Rapportgeneratie  
* Klantspecifieke huisstijl / branding  
* Doorlopend onderhoud / support na acceptatie (tenzij apart overeengekomen)  
* Hostingkosten en cloudverbruik  

Verzoeken buiten deze scope worden beschouwd als meerwerk en worden uitsluitend uitgevoerd na schriftelijke goedkeuring van opdrachtgever.

---

## **6. Prijs & Mijlpalen**

Vaste prijs met deelbetalingen per mijlpaal.  
Bedragen zijn **vrijgesteld van BTW** (opdrachtnemer is niet btw-plichtig).

| Mijlpaal | Omschrijving | Bedrag |
| ----- | ----- | ----- |
| 1 | FML-editor upgrade (vloeren/areas, inspectiemodus, touch, module, gevel-groepering, roomtypes 1-op-1, ramen/deuren maten/toevoegen/verwijderen, FML-export met edits) | €1.500 |
| 2 | PWA-upgrade (plattegrondgestuurde opname, schema-uitbreiding) | €1.500 |
| 3 | Test en afronden | €2.500 |

**Totaal projectbedrag:** €5.500

Facturatie per mijlpaal bij oplevering van die mijlpaal.  
Betaling binnen 14 dagen na factuurdatum.

---

## **7. Optionele Uitbreidingen**

Niet inbegrepen in het vaste projectbedrag. Uitvoering na schriftelijk akkoord.

### **Afstemmen van Vabi-tabellen**

Afstemming van PWA-velden en IDs (waaronder `fmlGuid`; gevel = lijst muursegment-IDs) op uw Vabi-importtabellen.

**Oplevering:**

* Mappingdocument  
* Voorbeeld-export / voorbeeldtabel (CSV of JSON) die Vabi kan inlezen  

Dit is geen volledige automatisering in de app (geen doorlopende Vabi-koppeling of IFC-pipeline).

**Investering:** €1.000

Opdrachtgever levert hiervoor voorbeeld-Vabi-tabellen en/of kolomdefinities.

---

## **8. Planning**

| Fase | Doorlooptijd |
| ----- | ----- |
| FML-editor upgrade | ± 2 weken |
| PWA-upgrade | ± 2 weken |
| Test, feedback & afronden | ± 5 weken |

Totale indicatieve doorlooptijd:

**± 9 weken**

Start na schriftelijk akkoord.  
Planning houdt rekening met parallelle werkzaamheden aan andere projecten.

---

## **9. Wat wij van u nodig hebben**

* Voorbeeldtekeningen / FML-bestanden om editor, gevel-groepering en veldinspectie mee te toetsen  
* Floorplanner-rolencatalogus (of bevestiging daarvan) voor het 1-op-1 gelijk trekken van roomtypes  
* Eén vast inhoudelijk aanspreekpunt  
* Tijdige feedback tijdens de test- en afrondingsfase (mijlpaal 3)  
* Voor het optionele Vabi-onderdeel: voorbeeldtabellen en/of kolomdefinities (alleen indien u dat onderdeel afneemt)  

Testdata wordt tijdens de uitvoering afgestemd.

---

## **10. Aannames**

* Deze oplevering bouwt voort op de bestaande Vastgoed Opname App  
* De FML wordt in de editor voorbereid; in het veld geen her-detectie. Muren/kamers blijven bevroren; ramen en deuren mogen maten, toevoegen en verwijderen. Afronden levert een nieuwe FML (export + API)  
* Bestaande templates bepalen welke onderdelen vragen hebben; deze offerte voegt geen nieuw inspectietype toe  
* Eindgebruikers werken met een moderne browser; PWA-installatie op iPad/telefoon is voldoende (geen App Store)  
* Rapportage en dashboard-bouw vallen buiten deze oplevering  

---

## **11. Voorwaarden**

### **Acceptatie**

Een mijlpaal wordt geacht te zijn geaccepteerd wanneer de beschreven functionaliteit is gedemonstreerd en opdrachtgever niet binnen vijf werkdagen schriftelijk gemotiveerd bezwaar maakt.

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

Opnamedata, bronbestanden (waaronder foto’s en FML-bestanden) en exports blijven eigendom van de opdrachtgever c.q. de opnemende / opdrachtgevende organisatie — **niet** van de opdrachtnemer als softwareleverancier.

Opdrachtgever kan via de oplevering (dossier-export / API) data exporteren en meenemen. Opdrachtnemer verwerkt en bewaart data uitsluitend ten behoeve van de dienstverlening binnen deze overeenkomst, tenzij schriftelijk anders overeengekomen.

---

### **Hosting**

Eventuele kosten voor hosting, domeinen, opslag, bandwidth of diensten van derden zijn voor rekening van opdrachtgever tenzij schriftelijk anders overeengekomen.  
Eventuele initiële technische opleveringshulp rond hosting wordt indien nodig apart afgestemd.

---

### **Onderhoud**

Onderhoud en support na acceptatie van de eindoplevering zijn niet inbegrepen en kunnen separaat worden geoffreerd.  
De opleveringsfase (mijlpaal 3) omvat wel een test- en feedbackperiode van circa vijf weken vóór afronding.

---

### **Aansprakelijkheid**

De aansprakelijkheid van opdrachtnemer is beperkt tot het bedrag dat voor de betreffende mijlpaal is gefactureerd en betaald.

---

## **12. Akkoord**

**Opdrachtgever						Opdrachtnemer**

Naam:								Naam:

Datum:								Datum:

Handtekening:							Handtekening:
