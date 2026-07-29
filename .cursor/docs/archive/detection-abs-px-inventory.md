# Detectie abs-px inventaris (bespreeklijst)

**Datum:** 2026-07-22  
**Status:** besluiten geïmplementeerd (2026-07-22). Keep/Later ongemoeid; actie-IDs ×ref / ×underlay / cap↑ / abs→0 doorgevoerd.  
**Ankers:** [`resolution-4k-impact-audit.md`](resolution-4k-impact-audit.md) §3 + §7 P1, [`workspace-flow.md`](workspace-flow.md), codepaden hieronder.

---

## Doel

Bespreekbare lijst van **hardcoded / abs-px limieten** in de **Detectie-flow** (stap 3 + refs), na floor **3000**. Alleen items die bij hogere ref/resolutie kunnen knijpen of relatief te mild/streng worden.

**Niet in scope:** stap-1 underlay (floor/upscale), stap-2 B/W-UI defaults, overlay-stripe diktes, hoeken/ratios, archive-code, SAFE `ref×ratio` zonder harde floor/cap.

---

## Schaalassen (context)

| As | Bron | Gebruik |
|----|------|---------|
| `referenceWallThicknessPx` | muur-LBE / ink-band (stap 2 → detectie) | V3 L1–L10 via `ref × (n/30)` |
| `pxPerMmX/Y` | underlay-schaal | deur mm-band, FML cm |
| Opening-refs | face-maten / ratio’s op plan-px | deur/raam matching (geen aparte thickness) |

**Impact-kolom:** kort effect bij ~**2× lineair** (typische JPG-floor 2k→3k/4k, of verdubbelde ref-dikte).

**Type:** `abs` = vaste px · `floor` = `max(vaste, …)` · `cap` = `min(vaste, …)` · `eps` = bewust subpixel/klein · `area` = px².

**Audit:** ja = al in resolution-4k-impact-audit §3/§7 · nee = nieuw/onderbelicht t.o.v. die audit.

---

## 1. Room-first / ink (vóór V3)

| ID | Waarde | Bestand | Rol | Type | Audit | Impact ~2× |
|----|--------|---------|-----|------|-------|------------|
| R1 | `EXTERIOR_POCKET_MAX_BBOX_PX = 50` | [`room-exterior-pocket.ts`](../../frontend/src/cv/walls/rooms/room-exterior-pocket.ts) | Max bbox-zijde voor demote → outside | abs | ja | Echte pockets sneller te groot → minder demote |
| R2 | `max(32, th×2)` / fallback 32 | [`room-ink-process.ts`](../../frontend/src/cv/walls/rooms/room-ink-process.ts) | Ink diff/patch marge | floor | ja | Floor 32 milder relatief; bij dikke ref schaalt th×2 wel |
| R3 | `max(8, th)` / fallback 8 | idem | Lokale topologie-patch | floor | ja | Idem |
| R4 | wall eat clamp **5–10** (`th×0.5`) | [`room-ink-resolve.ts`](../../frontend/src/cv/walls/rooms/room-ink-resolve.ts) | Ink-eat muur-radius | cap | ja | Cap 10 bereikt vroeger → relatief te klein t.o.v. dikkere muren |
| R5 | outside eat clamp **1–5** (`th×0.15`) | idem | Ink-eat buiten | cap | ja | Cap 5 knijpt bij dikkere ref |
| R6 | fallback thickness **16** | idem (`resolveInkEatRadii`) | Eat zonder ref | abs | nee | Alleen zonder muur-ref; vaste fallback |
| R7 | `WALL_INK_REACH_BONUS_PX = 2` | idem | Extra muur-bereik boven booster | abs | ja | Relatief kleiner t.o.v. dikkere strokes |
| R8 | close-radius clamp **1–5** (`th×0.03/0.04`) | [`room-wall-close-radius.ts`](../../frontend/src/cv/walls/rooms/room-wall-close-radius.ts) | Morph close na merge | cap | ja | Cap 5 te krap voor pinholes bij 2× dikte |
| R9 | face-migration `maxRadius = 16` | [`room-face-migration.ts`](../../frontend/src/cv/walls/rooms/room-face-migration.ts) | Label zoeken bij override | abs | nee | Zoekstraal relatief kleiner |
| R10 | `ROOM_WALL_CONNECTED_BLOB_PADDING_PX = 2` | [`room-wall-connected-blobs.ts`](../../frontend/src/cv/walls/rooms/room-wall-connected-blobs.ts) | CC ROI-padding | abs | nee | Klein; lage prioriteit |
| R11 | `minBlobAreaPx = max(24, th²)` | [`room-wall-finalize-shared.ts`](../../frontend/src/cv/walls/rooms/room-wall-finalize-shared.ts) | Min blob-area (alleen als niet keepLargest-only filterpad) | floor | ja | Floor 24 milder; th² schaalt mee |

---

## 2. Refs (meten / preprocess-anker)

| ID | Waarde | Bestand | Rol | Type | Audit | Impact ~2× |
|----|--------|---------|-----|------|-------|------------|
| F1 | `bridgeGaps: 8` | [`room-reference-preprocess.ts`](../../frontend/src/cv/walls/rooms/room-reference-preprocess.ts) | Ref-laag morph bridge | abs | ja | Relatief milder → minder bruggen |
| F2 | `removeSpeckles: 80` | idem | Despeckle area | area | ja | Area×4 bij 2× lineair → relatief strenger of milder afhankelijk stroke |
| F3 | holes clamp **16–42/44** (`th×0.45/0.5`) | idem `resolveReferenceRemoveHolesPx` | Gatenvullen | floor+cap | ja | Cap ~44 knijpt bij dikke ref |
| F4 | thicken clamp **2–6/7** (`th×0.08/0.1`) | idem `resolveReferencePrefilterThickenPx` | Prefilter lijnverdikking | floor+cap | ja | Cap 6–7 plat bij dikkere muren |
| F5 | `minLengthPx` **3**; `minAreaPx` **4 / 1 / 8** | [`ref-pipeline.ts`](../../frontend/src/cv/refs/ref-pipeline.ts), [`ref-stages.ts`](../../frontend/src/cv/refs/ref-stages.ts), [`ref-blob.ts`](../../frontend/src/cv/refs/ref-blob.ts), classify-wall | Minimale ref-blob / lijn | abs | nee | Relatief milder (meer kleine blobs) |
| F6 | occupancy `minGapPx=3`, `minSpanPx=4` | [`ref-blob.ts`](../../frontend/src/cv/refs/ref-blob.ts) `spansFromOccupancy` | Span-extractie | abs | nee | Gaps/spans relatief korter |
| F7 | `AXIS_BAND_PX = 3` (clamp 1–5) | [`ref-swing-hinge.ts`](../../frontend/src/cv/refs/ref-swing-hinge.ts) | Deur-hinge as-band | abs | nee | Band relatief smaller t.o.v. dikkere deur |

---

## 3. V3 L5 cleanup (caps bovenop scale)

| ID | Waarde | Bestand | Rol | Type | Audit | Impact ~2× |
|----|--------|---------|-----|------|-------|------------|
| L5a | `nearEndpointGapPx = 0.8` | [`policies/layer-5.ts`](../../frontend/src/cv/walls/rooms/pipeline-v3/policies/layer-5.ts) | Near-endpoint gap | eps | ja | Relatief strakker |
| L5b | `microMaxPx` clamp **2–6** (`ref×0.15`) | idem `resolveLayer5MicroMaxPx` | Max micro-segment | cap | nee | Cap 6 bereikt vroeger |
| L5c | `txZoneMaxPx` clamp **5–10** (`ref×0.28`) | idem `resolveLayer5TxZoneMaxPx` | T-zone | cap | nee | Cap 10 knijpt |
| L5d | micro-loop `endGapMax` clamp **4–8** (`ref×0.25`) | [`cleanup/index.ts`](../../frontend/src/cv/walls/rooms/pipeline-v3/engines/cleanup/index.ts) | Loop-eindgap | cap | nee | Cap 8 plat bij dikkere ref |

*(Overige L1–L5/L7–L10 lengtebudgets via [`scale.ts`](../../frontend/src/cv/walls/rooms/pipeline-v3/engines/scale.ts) `ref × (n/30)` = SAFE — niet op deze lijst.)*

---

## 4. V3 L6 connector / chamfer

Hoogste P1-cluster uit de 4k-audit.

| ID | Waarde | Bestand | Rol | Type | Audit | Impact ~2× |
|----|--------|---------|-----|------|-------|------------|
| L6a | `LAYER6_CONNECTOR_MAX_CAP_PX = 48` | [`connector/constants.ts`](../../frontend/src/cv/walls/rooms/pipeline-v3/engines/connector/constants.ts) | Cap connector-lengte (`1.2×ref` tot 48) | cap | ja | Bij ref≫40 plat → connectors te kort |
| L6b | `nearGroupPx = LAYER6_CONNECTOR_MAX_CAP_PX` (**48**, niet ref-geschaald) | idem `resolveLayer6Scale` | Chamfer near-group | abs/cap | ja | Zoekgroep schaalt niet mee met ref |
| L6c | `LAYER6_ARM_DETECT_MIN_PX = 22` | idem | Floor arm-detect | floor | ja | Floor minder knellend bij dikke ref; bij dunne ref bewust |
| L6d | `LAYER6_ARM_DETECT_MAX_PX = 50` | idem | Cap arm-detect | cap | ja | Cap knijpt bij ref≫50 |
| L6e | `LAYER6_CHAMFER_L_GUARD_PX = 12` | idem | L↔T chamfer guard | abs | ja | Relatief kleiner |
| L6f | `LAYER6_ATTACHMENT_SHIFT_MIN_PX = 10` | idem | Floor attachment shift | floor | nee | Floor milder relatief |
| L6g | `LAYER6_HV_BAND_FALLBACK_PX = 8` | idem | Fallback H/V-band zonder scale | abs | nee | Alleen fallback-pad |
| L6h | `ENDPOINT_SNAP_PX = 1.25` / `NEARBY_WELD = 2.5` | idem | Incident / weld | eps | ja | Bewust vast; relatief strakker |
| L6i | `DIAGONAL_AXIS_FLOOR_PX = 1.5` | idem | Diagonaal vs as-jitter | eps | nee | Klein |

---

## 5. Thickness / ortho helpers

| ID | Waarde | Bestand | Rol | Type | Audit | Impact ~2× |
|----|--------|---------|-----|------|-------|------------|
| T1 | `JUNCTION_THICKNESS_MARGIN_PX = 30` | [`room-wall-segment-thickness.ts`](../../frontend/src/cv/walls/rooms/room-wall-segment-thickness.ts) | Junction dikte-sample marge | abs | ja | Relatief kleiner → dikte-meting korter bereik |
| T2 | `WALL_LINE_SNAP_PX = 8` | idem | Collineaire lijn-snap | abs | ja | Relatief strakker |
| T3 | `WALL_LINE_PARALLEL_SEP_PX = 6` | idem | Parallel centerline-offset | abs | ja | Idem |
| T4 | `ORTHO_BAND_PX = 8` | [`wall-segment-geometry-constants.ts`](../../frontend/src/cv/walls/rooms/wall-segment-geometry-constants.ts) | Ortho-band | abs | ja | Idem |
| T5 | `ORTHO_COLLINEAR_MAX_OFFSET_PX = 2` | idem | Collinear offset | abs | ja | Idem |

---

## 6. Deuren (L11/L12 snap)

| ID | Waarde | Bestand | Rol | Type | Audit | Impact ~2× |
|----|--------|---------|-----|------|-------|------------|
| D1 | snap `max(8, th×1.5 + depth×0.5 + …)` | [`door-wall-snap.ts`](../../frontend/src/cv/doors/door-wall-snap.ts) `resolveMaxSnapPx` | Max snap-afstand | floor | nee | Floor 8 milder; th-term schaalt |
| D2 | span gap `max(6, th×1.25)` | idem | Span-tolerantie | floor | nee | Idem |
| D3 | direction slack `max(2, th×0.5)` | idem | Richting-slack | floor | nee | Idem |
| D4 | missing-touch penalty `max(20, proximity×0.8)` | idem `resolveBindingScore` | Score-penalty | abs-ish | nee | Score-gewicht; niet spatiaal geometrie |

*(SAFE, niet op lijst: `DOOR_MIN/MAX_MM` 250–1200 × ppm; swing/fill ratio’s; framing uit opnieuw getekende refs.)*

---

## 7. Ramen (Stage 1–4 + L14)

| ID | Waarde | Bestand | Rol | Type | Audit | Impact ~2× |
|----|--------|---------|-----|------|-------|------------|
| W1 | `CENTER_*_BAND_WIDTH_PX = 5` | [`window-axel-ref.ts`](../../frontend/src/cv/windows/window-axel-ref.ts), [`window-axel-filter.ts`](../../frontend/src/cv/windows/window-axel-filter.ts) | Center-strip sample-band | abs | ja | Band relatief smaller |
| W2 | merge / strip-merge gap **1** | idem | Strip-interval merge | abs | ja | Relatief strakker |
| W3 | groupGap clamp **1.5–4** (`target×0.5`) | [`window-axel-filter.ts`](../../frontend/src/cv/windows/window-axel-filter.ts) | Cluster groep-gap | cap | nee | Cap 4 knijpt bij hoge strip-hoogte |
| W4 | height/perp floors `max(2, target×0.55)`, `max(3, target×3)` | idem | Strip-hoogte / cluster-tol | floor | ja | Floors milder relatief |
| W5 | L14 bind `max(thickness/2, 8)` | [`window-wall-bind.ts`](../../frontend/src/cv/windows/window-wall-bind.ts) | Max loodrechte bind-afstand | floor | ja | Floor 8 domineert bij dunne segmenten |
| W6 | `WINDOW_MERGE_BBOX_TOUCH_EPS_PX = 1.5` | [`window-wall-merge.ts`](../../frontend/src/cv/windows/window-wall-merge.ts) | Bbox-touch voor merge | abs | ja | Relatief strakker |

*(SAFE: `WINDOW_MERGE_MAX_SIZE_RATIO = 0.05`; Stage evidence-ratio’s.)*

---

## 8. OCR (stap 3 mask)

| ID | Waarde | Bestand | Rol | Type | Audit | Impact ~2× |
|----|--------|---------|-----|------|-------|------------|
| O1 | area `<16` of `>12000` | [`ocrTextFilters.ts`](../../frontend/src/cv/port/ocrTextFilters.ts) | Box area filter | area | ja | Area×4 → meer/minder hits in band |
| O2 | `width > 280` of `height > 120` | idem | Max box size | abs | ja | Grotere tekst-boxes sneller afgewezen |
| O3 | line-like `long < 24`, `short ≤ 28` | idem | Architectuur-lijn filter | abs | ja | Dunne lange bboxen anders geclassificeerd |
| O4 | dedupe `dist < 12` | idem | Woord-dedupe | abs | nee | Relatief dichter bij elkaar nodig |
| O5 | merge gap `max(8, avgH×2.25)` | idem | Adjacent word merge | floor | nee | Floor 8 milder; avgH schaalt |

---

## Bewust níet op de lijst

| Cluster | Waarom |
|---------|--------|
| V3 `resolvePipelineScale` / meeste L1–L5/L7–L10 | Al `ref × (n/30)` |
| L6 ratio-budgets (hvBand, armStrict, …) | Al ref-geschaald; alleen caps/floors hierboven |
| Deur mm-band + swing/fill ratio’s | Underlay / ratio SAFE |
| Raam size-ratio merge 5%, evidence-ratio’s | SAFE |
| `PIPELINE_*_EPS_PX = 1`, converge grids | Bewust subpixel (tenzij later meeschalen) |
| Overlay stripe 9 / contour 2 | Puur UI |
| Stap-2 `WALL_LAYER_DEFAULTS` (adaptive 11, despeckle 32, thicken 1) | Preprocess-scope, niet detectie-thresholds |
| Archive openings / baseline Hough | Niet actief detectiepad |

---

## Bespreking — besluiten

Per ID één label:

1. **Keep** — bewust vast (vaak eps)
2. **× ref** — `referenceWallThicknessPx × ratio` (eventueel zonder harde cap)
3. **× underlay** — `pxPerMm` of `maxEdge/1000`
4. **Cap/floor omhoog** — formule houdt, alleen grenzen verruimen
5. **Later / laag** — klein effect, uitstellen

**Volgorde:** L6 → ink/close (R4–R8) → thickness/ortho (T*) → ramen (W*) → OCR (O*) → refs (F*) → deuren floors (D*) → rest (R1, R9–R11, L5*).

| ID | Label | Notitie |
|----|-------|---------|
| L6a | × ref + cap | Cap = **3 × ref** (vervangt vaste 48); formule `1.2×ref` blijft, beide schalen met tekening |
| L6b | × ref | `nearGroupPx` = zelfde connector-max (**3 × ref**), niet meer vaste 48 |
| L6c | × ref | Floor arm-detect = **ref × 0.5** (vervangt vaste 22) |
| L6d | × ref + cap | Cap arm-detect = **3 × ref** (vervangt vaste 50) |
| L6e | × ref | Chamfer L-guard = **0.4 × ref** (vervangt vaste 12; ≈12 bij ref=30) |
| L6f | × ref | Attachment-shift = **0.4 × ref** (vaste floor 10 weg) |
| L6g | Keep | Alleen noodpad; stap 3 niet toegankelijk zonder scale-object |
| L6h | × ref | Endpoint snap = **0.1 × ref**; nearby weld = **0.2 × ref** (was 1.25 / 2.5) |
| L6i | × ref | Diagonal axis floor = **0.1 × ref** (was 1.5) |
| R4 | × ref | Wall eat = **0.5 × ref** (vaste clamp 5–10 weg) |
| R5 | × ref | Outside eat = **0.15 × ref** (vaste clamp 1–5 weg) |
| R6 | Keep | Noodpad zonder ref; stap 3 heeft normaal wel ref |
| R7 | Later / laag | Vaste +2 px bonus; voorlopig laten |
| R8 | Later / laag | Close-radius clamp 1–5; voorlopig laten |
| T1 | × ref | Junction thickness margin = **1 × ref** (was 30) |
| T2 | × ref | Wall line snap = **0.3 × ref** (was 8) |
| T3 | × ref | Parallel sep = **0.2 × ref** (was 6) |
| T4 | × ref | Ortho band = **0.3 × ref** (was 8) |
| T5 | × ref | Ortho collinear offset = **0.1 × ref** (was 2) |
| W1 | Keep | Center-strip band 5 px bewust vast |
| W2 | abs → 0 | Strip-merge gap = **0** (geen merge via gap; was 1) |
| W3 | abs → 0 | Group gap = **0** (geen cluster-gap merge; was clamp 1.5–4) |
| W4 | Cap/floor omhoog | Floors **3 / 3** (was `max(2,…)` / `max(3,…)` → beide min **3**) |
| W5 | Cap/floor omhoog | L14 bind = `max(thickness/2, **10**)` — minimum 10 px (was 8); niet × ref |
| W6 | × window-ref | L14 merge touch eps = **0.05 × window-ref** (per ref; was 1.5 px) |
| O1 | Keep | Area 16 / 12000 bewust vast |
| O2 | × underlay | Max box w/h = **0.1 × underlay** (max-edge; was 280×120). Ink-only erase bestaat nog niet — aparte latere feature |
| O3 | Keep | Line-like long/short 24/28 bewust vast |
| O4 | × underlay | Dedupe dist = **0.006 × underlay** (max-edge; was 12) |
| O5 | Keep | Merge gap `max(8, avgH×2.25)` bewust zo; avgH schaalt al |
| F1 | Keep | bridgeGaps 8 bewust vast |
| F2 | Keep | removeSpeckles 80 bewust vast |
| F3 | Keep | Holes clamp 16–42/44 (`th×0.45/0.5`) bewust zo |
| F4 | Keep | Thicken clamp 2–6/7 (`th×0.08/0.1`) bewust zo |
| F5 | Keep | minLength/minArea 3 / 4·1·8 bewust vast |
| F6 | Keep | minGap/minSpan 3/4 bewust vast |
| F7 | Keep | AXIS_BAND 3 (clamp 1–5) bewust vast |
| D1 | Keep | Max snap `max(8, th×1.5+…)` bewust zo; th schaalt al |
| D2 | Keep | Span gap `max(6, th×1.25)` bewust zo |
| D3 | Keep | Direction slack `max(2, th×0.5)` bewust zo |
| D4 | Keep | Missing-touch penalty `max(20, proximity×0.8)` — score, niet geometrie |
| R1 | × ref | Exterior pocket max bbox = **3 × ref** (was 50) |
| R2 | Keep | Ink patch marge `max(32, th×2)` bewust zo |
| R3 | Keep | Topologie-patch `max(8, th)` bewust zo |
| R9 | Keep | Face-migration maxRadius 16 bewust vast |
| R10 | Keep | Blob ROI-padding 2 px bewust vast |
| R11 | Keep | minBlobArea `max(24, th²)` bewust zo; th² schaalt al |
| L5a | Keep | nearEndpointGap 0.8 px bewust eps |
| L5b | Cap/floor omhoog | microMax clamp **2–10** (`ref×0.15`; was 2–6) |
| L5c | Cap/floor omhoog | txZone clamp **5–20** (`ref×0.28`; was 5–10) |
| L5d | Cap/floor omhoog | endGapMax clamp **4–12** (`ref×0.25`; was 4–8) |

---

## Bronindex

| Concern | Pad |
|---------|-----|
| 4k-audit (SAFE/RISK context) | [`.cursor/docs/resolution-4k-impact-audit.md`](resolution-4k-impact-audit.md) |
| V3 scale | `frontend/src/cv/walls/rooms/pipeline-v3/engines/scale.ts` |
| L6 constants | `frontend/src/cv/walls/rooms/pipeline-v3/engines/connector/constants.ts` |
| Ink / close | `room-ink-resolve.ts`, `room-wall-close-radius.ts`, `room-ink-process.ts` |
| Ref preprocess | `room-reference-preprocess.ts` |
| Deur snap | `frontend/src/cv/doors/door-wall-snap.ts` |
| Raam bind/merge | `window-wall-bind.ts`, `window-wall-merge.ts`, `window-axel-*.ts` |
| OCR | `frontend/src/cv/port/ocrTextFilters.ts` |
