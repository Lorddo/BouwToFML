# Escalatiepaden — aanpak

Peildatum: 2026-07-29 · Status: **advies, vastgesteld met gebruiker** · Bron-inventaris: [`escalatiepaden-inventaris.md`](escalatiepaden-inventaris.md)

Dit document zegt **hoe** we de ruim tweehonderd escalatiepaden gaan opruimen. De inventaris zegt *wat* er is en blijft een bevroren momentopname; hier staan de doelstelling, het meetinstrument, de volgorde en de spelregels. Uit dit document worden vervolgens de losse plannen afgeleid — één per cascade, niet één voor het geheel.

Verwante documenten: [`audit-2026-07-29.md`](audit-2026-07-29.md) (risico 5 is de aanleiding), het E2E-fixtureplan (`.cursor/plans/e2e_fixtures_fml_current_*.plan.md`), [`decisions.md`](decisions.md) voor de formele besluiten, [`escalatiepaden-lagen-diagrammen.md`](escalatiepaden-lagen-diagrammen.md) (flow per laag/stage).

---

## 1. Wat het probleem wél en niet is

Het commentaar bij de drempels is **herkomst, geen hardcoding**. `shallowRescueAxisMinRelaxRatio: 0.5` staat er niet omdat 2D_3E in een `if`-conditie zit, maar omdat iemand op 2D_3E heeft gemeten dat 0,55 een fragment van 44px liet zakken. Dat is netjes gedocumenteerd werk en de inventaris stelt het ook zo vast: de coördinaten staan in commentaar, niet in condities.

Het probleem zit een niveau lager: **de waarde is gekalibreerd op n=1 en er is geen mechanisme dat vaststelt of hij generaliseert.**

Daarmee is "coördinaten uit de code halen" de verkeerde doelstelling — die staan er al niet. En "escalatiepaden verwijderen" is het ook niet, want sommige tekeningen hebben echt een tweede poging nodig. De bruikbare doelstelling volgt uit het onderscheid in sectie 2.

## 2. Het criterium: legitieme tak versus over-fit

| | Legitieme tak | Over-fit escalatie |
|---|---|---|
| **Trigger** | Een gemeten situatie: *"de referentie-swing is ondieper dan 60°"*, *"er is geen distance-map-sample op deze knik"* | Het feit dat de vorige poging niets opleverde |
| **Drempel** | Afgeleid van een gemeten grootheid (ref-dikte, ref-swing, schaal) of vastgelegd beleid | Gekozen om precies één waargenomen geval binnen te laten |
| **Voorspelbaar op nieuwe input** | Ja — de precondititie beschrijft de situatie | Nee — alleen door uitproberen |

**Het eindproduct van deze operatie is dus niet minder takken, maar: elke tak heeft een precondititie die de situatie beschrijft in plaats van de mislukking, en elke drempel is herleidbaar tot een meting of expliciet beleid.**

Vrijwel alle categorie-A items in de inventaris zijn vandaag het rechterkolom-geval. Wie dat verwart met "de tak moet weg" haalt correcties weg die iemand op een echte tekening heeft zien ontstaan.

---

## 3. Meetdekking: wat het E2E-harnas ziet en wat niet

Het E2E-fixtureplan bakt stap 0/1, de refs en de deur- en raampas als lijsten, en laat L2–L10, L11/L12, L14 en de FML-conversie draaien. Voor de oorspronkelijke vraag ("breekt een wijziging in laag 2 iets in laag 5") is dat exact goed. Naast de clusterverdeling van de inventaris gelegd:

| Cluster | Items A–E | Gedekt door het geplande harnas |
|---|---|---|
| Muren L2–L10 | ≈43 van 49 | **ja** — per-laag segment/junction-telling |
| Conversie/FML | ≈19 | **ja** |
| Deuren Stage 1/2 | ≈43 | nee — gebakken als lijst |
| Ramen Stage 1–4 | ≈24 | nee — gebakken als lijst |
| Refs | ≈18 | nee — verdisconteerd in de gebakken lijsten |
| Orkestratie | ≈50 | nee — volledig buiten het harnas |

Ongeveer 90 van de ruim 200 paden komen in beeld; de twee dichtste concentraties ná L5/L6 (deur-cascades en orkestratie) niet.

Daarbij: de 21 over-fit-ankers verwijzen naar vier tekeningen — 2D_3E (8 paden), BouwTek11 (5), Project4 (5), De Roemer (2), probe-1 (1). Van die vier staat alleen 2D_3E in het fixtureplan; Kinderdijkstraat en Amstelveenseweg zijn nieuwe tekeningen. Het harnas kan dus 8 van de 21 ankers bewijzen.

### Besluit (2026-07-29)

**Het E2E-plan blijft ongewijzigd.** Het escalatiewerk dat drempels of paden aanraakt beperkt zich voorlopig tot **muren L2–L10 en de FML-conversie** — precies wat het harnas dekt. Deuren, ramen, refs en orkestratie krijgen een eigen instrument (zie sectie 4 en 5) voordat daar iets aan gedrag verandert.

Consequentie die we bewust accepteren: 13 van de 21 over-fit-ankers hebben nog geen fixture. Het journaal uit batch nul is daar het vervangende meetinstrument, en dat is geen compromis maar de juiste keuze voor stages die per definitie niet-deterministisch mensenwerk als input hebben.

---

## 4. Het instrument: escalatie-grootboek

Een interview over 203 items loopt vast, en erger: het levert meningen op waar feiten nodig zijn. Wat de aanpak werkbaar maakt is dat de machine eerst drie vragen per pad beantwoordt en de mens alleen de restcategorie krijgt.

**De drie vragen per pad:**

1. **Vuurt dit pad ooit?** Elk pad krijgt een teller onder zijn inventaris-ID; de run rapporteert welke ID's afgingen, hoe vaak, per tekening.
2. **Vuurt het op meer dan één tekening?**
3. **Verandert de uitkomst als het uit staat?** Kill-switch per ID, run met het pad uit, snapshot diffen.

**Die drie feiten sorteren het merendeel automatisch:**

| Bevinding | Verdict | Interview nodig |
|---|---|---|
| Vuurt op 0 tekeningen | Dood pad — weghalen | nee |
| Vuurt altijd, en de primaire poging slaagt nooit | Het *is* de hoofdweg — promoveren, de dode aanloop opruimen | nee |
| Vuurt overal; uit → alles kapot | Legitieme tak — precondititie documenteren, drempel herleiden | nee |
| Vuurt op 1 van N; uit → alleen die tekening wijzigt | **Over-fit bevestigd** — hier ligt de echte vraag | **ja** |

De tweede regel is de grootste verborgen winst en staat nergens in de inventaris: **een cascade van negen stappen waarin stap 1 nooit slaagt is geen cascade, maar een algoritme met acht regels dode aanloop.** D-52 is daar al een expliciete verdachte — het commentaar zegt dat het pad alleen nog voor oude tests bestaat, terwijl het in productie het laatste redmiddel is.

Het grootboek is ook wat het latere interview kort houdt: alleen de vierde rij komt bij de gebruiker terecht.

---

## 5. Batch nul: stille fouten luid maken

De enige batch die *nu* kan, want hij heeft geen fixtures nodig en verandert geen gedrag. Hij is tegelijk de voorwaarde voor al het latere werk, want zonder journaal is niets van sectie 4 meetbaar.

### 5.1 Uitgangssituatie in de code

In heel `frontend/src` staan **twee** bestanden met een `console.warn`/`console.error`, en `setLocalError` is één string-slot voor blokkerende meldingen aan de gebruiker. **Een run die half is mislukt ziet er identiek uit als een run die is geslaagd.**

Er is wél een prototype, precies waar we heen willen: de deur-pipeline heeft een `diagnostics`-kanaal dat naar buiten komt uit `runDoorStagePipeline` (`stage1Diagnostics`, `angleRescueDiagnostics`), met getypeerde statussen (`rejected_outside_or_wall`, `rejected_out_of_band_or_aspect`, `rejected_cluster_no_match`) en `DoorFillFilterStats` met tellers per afkeurreden — en dat bereikt het deur-swing-rapport.

**Batch nul is dus niet "een logmechanisme bouwen" maar dat patroon generaliseren** naar muren, ramen, refs, conversie en orkestratie. Goedkoper, en het sluit aan op een kanaal dat de gebruiker al leest.

### 5.2 Drie soorten stilte, drie soorten luid

Dit onderscheid is het belangrijkste ontwerpbesluit van de batch: "alles loggen" levert ruis, en dan kijkt niemand er meer naar.

**a. Verzwegen fout** — een `catch` slikt een exceptie in. O-31 t/m O-41, plus X-23 (OpenCV laadt niet → geen diktemeting).

> Luid = exceptie vastleggen mét stack, en de run krijgt een vlag **gedegradeerd** die in het dev-paneel zichtbaar is. Niet per se een melding voor de tekenaar; de essentie is dat een half mislukte run niet meer op een geslaagde lijkt. O-36 is het scherpste geval: `orientBoundDoors` faalt, `oriented = []`, resultaat is een FML zonder deuren zonder dat er iets te zien is.

**b. Ontbrekende meting → getal** — W-07, W-13, W-14, R-05, R-23, X-22, REF-06 t/m REF-08. Er ging niets mis; er was geen meting en een default ging naar buiten.

> Luid = **geaggregeerd**, niet per gebeurtenis: *"dikte-fallback gebruikt op 37 van 214 knikken, waarde 30px uit referentie"*. Per-event verzuipt en kost de hot path. De vraag die hiermee stelbaar wordt en nu niet: is de vierstaps fallbackketen in `position-segments-hv.ts` één op honderd keer nodig, of één op drie?

**c. Meting weggegooid** — X-01 (`balance: 0.5`), X-02 (dikte → vaste tier), X-18 (`INK_THICKNESS_FACTOR` 0.9). Er is een gemeten waarde *en* een uitgaande waarde.

> Luid = **beide** vastleggen, zodat het verschil zichtbaar is. Dit is de categorie die direct tuning-signaal oplevert: als de gemeten balans systematisch 0,35 is en er gaat altijd 0,5 uit, dan weet je iets.

### 5.3 Scope deuren en ramen (alles vóór finalize)

Hier zit de grootste winst, en dit is waarom het besluit in sectie 3 samenhangt: als het harnas die stages niet draait, is het journaal op een echte tekening het meetinstrument daar.

Aanwezig: de deur-diagnostics hierboven en reject-reasons in `window-evidence-filter.ts`. Als eerste te wiren:

| Prio | Pad | Wat het journaal moet zeggen |
|---|---|---|
| 1 | **R-16** derde niveau evidence-cascade | *"raam geaccepteerd zonder rails- of framing-bewijs"* — nu volledig onzichtbaar; vermoedelijk de waardevolste enkele regel van de batch |
| 2 | **D-61** `existingDoorsOnly` | Dát de run in die modus liep en welke vier gates dus niet hebben gedraaid — anders is het verschil in false positives tussen de twee modi onverklaarbaar |
| 3 | **D-37** angle-rescue-injectie | Welke hypotheses via dat pad binnenkwamen, langs fill- en surround-filter heen |
| 4 | Match-cascades | **Welk niveau leverde** — deur Stage-1 (strikt → clipped-arc → sizeNear → shallow), REF-01/02/04. Dit is de kern van het latere grootboek en komt hier gratis mee |
| 5 | §7.1 ondergrens train-by-example | Eén regel bij `refBands.length < 3`. Kost niets en verklaart veel later gedrag |

### 5.4 Randvoorwaarden

- **Sink injecteerbaar en puur.** `cv/**` weet niets van UI, blijft werken in de worker (geen `document`/`HTMLImageElement`, conform `workspace-flow.md`), en er komt géén nieuwe `core ↔ cv`-koppeling bovenop de bestaande cirkel. Het deur-patroon doet dit al goed: diagnostics komen als **resultaat** naar buiten, de module schrijft niet ergens naartoe. Die richting aanhouden.
- **Hot paths allocatievrij.** In de L5-lus (≤20 iteraties), de L6-connector-loops en de face-edit-preview (waar net dirty-rect-werk in zit): alleen tellers per ID verhogen, geen strings of objecten alloceren. De leesbare samenvatting wordt pas aan het eind van de run opgebouwd.
- **Harde grens: geen enkele drempel wijzigt, geen enkel pad verdwijnt.** Puur observatie. Raakt de diff ook maar één numerieke waarde, dan hoort die in een latere batch. Dit is wat de batch veilig maakt terwijl het harnas nog niet staat.

### 5.5 Eindpunt van de batch

1. Het bestaande layer-debug-rapport krijgt een **journaal-sectie**.
2. Elke run krijgt een status **schoon / gedegradeerd**.
3. Dezelfde samenvatting wordt later het grootboek-veld in de E2E-snapshot.

Eén mechanisme, drie afnemers.

### 5.6 Uitgevoerd 2026-07-30 — wat het is geworden

Het journaal staat in `frontend/src/core/diagnostics/` (`run-journal.ts` + de gegenereerde ID-registry, die daarheen is verhuisd omdat productiecode niet uit `tests/` mag importeren; `check-esc-tags.ts --write-ids` schrijft nu naar `src`).

**Afwijking van 5.4, bewust.** De randvoorwaarde "diagnostics komen als resultaat naar buiten" is niet gehaald. Dat zou de signatuur van ~130 bestanden veranderen — precies het soort diff waarin een gedragswijziging ongemerkt meelift. In plaats daarvan een **module-scoped journaal**: `resetRunJournal(label)` bij een top-level actie, vrije functies (`escalate`, `tally`, `note*`) in de diepte. De module importeert alleen zijn eigen ID-registry, kent geen UI en geen DOM, en is dus worker-veilig. Prijs: verborgen state, en tests moeten `resetRunJournal()` in `beforeEach` doen.

**De worker is expliciet meegenomen.** De hele extractie (L1–L10, refs) draait in `cv-pipeline.worker.ts` en heeft daar een eigen module-instantie. De worker opent zijn eigen journaal en stuurt `summarizeRunJournal()` mee in het antwoord; `useExtraction` voegt dat samen via `mergeRunJournalSummary`. Zonder die stap waren juist de muur-tellers stil verdwenen.

**Tellers vs. gebeurtenissen.** `counts` per ESC-ID is de waarheid en mapt 1-op-1 op `EscalationLedger`. `events` is een steekproef, begrensd op 3 per ID en 400 per run (`droppedEvents` telt de rest). Hot paths gebruiken `tally(id, niveau)`: dat bouwt geen event-object en levert meteen teller **én** noemer — `W-14:sampled` naast `W-14:reference` beantwoordt de vraag uit 5.2b.

**Niveau-verdeling.** Elke `note*` verhoogt ook een niveau met de naam van zijn soort, dus elk ID krijgt gratis een verdeling (`R-16:framing` vs `R-16:evidence_missing`).

**Wat er níet in zit:**

- **O-40** is overgeslagen. Dat is een `ref()` die bij het samenstellen van de facade altijd wordt aangemaakt, ongeacht gebruik. Een teller daar telt de constructie, niet de escalatie — misleidender dan geen teller.
- **§7.1** kreeg geen ESC-ID, want de inventaris is bevroren. Het loopt via een aparte `DiagnosticCode` (`REF_COUNT_BELOW_ADVICE`) die buiten `escalations` blijft, zodat het grootboek strikt per ESC-ID blijft. Alleen op ramen gewired; deuren volgen als de inventaris een ID krijgt.
- Van de match-cascades zijn **D-15** (4 niveaus), **D-13** (ink/white/none), **REF-01** en **REF-02** gewired — niet alle elf takken van de angle-rescue.

Geen enkele drempel gewijzigd, geen enkel pad verwijderd. 989 tests groen (981 bestaand + 8 nieuw), `esc:check` 228/228, lint/format/build groen.

---

## 6. Volgorde ná batch nul

Geordend op risico en op beschikbaar meetinstrument — niet op laagnummer.

| # | Batch | Instrument | Waarom hier |
|---|---|---|---|
| **0** | ~~Stille fouten luid (sectie 5)~~ — **klaar 2026-07-30**, zie 5.6 | geen nodig | Voorwaarde voor al het overige; geen gedragswijziging |
| **1** | Categorie E in `core/fml` — X-01 (`balance`), X-11 (`mirrored` op ramen), X-13 t/m X-17 | E2E-snapshot | Verandert output, raakt **geen** detectiedrempel, volledig gedekt door het harnas. Grootste winst per risico-eenheid van de hele lijst |
| **2** | Idempotentie in de orkestratielaag (≈30 D-items) | idempotentie-test op composable-niveau | Eén defect met dertig pleisters — niet pleister voor pleister oplosbaar. Zie 6.1 |
| **3+** | A en B in muren L5/L6 en de deur/raam-cascades | grootboek **én** fixtures van de ankertekeningen | Hier hoort het interview thuis, en alleen voor paden die op één tekening vuren |

### 6.1 Waarom batch 2 anders werkt

Sectie 10.5 van de inventaris stelt de diagnose al: die dertig items bestaan omdat **her-detectie niet idempotent is**. Het instrument is hier geen fixture maar een test op composable-niveau — draai de detectie twee keer op dezelfde state en eis identieke uitkomst — plus een expliciete **herkomst** op face-classificaties (automatisch / handmatig / afgeleid), zodat "wat mag weg bij een her-run" één regel wordt in plaats van vier verschillende regels per klasse (O-01 t/m O-04).

Dit is de duurste batch en tegelijk de enige waar substantieel regels verdwijnen.

### 6.2 Categorie C

Grotendeels **F met documentatie**: dual-space is vastgelegd beleid (`DOOR_SPACE_POLICY`, `WINDOW_SPACE_POLICY`) en dus ontwerp, geen escalatie. Uitzondering is de **Either-constructie** (D-04, D-13, D-31): twee volledige pogingen in twee meetruimtes verdubbelt de zoekruimte en daarmee het aantal false positives dat de latere gates moeten wegfilteren. Dat verdient een eigen besluit.

---

## 7. Eenheid van werk: de cascade, niet de laag

"Laag voor laag, stage voor stage" moet op één punt worden bijgesteld. Sectie 10.2 van de inventaris geeft de reden: de cascades hebben per stap eigen constanten uit eigen tuning-objecten zonder gedeelde herkomst, dus **een verandering in stap 2 kan stap 7 stilzwijgend onbereikbaar maken.** Werk je per laag, dan raak je halve cascades.

**De werkbare eenheid is één cascade met al zijn tuning-objecten in één plan.** Dat zijn ruwweg vijftien tot twintig eenheden in plaats van 203 items, en het is precies de eenheid waarover het grootboek uitspraken doet.

Kandidaat-eenheden (te verfijnen bij het plannen):

| Cascade | Niveaus | Tuning-eigenaar |
|---|---|---|
| Deur Stage-1 match | 4 (strikt → clippedArc → sizeNear → shallow) × 2 meetruimtes | `DOOR_SWING_TUNING` |
| Deur L11 bind | 9 | `DOOR_WALL_SNAP_TUNING` |
| Deur angle-rescue | 11 takken | `DOOR_ANGLE_RESCUE_TUNING` |
| Raam evidence | 3 | `WINDOW_EVIDENCE_TUNING` |
| Raam axel-ref/strip-kalibratie | rails → as-band → strip | `window-axel-*` |
| L5 cleanup-lus | 8 takken × ≤20 iteraties | `pipeline-v3` policies |
| L6 connector-detect + geometry-resolve | 3 + 3 | `LAYER6_*` |
| L7–L10 guarded passes | 4 | `policies/layer-*` |
| REF opening-units / as-align | 4 + 4 | `cv/refs` |
| FML harmonize dikte + balance | keten | `core/fml` |

De tuning-objecten staan al netjes per cascade gecentraliseerd, met de herkomst in het commentaar. Dat is precies de basis die dit werkbaar maakt.

---

## 8. Ontwerp van de skill

De skill volgt de ingeburgerde vorm van `production-refactor` en `lean-dry-review` (INDEX → DOCUMENT → DISCUSS → VERBETER), met vier dingen die hij **anders** moet doen.

**1. Het interview vraagt naar de tekening, niet naar de code.** De agent kan zelf vaststellen wat de code doet; wat alleen de gebruiker weet is wat er op die tekening had moeten gebeuren. Dus: *"op Project4, face 262 — is dit een deur, en waaraan zie je dat?"* en niet *"wil je dit pad houden?"*. Het gezochte antwoord is de **precondititie in woorden**, want dat is wat de nieuwe drempel moet uitdrukken.

**2. Vaste verdict-woordenlijst per ID.** Vijf mogelijkheden, geen proza:

| Verdict | Betekenis |
|---|---|
| **PROMOVEREN** | Het pad is de hoofdweg; de niet-slagende aanloop wordt opgeruimd |
| **HERLEIDEN** | Drempel wordt een ratio van een gemeten grootheid |
| **AFBAKENEN** | Blijft, maar met expliciete precondititie én zichtbaar in het journaal wanneer het vuurt |
| **VERWIJDEREN** | Vuurt nooit, of wordt gedekt door een ander pad |
| **BEHOUDEN (F)** | Bewuste keuze; documenteren + test |

Zonder vaste woordenlijst wordt het grootboek proza, en dan is de volgende sessie het spoor kwijt.

**3. Uittredingscriterium per pad: er moet een test bestaan die faalt als het pad uit staat.** Bestaat die niet, dan is het pad óf niet nodig óf niet gedekt — en in beide gevallen is verder discussiëren zinloos tot dat is opgelost. Dit ene criterium voorkomt precies wat sectie 12 van de inventaris vreest: een correctie weghalen zonder te merken dat je dat doet.

**4. Nooit een pad verwijderen en een drempel wijzigen in dezelfde batch.** Anders is een regressie niet toe te wijzen. Zelfde discipline als de "geen big-bang"-regel in de bestaande skills, maar strakker, want hier is de diff per definitie gedragsveranderend.

---

## 9. Administratie en ID-stabiliteit

**Anker de ID's in de code, en doe dat vroeg.** De inventaris zegt het zelf: de regelnummers zijn een momentopname en schuiven bij elke wijziging. Een tag naast de betreffende tuning-key of tak (`// ESC:D-10`) kost bijna niets en houdt het document over drie maanden bruikbaar. Zonder dat is de inventaris binnen twee refactor-rondes archeologie.

**Zet het grootboek-veld in de E2E-snapshot terwijl die toch wordt gebouwd.** Eén extra veld met "welke escalatie-ID's vuurden, hoe vaak". Achteraf toevoegen betekent alle fixtures opnieuw goedkeuren.

**Verdeling over documenten:**

| Wat | Waar |
|---|---|
| Wat er is (bevroren momentopname) | `escalatiepaden-inventaris.md` — **niet bijwerken met besluiten** |
| Hoe we het aanpakken | dit document |
| Verdict + bewijs + datum per ID | `escalatie-ledger.md` (nog te maken) |
| Formele besluiten | `decisions.md` |
| Lopende staat | `memory.mdc` |

---

## 10. Besluiten van deze sessie (2026-07-29)

1. **Doelstelling herijkt** — niet "escalatiepaden verwijderen" maar: elke tak heeft een precondititie die de *situatie* beschrijft, elke drempel is herleidbaar tot een meting of expliciet beleid.
2. **E2E-plan blijft ongewijzigd**; escalatiewerk dat gedrag raakt beperkt zich eerst tot muren L2–L10 + FML-conversie. Deuren/ramen/refs/orkestratie krijgen eerst het journaal als instrument.
3. **Batch nul = stille fouten luid maken**, inclusief de deur- en raam-stages vóór finalize. Geen drempelwijziging, geen padverwijdering.
4. **Eenheid van werk is de cascade**, niet de laag of het bestand.
5. **Grootboek vóór interview** — de mens beslist alleen over paden die op precies één tekening vuren.

---

## Bijlage — code-bevindingen die dit advies onderbouwen

| Bevinding | Bewijs |
|---|---|
| Geen diagnostisch kanaal | Twee bestanden in heel `frontend/src` met `console.warn`/`console.error`; `setLocalError` is één string-slot |
| Diagnostics-prototype bestaat al voor deuren | `runDoorStagePipeline` levert `stage1Diagnostics` + `angleRescueDiagnostics`; `DoorSwingDiagnosticStatus` en `DoorFillFilterStats` in `cv/doors/types.ts` |
| Reject-reasons verspreid aanwezig | `door-room-surround.ts`, `window-evidence-filter.ts`, `connector-repair.ts`, `junction-repair.ts`, `door-swing-filter.ts` |
| Tuning al per cascade gecentraliseerd, met herkomst in commentaar | `DOOR_SWING_TUNING` (`door-swing-filter-matching.ts:9-40`), `DOOR_WALL_SNAP_TUNING` (`door-wall-snap-tuning.ts:4-41`), `WINDOW_EVIDENCE_TUNING`, `LAYER6_*` |
| Anker-tekeningen vs fixtures | 21 ankers over 2D_3E (8), BouwTek11 (5), Project4 (5), De Roemer (2), probe-1 (1); fixtureplan dekt alleen 2D_3E |
