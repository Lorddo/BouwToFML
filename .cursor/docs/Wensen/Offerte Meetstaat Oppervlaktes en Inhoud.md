# **Offerte – Meetstaat Oppervlaktes en Inhoud (FML-editor)**

Vervolg op Bouwtekening naar FML Conversietool / FML-editor

## **1. Gegevens**

**Opdrachtnemer:** dhr. Jordi Baudoin  
**Opdrachtgever:** Pranimate  
**Contactpersoon klant:** dhr. Sono  
**Offertenummer:** SW-0005  
**Datum:** 10-09-2026  
**Geldig tot:** 10-10-2026

---

## **2. Inleiding**

Hartelijk dank voor het vertrouwen in de FML-editor.

Deze offerte beschrijft een vervolgoplevering op die editor:

**"Meetstaat — oppervlaktes en inhoud"**

Doel is dat de tekenaar in de editor snel de cijfers paraat heeft die hij in het eigen rapport (BBMI / NEN 2580-vervolg) overneemt: gebruiksoppervlakte, bruto vloeroppervlakte, inhoud, en openingoppervlaktes. Geen officieel meetrapport en geen certificering — wél tabellen, JSON- en CSV-export.

Dit is een **tab Meetstaat in de FML-editor** (desktop). Geen detectie, geen veld-opname, geen dashboard-rapportage.

---

## **3. Doel & Probleemstelling**

Oppervlaktes en inhouden worden nu buiten de editor nagemeten of overgetypt. De geometrie (muren, kamers, gaten, daken, openingen) staat al in het model; de cijfers ontbreken als exportklaar overzicht.

Dit vervolg richt zich op:

* Eén Meetstaat-tab met tabellen: **totaal woning**, **verdiepingen**, **ruimtes**, **openingen**
* Cijfers die de tekenaar 1-op-1 in het eigen rapport kan zetten
* Classificatie van ruimtes naar **GO / GGB / EB / OIP** (gebruiksoppervlakte, gebouwgebonden buitenruimte, externe bergruimte, overig inpandig)
* Muursoort (buiten / dragend / binnen) via **muurgroepen**, los van gevelaanzichten
* Trapgaten en overige vloergaten die de tekenaar zelf tekent
* BVO als som van **buitenringen** (geen bounding box)
* Inhoud inclusief vloerplaten en schuine daken — **alleen als het dak is getekend**

De tekenaar blijft verantwoordelijk voor interpretatie (muursoort, roomtype, gaten, dakvlakken). De module rekent op dat model.

---

## **4. Wat u krijgt**

Oplevering in de bestaande **FML-editor** (geen wijziging aan de detectie-/conversie-app of de opname-PWA).

Roomtype-mapping naar GO / GGB / EB / OIP wordt in overleg vastgezet (defaults in de catalogus; opdrachtgever levert de gewenste indeling).

---

### **Mijlpaal 1 — Ruimtes + totalen**

Meetstaat-tab met tabellen **totaal woning**, **verdiepingen** en **ruimtes**. Oppervlaktes, nog geen inhoud en nog geen openingstabel.

* **Tab Meetstaat** in de editor, naast Plattegrond / Dak / Gevels  
* **Gebruiksoppervlakte per ruimte** (binnenmaten van de kamer), met roomtype en BBMI-klasse (GO / GGB / EB / OIP)  
* **Totaal netto gebruiksoppervlakte (GO):** inclusief niet-dragende binnenmuren, minus trapgat / getekende gaten, minus dragende wanden  
* **Totaal bruto vloeroppervlakte (BVO):** tot de buitenkant van de buitenmuren; som van buitenringen bij meerdere volumes  
* **Oppervlakte woning:** som volgens de afgesproken roomtype-mapping (GO vs. overige klassen zichtbaar in de totalen)  
* **Per verdieping:** GO / BVO en uitsplitsing naar BBMI-klasse  
* **Muurgroepen (meetsoort):** buiten / dragend / binnen — exclusief, los van gevelgroepen en aanzichten. Selectie toewijzen; optioneel voorstel “buitenring = buiten”  
* **Gaten:** tekenaar tekent trapgat / cutout; die oppervlakte telt niet mee in GO en niet als kamer  
* **Export** van deze tabellen: **JSON** + **CSV** (methodeversie en aannames in de JSON)  
* **Warnings** in de tab: ruimte zonder type, muur zonder meetsoort, ontbrekend trapgat (indicatie)

---

### **Mijlpaal 2 — Ramen + deuren**

Meetstaat-tabel **openingen**, plus de bijbehorende exportkolommen.

* Per raam en per deur: verdieping, host-muur, type, **breedte × hoogte** (FML-gat) → openingoppervlakte  
* Overzicht in de Meetstaat-tab (totaal per verdieping + totaal woning)  
* Meenemen in JSON- en CSV-export  
* Rond / driehoek / boog: silhouet waar de editor die vorm al kent; anders rechthoek met vermelding in de export  

Kozijnband en **glasoppervlakte apart** vallen buiten deze offerte (eigen bestandsformaat / kozijnmaten). Tot die tijd is het getal het **kozijngat**.

---

### **Mijlpaal 3 — Inhoudsberekeningen**

Inhoud op dezelfde Meetstaat-tabellen (woning, verdieping, ruimte). Geen extra rapportformat.

* **Netto inhoud per ruimte** (kameroppervlakte × verdiepingshoogte; onder een getekend dakvlak het volume tot dat vlak)  
* **Bruto en netto inhoud per verdieping** (bruto o.a. BVO × hoogte, inclusief vloerplaat waar die in het model staat)  
* **Totaal inhoud pand:** som van de verdiepingen, inclusief vloerplaten; schuine kanten **alleen** als dakvlakken zijn getekend  
* **Dak onvolledig of afwezig:** inhoud van de kap wordt niet verzonnen; de Meetstaat vermeldt dat dakvolume is overgeslagen  
* **Dakvlakken mogen in bovenaanzicht niet overlappen** (zelfde soort blokkade als “geen dak waar een hogere vloer ligt”). Tekenen/slepen dat overlap geeft, wordt geweigerd  
* Inhoud mee in JSON- en CSV-export  

---

### **Mijlpaal 4 — Test + feedback**

* Gezamenlijk toetsen op representatieve FML-panden (minimaal één gouden referentiepand, handmatig nageteld)  
* Feedback verwerken **binnen de scope** van deze offerte  
* Kleine mapping-bijstellingen GO / GGB / EB / OIP na eerste gebruik  
* Opleveringsdemo / walkthrough van de Meetstaat-tab en export  
* Korte aanvulling op de gebruikershandleiding (meetstaat, muursoort, gaten, dak)  
* Afronding en acceptatie  

Deze mijlpaal omvat een **test- en feedbackperiode van vier weken**.

---

## **5. Afbakening (Scope)**

### **Wel inbegrepen**

* Tab Meetstaat in de FML-editor  
* Tabellen: totaal woning, verdiepingen, ruimtes, openingen  
* Roomtype-mapping naar GO / GGB / EB / OIP (in overleg)  
* Muurgroepen meetsoort (buiten / dragend / binnen), los van gevelaanzichten  
* Aftrek van door de tekenaar getekende gaten / trapgaten  
* BVO als som van buitenringen  
* Openingoppervlakte ramen/deuren op FML-gat (breedte × hoogte)  
* Inhoud per ruimte, per verdieping en totaal pand; dakvolume alleen bij getekende dakvlakken  
* Overlap-verbod dakvlakken (bovenaanzicht)  
* JSON- + CSV-export  
* Test, vier weken feedback, demo en handleiding-aanvulling (mijlpaal 4)  

### **Niet inbegrepen**

* Officieel NEN 2580- of BBMI-meetrapport / certificering / huisstijl-PDF  
* NEN-hoogtestroken onder kap (&lt; 1,50 m / 1,50–2,00 m) — v1 rekent met modelhoogte / getekend dak, geen wettelijke strokenkaart  
* Glasoppervlakte en kozijnband los van het FML-gat (wacht op eigen formaat / kozijnmaten)  
* Automatisch herkennen van dragende wanden, trapgaten of dakvlakken  
* Wijzigingen aan de detectie-/conversie-app of de opname-PWA  
* Koppeling met Vabi, IFC-export of dashboard-rapportage  
* Bounding-box-oppervlaktes (bewust niet; BVO = buitenringen)  
* Doorlopend onderhoud / support na acceptatie (tenzij apart overeengekomen)  

Verzoeken buiten deze scope worden beschouwd als meerwerk en worden uitsluitend uitgevoerd na schriftelijke goedkeuring van opdrachtgever.

---

## **6. Prijs & Mijlpalen**

Vaste prijs met deelbetalingen per mijlpaal.  
Bedragen zijn **vrijgesteld van BTW** (opdrachtnemer is niet btw-plichtig).

Oppervlaktes (mijlpaal 1, 2 en 4): **€4.500**  
Inhoud (mijlpaal 3): **€1.500**

| Mijlpaal | Omschrijving | Bedrag |
| ----- | ----- | ----- |
| 1 | Ruimtes + totalen (Meetstaat-tab, GO/BVO/woning, verdiepingen, muursoort, gaten, JSON/CSV) | €1.500 |
| 2 | Ramen + deuren (openingstabel + export) | €1.500 |
| 3 | Inhoudsberekeningen (ruimte / verdieping / pand, dak indien getekend, overlap-verbod) | €1.500 |
| 4 | Test + feedback (vier weken, demo, handleiding) | €1.500 |

**Totaal projectbedrag:** €6.000

Facturatie per mijlpaal bij oplevering van die mijlpaal.  
Betaling binnen 14 dagen na factuurdatum.

---

## **7. Optionele Uitbreidingen**

Niet inbegrepen in het vaste projectbedrag. Uitvoering na schriftelijk akkoord.

### **Glas- en kozijnoppervlakte**

Apart glas- en kozijnoppervlak per opening, zodra kozijnmaten in het eigen bestandsformaat (of `extras`) structureel beschikbaar zijn.

**Investering:** nader te bepalen

---

### **NEN-hoogtestroken onder kap**

Oppervlakte/inhoud volgens 0 / 50% / 100% bij &lt; 1,50 m en 1,50–2,00 m onder het dakvlak.

**Investering:** nader te bepalen

---

### **PDF-meetstaat / huisstijl-rapport**

Opgemaakt document naast JSON/CSV. Rapportgeneratie voor BBMI/NEN blijft bij uw bestaande tools tenzij u dit onderdeel afneemt.

**Investering:** nader te bepalen

---

## **8. Planning**

| Fase | Doorlooptijd |
| ----- | ----- |
| Ruimtes + totalen | ± 2–3 weken |
| Ramen + deuren | ± 1–2 weken |
| Inhoudsberekeningen | ± 1–2 weken |
| Test, feedback & afronden | ± 4 weken |

Totale indicatieve doorlooptijd:

**± 9–11 weken**

Start na schriftelijk akkoord.  
Planning houdt rekening met parallelle werkzaamheden aan andere projecten.

---

## **9. Wat wij van u nodig hebben**

* Afgesproken indeling roomtypes → GO / GGB / EB / OIP (of akkoord op voorgestelde defaults)  
* Minimaal één representatief FML-pand als gouden referentie (handmatig nagetelde m², bij fase 3 ook m³)  
* Bevestiging welke muursoorten u hanteert (buiten / dragend / binnen; eventueel woningscheidend)  
* Eén vast inhoudelijk aanspreekpunt  
* Tijdige feedback tijdens de testperiode (mijlpaal 4, vier weken)  

Testdata wordt tijdens de uitvoering afgestemd.

---

## **10. Aannames**

* Deze oplevering bouwt voort op de bestaande FML-editor; detectie en opname-PWA wijzigen niet  
* Cijfers zijn **indicatief** volgens de in de export vastgelegde methode — geen gecertificeerde NEN 2580-meetstaat  
* De tekenaar classificeert muren, tagt ruimtes, tekent gaten en (voor kap-inhoud) dakvlakken  
* BVO = som van muur-union-buitenringen, geen omhullende rechthoek  
* Dakinhoud alleen bij getekende, niet-overlappende dakvlakken  
* Openingoppervlakte = FML-gat; glas/kozijn volgt later  
* Eindgebruikers werken met een moderne browser  
* Rapportage in uw BBMI-/NEN-documenten blijft bij u; wij leveren tabellen en export  

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

Projectbestanden (waaronder FML) en Meetstaat-exports blijven eigendom van de opdrachtgever — **niet** van de opdrachtnemer als softwareleverancier.

---

### **Hosting**

Eventuele kosten voor hosting, domeinen, opslag, bandwidth of diensten van derden zijn voor rekening van opdrachtgever tenzij schriftelijk anders overeengekomen.

---

### **Onderhoud**

Onderhoud en support na acceptatie van de eindoplevering zijn niet inbegrepen en kunnen separaat worden geoffreerd.  
De opleveringsfase (mijlpaal 4) omvat wel een test- en feedbackperiode van **vier weken** vóór afronding.

---

### **Aansprakelijkheid**

De aansprakelijkheid van opdrachtnemer is beperkt tot het bedrag dat voor de betreffende mijlpaal is gefactureerd en betaald.

De Meetstaat is een hulpmiddel. Opdrachtgever blijft verantwoordelijk voor de cijfers in het eigen rapport aan derden.

---

## **12. Akkoord**

**Opdrachtgever						Opdrachtnemer**

Naam:								Naam:

Datum:								Datum:

Handtekening:							Handtekening:
