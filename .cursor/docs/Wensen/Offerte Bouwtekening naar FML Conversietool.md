# **Offerte – Bouwtekening naar FML Conversietool (V1)**

## **1\. Gegevens**

**Opdrachtnemer:** dhr. Jordi Baudoin  
**Opdrachtgever:** Pranimate  
**Contactpersoon klant:** dhr. Sono  
**Offertenummer:** SW-0002  
**Datum:** 20-06-2026  
**Geldig tot:** 20-07-2026

---

**2\. Inleiding**

Hartelijk dank voor de mogelijkheid om mee te denken over de optimalisatie van uw tekenproces.

Deze offerte beschrijft de ontwikkeling van de webapplicatie:

**"Bouwtekening → FML Conversietool"**

De tool ondersteunt tekenaars bij het semi-automatisch omzetten van bouwkundige plattegronden naar een basisbestand dat geschikt is voor verdere verwerking binnen Floorplanner.

De applicatie richt zich op het herkennen en converteren van:

* Buitenmuren  
* Binnenmuren  
* Deuren  
* Ramen

Het eindresultaat is een exporteerbaar FML-bestand dat als basis kan worden gebruikt binnen Floorplanner voor verdere afwerking zoals maatvoering, ruimtebenamingen, sanitair, keukeninrichting en huisstijl-specifieke elementen.

De software is nadrukkelijk bedoeld als versnelling van het bestaande proces en niet als volledig automatische vervanging van de tekenaar. Door gebruik te maken van project-specifieke voorbeelden ("train-by-example") blijft de gebruiker controle houden over de interpretatie van de aangeleverde bouwtekening.

# **3\. Doel & Probleemstelling**

Momenteel worden bouwtekeningen handmatig overgetekend binnen Floorplanner.

Hoewel dit proces betrouwbaar is, brengt het aanzienlijke verwerkingstijd met zich mee.

De voorgestelde oplossing richt zich op:

* Verminderen van repetitief tekenwerk  
* Sneller opzetten van een basisplattegrond  
* Verkorten van de verwerkingstijd per project  
* Behoud van controle door de tekenaar  
* Verminderen van foutgevoelige handmatige invoer

Het doel van versie 1 is niet volledige automatisering, maar het realiseren van een aanzienlijke tijdsbesparing door de eerste opzet van de plattegrond geautomatiseerd te genereren.

---

# **4\. Wat u krijgt (V1)**

Een afgeschermde webapplicatie toegankelijk via een moderne browser op Windows.

## **Bestanden inladen**

* Drag & drop ondersteuning  
* Bestandskiezer  
* Ondersteuning voor:  
  * PDF  
  * PNG  
  * JPG  
  * JPEG

Per sessie wordt één object verwerkt. Per verdieping doorloop je het gehele process

---

## **Voorbewerking van de tekening**

De gebruiker kan de aangeleverde tekening optimaliseren met behulp van interactieve instellingen:

* Crop (Square en Polygon)  
* Contrast  
* Helderheid  
* Threshold  
* Noise reduction  
* Rotatiecorrectie  
* Download resultaat (bewerkte onderlegger)

Doel is het verbeteren van de herkenbaarheid van lijnen en symbolen.

---

## **Schaalbepaling**

De gebruiker bepaalt de schaal van de tekening door:

* Een horizontale referentielijn te selecteren  
* Een verticale referentielijn te selecteren  
* De werkelijke afmetingen in te voeren

Hiermee wordt een nauwkeurige pixel-naar-millimeter verhouding vastgesteld.

---

## **Train-by-Example herkenning**

De gebruiker markeert voorbeelden op de tekening van:

* Buitenmuur  
* Binnenmuur  
* Deur  
* Raam

De software gebruikt deze voorbeelden uitsluitend binnen de huidige sessie om vergelijkbare objecten automatisch te detecteren.

---

## **Automatische detectie**

Op basis van de geselecteerde voorbeelden analyseert de software:

* Lijnen  
* Contouren  
* Openingen  
* Symbolen

en genereert een eerste interpretatie van:

* Muren  
* Deuren  
* Ramen

---

## **Vectorisatie**

De gedetecteerde elementen worden omgezet naar een intern vector-model bestaande uit coördinaten.

De software werkt niet op rasterbasis maar op vectorbasis zodat export naar Floorplanner mogelijk is.

---

## **Controle Viewer en Editor**

De gebruiker krijgt een visuele preview van het resultaat.

Hierin worden weergegeven:

* Muren (selecteer type Buitenmuur, Tussenmuur, Binnenmuur met eigen muurdikte)  
* Deuren (selecteer Voordeur, Achterdeur, Binnendeur met eigen hoogte en bovenlicht)  
* Ramen (selecteer Type1, Type2, Type3 met eigen hoogte)

De viewer is uitsluitend bedoeld voor controle en lichte aanpassingen van de plattegronden zoals draairichting en types

Uitgebreide bewerking van de plattegrond vindt plaats binnen Floorplanner.

---

## **Detail instellingen** Voordat de export wordt gedaan, kunt u de default-hoogte instelling wijzigen per verdieping.

* Deuren (voor- / achter- / binnendeuren) hoogtematen  
* Ramen (hoogte en positiehoogte)

* ## Muren (plafond)

Deze instelling worden direct in het fml verwerkt zodat de 3D weergave juist wordt meegenomen in de export  
---

**FML Export**

Export van de gegenereerde plattegrond naar een Floorplanner-compatibel FML-bestand.

Dit bestand vormt de basis voor verdere afwerking binnen Floorplanner.

De export kan zonder download ook direct via Floorplanner API worden doorgestuurd

---

**Hosting**

Initiële hosting van de applicatie via Cloudflare infrastructuur, voor zover deze dienstverlening kosteloos beschikbaar blijft.

Eventuele toekomstige hostingkosten of kosten van derden vallen buiten deze offerte.

---

# **5\. Afbakening (Scope)**

## **Wel inbegrepen**

* Upload van PDF, PNG, JPG en JPEG bestanden  
* Handmatige beeldoptimalisatie  
* Schaalbepaling via referentielijnen  
* Train-by-example herkenning  
* Detectie van muren, deuren en ramen  
* Vectorisatie van herkende objecten  
* Controleviewer en lichte editor  
* Export naar FML (download & API koppeling)  
* Initiële hostingconfiguratie

## **Niet inbegrepen (v1)**

* Volledig automatische herkenning zonder gebruikersinput  
* AI-training over meerdere projecten  
* BIM-export  
* IFC-export  
* DWG-export  
* Automatische maatvoering  
* Automatische ruimtebenamingen  
* Automatische meubelherkenning  
* Automatische badkamer- of keukenherkenning  
* Opslaan van projecten  
* Gebruikersaccounts  
* Rechtenbeheer  
* ERP- of CRM-koppelingen  
* Ondersteuning voor andere besturingssystemen dan Windows

Verzoeken buiten deze scope worden beschouwd als meerwerk en worden uitsluitend uitgevoerd na schriftelijke goedkeuring van opdrachtgever.

---

# **6\. Prijs & Mijlpalen (v1)**

Vaste prijs met deelbetalingen per mijlpaal.

| Mijlpaal | Omschrijving | Bedrag |
| ----- | ----- | ----- |
| 1 | Projectstart | €500 |
| 2 | Voorbewerking en schaalbepaling | €750 |
| 3 | Train-by-example systeem en objectdetectie | €750 |
| 4 | Vectorisatie en Editor | €2.000 |
| 5 | FML-export, testfase en oplevering | €2.500 |

**Totaal projectbedrag:** €6.500 excl. BTW

Betaling binnen 14 dagen na factuurdatum.

---

# **7\. Optionele Uitbreidingen (V2)**

Niet inbegrepen in deze offerte.

## **Icoon bibliotheek**

Sanitair en keukenapparatuur worden niet automatisch herkend. Via icoon en drag plaats je deze direct in onze editor zodat je dit niet meer in de Floorplanner editor hoeft te doen.

Stel de juiste assets in voor:

* Keuken  
* Sanitair  
* Vlizotrappen

Indicatieve investering: €500 (voor een enkel profiel ondersteuning)

---

**Huisstijl bibliotheek**

Opslaan en hergebruiken van huisstijlen

Selecteer eigen kleur en room tags per klantprofiel, Ook kunt u ander type deuren en maatlijnen meenemen in dit profiel en het bovenstaande Icoon bibliotheek per profiel. 

Indicatieve investering: €1.500 (afhankelijk van hosting oplossing)

---

## **Aanzichten en doorsneden**

Optioneel kunnen aanzichten en doorsneden gebruikt worden en gekoppeld worden aan de plattegronden om hoogtematen van plafonds, ramen en deuren direct uit deze aanzichten te meten

.   
De software zal automatisch de locaties van ramen en deuren lokaliseren met lijnen zodat u alleen nog maar de hoogte juist hoeft aan te geven.

Indicatieve investering: €2.500

## **Gebruikersaccounts & Rollenbeheer**

* Beheerderaccounts (admin)  
* Gebruikersaccounts (tekenaar)  
* Uitnodigingen (invites)  
* Rechtenstructuur 

Indicatieve investering: €1.000

---

## **Detectie bibliotheek**

Opslaan en hergebruiken van detectieprofielen.

Wanneer meerdere projecten afkomstig zijn van hetzelfde tekenbureau of dezelfde opdrachtgever kan de software eerder gebruikte instellingen automatisch toepassen.

Indicatieve investering: nader te bepalen

---

**8\. Planning (v1)**

| Fase | Doorlooptijd |
| ----- | ----- |
| Projectopzet | ± 2 weken |
| Detectie en vectorisatie | ± 2 weken |
| Testfase | ± 4 weken |
| Feedbackverwerking en oplevering | ± 2 weken |

Totale indicatieve doorlooptijd:

**± 10 weken**

Start na akkoord en ontvangst van de aanbetaling.

---

# **9\. Wat wij van u nodig hebben**

* 10 tot 20 representatieve voorbeeldtekeningen  
* Verschillende tekenstijlen indien beschikbaar  
* 100 Credits voor Floorplanner.com voor internal testing  
* Tijdige feedback tijdens testfases  
* Eén vast aanspreekpunt voor inhoudelijke beslissingen

---

# **10\. Aannames**

* Plattegronden worden aangeleverd als PDF, PNG of JPG  
* Tekeningen zijn voldoende leesbaar voor menselijke interpretatie  
* Gebruikers beschikken over basiskennis van Floorplanner  
* Gebruikers werken met een moderne browser onder Windows

---

# **11\. Voorwaarden**

## **Acceptatie**

Een mijlpaal wordt geacht te zijn geaccepteerd wanneer de beschreven functionaliteit is gedemonstreerd en opdrachtgever niet binnen vijf werkdagen schriftelijk gemotiveerd bezwaar maakt.

---

## **Wijzigingen**

Aanpassingen buiten de scope van deze offerte worden beschouwd als meerwerk.

---

## **Eigendom**

Na volledige betaling verkrijgt de opdrachtgever het gebruiksrecht op de ontwikkelde software en wordt de broncode overgedragen.

Opdrachtnemer behoudt het recht om generieke technische kennis, herbruikbare componenten en niet-klantspecifieke software patronen in andere projecten toe te passen.

---

## **Hosting**

Eventuele kosten voor hosting, domeinen of diensten van derden zijn voor rekening van opdrachtgever tenzij schriftelijk anders overeengekomen.

---

## **Onderhoud**

Onderhoud en support zijn niet inbegrepen en kunnen separaat worden geoffreerd.

---

## **Aansprakelijkheid**

De aansprakelijkheid van opdrachtnemer is beperkt tot het bedrag dat voor de betreffende mijlpaal is gefactureerd en betaald.

---

**12\. Akkoord**

**Opdrachtgevers						Opdrachtnemer**

Naam:								Naam:

Datum:								Datum:	

Handtekening: 							Handtekening: