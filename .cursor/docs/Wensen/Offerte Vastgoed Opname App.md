# **Offerte – Vastgoed Opname App (MVP)**

## **1. Gegevens**

**Opdrachtnemer:** dhr. Jordi Baudoin  
**Opdrachtgever:** Pranimate  
**Contactpersoon klant:** dhr. Sono  
**Offertenummer:** SW-0003  
**Datum:** 10-09-2026  
**Geldig tot:** 10-10-2026

---

## **2. Inleiding**

Hartelijk dank voor de mogelijkheid om mee te denken over het digitaliseren van uw vastgoedopnames.

Deze offerte beschrijft de ontwikkeling van:

**"Vastgoed Opname App"**

Een Progressive Web App (PWA) met eigen backend en API, bedoeld om opnames voor vastgoedobjecten gestructureerd vast te leggen — inclusief onderdelen, antwoorden en fotobewijs — zodat deze data beschikbaar is voor uw bestaande dashboard en verdere verwerking.

De eerste toepassingen binnen deze oplevering zijn **BBMI** en **WWS**. Het systeem wordt gebouwd als generiek vastgoed- en inspectieplatform, zodat latere inspectietypes (zoals EPA, NEN 2580, WO, BOG, brandveiligheid) als templates kunnen worden toegevoegd zonder een nieuwe applicatie te bouwen.

De oplossing is nadrukkelijk bedoeld voor **opname en datavararing**. Rapportgeneratie blijft bij uw bestaande dashboard en tools.

---

## **3. Doel & Probleemstelling**

Opnames voor BBMI, WWS en vergelijkbare inspecties worden nu (deels) uitgevoerd door partners zoals makelaars, fotografen, ZZP’ers of inspecteurs die niet altijd de specialistische kennis hebben welke gegevens verplicht of relevant zijn.

Dit leidt tot:

* Incomplete of inconsistente opnames  
* Extra nabewerking door tekenaars / rekenaars  
* Dubbel werk wanneer meerdere inspecties op hetzelfde object plaatsvinden  
* Moeilijke hergebruik van eerder vastgelegde gegevens  

De voorgestelde oplossing richt zich op:

* Gestructureerd doorlopen van opname-onderdelen  
* Eén datalaag per vastgoedobject (herbruikbaar over inspecties)  
* Offline kunnen werken en later synchroniseren  
* Fotobewijs koppelen aan vastgelegde gegevens  
* Data beschikbaar maken via API voor uw dashboard  

Het doel van deze MVP is een werkend opnameplatform met BBMI- en WWS-templates — niet volledige automatisering van rapportage.

---

## **4. Wat u krijgt (MVP)**

Een PWA die werkt op moderne browsers op **iOS, Android, tablets (waaronder iPad) en desktop**, te installeren op het startsysteem zonder App Store-publicatie.

Ondersteunde talen in de interface: **Nederlands en Engels**.  
Visuele huisstijl: functionele default (geen klantspecifieke branding in deze offerte).

---

### **Platform & datamodel**

* Generiek model voor vastgoedobjecten (niet beperkt tot woningen)  
* Structuur: object → verdiepingen → ruimtes → assets  
* Pandbrede kenmerken op objectniveau (bijv. gevel-/dakgerelateerde gegevens)  
* Centrale attributencatalogus (gestructureerde gegevens i.p.v. losse “vragen-apps”)  
* Observations met tijd, bron en **eigenaar** (organisatie); geconsolideerde waarden (facts) op het object voor zover zichtbaar voor die organisatie  
* Eigenaarschaplaag op inspectieresultaten / observations / foto’s (`owner` + visibility: private / shared / public_to_client)  
* Foto’s als bewijs, gekoppeld aan het relevante onderdeel / observation  
* Templates per inspectietype (BBMI, WWS), met vastgezette templateversie per opname  
* Data-eigenaarschap bij u / de opnemende partij: export en meeneembaarheid; geen automatische overname van bestaande opnamedata bij wissel van organisatie

---

### **Opname-PWA (veldgebruik)**

* Opnames starten en doorlopen als **onderdelen** (geen klassieke vragenlijst-ervaring)  
* Ondersteuning voor aparte én gecombineerde opnames (BBMI en/of WWS)  
* Invoer van antwoorden en fotobewijs  
* Compleetheidsbeeld t.o.v. het gekozen template (wat ontbreekt nog)  
* Download van een dossier-export (gestructureerde data + bewijsreferenties)  
* Rollen: opnemer en admin/reviewer  

---

### **Offline & synchronisatie**

* Offline-first werken na synchronisatie van templates/projecten  
* Lokale opslag en sync-queue  
* Synchronisatie zodra verbinding beschikbaar is  
* Ondersteuning voor **meerdere devices op hetzelfde project** (verschillende inspecteurs / inspecties)  
* BAG-koppeling / objectidentiteit als onderdeel van de sync- en objectopbouw  
* Duidelijke sync-status in de UI  

---

### **BBMI- en WWS-templates**

* Opdrachtgever levert de volledige BBMI-checklist / onderdelenlijst  
* Opdrachtnemer vertaalt dit naar een werkbare template-subset in het platform  
* Opdrachtgever levert eveneens de WWS-checklist / onderdelenlijst  
* WWS-template wordt binnen deze MVP als afgeronde template opgeleverd  
* Templates worden in deze fase door opdrachtnemer geconfigureerd (op basis van aangeleverde lijsten)  

---

### **API voor uw dashboard**

* Eigen backend met API als technische bron van waarheid voor opnamedata (juridisch blijft u eigenaar van bronbestanden)  
* Uw dashboard kan hierop aansluiten om gegevens op te halen  
* Bouw, UI en rapportlogica van uw dashboard vallen **niet** onder deze offerte  
* Exact API-contract (auth-methode, endpoints, documentatievorm) wordt in overleg vastgelegd tijdens de uitvoering  

---

### **Delen van objecten & data-eigenaarschap**

* Vastgoedobjecten (fysieke identiteit, ruimtes, installaties) kunnen herkenbaar blijven en — waar gewenst — worden gedeeld tussen samenwerkende partijen (bijv. makelaar ↔ inspecteur)  
* Inspectieresultaten, observations, foto’s en rapportdata hebben een **eigenaar-organisatie** en zijn niet automatisch beschikbaar voor andere organisaties  
* Bij wissel van organisatie worden bestaande opnamegegevens **niet automatisch** overgenomen; delen gebeurt alleen expliciet (visibility / share)  
* U blijft juridisch eigenaar van bronbestanden en opnamedata; het platform is de technische bewaarplaats met export/dossier-download  
* Rechtenmodel wordt praktisch gehouden binnen de MVP-grenzen

---

### **Hosting**

Hosting, domeinen, cloudkosten en diensten van derden vallen **buiten** deze offerte en zijn voor rekening van opdrachtgever, tenzij schriftelijk anders overeengekomen.

---

## **5. Afbakening (Scope)**

### **Wel inbegrepen**

* PWA voor vastgoedopnames (iOS / Android / tablet / desktop)  
* Backend, database en API  
* Offline werken + synchronisatie  
* Meerdere devices op hetzelfde project  
* Rollen: opnemer + admin/reviewer  
* BBMI-template (op basis van door u aangeleverde checklist; werkbare subset)  
* WWS-template (op basis van door u aangeleverde checklist; afgerond binnen MVP)  
* Foto’s als bewijs (geen video)  
* Compleetheidsbeeld + dossier-download  
* BAG-gerelateerde objectidentiteit / koppeling binnen de sync-opbouw  
* Delen van objecten tussen samenwerkende partijen (MVP-niveau), met eigenaarschap op inspectiedata (geen automatische overname bij org-wissel)  
* Dossier-export zodat u data kunt meenemen  
* Nederlands + Engels in de UI  
* Korte gebruikershandleiding + opleveringsdemo / walkthrough  
* Test- en feedbackperiode in de opleveringsfase (zie planning)  

### **Niet inbegrepen**

* Native App Store / Google Play publicatie  
* Bouw of aanpassing van uw bestaande dashboard  
* Rapportgeneratie (BBMI-/WWS-/EPA-rapporten e.d.)  
* Koppeling met of wachten op uw iOS LiDAR / scan-app  
* EPA-, NEN 2580-, WO-, BOG- of brandveiligheid-templates  
* Video-opnames  
* Klantspecifieke huisstijl / branding  
* Realworks API-integratie  
* Partner-template / CSV-vulling naar externe sjablonen (apart traject)  
* Uitgebreide template-beheer-UI voor eindgebruikers (templates worden in MVP door opdrachtnemer geconfigureerd)  
* Doorlopend onderhoud / support na acceptatie (tenzij apart overeengekomen)  
* Hostingkosten en cloudverbruik  

Authenticatie (login-methode, eventuele aansluiting op bestaande accounts via uw dashboard) wordt tijdens de uitvoering nader afgestemd. De applicatie krijgt wel afgeschermde toegang met rollen.

Verzoeken buiten deze scope worden beschouwd als meerwerk en worden uitsluitend uitgevoerd na schriftelijke goedkeuring van opdrachtgever.

---

## **6. Prijs & Mijlpalen (MVP)**

Vaste prijs met deelbetalingen per mijlpaal.  
Bedragen zijn **vrijgesteld van BTW** (opdrachtnemer is niet btw-plichtig).

| Mijlpaal | Omschrijving | Bedrag |
| ----- | ----- | ----- |
| 1 | Projectstart | €500 |
| 2 | Engine + PWA (datamodel, auth/rollen-basis, opnameflow online) | €1.000 |
| 3 | Offline + Sync (incl. multi-device sync en BAG-objectkoppeling) | €1.000 |
| 4 | BBMI-template | €500 |
| 5 | WWS-template | €1.000 |
| 6 | Oplevering (test, feedback, handleiding, afronding) | €1.000 |

**Totaal projectbedrag:** €5.000

Facturatie per mijlpaal bij oplevering van die mijlpaal (mijlpaal 1 bij projectstart / ondertekening).  
Betaling binnen 14 dagen na factuurdatum.

Indien tijdens uitwerking blijkt dat de aangeleverde BBMI-/WWS-checklists of gewenste dekking substantieel groter is dan redelijkerwijs binnen deze vaste prijs past, wordt in overleg de scope aangescherpt of meerwerk voorgesteld — voordat die extra werkzaamheden worden uitgevoerd.

---

## **7. Optionele Uitbreidingen**

Niet inbegrepen in deze offerte. Indicatief; nader te specificeren na inhoudsanalyse.

### **EPA-template**

Configuratie van EPA als extra inspectietemplate op het bestaande platform.

Indicatieve investering: nader te bepalen (afhankelijk van checklistomvang)

---

### **NEN 2580 / WO / BOG-templates**

Uitbreiding naar aanvullende opname- en objecttypes.

Indicatieve investering: nader te bepalen (afhankelijk van checklistomvang)

---

### **Brandveiligheid-template**

Indicatieve investering: nader te bepalen (afhankelijk van checklistomvang)

---

### **Partner-template / gestructureerde export naar klant- of partnersjablonen**

Vullen van externe templates op basis van platformdata (JSON-gedreven; geen CSV-hoofdroute).

Indicatieve investering: nader te bepalen (afhankelijk van template en dashboard terugkoppeling)

---

## **8. Planning (MVP)**

| Fase | Doorlooptijd |
| ----- | ----- |
| Projectstart & opzet | ± 1–2 weken |
| Engine + PWA | ± 3–4 weken |
| Offline + Sync | ± 3–4 weken |
| BBMI-template | ± 1–2 weken |
| WWS-template | ± 2 weken |
| Test, feedback & oplevering | ± 4 weken |

Totale indicatieve doorlooptijd:

**± 16 weken**

Start na schriftelijk akkoord en ontvangst van de aanbetaling (mijlpaal 1).  
Planning houdt rekening met parallelle werkzaamheden aan andere projecten.

---

## **9. Wat wij van u nodig hebben**

* Volledige BBMI-checklist / onderdelenlijst (aangeleverd door opdrachtgever)  
* Volledige WWS-checklist / onderdelenlijst (aangeleverd door opdrachtgever)  
* Eventuele foto-eisen of voorbeelden per onderdeel (indien beschikbaar)  
* Eén vast inhoudelijk aanspreekpunt  
* Eén technisch aanspreekpunt voor API-aansluiting op uw dashboard  
* Tijdige feedback tijdens test- en opleveringsfase  
* Reeds gedeelde dashboard-context / voorbeelden zodat API-payloads logisch aansluiten  

Geen verplicht aantal proefobjecten vooraf; testdata wordt tijdens de uitvoering afgestemd.

---

## **10. Aannames**

* Opdrachtgever levert bruikbare BBMI- en WWS-checklists tijdig aan  
* BBMI wordt opgeleverd als volledige template opgeleverd op basis van de aangeleverde checklist  
* WWS wordt binnen MVP als volledige template opgeleverd op basis van de aangeleverde checklist  
* Eindgebruikers werken met een moderne browser; PWA-installatie op iPad/telefoon is voldoende (geen App Store)  
* Uw team sluit het dashboard zelf aan op de geleverde API  
* Rapportage en scan-/LiDAR-app vallen buiten deze oplevering  
* Initiële gebruikersaantallen / organisatienummer worden tijdens de startfase concreet gemaakt; het datamodel is multi-tenant voorbereid  
* Authenticatie-invulling (eigen login vs. aansluiting via uw omgeving) wordt in de startfase gekozen zonder de rest van de scope open te breken  

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

Opnamedata, bronbestanden (waaronder foto’s) en exports blijven eigendom van de opdrachtgever c.q. de opnemende / opdrachtgevende organisatie — **niet** van de opdrachtnemer als softwareleverancier.

Opdrachtgever kan via de oplevering (dossier-export / API) data exporteren en meenemen. Opdrachtnemer verwerkt en bewaart data uitsluitend ten behoeve van de dienstverlening binnen deze overeenkomst, tenzij schriftelijk anders overeengekomen.

---

### **Hosting**

Eventuele kosten voor hosting, domeinen, opslag, bandwidth of diensten van derden zijn voor rekening van opdrachtgever tenzij schriftelijk anders overeengekomen.  
Eventuele initiële technische opleveringshulp rond hosting wordt indien nodig apart afgestemd.

---

### **Onderhoud**

Onderhoud en support na acceptatie van de eindoplevering zijn niet inbegrepen en kunnen separaat worden geoffreerd.  
De opleveringsfase (mijlpaal 6) omvat wel een test- en feedbackperiode van circa vier weken vóór afronding.

---

### **Aansprakelijkheid**

De aansprakelijkheid van opdrachtnemer is beperkt tot het bedrag dat voor de betreffende mijlpaal is gefactureerd en betaald.

---

## **12. Akkoord**

**Opdrachtgever						Opdrachtnemer**

Naam:								Naam:

Datum:								Datum:

Handtekening:							Handtekening:
