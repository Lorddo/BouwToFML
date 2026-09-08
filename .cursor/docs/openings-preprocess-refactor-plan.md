# Openings-preprocess — eigen B/W voor deuren en ramen

Peildatum: 2026-09-08 · Status: **PLAN** (nog niet gebouwd)

Aanleiding: stap-2 wall-B/W heeft adaptive **laatst**. Muren werden beter; deuren en ramen iets slechter. Overweging: één openings-laag (deur + raam samen) met eigen voorbewerking **zonder adaptive**, plus volledige stage/lagen-refactor.

Gerelateerd: [`workspace-flow.md`](workspace-flow.md), [`window-detection-flow.md`](window-detection-flow.md), [`decisions.md`](decisions.md) «Stap-2 wall-B/W: adaptive ná morph».

---

## 1. Doel

Openingen mogen hun bevindingen doen op een B/W die dunne symbolen (draaiboog, stijlen, dorpel) bewaart. Muren blijven de adaptive-tune houden.

Eén laag voor **deuren en ramen samen** — ze zijn gekoppeld (doorframe, Stage-2 deurboog, X-28 suppress). Geen aparte `doorLayer` / `windowLayer`.

Stap 4 FML blijft het bestaande contract: `orientedDoors` (L12) + `boundWindows` (L14) op de semantic muurgraaf. Geen tweede `extractionToPlan`, geen `tabOutputs.doors`.

---

## 2. Huidige staat (inventaris)

Opening-detectie heeft **geen eigen B/W**. Floor én LBE-refs lezen post-bake muur-`baseBw` / `effectiveBw`. Detectie is face-based op classify-IDs.

| Laag | Status | Rol |
|---|---|---|
| `wallLayer` | Productie | Enige canvas-B/W stap 2. Adaptive laatst. Bron classify, refs, dual-space. |
| `ocrLayer` | Legacy storage | Runtime deelt `wallLayer`. |
| `gapsLayer` | Hidden, lichter recept | Tweede tune (geen pre-B/W 150, geen bridge/thicken). Alleen **face-demote** (muurvlakken → outside). Niet de input van deur/raam-stages. Haak voor één openings-tune. |
| Int muur / Otsu | Eigen recept | Vanaf kleur-origineel, **geen** adaptive. Precedent voor “tweede preprocess”. |

Oude `wallMat` / `doorMat` / `windowMat` (template-match, juni 2026) staat alleen in docs. In types en `resolveLayerPreprocess` zitten **geen** `doorLayer`/`windowLayer`. `detectTargetsForTab('doors'|'windows')` geeft `{}`.

Huidige keten:

```
stap 2 wall-B/W (adaptive laatst)
  → classify (witte CC + Otsu-dekking)
  → FaceDualSpace (opening-wit + wall-ink, zelfde FaceIDs)
  → deur Stage-2 / raam Stage 1–4 op die faces
  → L11/L12 + L14 binden op de V3-muurgraaf
  → stap 4 FML via orientedDoors + boundWindows
```

`mergeTabOutputs` is alleen muren. Generate: `workspace-fml-generate.ts` → `extractionToPlanWithOrigin`.

---

## 3. Waarom adaptive-laatst openingen raakt

Keten (`preprocess-layer.ts`): start-B/W (150) → polarity → morph → **adaptive** → gum.

Adaptive op een al binaire plaat **ponst grote zwarte vlakken weer wit**. Goed voor kamervelden / gevulde muurbanden. Slecht voor openingen:

1. **Dunne symbolen** — boog, stijl, dorpel verdwijnen of worden specks. REF-bands (swing, striphoogte, framing) matchen de floor niet meer.
2. **Extra wit in de muur** — geponsede kern = nieuw opening-wit vlak. Otsu (geen adaptive) ziet daar nog muur-inkt → class `wall`. Raam Stage 1 mag `wall` meenemen → valse glasstroken.
3. **Ink-bruggen** — clustering (wit–inkt–wit) en doorframe hebben wall-ink tussen ruiten/bogen nodig. Adaptive kan die brug wissen.
4. **Topologie** — ponst-gat verbindt kamer met draaivlak → swing-filter faalt.

Maten (`t` / `width`) wijken nú al af door die kernel. Wall-faces zijn al een slechte meetlat — die 1:1 bewaren over twee B/W’s is geen winst.

Int muur blijft Otsu zonder adaptive. Openingen lezen **wall-B/W-faces**, niet Otsu. Daarom voel je de adaptive-wijziging daar harder.

---

## 4. Architectuur: twee ruimtes + projectie

FaceIDs gelijk houden over twee B/W’s is een valse eis. De mouw is **twee ruimtes + één overdracht**.

| Ruimte | Baas over | IDs |
|---|---|---|
| **Openings-B/W** (geen adaptive) | Vinden: boog, strip, framing, deur↔raam | Eigen CC, alleen lokaal in de stages |
| **Muur-B/W + L10** | Plaatsen: gat op de muur, FML `t`/`width` | Bestaande classify/V3, ongewijzigd |

Stages blijven face-based — op **openings-faces**. Die IDs mogen nergens in `RoomRasterCache` terechtkomen.

Overdracht is geen FaceID en geen losse AABB, maar:

```ts
OpeningHit {
  kind: 'door' | 'window' | 'doorframe'
  mask | polygon | alongWallSpan   // bron voor bind
  bbox                             // alleen overlay
  ref, scores
}
```

L14 doet dit al bijna (centroid + as + bbox-hoeken → segment). L11 is FaceID-zwaar (`faceIds`, Path A `doorframeFaceIds`). In de refactor wordt L11 L14-achtig: hit → segment; Path A/B op het **openings-masker** tegen de muurmask.

### Wat niet

| Pad | Waarom niet |
|---|---|
| Oude `doorMat` template-match terugzetten | Architectuur is weg; actieve flow is face-stages + L11/L14 |
| Tweede room-first / eigen classify op openings-B/W als bron van wall-FaceIDs | IDs lopen uit elkaar; claim/D-63/overrides breken |
| AABB over muur-faces kleuren | Deur-bbox = kwartcirkel-sector; kleurt kamer + muur + buurraam |
| AABB-snijden als ruggengraat | Zelfde te grote box wordt een “face” die geen opening is |
| Twee tunes (deur vs raam) | Vroeger bijna dezelfde settings; link (doorframe) vereist één dual |
| Git-branch / worktree voor de spike | Zie §7 — volle map-kopie / backup, zoals eerder |

### Optionele late stempel (niet de kern)

Faces “inbakken” mag als **one-way stamp** ná hits: openings-masker rasteren over muur-labels, nieuwe wall-space IDs + class, opnieuw na inkt/recalculate. Alleen voor canvas-kleur + eventueel D-63. Enclosed merge/refine vreten van die snedes — detectie mag er niet van afhangen.

Aanbevolen tussenvorm: **L0-punch zonder split** — hit-maskers als gaten in het muurmasker, geen nieuwe FaceIDs. Stap 3 = overlay (Dev-overlays bestaan al).

---

## 5. Scope van de refactor

**Houden (logica, andere input):** Stage 1 strip/axel, swing-filter, doorframe, evidence, pair-demote, L12 hinge, L14 merge. Policy-keys blijven; dual = openings-dual.

**Nieuw:**

- één `openingsLayer` (geen adaptive; rotatie/gum delen met muren) — hergebruik of hernoem `gapsLayer`
- eigen raster-cache — **niet** `RoomRasterCache` hergebruiken
- refs van openings-`baseBw` (floor en voorbeeld weer hetzelfde raster)
- projector `OpeningHit → L10`
- L11 vereenvoudigen (minder `labelsData` / `faceIds`)
- D-63 → mask-punch i.p.v. `maskKeepDoorFaceIds`
- compose: OCR/inkt/stempel niet blind van de muur overnemen
- DRY: `WORKSPACE_PREPROCESS_LAYER_ORDER` + `resolveLayerPreprocess` + `defaultLayerTune` — geen extra `useWorkspace*` kopie

**Niet opnieuw:** V3 L1–L10, `extractionToPlan`, `mergeTabOutputs`, Dak/`designs[]`.

Volgorde (één openings-laag):

```
classify (muur-B/W, adaptive)
openings-B/W → eigen dual → gedeelde stages (doorframe / X-28 hier)
  → OpeningHit[]
projecteer op L10
  → orientedDoors / boundWindows
optioneel: punch hit-maskers in L0 (geen face-split)
optioneel: overlay of stamp op stap-3 canvas
finalize V3 (ziet L0-gaten)
```

D-63-intentie blijft: dunne deuren uit het muurmasker, anders groeit V3 door het gat. Punch vervangt FaceID-keep.

---

## 6. Let op — stap 3 en stap 4

### Stap 3

- Face-IDs van classify blijven de munteenheid van **muren** (klik, overrides, ink-recalculate). Openings-IDs blijven lokaal.
- Floor-dual en REF-dual van openingen: hetzelfde openings-raster, of per space gedocumenteerd (`WINDOW_SPACE_POLICY` / `DOOR_SPACE_POLICY`).
- `prepareOpeningPipeDual` detacht/rebind white; ink van de openings-cache, niet van de muur-cache.
- Initial flow: Muren → Deuren → Ramen blijft; stages draaien intern op één openings-dual.
- Inkt op stap 3 zit in muur-`effectiveBw`. Tweede raster ververst niet vanzelf — eigen fingerprint (er is al een `baseBw`-fingerprint bij deur-refs).
- Tabs Deuren/Ramen/Gaten zijn Dev-hidden. Openings-tune = stap-2-laag of Dev, geen derde detectie-tab.
- `precomposedWallBw` niet hergebruiken als openings-B/W.
- E2E: muur-snapshots blijven; opening-counts / L11 / L14 schuiven. `schuine-gevel-bg` + opening-harnesses meenemen.

### Stap 4

- FML alleen uit L12 + L14 op de semantic graph. Projector levert spans in image-px; bind blijft geometrisch op L10.
- Als alleen hypotheses veranderen en L0-punch klopt, schuift de muurgraaf niet. Slechte punch → V3 wél anders.
- Dubbele deur (24 px-gap) en raam-merge (R-27) reageren op span, niet op het tweede raster.
- Stempel-inject ná openingen, ongewijzigd.
- Persist: tweede B/W in de floor-blob als 3→4 herhaald moet kunnen; `previewPlan` blijft de 3→4-brug na resume zonder `detectionExact`.
- Diagnose-rapport L11/L12/L14: meten op telling + FML-breedte, niet op “zelfde face 12 nog amber”.

---

## 7. Werkwijze: backup + werken in deze map

Geen git-branch en geen worktree. Zelfde patroon als eerdere spikes: **volle map-kopie als backup**, experiment in de huidige repo.

| Stap | Wat |
|---|---|
| 1. Backup | Kopie van de **huidige** `BouwToFMLV3`-map (werkende adaptive-muurstand) naar een sibling, bijv. `BouwToFMLV3-backup-openings-pre` — inclusief `.git`, `node_modules` mag weg in de backup als `npm i` acceptabel is. |
| 2. Werken | Refactor **in deze map** (`C:\Pranimate\BouwToFMLV3`). Commits lokaal mogen; niet forceren tot de spike een go krijgt. |
| 3a. Slagen | Deze map blijft. Daarna **mergen via git** (commits opruimen / op `main` zetten zoals gebruikelijk). Backup mag weg na bevestiging. |
| 3b. Niet slagen | Deze map **verwijderen**, backup terugplaatsen als `BouwToFMLV3`. Geen half-refactor op de productiemap. |

Eerste spike-vraag, vóór alle stages herschrijven: één fixture, openings-B/W → ruwe `OpeningHit[]` (mask + bbox) → bestaande L14-achtige projectie op de **huidige** L10. Als die gaten al beter op de muur zitten, is de projector de kern. Als hits goed zijn maar bind rotzooi blijft, eerst L11 naar bbox/mask, daarna pas eigen dual.

Meten op **output**, niet op FaceID-metrics: L12/L14-telling, FML-breedtes vs onderlegger, valse stroken in dikke muren, junction-in-bbox.

---

## 8. Plan (volgorde)

1. **Backup-map** zetten (§7). Dit document in de werkmap laten staan.
2. **`openingsLayer`-tune** — geen adaptive; rotatie/gum delen; defaults lichter dan muren (`gapsLayer` als start). Stap-2 UI: Dev of één extra tune, geen losse detectie-tab.
3. **Eigen openings-raster + dual** — tweede cache; refs van die B/W. Nog geen write naar `RoomRasterCache`.
4. **Stages verhuizen** naar openings-dual (deur + raam één run, doorframe gedeeld). Output = `OpeningHit[]`.
5. **Projector** → L10; L11 L14-achtig maken. FML-pad ongewijzigd voeden.
6. **L0-punch** (D-63-vervanger). Overlay op stap 3. Stamp-split alleen als face-klik echt nodig blijkt.
7. **E2E / fixtures** openings + `schuine-gevel-bg`. Diagnose-tellingen vergelijken met de backup-run.
8. **Go / no-go** — slagen: git-merge (§7 3a). Niet: map weg, backup terug (§7 3b).

Contractregel blijft: nieuwe laag = `layer-flow` + `layer-preprocess`. Geen OCR in `geometry-pipeline`.

---

## 9. Open / later

- Exacte storage-key: `gapsLayer` hernoemen vs nieuwe `openingsLayer` (legacy blobs).
- Of openings-tune in productie-stap 2 zichtbaar wordt of Dev blijft tot de spike slaagt.
- Stamp-split vs alleen overlay — beslissen ná punch.
- Oude `door-detection-flow.md` ontbreekt in docs (alleen raam-flow + archive-verwijzingen); bij cutover een korte openings-flow schrijven die beide dekt.
