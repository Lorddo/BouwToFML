# Stempel ↔ detectie — dubbele muren (bespreken)

Peildatum: 2026-08-20 · Status: **GEÏMPLEMENTEERD (optie A)** — ownership-pass in FML-laag; band-unificatie nog open.

Doel: meerdere agents hetzelfde probleem laten beoordelen. Implementatie: `resolve-stamp-ownership.ts` + `stampOwned` extras-vlag.

Flow-contract: [`workspace-flow.md`](workspace-flow.md).  
Huidige productkeuze stempel: [`decisions.md`](decisions.md) «Stap 2 muurstempel».  
Dit document **wijzigt die keuze niet**; het beschrijft een regressie + ontwerpvragen.

---

## 0. Hoe dit document gebruiken

Lees §1–§4 als feiten (code + observatie). Beoordeel §6-opties. Vul §11.

| Verdict | Betekenis |
|---|---|
| **PROMOVEREN** | Hoofdweg; andere paden mogen weg of worden vangnet |
| **AFBAKENEN** | Blijft, met duidelijke preconditie |
| **VERWIJDEREN** | Dood of gedekt elders |
| **BEHOUDEN (F)** | Bewuste keuze; laten |
| **ONZEKER** | Meer info / spike nodig |

Spelregel: geen pad én drempel in dezelfde diff als er later code volgt. Eerst methode, dan getallen.

---

## 1. Symptoom (observatie)

Stempel op stap 2: deel van de donor-muren **komt overeen** met de huidige scan, deel was **missend** op de tekening.

Na detectie + generate (stap 4): **dubbele / parallelle muren**.  
«Opschonen» haalt ze niet weg — hartlijnen liggen waarschijnlijk nét naast elkaar.

Gevoel van de tekenaar: **dubbel werk** — detectie tekent wat de stempel al is, inject zet de stempel er nóg eens bij.

Plaatsing is **handmatig**. Een afwijking van **een paar cm** is normaal, geen fout.

---

## 2. Huidige architectuur (feit)

Twee paden na bake, niet één bron van waarheid.

```
Stap 2 bake
  ├─ raster: stampBw → effectiveBw (compose)
  │          stampMask → Otsu-referentie (OR)
  └─ Stempelset only: injectWalls + bakeNulpunt
        ↓
Stap 3 room-first
  vlakken uit wit + inkt → finalize-mask → keepLargest blob → WASM-skelet → V3 L1–L10
        ↓
Stap 4 generate
  nulpunt-frame → injectStampWallsIntoPlan (alleen Stempelset)
                 → harmonize (pinned dikte) → sanitize
```

### 2.1 Raster (altijd na bake)

| Wat | Module |
|---|---|
| Ghost + bounds + gum | `frontend/src/ui/composables/workspace/useWallStamp.ts` |
| `stampBw` OR in B/W | `compose-wall-bw.ts` — `effectiveBw = baseBw → OCR-white → stampBw → ink` |
| `stampMask` OR in Otsu | `wall-stamp-raster.ts` → `geometry-pipeline.ts` / `room-recalculate-local.ts` |
| Band-filter min/mid/max | `filterWallsByBands` — default mid+max; **geen** vector-inject |
| Stempelset | `skipBandFilter` + `injectWalls`; translate-only; nulpunt-zaad |

Detectie ziet stempelpixels als muur. Room-first maakt vlakken **tussen** stempelmuren. Die inkt gaat het muurmasker in. Het skelet **tekent de stempel na**.

### 2.2 Vector-inject (alleen Stempelset)

| Wat | Module |
|---|---|
| Gate | `useWorkspace.ts` `getStampVectorInject` — alleen als `baked && skipBandFilter && injectWalls` |
| Plaatsing | `injectStampWallsIntoPlan` in `apply-stamp-to-floor.ts` |
| Offset | `bakeNulpunt − currentNulpunt` (`stamp-nulpunt.ts`) |
| Overlap | `replaceOverlap: true` — **beide eindpunten** binnen `STAMP_INJECT_SEGMENT_EPS_CM` (**8 cm**) |
| Dikte | `pinnedWallIds` — donor-dikte, niet `harmonize` |

Band min/mid/max: `injectWalls = []` → geen inject. Die muren bestaan alleen als raster → L10.

### 2.3 Sanitize (na inject)

`harmonizeFmlWallThickness` → `sanitizeFmlWalls`:

| Constante | Waarde | Bedoeling |
|---|---|---|
| `SANITIZE_WELD_EPS_CM` | **0,25 cm** | knoopjes lassen |
| `SANITIZE_AXIS_CLUSTER_EPS_CM` | **0,50 cm** | zelfde as; **niet** dikte — gang moet blijven |
| Cover | collineair + span volledig gedekt | muur-onder-muur |

Een parallelle muur **3–8 cm** ernaast is voor sanitize een andere muur. Dat is geen bug in cleanup; het beleid is te krap voor stempel-plaatsfout.

### 2.4 Skelet-blob (W-01)

`prepareRoomFinalizeMask` → `splitConnectedWallBlobs({ keepLargestOnly: true })`.

Meerdere wall-blobs → alleen de **grootste**. Bewuste keuze (losse garage = eigen plattegrond). Verdict elders: **BEHOUDEN (F)**.

Als stempelpixels de **enige brug** zijn tussen twee vleugels, en je haalt die pixels uit het masker, valt de kleinere vleugel af. Elke oplossing die stempel uit het skeletmasker knipt, moet dit expliciet adresseren.

Muurmasker ≠ alle zwarte pixels. Het is inkt/gap van vlakken class `wall`/`window` (`buildInkWallMaskData`). Stempelmuren komen er alleen in als er wall-class vlakken naast liggen (of via de huidige raster-OR in B/W + Otsu die die vlakken eerst maakt).

---

## 3. Waarom déze case dubbel wordt

Klassiek: **één donor-muur** dekt scan-deel + missend deel.

| Bron | Wat er ontstaat |
|---|---|
| Scan + stempel-raster | L10-segment op het overlappende stuk (eindpunten ≠ donor) |
| Eventueel | tweede trace iets verschoven (plaatsfout paar cm) |
| Inject | volle donor-muur (andere eindpunten) |
| `segmentsMatch` | faalt → donor wordt **toegevoegd**, detectie blijft |
| Sanitize | as-afstand > 0,5 cm → beide blijven |

Eindpunt-match van 8 cm lost deel-overlap niet op. Een muur van 10 m waarvan detectie 6 m ziet, matcht nooit op beide punten.

Gum raakt nu alleen het raster (`eraseMask` → `stampBw`/`stampMask`). `injectWalls` blijft de **volle** donorlijst. Weggegumde muren komen in stap 4 terug.

---

## 4. Constraints

### 4.1 Vast (niet onderhandelbaar zonder nieuw productbesluit)

- Stempel is **handmatig geplaatst**; paar cm afwijking is OK.
- Stempel **zijn muren** — als ze goed staan, zijn dat de juiste muren (donor-vector + plaats-transform), niet een WASM-zag over het raster.
- OpenCV only; geen AI.
- `keepLargest` niet stilzwijgend uitzetten (W-01).
- Sanitize 0,5 cm **niet** globaal ruimer maken (gangen).
- CV blijft single-floor; stempel is overname tussen floors.

### 4.2 Te kiezen

- Is de stempel **altijd waarheid** in een zone rond die muren, ook als de scan-hartlijn een paar cm anders ligt?  
  Werkaaname tekenaar (2026-08-20): **ja** — methode nog niet gekozen.
- Zitten min/mid/max en Stempelset op **dezelfde** vector-flow (alleen selectie verschilt: dikteband vs groep `stamp`)?
- Mag band-mode nog **stretchen**, of wordt alles translate-only?
- Hoe ver mag de “zelfde muur”-zone? (spouw/dubbele muur vs plaatsfout)

### 4.3 Spanningsveld slack

| Slack te krap (0,5–2 cm) | Slack te ruim (15–20 cm) |
|---|---|
| Huidige parallellen blijven | Echte spouw / dubbele blad kan verdwijnen |
| Plaatsfout van 4 cm overleeft | Gang is veilig (~80 cm+), spouw niet |

Plaatsfout: typisch 2–8 cm, soms ~10. Spouw hart-op-hart vaak ~15–30 cm. Daar zit het ontwerpruimte.

---

## 5. Kernvraag

**Waar wordt de stempel “owned geometry”, en hoe verdwijnt de detectie-kopie zonder de blob of een echte parallelle muur te slopen?**

Niet: “cleanup iets ruimer”. Wel: één bron van waarheid + een regel voor *zelfde muur* die bestand is tegen plaatsfout én deel-overlap.

---

## 6. Opties om te wegen

Geen van deze is gekozen. A is de werkaaname uit de chat, niet een besluit.

### A — Corridor + inject wint (FML-laag)

Stempel-vectoren altijd injecteren (set **en** band).  
Rond elke stempelmuur een **corridor**: lichaam (dikte) + plaats-slack (~6 cm).  
Detectie-muur die parallel is, span-overlapt, en hartlijn in de corridor heeft → drop/trim.  
Kopse scan-muur in de corridor → **T-snap** op de stempelhartlijn (niet droppen).  
Skeletmasker houdt stempel**strepen** (brug + DT). L10-trace over de stempel valt in de corridor en gaat weg.  
Vlakken in stempel-holtes onderdrukken = later, lost parallellen niet op.

| + | − |
|---|---|
| Lost deel-overlap + plaatsfout op zonder sanitize te slopen | Slack is een drempel (spouw-risico) |
| Stempel blijft de muur (donor-vector) | Twee maskers (vlak vs skelet) uitleggen |
| Band en set kunnen één pad worden | Gum moet inject-lijst knippen |

### B — Stempel-polylines als L1 (skelet-laag)

Bake slaat hartlijnen in image-px op. Die gaan als L1-segmenten het graph in (pinned). WASM tekent de scan; lassen op de snede. Nearby parallellen vroeg absorberen.

| + | − |
|---|---|
| Stempel ís het skelet; geen zag-kopie | Graph-las scan↔stempel (T/L) is nieuw werk |
| Dikte/DT kan van raster blijven | E2E/L1-contract wijzigen |
| | Zwaarder dan A voor hetzelfde productdoel |

### C — Occupancy / volle inkt (vlak-laag only)

Geen witte CC’s onder de stempel (holtes vullen of onderdrukken). Muren via stap-4 inject.

| + | − |
|---|---|
| Minder velden / deuren in stempelkamers | **Gedeelde rand** scan↔stempel blijft L10 (room-first tekent inkt↔kamer) |
| | Bbox vol zwart → buitencontour wordt een doos |
| | Zonder inject op band-modus verdwijnen die muren |
| | Lost de geobserveerde parallel **niet** op |

### D — Alleen overlap-eps / sanitize ruimer

`STAMP_INJECT_SEGMENT_EPS_CM` omhoog, of `SANITIZE_AXIS_CLUSTER_EPS_CM` omhoog, of cover met meer marge.

| + | − |
|---|---|
| Weinig code | Eindpunt-match faalt nog bij deel-overlap |
| | Globale as-eps eet gangen |
| | Behandelt symptoom, niet dubbel pad |

### E — Stempel uit detectie (geen raster in B/W/Otsu)

Scan-only detectie; inject is de enige stempelbron.

| + | − |
|---|---|
| Geen WASM-kopie van de stempel | `keepLargest`: vleugel weg als stempel de brug was |
| | Scan-helft van de overlappende muur blijft → alsnog corridor nodig (A) |
| | Dunne 1 px-brug voor connectivity bederft DT (~1 px dikte) |

---

## 7. Wat “stempel houden” wél is

Houden = donor-`a`/`b`/`thickness`/`balance` na dezelfde transform als de ghost (nulpunt + translate, eventueel bounds).

Niet houden = L10-trace over `stampMask`. Dat is een tweede geometrie.

Als A of B: die trace mag weg. De stempel niet.

---

## 8. Band vs Stempelset

Logica is gelijk; selectie verschilt.

| | Stempelset | min / mid / max |
|---|---|---|
| Selectie | groep `stamp` (handmatig op donor) | `classifyFmlThicknessBand` |
| Align nu | translate-only | stretch toegestaan |
| Inject nu | ja | nee (raster only) |
| Nulpunt | bake-zaad | geen |

Unificatie (als gekozen): beide inject + corridor; stretch uitzetten **of** dezelfde bounds-transform op de vectoren. Anders blijven band-muren een tweede pad.

---

## 9. Gum, overflow, openings

- Gum moet **raster + inject-leden** raken, anders komen gewiste muren terug.
- Stempel buiten scan: wit pad (`expandUnderlayForStamp`, max-edge 12k). Corridor/nulpunt in die extra ruimte.
- Stempel heeft geen openings. Deuren/ramen in een stempel-holte: alleen relevant als we daar vlakken blijven maken (C / huidige raster).

---

## 10. Ankerbestanden

| Concern | Pad |
|---|---|
| Bake / serialize / gum | `frontend/src/ui/composables/workspace/useWallStamp.ts` |
| Inject + eindpunt-match | `frontend/src/core/fml/apply-stamp-to-floor.ts` |
| Nulpunt-offset | `frontend/src/core/fml/stamp-nulpunt.ts` |
| Generate-hook | `workspace-fml-generate.ts` `finalizePlanInNulpuntFrame` |
| Inject-gate | `useWorkspace.ts` `getStampVectorInject` |
| Raster in B/W | `compose-wall-bw.ts` |
| Raster in Otsu | `wall-stamp-raster.ts` `orStampMaskIntoReference` |
| Finalize-mask + blob | `room-wall-finalize-shared.ts`, `room-wall-connected-blobs.ts` |
| Sanitize | `sanitize-fml-walls.ts` |
| Dikte pin | `harmonize-fml-wall-thickness.ts` `pinnedWallIds` |

---

## 11. Verdict-tabel

Ingevuld 2026-08-20 (code-review agent). Rationale + methode: §13.

| ID | Optie | Verdict | Notitie |
|---|---|---|---|
| S-A | Corridor + inject wint | **PROMOVEREN** | Enige optie die deel-overlap **en** plaatsfout dekt zonder L1–L10 of blob te raken |
| S-B | Stempel-polylines als L1 | **ONZEKER** | Vereist alsnog corridor (WASM traceert de stempelpixels), plus pinned-edge door L1–L10 + verse E2E-baselines. Alleen heropenen als A tekortschiet |
| S-C | Occupancy / volle inkt only | **AFBAKENEN** | Geen oplossing voor dit symptoom; blijft kandidaat voor kamer-/deur-hygiëne in stempelholtes |
| S-D | Alleen eps/sanitize ruimer | **VERWIJDEREN** | Eindpunt-eps faalt principieel bij deel-overlap; globale as-eps eet gangen. Lost op in A |
| S-E | Stempel uit detectie-raster | **VERWIJDEREN** | `keepLargest`-brug + DT-vervuiling, en de scan-helft van de gedeelde muur blijft → A blijft nodig |
| S-U | Band ≡ set (één vector-flow) | **AFBAKENEN** | Band-modus injecteert niet → heeft dit symptoom niet. Unificatie = apart besluit over stretch (§13.6) |
| S-G | Gum knipt inject-leden | **PROMOVEREN** | Echte bug, los van A: `eraseMask` raakt `injectWalls` niet |
| S-K | keepLargest laten (W-01) | **BEHOUDEN (F)** | A raakt het masker niet; brug blijft intact |

### 11.1 Extra bevindingen (code, nog niet in §1–§4)

| # | Bevinding | Bewijs |
|---|---|---|
| F-1 | `replaceOverlap: true` gooit **openings weg**. Bij een match filtert `injectStampWallsIntoPlan` de gedetecteerde muur uit `nextWalls`; L12-deuren en L14-ramen zitten op dat moment al op die muur (`extractionToPlanWithOrigin` met `layer12Doors` / `layer14Windows`) en de kloon krijgt `openings: []` | `apply-stamp-to-floor.ts` ~292, `cloneStampWall` ~116, `workspace-fml-generate.ts` ~215 |
| F-2 | T-snap kan **niet** op sanitize leunen: `JUNCTION_ON_AXIS_EPS_CM = 0,25 cm`. Een kopse scan-muur die 3–8 cm naast de stempelhartlijn eindigt wordt geen T — je houdt een stub of een spleet | `materialize-wall-junctions.ts` 18 |
| F-3 | `injectWalls` wordt één keer gezet in `beginFromDonor` en daarna nooit gefilterd; gum werkt alleen op `stampBw` / `stampMask` via `applyEraseToBw` | `useWallStamp.ts` 321, `wall-stamp-raster.ts` 217 |

---

## 12. Vragen aan een agent

1. Is A de juiste laag (FML ná L10), of hoort eigendom in het skelet (B)?
2. Hoe voorkom je parallellen bij 3–8 cm plaatsfout **zonder** een echte spouw te eten? Welke corridor-definitie (lichaam+slack vs ½+½+slack)?
3. Hoe laat je het skelet de stempel als **brug** gebruiken zonder de L10-trace te houden?
4. Wat gebeurt er met een T van scan-muur op stempelmuur (snap vs spleet vs valse parallel)?
5. Deel-overlap: hele keten droppen + donor, of knippen op de corridor-rand?
6. Moet band-stretch weg, of vector-meeschalen?
7. Wat is de kleinste wijziging die het symptoom stopt, vs de mooiste lange-termijnvorm?

Antwoord in §11 + korte rationale. Geen code tenzij gevraagd.

---

## 13. Advies (2026-08-20) — A, in de FML-laag, in vier stappen

### 13.1 Laag-keuze (vraag 1)

Het conflict bestaat tussen **twee vectorsets in dezelfde cm-ruimte**: de L10-trace en de geïnjecteerde donor-muren. Los het op waar beide bestaan — ná inject, vóór `harmonize`, dus in `finalizePlanInNulpuntFrame`. Dat is een pure functie op `Wall[]`, unit-testbaar, zonder WASM, zonder E2E-baseline-verversing.

B (stempel als L1) is conceptueel mooier maar duurder voor hetzelfde resultaat: de WASM-zag traceert de stempelpixels nog steeds, dus je hebt binnen de graph alsnog corridor-logica nodig — plus pinned-edge-semantiek door L1–L10 (L6-connector is al als fragiel gemarkeerd) en nieuwe baselines. Niet de eerste stap.

Het raster blijft ongemoeid. Daarmee houdt de stempel zijn twee nuttige rollen: kamer-omsluiting en `keepLargest`-brug (vraag 3). De trace ontstaat wél en verdwijnt daarna — bewuste verspilling, in ruil voor nul risico op een weggevallen vleugel.

### 13.2 Corridor die zichzelf begrenst (vraag 2)

Per geïnjecteerde stempelmuur *i*:

```
halfWidth_i = min( thickness_i / 2 + SLACK , 0,5 × gap tot naaste parallelle stempelmuur )
```

De tweede term is de kern: de **stempel begrenst zijn eigen corridor**. Zit er een spouw in de donor, dan injecteren we beide bladen en pakt elk blad maximaal de helft van de tussenruimte — twee gedetecteerde bladen overleven dan correct, elk gesnapt op zijn eigen donor-blad.

Met `SLACK = 6` en `thickness = 10` wordt de corridor 11 cm breed (halve breedte). Ontwerpvenster: plaatsfout ≤ 11 cm wordt geabsorbeerd, echte spouw vanaf ~15 cm hart-op-hart valt erbuiten. Dat venster is smal maar reëel; het is de reden om `SLACK` niet naar 15 te laten lopen.

Restrisico, expliciet accepteren: een spouw in de scan waar de donor maar één muur heeft, verliest het tweede blad. Dat volgt uit §4.2 «stempel = waarheid in de zone» en is te repareren met de gum op de stempel.

Victim-test per detectie-muur: bijna-parallel (≤ 6°), hartlijn binnen `halfWidth` van de **naaste** stempelmuur, en span-overlap met die stempelmuur. Kops op stempel = niet parallel = nooit victim → §13.4.

### 13.3 Knippen, niet droppen — en openings verhuizen (vraag 5)

Trek de stempel-span **langs de as** van de detectie-muur af, in plaats van de hele keten te droppen:

- overblijvend stuk < `MIN_KEEP` → weg;
- overblijvend stuk ≥ `MIN_KEEP` → blijft staan, met een eindpunt op de corridor-rand (dat eindpunt gaat daarna door de snap van §13.4).

Zo overleeft de situatie «detectie ziet 6 m van een 10 m donor-muur» én «detectie loopt door waar de stempel stopt» met dezelfde regel. Drop is gewoon trim met lege rest.

Verplicht onderdeel (F-1): openings op een verwijderd stuk gaan naar de stempelmuur, via centrum-projectie zoals `findCoverHost` in `sanitize-fml-walls.ts`. Zonder dit verliezen we deuren/ramen precies op de overlappende muren — en dat gebeurt vandaag al bij `replaceOverlap`.

### 13.4 T-snap (vraag 4)

Na trim: elk eindpunt van een niet-stempelmuur dat binnen de corridor van een stempelmuur valt, projecteren op de stempelhartlijn (verlengen of inkorten langs de eigen as). Sanitize kan dit niet overnemen — zie F-2, 0,25 cm.

Snappen, niet droppen: de kopse muur is echte scan-informatie. Zonder deze stap ruil je dubbele muren in voor stubs en spleten langs de hele stempelrand.

### 13.5 Gum knipt de inject-lijst (S-G)

Los van A: filter `injectWalls` op `eraseMask`-dekking (zelfde bounds-transform als de rasterisatie), zowel bij bake als in `serialize`. Nu komen weggegumde stempelmuren in stap 4 terug — dat is precies het gereedschap dat de tekenaar nodig heeft om het restrisico van §13.2 zelf op te lossen.

### 13.6 Wat níet verandert

| | |
|---|---|
| Band-modus | Blijft raster-only, geen inject → geen dubbele muren. Unificatie eerst een besluit over stretch (vraag 6): vectoren mee-schalen is technisch mogelijk (`transformWallsByBounds`), maar dan zijn donor-diktes en -lengtes niet meer echt. Voorkeur: band ook translate-only maken, apart |
| `keepLargest` | Ongemoeid (W-01) |
| Sanitize-constantes | 0,25 / 0,5 cm blijven; de corridor is stempel-lokaal en niet globaal |
| Raster in B/W + Otsu | Blijft — omsluiting + brug + DT |

### 13.7 Kleinste vs mooiste (vraag 7)

Ze vallen hier samen. Het kleinste dat het symptoom écht stopt is §13.2–13.4 plus de openings-overdracht; alles kleiner (optie D) faalt op deel-overlap. Eén nieuwe pure module (`core/fml/`, bijv. `resolve-stamp-ownership.ts`), één aanroep in `finalizePlanInNulpuntFrame`, en de eindpunt-eps van 8 cm verdwijnt of blijft als snelle voorsortering.

Getallen (`SLACK` 6 cm, hoek 6°, `MIN_KEEP` ~20 cm) zijn een startvoorstel, te tunen op BouwTek11 / Kinderdijkstraat — niet in dezelfde diff als het pad (§0).

---

## 14. Bespreking 2026-08-20 — vastgelegd door de tekenaar

> «Stempel is waarheid van de muur in zijn corridor (moet volledig worden overgenomen, met dezelfde diktes etc.). Muren moeten er op aan kunnen sluiten (mag via clean up worden opgeruimd als nodig). Ramen en deuren kunnen nog steeds uit het origineel komen.»

Gevolgen voor §13:

| # | Gevolg |
|---|---|
| P-1 | Stempel wint **geometrie én dikte** in de corridor. Dikte-kant bestaat al: `pinnedWallIds` slaat `harmonizeFmlWallThickness` over voor de inject-muren. Alleen de geometrie-kant is nieuw |
| P-2 | Restrisico uit §13.2 (scan-spouw waar de donor één muur heeft) is **geaccepteerd**. Slack mag daarom ruimer dan 6 cm. De `min()`-term blijft nodig, niet voor scan-spouwen maar zodat twee **donor**-bladen niet elkaars detectie-partner opeten |
| P-3 | «Zone» is **per stempelmuur**, niet per stempel-bbox. Een muur die in de scan staat maar niet in de donor blijft staan — ook binnen de bbox |
| P-4 | Aansluiten is een **eis**, geen bijproduct. Zie §14.1: Opschonen kan dit vandaag niet |
| P-5 | Openings blijven uit de detectie → overdracht naar de stempelmuur is verplicht, inclusief richtingscorrectie. Zie §14.2 |

### 14.1 «Mag via clean up» kan vandaag niet

| Constante | Waarde | Gevolg |
|---|---|---|
| `SANITIZE_WELD_EPS_CM` | 0,25 cm | eindpunten 5 cm uit elkaar lassen niet |
| `JUNCTION_ON_AXIS_EPS_CM` | 0,25 cm | kopse muur 5 cm naast de hartlijn wordt geen T |
| `SANITIZE_AXIS_CLUSTER_EPS_CM` | 0,5 cm | parallel op 5 cm is een andere as |

De aansluiting moet dus in de ownership-pass zelf, met de corridor als tolerantie (stempel-lokaal, niet globaal — §4.1 blijft staan).

Wil de knop «Opschonen» dit **later** nog eens kunnen doen, dan moet een muur weten dat hij van de stempel is. Die markering bestaat nu niet duurzaam: het enige spoor is het id-prefix `stamp-` uit `cloneStampWall`, en dat overleeft sanitize niet — T/X-split geeft de tweede helft `split-host-…`, cover geeft `sanitize-…`. Open keuze: extras-vlag op de muur, of lidmaatschap van de bestaande `stamp`-groep (die wordt bij download al gestript door `stripFacadeGroupsFromPlan`).

### 14.2 Openings overzetten — richting is niet triviaal

`mirrored` is relatief aan de muur-tekenrichting a→b ([`door-mirrored-semantics.md`](floorplanner/door-mirrored-semantics.md)). Donor-muren komen van een andere verdieping met willekeurige richting. Loopt de stempelmuur tegengesteld aan de detectie-muur, dan moet bij overdracht:

- `t → 1 − t`
- `mirrored[0]` omklappen (scharnier-einde start ↔ eind)
- `mirrored[1]` omklappen (zwaaizijde volgt de rechtse normaal, die met de richting meedraait)

Zonder dit springt de deur van scharnier én draairichting. Het cover-pad in `sanitize-fml-walls.ts` doet deze correctie vandaag ook niet; daar is het minder zichtbaar omdat host en victim uit dezelfde detectie-pass komen en doorgaans dezelfde richting hebben.

### 14.3 Beslist (2026-08-20)

| ID | Vraag | Besluit |
|---|---|---|
| Q-1 | Waar hoort de aansluiting? | **Snap in de ownership-pass, plus een duurzame stempel-markering** zodat «Opschonen» de pass kan herhalen. Markering moet split/cover overleven (id-prefix voldoet niet) |
| Q-2 | Collineaire voortzetting van de scan | **Stempeldikte overnemen** — fysiek dezelfde muur, geen knik op de naad. Alleen collineair (≤ hoekdrempel én op de as); kopse muren houden hun eigen dikte |
| Q-3 | `SLACK` | **8 cm** → halve corridor ~13 cm bij een muur van 10 cm. `min()`-begrenzing op de halve donor-tussenruimte blijft |

Openstaand na dit blok: alleen de vorm van de markering (extras-vlag vs `stamp`-groep) en de tuning van hoek / `MIN_KEEP` op fixtures. Getallen niet in dezelfde diff als het pad (§0).

---

## 15. Implementatie 2026-08-20

| Onderdeel | Keuze |
|---|---|
| Module | `frontend/src/core/fml/resolve-stamp-ownership.ts` |
| Vlag | `extras.stampOwned` (`stamp-owned.ts`) — **niet** facade-groep `stamp` |
| Inject | `replaceOverlap: false`; ownership ná inject, vóór `harmonize` |
| Pin dikte | `collectStampOwnedWallIds` (alle owned, niet alleen added) |
| Gum | `filterInjectWallsByEraseMask` bij `getFilteredInjectWalls` / generate |
| Opschonen | ownership vóór sanitize als er owned-muren zijn |
| Export | `serializeWall` stript `stampOwned` |
| Band | ongewijzigd (raster-only) |
| Slack / hoek / MIN_KEEP | 8 cm / 6° / 20 cm — tuning op fixtures later |

### 15.1 Ronde 2 — 3D-contract (2026-08-20)

Stempelset-muren moeten in Floorplanner **1-op-1** donor-cm én donor-dikte zijn. Detectie mag aansluiten; de stempel mag niet meebewegen.

| Onderdeel | Keuze |
|---|---|
| Coords | `freezeStampGeometry` na snap/weld — stamp `a`/`b`/`thickness` = inject |
| Junction | Alleen detectie → stempel (`snapWallToStamps` + `weldDetectionOntoStampEndpoints`); **geen** stempel→detectie-snap |
| Parallel | Overlap ≥ 50% van detectielengte → drop geheel (`STAMP_OWN_FULL_DROP_OVERLAP`) |
| Junction-eps | `STAMP_OWN_JUNCTION_EPS_CM = 3` (plaatsfout; sanitize 0,25 blijft globaal) |
| Bake-feedback | Stempelset toont inject-aantal (minus gum) na bakken |
