# FML inspect-on-plan — briefing voor beide agents

**Doel:** één set product- en koppelafspraken voor OpnameChecklist (PWA) en BouwToFML (viewer). Geen interne uitvoeringsstatus van de converter.

**Datum:** 2026-08-18.

**Twee apps, één keten**

| App | Rol |
|---|---|
| BouwToFML (desktop) | Tekening → FML. Detectie, tekenen, areas/roomtags, guids. Geen veldinspectie. |
| OpnameChecklist (PWA) | Inspectie op locatie op een **geüploade / meegeleverde FML**. Geen detectie, geen OpenCV, geen FML-generatie. |

FML is de **ruimtelijke index** (geometrie + guid). Observations blijven de **bron van waarheid** in de PWA. Antwoorden gaan niet als canonical store het FML-bestand in.

---

## Productdoel

Inspecteur opent een FML in de PWA. Alle inspecteerbare objecten bestaan dan al als PWA-subjects (afhankelijk van de geselecteerde templates). Tikken op kamer / gevel / deur / raam / fixture opent de bestaande vragenlijst. De plattegrond kleurt mee (open / klaar). Afronden levert observations plus een stabiele guid-koppeling.

Dit is een **plattegrond-laag op bestaande PWA-subjects**, geen tweede inspectie-app.

Veldwerk gebruikt dezelfde canvas als de FML-viewer, in een **inspect-modus** (read-only tikken). Niet de volle tekenaar-editor (muur tekenen, knopen, dikte, nulpunt, rotatie).

---

## Beslissingen (beide agents)

Deze vijf punten wijken af van eerdere concepten. Dit is de lijn.

1. **Subjects bij openen, niet bij eerste tik.** Bij laden van de FML maakt de PWA rooms/assets aan voor alle relevante FML-objecten, gefilterd op de geselecteerde inspecties. Dat explodeert het aantal subjects; dat is geaccepteerd. De inspecteur ziet daardoor meteen wat nog openstaat.
2. **Gevel is één subject.** Een EPA-gevel is meerdere FML-muursegmenten. Tikken op een segment selecteert de gevel. Hoe we groepen in de editor/viewer bouwen (box-select, collineair, handmatig in BouwToFML, …) lossen we op zodra we bouwen. Het datamodel is wél v1: `fmlWallGuids: string[]`.
3. **Fixtures zijn inspect-targets.** `items[]` (keuken, sanitair, installaties, trap, …) telt mee: subject bij openen, tikbaar, kleuren.
4. **Observation-UUID blijft intern.** Koppeling is `fmlGuid` (+ kind, floorIndex). Dexie/Postgres-UUID niet vervangen door FML-guid.
5. **FML bevriezen zodra een inspectie loopt.** Geen her-detectie. Verplaatsen in de editor: guid behouden. Nieuw object: nieuwe guid. Hergenereren vanaf tekening = nieuwe IDs; bestaande antwoorden blijven op PWA-UUIDs (wees t.o.v. nieuwe FML).

---

## Wat de PWA al heeft

- Subjects: `property` → `floor` → `room` / `asset`
- Observations op `subjectType` + `subjectId`
- Completeness per room/asset (0 zichtbare vragen = compleet → groen)
- EPA-w: gevel / raam / deur zijn **assets**, geen ruimtes. BBMI/WWS denken in rooms.
- Geen maten in de veldapp (komen uit tekening; IFC later)
- Offline / Dexie; foto’s als JPEG (R2), geen FML-documentstore
- Structuurstap is nu **handmatig** (palette)

FML **vervangt die handmatige structuurstap**: bij openen voorinvullen, niet pas bij tikken.

Stack-match: beide Vue 3 + TypeScript + Vite + vue-i18n. FML-canvas is Vue + Konva (geen Quasar). OpenCV hoort **niet** in de PWA (~11 MB, desktop-werk).

---

## ID-contract (join key)

Officiële Floorplanner-FML heeft al guids:

| FML-veld | Betekenis |
|---|---|
| `walls[].guid` | Muur**segment** (knoop → knoop). Alleen, nooit “een gevel”. |
| `openings[].guid` | Deur of raam |
| `areas[].guid` | Kamer / binnenruimte (`name` / `customName` / `role`) |
| `surfaces[].guid` | Handmatig vlak (balkon, overlay, …) |
| `items[].guid` | Fixture (keuken / sanitair / installatie / trap, …) |

Junctions hebben **geen** FML-guid (`stableJunctionId` is afgeleid van `wallId:end`). Gevels groeperen daarom wall-segment-guids, niet knopen.

**Join key:** `project + floorIndex + kind + guid`.

In-memory mapping: FML `guid` = viewer `id` voor area / surface / wall / item. Bij openingen emit **`opening.guid`**, niet een interne composite zoals `${wallId}-door-…`.

`refid` is **catalogustype** (standaarddeur, driedelig raam, fixture-type), geen instance-ID.

Detectie-ids (`e0`, `door-swing-single-17`) zijn **niet stabiel** over een her-detectie.

Bovenlichten staan in de geëxporteerde FML (`{source}-bovenlicht`) met een eigen opening-guid. **Geen eigen inspect-subject** in v1: ze horen bij de bron-deur/raam. Guid blijft beschikbaar voor IFC.

---

## Mapping PWA ↔ FML

| FML | OpnameChecklist | Templates |
|---|---|---|
| `areas[].guid` + naam/role | `room` + `fmlGuid` | BBMI/WWS; EPA-w heeft geen roomTypes → rooms alleen aanmaken als een geselecteerde template rooms heeft |
| `openings[].guid` window/door | `asset` `raam` / `deur` + `fmlGuid` | 1-op-1 (EPA-w) |
| `walls[].guid` (lijst) | `asset` `gevel` + **`fmlWallGuids[]`** | één gevel-asset, meerdere segmenten |
| `items[].guid` | `asset` (type uit fixture-catalogus / later template) + `fmlGuid` | tikbaar; vragen alleen als template ze heeft (0 vragen = groen) |
| `surfaces[].guid` | later of negeren | overlay, geen kern-EPA |

Observation blijft `asset:uuid` / `room:uuid`. Room/asset krijgt **`fmlGuid`** (plus `floorIndex` / `kind`). Gevel extra: **`fmlWallGuids: string[]`**.

Roomtags uit FML (`name: "Woonkamer"`, `role: 0`) vullen `room_type` / label. Naamloze areas (schacht): overslaan of `overig`. Roomtype-catalogus BBMI 1-op-1 gelijk trekken met Floorplanner `role` is **geen** v1-eis; een ruwe mapping volstaat.

Kamers / fixtures zonder zichtbare vragen: completeness is 0 vragen = compleet; polygoon/item groen.

---

## Gevel (project-scope via settings)

Eén FML-muur = één segment tussen knopen. Een EPA-gevel is vaak 3–8 segmenten. **Toch één PWA-subject.**

**BouwToFML-store (v1):** groepen staan in `plan.source.settings.facadeGroups`:

```
{ id: "G1", code: "VG", name: "Voorgevel", wallGuids: ["…", "…"] }
```

- Project-breed (alle verdiepingen delen één “Voorgevel”).
- Muur-GUID blijft de haak; geen suffix in de GUID, geen `facadeGroupId` op de muur (Floorplanner stript wall-extras).
- In `/FML-editor` (bewerken + inspectie): aanmaken/koppelen/loshalen; tik op een segment selecteert alle leden **op die floor** (`FmlInspectHit.ids`).
- PWA join: `fmlWallGuids[]` ← `facadeGroups[].wallGuids` (of subset per floor).

Gedrag:

- Tik op elk segment van de groep selecteert dezelfde gevel-asset.
- Viewer-hit emit `id` (getikt segment) + optioneel `ids` (leden op floor); de PWA lost op naar de gevel die die guid in `fmlWallGuids` heeft.
- Groepen bestaan vóór of bij het openen van de FML in de PWA, zodat eager subject-aanmaak al gevels maakt en niet elk segment.

IFC/Vabi later: FML blijft geometrie+guid; observations blijven de tabel; IFC krijgt `FmlGuid=…` of `gevelAssetId → [wallGuid, …]`. VABI leest een muur als **lijst IDs**.

---

## Fixtures

`items[]` hoort in het inspect-plan.

- Subject bij openen (als de FML het item heeft).
- Tikbaar in inspect-modus.
- `inspectColors` op `items[].guid`.
- Asset-type: uit bekende fixture-refids waar mogelijk, anders generiek tot een template het specifieert.
- Geen vragen in de geselecteerde templates → groen (zelfde regel als kamers zonder vragen).

---

## Wat er gebouwd moet worden

### 1. FML-viewer: inspect-modus (converter-kant, te leveren)

Read-only pointer op de bestaande canvas. Geen geometrie-mutatie, geen detectie.

**API die de PWA gaat consumeren**

```ts
inspectMode?: boolean                    // default false = editor
inspectColors?: Record<string, string>   // FML-guid → #RRGGBB

inspectSelect: [hit: FmlInspectHit | null]

type FmlInspectKind = 'wall' | 'door' | 'window' | 'area' | 'surface' | 'item'

interface FmlInspectHit {
  kind: FmlInspectKind
  id: string          // FML guid (bij wall: het getikte segment)
  floorIndex: number
  wallId?: string     // alleen deur/raam
  ids?: string[]      // optioneel; gevel-groep van wall-guids als de viewer die al kent
}
```

Lege tik → `inspectSelect(null)`.

**Pointer (alleen als `inspectMode`)**

- Space-pan + wheel-zoom blijven
- Geen tools, junctions, sleep, dikte-pick
- Box-select niet verplicht in de eerste inspect-ronde (groeperen mag in de editor-app)
- Hit-volgorde: **opening → item → surface (geen cutout) → muur → kamer**
  - Muur vóór kamer op de rand, anders is een gevel niet tikbaar
  - Surface-cutouts zijn geen target
- Gewone tik selecteert (geen Ctrl)
- Geen `planUpdate`

**Kleuren:** de PWA (host) bepaalt de hex via `inspectColors`. Geen entry = huidige default (roomtype / muur grijs / deur amber / raam cyaan / fixture-default). Selectie-oranje wint visueel van status.

Omdat subjects bij openen bestaan, vult de PWA kleuren voor **alle** inspecteerbare guids, niet alleen aangeraakte:

| Status | Voorbeeld |
|---|---|
| Open / incompleet | `#f59e0b` |
| Klaar (incl. 0 vragen) | `#22c55e` |

### 2. PWA: koppeling

- FML-bestand bewaren (Dexie; download bij afronden). Geen nieuwe blob-API nodig in v1.
- Kolom `fmlGuid` (+ kind, floorIndex) op room/asset; gevel: `fmlWallGuids[]`.
- **Bij openen:** walk de FML, maak subjects aan die de geselecteerde templates kennen (rooms, raam, deur, gevel-groepen, fixtures). Idempotent op guid: heropenen maakt geen duplicaten.
- Bij tik: match bestaand subject op guid (of wall-guid ∈ `fmlWallGuids`). Geen create-on-tap.
- Vragenlijst op de selectie (`QuestionField` blijft).
- `inspectColors` uit completeness van **alle** FML-subjects.
- Geen OpenCV, geen her-detectie, geen maten invoeren.

**Completeness**

Eager create is de productkeuze. EPA-w (fotoplicht, `inspection.completed`) telt dan alle ramen/deuren/gevels mee. Dat is bewust: de plattegrond ís de status. Templates zonder vragen voor een object → dat object groen, geen blokkade.

### 3. Areas/surfaces in de FML zelf

Zonder `areas[]` in het bestand is er geen kamer-tik en geen room-subjects bij openen. Officiële Floorplanner-FML heeft die arrays met guid. Gegenereerde FML moet ze **vullen** en roundtrip-export mag ze niet wissen.

`surfaces[]` mag leeg blijven in v1 (geen kern-inspect).

### 4. Touch (in `/FML-editor`; workspace later bij knip)

Touch-editor zit in de losse viewer (`/FML-editor`, prop `touchEditor`). Op een muis-PC blijft de gewone hover/klik-flow (knopen zichtbaar bij muur-hover); Set/H/V/Move + 1-vinger/2-vinger-nav alleen bij `pointer: coarse`. Move = punten/openingen/fixtures verslepen; Set blijft multi-select. Workspace stap 4 blijft muis/desktop tot de module-knip.

Op tablet: split plattegrond + vragen. Op telefoon: sheet over de plattegrond.

### 5. Module-knip (latere schijf)

PWA neemt niet de hele detectie-app.

| Pakket | Inhoud | Waar |
|---|---|---|
| fml-core | types, import/export FML, guid | PWA + later IFC |
| fml-viewer | Konva-canvas + inspect-API | alleen PWA |

Niet meenemen: worker, OpenCV, stap 1–3, project-IndexedDB van BouwToFML.

Eerste integratie mag `FmlPreviewCanvas` als module zijn (geen npm-publicatie verplicht).

---

## Afronden en keten (niet v1-bouw, wél contract)

- Observations blijven in de PWA (tabel per object, keyed op subject-uuid + `fmlGuid`).
- FML-bestand gaat mee als geometrie (v1: ongewijzigd read-only; later writeback alleen bij veld-edit ramen/deuren).
- IFC-converter later: geometrie + IDs (en optioneel Psets). Niet de hele vragenlijst verplicht in IFC, wél altijd terug te koppelen.
- VABI leest IDs / tabellen per raam, deur, muur (muur = lijst segment-guids).

---

## Aanbevolen volgorde

1. Areas (+ items-guids) in FML + export die ze behoudt (anders geen kamer / fixture)
2. **Inspect-modus** op de FML-canvas (`inspectMode`, `inspectSelect` incl. `item`, `inspectColors`)
3. PWA: FML openen, `fmlGuid` / `fmlWallGuids`, **subjects bij openen**, kleuren terug naar canvas
4. Gevel-groepering in de editor/viewer (methode bij bouwen); PWA behandelt de groep al als één asset
5. Touch (pinch, pointer, grotere hits)
6. Module-knip als de API stabiel is
7. IFC-mapping later, puur op ids

---

## Buiten scope (v1)

- Detectie of FML-generatie in de PWA
- Volle editor in het veld (muur tekenen, knopen, dikte, nulpunt)
- Veld-edit ramen/deuren / FML-writeback (later, eigen stand — niet default inspect)
- Bovenlicht als eigen inspect-subject
- Surfaces als inspect-target
- Vabi / IFC-automatisering (wel ID-contract hierboven)
- Roomtype-catalogus BBMI 1-op-1 gelijk trekken met Floorplanner `role`

**Niet** buiten scope: gevel-als-groep, fixture-tik, subjects bij openen.

---

## Korte samenvatting voor agents

1. PWA inspecteert een **bevroren FML**; converter detecteert niet in het veld.
2. Koppeling = **`fmlGuid` + kind + floorIndex`**; gevel extra **`fmlWallGuids[]`**; observation-UUID blijft intern.
3. **Alle relevante subjects bij openen** (filter: geselecteerde templates). Niet create-on-tap.
4. **Gevel = groep wall-guids**, één asset. Groepeer-UI bij bouwen; datamodel nu.
5. **Fixtures (`items[]`) zijn tikbaar** en krijgen een subject.
6. Viewer levert **inspect-API**: `inspectMode`, `inspectSelect` (`wall` \| `door` \| `window` \| `area` \| `surface` \| `item`), `inspectColors`.
7. FML = geometrie + guid; observations = tabel. IFC/VABI later via dezelfde IDs.
8. Geen OpenCV in de PWA.
