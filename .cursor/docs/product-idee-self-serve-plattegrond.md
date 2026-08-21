# Productidee — self-serve plattegrond + bureau als knop

Brainstorm 21 augustus 2026. Los van BouwToFML-klantwerk. Bedoeld om buiten dit project te bewaren.

Geen juridisch advies; contractpunten zijn intern kader, geen uitleg van de overeenkomst.

---

## Eén zin

Wij verkopen geen FML-editor en geen Floorplanner-vervanging. Wij verkopen een **2D-plan-dienst** (later eigen 3D), met een editor als trechter en een tekenbureau als knop.

---

## Waarom dit, en waarom nu

Er zijn veel floorplan-apps. Ze scoren vaak laag: tekenen is lastig, 3D belooft te veel, iedereen moet het zelf doen.

Wij hebben iets dat die apps niet hebben: een **tekenbureau (~50 man)** plus software die repetitief lijnwerk al deels wegneemt. Daardoor kan “laat het tekenen” een echte productknop zijn, niet een loze belofte.

De bestaande editor en het FML-datamodel zijn de trechter. Detectie blijft **bureau-only** — niet de eerste klantintegratie. (AI-variant: ooit, niet nu.)

---

## Contractkader (intern)

- Geen FML-bestand leveren aan eindgebruikers.
- Commercieel wel toegestaan, zolang we **niet** dezelfde markt raken: Nederlandse makelaardij en woningcorporaties.
- FML is **intern transport** tussen tekenaar en onze app/database. Klanten hebben geen floorplanner.com-account.
- Uitbesteden zet het resultaat klaar **in hun account in onze app**, niet in Floorplanner.

Gevolg: Floorplanner.com verdwijnt uit het klantpad. Het bureau mag intern tekenen in Floorplanner of in onze editor — dat is hun operatie, niet ons product. Ingest is hetzelfde: FML dat wij al kunnen inlezen en naar eigen 2D vertalen. Eigen 3D komt later, met eigen look.

---

## Drie lagen, één waarheid

| Laag | Wat | Wie |
|------|-----|-----|
| **Interchange** | FML + refid + maten/rotatie | bureau ↔ onze database |
| **Presentatie** | eigen 2D (nu), eigen 3D (later) | klant in de app |
| **Export** | PNG/PDF (eerste waarde); DXF/IFC later | klant deelt of levert door |

Look-and-feel mag totaal anders dan Floorplanner. **Betekenis mag niet.** Tekent het bureau een hoge koelkast, dan renderen wij een hoge koelkast — anders tekenen zij tegen een blinde muur.

---

## Twee persona’s

**1. Consument** — inspiratie, verbouw, “even een plattegrond”. Mag zelf tekenen. Mag ruis zijn. Voedt het bureau via “laat het tekenen”.

**2. Kleine ondernemer met herhalend werk** — aannemer, inspecteur, verhuur, keuken/bad, elektra, constructie. Wil professioneel overkomen bij de klant. Vaste sjablonen, lagen, PDF met maten, later inspectie-flows.

Niet: makelaars, corporaties, verkoopdossiers, Floorplanner-vervanging.

---

## Wat de klant wel en niet krijgt

**Wel**

- Gratis zelf tekenen.
- Export JPG zonder maatvoering (delen is beperkt nuttig).
- Tegen credits: JPG/PNG/PDF **met** maatvoering (deelbaar, professioneel).
- Tegen credits: uitbesteden aan het bureau (prijs n.a.v. m² / verdieping / leesbaarheid — afstemmen met bureau).
- Premium: eigen inspectie-flow gekoppeld aan ruimtes, muren, deuren, ramen (visueel i.p.v. papier).
- Later: eigen 3D-weergave; optioneel DXF/IFC (geen FML-export).
- Meerdere ontwerpen / lagen per verdieping (elektra, loodgieter, …).
- Catalogus uitbreiden: meubels (consument), symbolen elektra/water/CV (constructie). Eigen weergave, geen Floorplanner-look.

**Niet**

- Detectie / scan-naar-muren in de klantapp (dat is bureau-gereedschap).
- `.fml` download of Floorplanner-account.
- Abonnement als hoofdmodel (credits; abo voelt als dwang).

---

## Verdienmodel: credits

Drie credit-soorten, niet één munt die alles moet dekken:

| Soort | Voorbeeldrichting | Functie |
|-------|-------------------|---------|
| **Export** | ~€2-achtige impuls, later bundels | hek om maten / PDF / PNG |
| **Tekenopdracht** | bureau; kleinste &lt;80 m² zat intern rond ~€8 — **voorbeeld, afstemmen** | de moat |
| **Flow** | ~€50 per inspectie-flow (prijs per flow) | premium, sticky, herhaalgebruik |

Geen abonnement als kern. Credits passen bij “ik betaal als het ertoe doet”: export als het gedeeld moet worden, tekenopdracht als het goed moet, flow als het veldwerk is.

App-store-cut en support op €2-transacties zijn details; bundels (tegoed) zijn logischer dan losse micropayments als volume komt.

Uitbesteden is alleen houdbaar als detectie + korte correctie de norm is. Staffel op verdiepingen en leesbaarheid van de scan, niet alleen m². Slechte scan = toeslag of globale uitwerking.

---

## Refid is het echte contract

Intern: `refid` (wat het bureau tekent) ↔ eigen `kind` (wat wij renderen) ↔ eigen 2D-symbool / later 3D-mesh.

- Self-serve en bureau-tekening delen **dezelfde catalogus**.
- Klant plaatst “hoge koelkast”; op de draad staat de bureau-refid.
- Onbekende refid mag nooit stil verdwijnen: grijze doos + intern “unmapped”. Dat is belangrijker dan 200 extra meubels.
- Varianten binnen een soort (hoog vs laag) zitten in kind + hoogte (`z_height`), niet in “ongeveer een wit blok”.
- 3D is dezelfde mapping, andere meshes, eigen draai.

Eerste mapping-prioriteit: wat het bureau **dagelijks** zet (keuken, sanitair, trap, basis-installatie), niet de hele Floorplanner-catalogus.

---

## Inspectie (premium, persona 2)

Geen tabblad op een leeg canvas. Eerst een plan in het account (zelf getekend of via bureau). Daarna een flow die visueel langs ruimtes en elementen loopt in plaats van papier.

Past bij bestaande backend-richting (Cloudflare + Supabase), desktop/mobiel/tablet. De plattegrond is het podium; de flow is de voorstelling. Verkoop en onboarding los van “teken je zolder”.

---

## Export later: DXF / IFC

FML blijft intern. DXF/IFC is de B2B-export die constructie/installatie al kent.

- **DXF** (2D, lagen per discipline) is de realistische eerste vertaler.
- **IFC** is bouwkundige semantiek — pas bouwen als inspectie/constructie-klanten het eisen.

Consumenten vragen dit zelden; de elektricien of aannemer wel. Vertaling moet nog gebouwd worden.

---

## Platforms

Zelfde soort backend als de inspectie-app: Cloudflare + Supabase. Desktop, mobiel, tablet; Android en iOS.

Mobiel eerst: bekijken, licht annoteren, opdracht uitzetten. Tekenen blijft desktop/tablet.

---

## Bouwvolgorde (bewust smal)

Niet drie producten tegelijk. Mixer, Canva en veldwerk in één launch is te veel.

1. **PDF/PNG met maatvoering + watermerk-hek** — geometrie is er; dit is de eerste klantwaarde zonder FML.
2. **Uitbesteden-knop** — scan in, prijs, bureau tekent, resultaat in hetzelfde account. Dit bewijst de moat.
3. **Lagen / varianten per verdieping** — elektra, loodgieter, … retentie voor persona 2.
4. **Inspectie-flow** — koppelen aan bestaande inspectie-stack, niet opnieuw in de editor.
5. **Meubels / mooi maken / eigen 3D** — pas als er een basisplan is dat mensen doorsturen.
6. **DXF** (daarna IFC) — als B2B het trekt.

Detectie voor consumenten (“foto → muren”) hoort niet in deze lijst.

---

## Wat al staat vs. wat dit product nodig heeft

Al bruikbaar als kern (huidige plattegrond-stack): muren/deuren/ramen/ruimtes, schaal, meerdere verdiepingen, editor, auto-maatlijnen, scan→vector voor het bureau, FML inlezen naar eigen 2D.

Nodig voor dit product, nu dun of afwezig:

- accounts voor consument/ZZP en project-inbox bureau
- credits / betalen
- nette PDF (titelblok, schaalstok, noorden, legenda)
- place-tool op eigen `kind` die terugschrijft naar refid
- discipline-lagen
- inspectie-flow op het plan
- DXF/IFC-vertaler
- eigen 3D-meshes

Niet meenemen: Floorplanner-catalogus als publiek meubelpakket; hun 3D als verkoopargument.

---

## Bevroren vs. nog met het bureau

**Bevroren in deze brainstorm**

- FML intern; klant ziet app + raster/PDF; DXF/IFC later optioneel
- Detectie = bureau only
- Twee persona’s; credits; editor = trechter; uitbesteden = moat
- Catalogus = refid ↔ kind ↔ eigen 2D/3D; look mag anders, klasse niet
- 3D = eigen draai, ná 2D-PDF die klanten durven doorsturen
- Geen makelaars/corporaties

**Nog afstemmen (operatie, geen architectuur)**

- Staffel tekenopdracht (m², verdiepingen, leesbaarheid, doorlooptijd)
- Wat het bureau in Floorplanner blijft doen vs. in onze editor
- Dagelijkse refid-set = mapping-prioriteit
- Credit-bundels en exacte exportprijs

---

## Scherpe productzin (intern herhalen)

Wij verkopen geen FML-bestand en geen Floorplanner-kloon. Wij verkopen een nauwkeurige 2D-plattegrond (later eigen 3D) die je zelf maakt of laat maken, deelt als PDF met maten, en — als je herhaalt — vastzet in lagen en inspectie-flows.
