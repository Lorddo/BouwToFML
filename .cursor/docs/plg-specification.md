# `.plg` specification (v1)

Peildatum: 2026-09-16 · Status: **bron van waarheid voor het native planformaat** · Versie: `format: "plg-plan"`, `version: 1`

Dit document beschrijft **wat** een `.plg` is en **hoe** het eruitziet. Waarom het bestaat (adapters, commercie, IDB): [`.cursor/docs/plg-native-format-plan.md`](plg-native-format-plan.md). FML is een andere specificatie: [`.cursor/docs/floorplanner/v30-specification.md`](floorplanner/v30-specification.md).

**Regel voor wijzigingen:** veld, kind, persist of adapter aanpassen = eerst dit document lezen, daarna **overleg**. Niet stil een key toevoegen, hernoemen of naar `extras` duwen. Agent-regel: `.cursor/rules/plg-schema.mdc`.

Types in code (niet dupliceren, wél nalopen bij twijfel):

| Laag | Bestand |
|---|---|
| Document + settings | `frontend/src/core/plg/plg-document.ts` |
| Extensies (dak, gevel, kozijn, …) | `frontend/src/core/plg/extension-types.ts` |
| Plan / floor / wall / opening / item | `frontend/src/core/plan/types.ts` |
| Opening-kinds | `frontend/src/core/plan/data/opening-kinds.json` |
| Fixture-kinds | `frontend/src/core/plan/data/fixture-kinds.json` |
| Lees / schrijf | `readPlg` / `writePlg` / `migratePlg` |
| FML-brug | `frontend/src/core/plg/fml-adapter/` |

---

## 1. Wat het is

`.plg` is het **native JSON-bestand** van de plattegrond. De editor bewerkt een `FloorPlan`; download en IDB-planhelft serialiseren die naar een `PlgDocument`.

Drie lagen (niet door elkaar halen):

1. **Domein** — `FloorPlan` in geheugen (canvas, hit-test, sanitize).
2. **`.plg`-bestand** — versioned JSON; default open/save.
3. **Adapters** — FML in/uit (lossy), later IFC. Geen van beide is de opslag.

Geen parallel BIM-model. Geometrie blijft FML-achtig: muur `a→b` + dikte + balance; opening op de muur (`t`, breedte, z). Eigen concepten (soort, kozijn, dak, gevel) zijn **getypte velden**, geen Floorplanner-hashes en geen stille `extras`.

Converter-werkstaat (scan, B/W, maskers, `tabOutputs`) hoort **niet** in `.plg`. Die blijft een IDB-sidecar.

---

## 2. Eenheden en assen

Zelfde conventie als FML v3 persistent:

| | Waarde |
|---|---|
| Intern | **centimeter**, floating point |
| X | links → rechts |
| Y | boven → onder (scherm) |
| Z | omhoog; `0` = vloer van die verdieping |
| Eenheden-UI | alleen weergave (`settings.unitSystem` / `scaleInputUnit`); schrijft geen cm om |

Muur = **hartlijn** `a→b`. Areas liggen op de **binnenfaces**, niet op de hartlijn.

`t` op een opening: `0` = midden van de opening boven eindpunt `a`, `1` boven `b`.

`balance` (0…1): kijk van `a` naar `b`. Links van de hartlijn = die kant; rechts = de andere. `0` = hele dikte rechts, `1` = hele dikte links, `0.5` = symmetrisch.

Kleuren: `#` + zes hex-cijfers, tenzij een veld (zoals `lines[].color`) ook `0` als number toe staat.

---

## 3. Runtime vs persistent

In geheugen is één groot `FloorPlan`-object. Bij `writePlg` verdwijnt sessie-only state. Bij `readPlg` komen identiteiten (`id` + `kind`) op openings/items als ze ontbreken.

| Veld | Persistent `.plg` | Runtime |
|---|---|---|
| `wall.stampOwned` | **nee** — `writePlg` stript | ja |
| `opening.bovenlicht` / `bovenlichtHeightCm` / `bovenlichtGapCm` | **ja** (`null`/`undefined` = erf floor-default) | ja |
| `opening.swingHingeInsetCm` / `swingFreeInsetCm` | genegeerd | `@deprecated`; inset uit kind-catalogus |
| Junctions | **niet opgeslagen** | afgeleid `wallId:end` |
| Clear-height contour | **niet opgeslagen** | live uit dak-Z − `liningCm` |
| `plan.roof.clearHeightOverride` | slot bestaat, nu leeg | zelfde |
| Converter-scan / maskers / banden / `thicknessMin/Mid/Max` | **nee** | converter-runtime + IDB `cv` |
| `extras.fmlRefid` | **nee** — `writePlg` stript | nooit |
| `foreign.fml` | alleen na FML-import | opaque passthrough |
| `extras` / `source.leftover` | ja, ongetypt | ja |

`readPlg` valideert de **envelop** (format, version, project, settings) strikt. `plan` checkt alleen `name` + `floors[]`; diepe muur/opening-validatie zit in editor/import. Een kapot segment in een `.plg` komt er dus door.

Schrijven is deterministisch: header-keys in vaste volgorde; `plan` diep alfabetisch gesorteerd. Onbekende keys in de envelop worden niet gedropt (alfabetisch achteraan).

---

## 4. Document

```typescript
interface PlgDocument {
  format: "plg-plan";
  version: number;          // nu 1; integer
  generator: string;        // default "BouwToFML 1.x"
  savedAt: string;          // ISO-8601
  project: PlgProjectMeta;
  settings: PlgSettings;
  plan: FloorPlan;
  foreign?: PlgForeign;
}

interface PlgProjectMeta {
  id: string;
  name: string;
  address: string;
}

interface PlgForeign {
  fml?: Record<string, unknown>;  // Floorplanner-passthrough; nooit onze extensies
}
```

Content-sniff: `format === "plg-plan"` (niet de bestandsnaam). Hogere `version` dan de app kent → fout. Ontbrekende migratiestap → fout. Keten `migratePlg` is bij v1 leeg.

Schemakeys in het bestand zijn schoon (`frame`, `slices`, `role`). Nooit `btf*` als **onze** JSON-key in een klant-`.plg`. FML-export mag intern nog `btfFrame` / `btfSlices` schrijven — dat is adapter-output, geen `.plg`.

---

## 5. Settings

Project-eigendom dat in FML nooit first-class meekwam. Canonieke types: `PlgSettings` / `PlgFloorDefaults`.

```typescript
type PlgUnitSystem = "metric" | "imperial";
type PlgScaleInputUnit = "mm" | "cm" | "m" | "ft-in";
type PlgPlanDisplayStyle = "editor" | "bouw" | "architect";

interface PlgSettings {
  unitSystem: PlgUnitSystem;
  scaleInputUnit: PlgScaleInputUnit;
  planDisplayStyle: PlgPlanDisplayStyle;
  showCanvasGrid: boolean;
  defaults: PlgFloorDefaults;
}

interface PlgFloorDefaults {
  wallHeightCm: number;
  doorHeightCm: number;
  windowHeightCm: number;
  windowSillZCm: number;
  bovenlichtDefault: boolean;
  windowBovenlichtDefault: boolean;
  bovenlichtHeightCm: number;
  bovenlichtGapCm: number;
  thicknessCms: number[];       // catalogus, min 3, tot 8
  dakThicknessCm: number;       // seed als plan.roof.stack nog leeg is
  slabThicknessCm: number;      // idem per floor
}
```

`thicknessCms` is de catalogus. Converter-gate (`thicknessMin/Mid/Max`, `bandMid/Max`) wordt runtime afgeleid via `limitsFromCatalog` — niet in het bestand. `readPlg` slikt oude keys stil. `dakThicknessCm` / `slabThicknessCm` zaaien alleen een lege `plan.roof.stack`; live dikte leest de stack.

---

## 6. Plan

```typescript
interface FloorPlan {
  name: string;
  floors: Floor[];
  settings?: FloorPlanSettings;     // o.a. bovenlichtPacked
  facadeGroups?: FacadeGroup[];
  roof?: PlanRoof;
  elevations?: PlanElevations;
  source?: FloorPlanSource;         // FML-meta / leftover
}

interface FloorPlanSettings {
  bovenlichtPacked?: boolean;       // default true
}

interface FloorPlanSource {
  id?: number | string;
  public?: boolean;
  features?: unknown[];
  settings?: Record<string, unknown>;
  leftover?: Record<string, unknown>;
}
```

`facadeGroups`, `roof` en `elevations` staan **op het plan**, niet in `settings`. Na `readPlg` / promote zijn die settings-keys weg; accessors lezen alleen typed. De FML-adapter projecteert ze tijdelijk naar `source.settings` / design-settings op het export-object en stript wat Floorplanner niet mag zien.

---

## 7. Floor en design

Een *floor* is een verdieping. De editor werkt plat op `floor.walls` / `items` / … — dat is het actieve design. `designs[]` bewaart alle ontwerpen (plattegrond + sibling **Dak**).

```typescript
interface Floor {
  name: string;
  level: number;
  height: number;                   // verhaal-hoogte (cm); niet de nokspan
  walls: Wall[];
  items?: FloorItem[];
  areas?: FloorArea[];
  surfaces?: FloorSurface[];
  labels?: FloorLabel[];
  lines?: FloorLine[];
  dimensions?: FloorDimension[];
  drawing?: DrawingMeta;
  designs?: FloorDesign[];
  activeDesignIndex?: number;
  source?: FloorSource;
}

interface FloorDesign {
  name: string;
  walls: Wall[];
  items?: FloorItem[];
  areas?: FloorArea[];
  surfaces?: FloorSurface[];
  labels?: FloorLabel[];
  lines?: FloorLine[];
  dimensions?: FloorDimension[];
  slices?: PlanSlice[];             // slicer M/P
  autoDimensions?: boolean;         // autogen-maatlijnen
  role?: "ridge";                   // Dak-design
  source?: FloorDesignSource;
}

interface PlanSlice {
  m: Point2D;                       // meetlijn
  p: Point2D;                       // plaatslijn; M ⊥ P−M
}
```

Nokbalken en dakvlakken wonen op het Dak-design (`role: "ridge"`), niet op de plattegrond-design. `floor.height` overschrijven tilt **geen** nokspan; span = dakdikte.

Cameras, annotations en overige Floorplanner-designkeys: `source` / leftover, niet getypt.

### Onderlegger

```typescript
interface DrawingMeta {
  x: number;
  y: number;
  width: number;                    // cm
  height: number;
  rotation: number;                 // graden
  url?: string;
  alpha?: number;
  visible?: boolean;
  flipX?: boolean;                  // .plg + editor; FML kent geen flip
  extras?: Record<string, unknown>;
}
```

FML-export stript lokale `data:` / `blob:`-URL's. `.plg` mag die houden (editor-sessie).

---

## 8. Wall

```typescript
interface Wall {
  id: string;
  a: Point2D;
  b: Point2D;
  thickness: number;                // cm
  balance?: number;                 // 0..1
  c?: Point2D | null;               // kwadratische bezier
  openings: Opening[];
  elevation?: WallEndpointElevations;
  role?: "ridge" | "dormer";
  stampOwned?: boolean;             // runtime-only
  extras?: Record<string, unknown>; // decor, groupMarker, …
}

interface WallEndpointElevations {
  a: { z: number; h: number };
  b: { z: number; h: number };
}
```

`z` = onderkant van dat eind, `h` = absolute top-Z (niet span). Ontbreekt `elevation` bij FML-export: `{ z: 0, h: floor.height }`.

Nok-muur: `role: "ridge"` + lid van `plan.roof.ridge.wallIds`. Dakkapel-U (kopse + wangen): `role: "dormer"` — alleen `.plg`; FML-export is een gewone muur (geen `extras.ridge`). Geen first-class knoop-GUID: een knoop is het gedeelde eind van twee muren.

`extras` is passthrough (decor, native groupMarker). Nieuwe **onze** muurdata hoort als veld, niet in extras.

---

## 9. Opening

Een opening zit **op een muur**, nooit als vrij 2D-blok.

```typescript
interface Opening {
  id: string;                       // UUID; FML-export → guid
  kind: OpeningKind;                // geen Floorplanner-hash
  type: "door" | "window";
  t: number;                        // 0..1 langs a→b
  width: number;                    // gatbreedte cm (max 2000 in editor)
  z?: number;                       // dorpel t.o.v. vloer
  z_height?: number;                // openingshoogte
  mirrored?: [number, number];
  frame?: OpeningFrame;
  name?: string;
  showLabel?: boolean;
  name_x?: number;
  name_y?: number;
  materials?: Record<string, { type: string; value: string }>;
  extras?: Record<string, unknown>; // geen fmlRefid
  bovenlicht?: boolean | null;      // persist; null = erf default
  bovenlichtHeightCm?: number | null;
  bovenlichtGapCm?: number | null;
}

interface OpeningFrame {
  leftCm: number;
  rightCm: number;
  topCm: number;
  bottomCm: number;
}
```

`width` is het **gat**. Kozijn (`frame`) is display in dat gat; alle vier verplicht als het veld gezet is. FML kent alleen het gat.

`kind` is de identiteit van het type. `type` volgt altijd `kind` (`openingTypeFromKind`). Unmapped FML-hash → `door.unmapped` / `window.unmapped` + `ImportWarning`; FML-export gebruikt de catalogus-default-refid. Geen `extras.fmlRefid`.

`mirrored` — deuren: scharnier + zwaai. Bron: [`.cursor/docs/floorplanner/door-mirrored-semantics.md`](floorplanner/door-mirrored-semantics.md). Driehoekraam: `mirrored[0]` = L/R. Overige ramen symmetrisch.

Objectlabel (`name` / `name_x` / `name_y`) hangt aan de opening, niet aan `labels[]`. Roundtrip + transform; geen eigen UI.

### Opening-kinds

Bron: `opening-kinds.json`. Nieuw type = catalogus + overleg, geen ad-hoc string.

| kind | type | Glyph-familie |
|---|---|---|
| `door.single` | door | single |
| `door.closet` | door | closet45 |
| `door.passage` | door | passage |
| `door.archway` | door | archway |
| `door.french_balcony` | door | french_balcony |
| `door.double` | door | double_wide (glas) |
| `door.double_solid` | door | double_wide (vol) |
| `door.bifold` | door | bifold |
| `door.bifold_double` | door | bifold_double |
| `door.pocket` | door | sliding_pocket |
| `door.sliding_single` | door | sliding_single |
| `door.sliding` | door | sliding |
| `door.garage` | door | garage |
| `door.unmapped` | door | single |
| `window.single` | window | single |
| `window.double` | window | multi (2) |
| `window.triple` | window | multi (3) |
| `window.round` | window | round |
| `window.half_round` | window | half_round |
| `window.triangle` | window | triangle |
| `window.blind` | window | single (plaat) |
| `window.unmapped` | window | single |

Boog-inset (`swingInsetCm`) en default-kozijn komen uit de catalogus, niet van de instantie.

---

## 10. Area

Gesloten binnenruimte, automatisch uit muurfaces. Punten op de **binnenkant**, niet de hartlijn.

```typescript
interface FloorArea {
  id: string;
  poly: Point2D[];
  color: string;
  showAreaLabel: boolean;
  showSurfaceArea?: boolean;
  role?: number;                    // Floorplanner-roomtype
  name?: string;
  customName?: string;
  name_x?: number;                  // cm-offset t.o.v. centroid
  name_y?: number;
  liningCm?: number;                // dakbekleding; default 0
  extras?: Record<string, unknown>;
}
```

`liningCm`: offset t.o.v. onderkant schild. Positief = 1,50-lijn naar de nok; negatief ruimer, clamp ≥ `−dakThicknessCm`. Alleen op area, niet op surface. Formule: zie [`roof-clear-height.md`](roof-clear-height.md).

`isCutout` / Trapgat is een **surface**, geen area.

---

## 11. Surface

Handmatige polygoon: dakvlak, trapgat, vlak zonder muren.

```typescript
interface FloorSurface {
  id: string;
  poly: Array<Point2D & { z?: number }>;
  color: string;
  showAreaLabel: boolean;
  showSurfaceArea?: boolean;
  role?: number;
  name?: string;
  customName?: string;
  name_x?: number;
  name_y?: number;
  isCutout?: boolean;               // Trapgat = vloerplaat, geen dak-gat
  isRoof?: boolean;
  pattern?: number;
  origin?: "generated" | "manual";
  roofKind?: "plane" | "dormer";    // default "plane"
  roofParentId?: string;            // alleen bij dormer
  extras?: Record<string, unknown>;
}
```

Voor dakvlakken is `poly[].z` de **onderkant van de dakplaat** (plafond), t.o.v. vloer-Z 0 — niet het hart. Aanzicht-dikte gaat omhoog. Goot mag tot `−slabThicknessCm`.

Dakkapel = kindvlak (`roofKind: "dormer"` + `roofParentId`), **geen gat** in het ouder-vlak. Sibling-overlap verboden.

Trapgat (`isCutout`): dichte vloerplaat op Dak-tab, geen kamer bij area-regen; overlay blijft op de plattegrond.

---

## 12. Item (fixture)

Los object op de plattegrond (keuken, sanitair, trap, dakraam). Geen opening.

```typescript
interface FloorItem {
  id: string;
  kind: FixtureAssetKind;
  x: number;
  y: number;
  z?: number;
  width: number;
  height: number;                   // plattegrond-diepte (Y-maat)
  z_height?: number;
  rotation?: number;
  mirrored?: [number, number];
  roofSurfaceId?: string;           // GUID FloorSurface (Dak-design)
  name?: string;
  showLabel?: boolean;
  name_x?: number;
  name_y?: number;
  extras?: Record<string, unknown>;
}
```

`skylight` is een fixture, geen `Opening`. Koppeling aan een schild alleen via «Muren aan dak» (`roofSurfaceId` + `z`). Geen auto-snap op de plattegrond. Aanzicht samplet Z live van dat vlak.

### Fixture-kinds

Bron: `fixture-kinds.json` + `FixtureAssetKind`. Nieuw objecttype = catalogus + overleg.

| kind | Categorie |
|---|---|
| `countertop` `fridge` `cabinet_high` `kitchen_sink` `cooktop` `dishwasher` | keuken |
| `washing_machine` `dryer` `washer_dryer` | was |
| `toilet` `toilet_wall_hung` `sink_small` `sink_large` `sink_vanity` `sink_double` `bathtub` `shower_head` `glass_wall` | sanitair |
| `fuse_box` `boiler` `heat_pump` `koof` `oil_bottle` | installaties |
| `stair_winder_180` `stair_quarter_90` `stair_quarter_90_up` `stair_straight` `stair_straight_double` `stair_opening` `railing` | trap |
| `skylight` `roof_eave` `dormer` `chimney` | dak |
| `canopy` `hidden` `balustrade` | buiten |
| `entrance_arrow` `north_cross` | annotatie |
| `generic` | overig |

`dormer` als fixture is het 2D-symbool (alleen FML-import / roundtrip, **niet plaatsbaar**). Het bouwkundige dakkapel-object is `FloorSurface.roofKind` + muren met `wall.role: "dormer"`.

---

## 13. Label, lijn, maatlijn

```typescript
interface FloorLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  fontFamily: string;
  fontSize: number;                 // wereld-cm-equivalent (16 px ≈ 20 cm)
  letterSpacing: number;
  fontColor: string;
  backgroundColor: string;
  backgroundAlpha?: number;
  align: "left" | "center" | "right";
  rotation: number;
  outline?: boolean;
  bold?: boolean;
  italic?: boolean;
  extras?: Record<string, unknown>;
}

interface FloorLine {
  id: string;
  a: Point2D;
  b: Point2D;
  type: "solid_line" | "dashed_line" | "dotted_line" | "dashdotted_line";
  color: number | string;
  thickness: number;
  extras?: Record<string, unknown>;
}

interface FloorDimension {
  id: string;
  type: "custom_dimension";
  a: Point2D;
  b: Point2D;
  extras?: Record<string, unknown>;
}
```

Drie maatlijn-sporen (weergave exclusief):

| Spoor | Persist |
|---|---|
| Autogen | `design.autoDimensions` (flags; overlay niet opslaan) |
| Slicer | `design.slices[]` `{ m, p }` |
| Handmatig | `dimensions[]` |

Labels schalen in wereld-cm (niet scherm-px). Kamerbenaming gebruikt `area.name_x` / `name_y`, niet `labels[]`.

---

## 14. Gevelgroepen

```typescript
interface FacadeGroup {
  id: string;
  code: string;
  name: string;                     // Engels in .plg; UI vertaalt op id
  wallIds: string[];                // wall.id — multi-lidmaatschap mag
  nativeId?: number;                // FP groupMarkerConfig
  groupMarker?: number;
}
```

Factory-slots: `front` / `back` / `left` / `right`. Lege groepen blijven catalogus; Gevels-tab toont alleen groepen mét muren. Native Floorplanner-markers worden niet meer geschreven; import hydrateert ze alleen als de catalogus leeg is.

---

## 15. Dak-model

```typescript
interface PlanRoof {
  ridge: { wallIds: string[]; displayWidthCm: number };
  planes: { surfaceIds: string[] };
  stack: FloorStack;
  clearHeightOverride?: Record<string, Array<Array<{ x: number; y: number }>>>;
}

interface FloorStack {
  nokThicknessCm: number;
  floors: Array<{
    level: number;
    thicknessCm: number;
    ridgeZCm?: number;              // default onderkant-Z voor nieuwe nokken; anders floor.height
  }>;
}
```

Id-lijsten zijn de identiteit (Floorplanner stript surface-extras soms). Oude lokale `.plg` met `wallGuids` / `surfaceGuids` wordt één keer gelezen. FML-adapter schrijft die oude keys nog in `source.settings`. De geometrie zelf staat op het Dak-design (`walls` + `surfaces`).

`ridgeZCm` is **niet** live geometrie van een bestaande nok (`wall.elevation`) en niet `clearHeightOverride`. Het is de per-floor default voor een **nieuwe** nok, zodat een aanbouw een andere Z kan hebben zonder `floor.height` te tillen. Live dak-/vloerdikte = `plan.roof.stack`; `settings.defaults.dak/slab` alleen via `seedFloorStackIfMissing`.

`floor.height` alleen omhoog zonder floor erboven (BG-aanbouw tilt 1e/2e niet).

---

## 16. Aanzichten

```typescript
type ElevationProjection = "architect" | "projective";

interface PlanElevations {
  projection: ElevationProjection;
  views: Array<{
    facadeGroupId: string;
    drawing?: DrawingMeta;
  }>;
}
```

Aanzicht-onderlegger hangt aan de gevelgroep, niet aan `floors[].drawing`. `architect` = vaste H/V-zijde; `projective` = mee met de gevel. Aanzicht-X = rechts van de kijker (buiten, naar de gevel).

FML-export stript `elevationViews` / `elevationProjection` / `floorStack`.

---

## 17. Identiteit

| Object | Identiteit in `.plg` | Niet |
|---|---|---|
| Wall, area, surface, label, line, dimension | `id` (string) | — |
| Opening, item | verplicht `id` (UUID) + `kind` | `refid` / `guid` op het domein |
| Gevelgroep | `id` (`front` / eigen) | native `groupId` als bron |
| Dakvlak / nok | surface/wall `id` + id-lijst in `plan.roof` | alleen extras |
| Junction | geen | afgeleid |
| Unmapped FML-asset | `kind: *.unmapped` + ImportWarning | hash als onze id / extras |

FML-export: `guid = id`; `refid` uit catalogus (`opening-fml-refids.json` / `fixture-fml-refids.json`); unmapped → default van dat type.

---

## 18. Open tas (`extras` / leftover)

Drie soorten data, drie plekken:

| Soort | Voorbeelden | Waar |
|---|---|---|
| Floorplanner-passthrough | decor, cameras, `project_id` | `foreign.fml` of `source.leftover` |
| Onze extensies | kozijn, dak, gevel, slicer, kind | **getypt veld** |
| Sessie-only | `stampOwned` | niet schrijven |

`extras` op wall/opening/item/area/surface is **geen** plek voor nieuwe productvelden. Als Floorplanner een key teruggeeft die we niet typen, mag die daar blijven tot er een veld is.

---

## 19. Nog geen veld (niet verzinnen)

Gepland in het format-plan, **niet** in v1-types. Eerst overleg + versiebesluit:

- `origin: { kind, guid?, meta? }` per element (IFC/FML/detectie/manual)
- `wall.layers[]` (IFC-opbouw)
- First-class junction-GUID
- Meetstaat-codes (D1/R1)
- Clear-height lijn-editor (`clearHeightOverride` vullen)

Niet in `.plg`: XML, IFC als intern model, CV-bytes, `detectionExact`.

---

## 20. FML-adapter (lossy)

`.plg` → FML is een projectie. Omgekeerd hydrateert de registry (`FML_CONCEPT_ADAPTERS`; volgorde telt).

| `.plg` | FML |
|---|---|
| `opening.id` / `kind` | `guid` / `refid` |
| `wall.elevation.a/b` | `az` / `bz` |
| `opening.frame` | `extras.btfFrame` |
| `wall.role` / `design.role` | `extras.ridge` / `settings.btfRole` |
| `surface.origin` / `roofKind` | `extras.btfOrigin` + lossy kinds |
| `design.slices` | `settings.btfSlices` |
| `plan.facadeGroups` | `settings.facadeGroups` (export stript native markers) |
| `plan.roof` | `ridgeWalls` / `roofPlanes` / `floorStack` (stack vaak gestript) |
| `plan.elevations` | tijdelijk gezet, daarna gestript |
| `drawing.flipX` | weg |
| `item.roofSurfaceId` | `extras.btfRoofSurfaceId` |
| `liningCm` / dakkapel-kind | deels `settings.roofPlanes.kinds` of weg |

Niet “even een extras-key in FML zetten” i.p.v. een `.plg`-veld. Adapter-modules: één concept per file, haken in de registry, niet `importFmlV3` / `buildFmlV3` zelf verbouwen.

---

## 21. Converter vs `.plg` vs IDB

Drie plekken, niet één bestand. Types: `frontend/src/platform/project-store/types.ts` (`plan` vs `cv`).

| | Inhoud | Waar |
|---|---|---|
| **Stap 4 / editor-download** | `PlgDocument` (`previewPlan` + project/settings) | `.plg`-bestand |
| **IDB `plan`** | die plattegrond + schaal/nulpunt/oriëntatie (sessie om verder te tekenen) | browser |
| **IDB `cv`** | scan, B/W, refs, maskers, `tabOutputs`, detectie-cache, banden | **alleen converter** |

Stap 1–3 horen nooit in `.plg`. Diagnose-HTML is een rapport-export, geen opslag.

`readPlg` / IDB-restore roepen `promotePlanExtensions` aan: FML-`source.settings`-keys (`ridgeWalls`, `roofPlanes`, `floorStack`, `facadeGroups`, `bovenlichtPacked`, …) gaan naar getypte velden en verdwijnen daarna uit settings. Accessors lezen alleen typed. FML-export mag die keys tijdelijk op het export-object zetten.

| | Download `.plg` | IDB (schema v2) |
|---|---|---|
| Vorm | één `PlgDocument` | `PersistedProject`: per floor `plan` + `cv` |
| Planhelft | hele `FloorPlan` | o.a. `previewPlan`, schaal, nulpunt, oriëntatie |
| CV | nooit | sidecar (`cv`); nooit in download |
| Versie | `PlgDocument.version` + `migratePlg` | project-`schemaVersion`; v1-blob wordt gewist |

Een veld dat in de editor moet overleven een refresh hoort in `FloorPlan` (dus `.plg`), niet in de sidecar — tenzij het CV is.

---

## 22. Minimaal voorbeeld

```json
{
  "format": "plg-plan",
  "version": 1,
  "generator": "BouwToFML 1.x",
  "savedAt": "2026-09-16T00:00:00.000Z",
  "project": { "id": "p1", "name": "Voorbeeld", "address": "" },
  "settings": {
    "unitSystem": "metric",
    "scaleInputUnit": "cm",
    "planDisplayStyle": "editor",
    "showCanvasGrid": true,
    "defaults": {
      "wallHeightCm": 280,
      "doorHeightCm": 220,
      "windowHeightCm": 120,
      "windowSillZCm": 100,
      "bovenlichtDefault": false,
      "windowBovenlichtDefault": false,
      "bovenlichtHeightCm": 40,
      "bovenlichtGapCm": 10,
      "thicknessCms": [10, 20, 30],
      "dakThicknessCm": 30,
      "slabThicknessCm": 20
    }
  },
  "plan": {
    "name": "Voorbeeld",
    "floors": [
      {
        "name": "Begane grond",
        "level": 0,
        "height": 280,
        "walls": [
          {
            "id": "w0",
            "a": { "x": 0, "y": 0 },
            "b": { "x": 400, "y": 0 },
            "thickness": 20,
            "balance": 0.5,
            "openings": [
              {
                "id": "11111111-1111-4111-8111-111111111111",
                "kind": "door.single",
                "type": "door",
                "t": 0.5,
                "width": 90,
                "z": 0,
                "z_height": 220
              }
            ]
          }
        ]
      }
    ]
  }
}
```

---

## 23. Wijzigingen

Elke modelwijziging is een migratie — `.plg` is ook de IDB-planhelft.

1. Bestaand veld hergebruiken? Eerst §8–16.
2. Nee → voorstel: naam, betekenis, persist vs runtime, FML-mapping, of `version` omhoog moet.
3. **Wachten op akkoord.** Daarna types + dit document + eventueel `MIGRATIONS` + adapter in dezelfde wijziging.
4. Geen stille extras-key, geen `btf*`-schemakey, geen tweede objectmodel.

Besluiten die het model raken: ook [`.cursor/docs/decisions.md`](decisions.md).
