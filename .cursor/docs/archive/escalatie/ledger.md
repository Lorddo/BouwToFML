# Escalatie-ledger

Peildatum: 2026-07-29 · Bron: [`escalatiepaden-inventaris.md`](escalatiepaden-inventaris.md) · Aanpak: [`escalatiepaden-aanpak.md`](escalatiepaden-aanpak.md)

Per inventaris-ID: verdict + bewijs + datum. De inventaris blijft bevroren; besluiten landen hier (en formeel in `decisions.md` wanneer dat nodig is).

Actuele code-vindplaats: [`escalatiepaden-tagindex.md`](escalatiepaden-tagindex.md) (gegenereerd via `npm run esc:index`).

---

## Categorie-toewijzing (tabellen zonder Cat-kolom)

De inventaris heeft vier tabellen zonder `Cat`-kolom. Vastgelegd bij ID-ankering (2026-07-29):

| ID's | Cat | Reden |
|---|---|---|
| D-01 … D-08 | C | Sectiekop §5.1: "categorie C, centraal" (`DOOR_SPACE_POLICY`) |
| D-44 | P | Inventaris: "— (primair)" — expliciet géén escalatie |
| O-01 … O-04 | D | Sticky-asymmetrie (§8.1) — orkestratie-compensatie |
| O-31 … O-41 | D | Stille fallbacks (§8.4) — orkestratie |
| O-42 … O-46 | B | Gates (§8.5) — guard zonder transform |
| X-27 | P | Inventaris: "—" (dode vlag; geen letter) — parser/tag als P |

---

## NIET GEVONDEN

Geen. Alle 228 inventaris-ID's zijn getagd (`npm run esc:check` OK).

---

## Geïnstrumenteerd (batch nul, 2026-07-30)

Deze ID's schrijven nu in het run-journaal (`@/core/diagnostics`). Zie [`escalatiepaden-aanpak.md`](escalatiepaden-aanpak.md) §5.6. Het journaal verschijnt als `journal`-sectie in het layer-debug-rapport; `escalations` daarin is exact het latere grootboek-veld.

| ID's | Signaal | Vorm |
|---|---|---|
| O-31, O-33 … O-39, X-23 | Ingeslikte exceptie | Event mét stack; zet run op **gedegradeerd** |
| O-32 | Finalize-output afgekeurd | `rollback`-event (geen exceptie, dus niet gedegradeerd) |
| O-41 | Rapport snapt L12 opnieuw | Event bij ontbrekende live-L12 |
| W-07, W-14, X-22 | Diktemeting ontbrak | `tally` met teller **én** noemer (`sampled` vs `reference`/`zero`) |
| W-13 | Spur-drempel zonder gemeten dikte | Event met drempelwaarde |
| R-05, R-23, REF-05 … REF-08 | Meting ontbrak → fallback | Event met context |
| X-01, X-02, X-18 | Meting weggegooid | Event met **beide** waarden (`measured` + `exported`) |
| R-16 | Raam-evidence | Niveaus `strip_stack` / `framing` / **`evidence_missing`** (bewijsloze passthrough) |
| D-61 | `existingDoorsOnly` | Event met de vier uitgeschakelde gates |
| D-37 | Angle-rescue-injectie | Event per geïnjecteerde hypothese |
| D-15, D-13, REF-01, REF-02 | Match-cascade | `tally` per niveau — welk niveau leverde |

**Niet geïnstrumenteerd, met reden:** O-40 (facade-`ref()` wordt altijd aangemaakt; een teller zou de constructie tellen, niet de escalatie). §7.1 (te weinig referentievakken) heeft geen inventaris-ID en loopt via `DiagnosticCode.REF_COUNT_BELOW_ADVICE`, buiten het grootboek.

---

## Telsite-audit (2026-07-31)

Toets: staat de teller aan de kant van de *beslissing*, niet van de *opbouw*?

| ID | Bevinding | Actie |
|---|---|---|
| **X-22** | Tally zat in `buildSemanticGraphFromFmlLayer` vóór `measureSegmentThicknessMax` → altijd `zero` | Verplaatst naar ná meting in `buildSemanticWallsForOutput`. Na snapshot-update: `measured=337`, `zero=0` |
| W-07 | Beide niveaus (`sampled` / `reference\|zero`) geteld | OK — alleen `sampled` vuurt |
| W-14 | Vier niveaus geteld | OK — `sampled` + `faceMedian`; `reference`/`policyFallback` dood |
| X-01 / X-02 | `noteDiscardedMeasurement` bij echte overwrite | OK |
| D-44..D-53 | Cascade-niveaus via `noteCascadeLevel` | OK |
| O-40 | Constructie-teller | Bewust niet geïnstrumenteerd (batch nul) |

---

## Verdict-woordenlijst

| Verdict | Betekenis |
|---|---|
| **PROMOVEREN** | Pad is de hoofdweg; dode aanloop opruimen |
| **HERLEIDEN** | Drempel wordt ratio van gemeten grootheid |
| **AFBAKENEN** | Blijft, met expliciete precondititie + journaal |
| **VERWIJDEREN** | Vuurt nooit, of gedekt door ander pad |
| **BEHOUDEN (F)** | Bewuste keuze; documenteren + test |

---

## Verdicts

Automatisch uit grootboek (6 fixtures) + kill-switch (`npm run esc:killswitch`). Code-wijzigingen alleen na expliciet verdict (geen drempel én pad in dezelfde diff).

| ID | Verdict | Bewijs | Datum |
|---|---|---|---|
| D-45 | **VERWIJDEREN** → **weg 2026-07-31** | 0/6 + kill-switch; geen losse doorframes zonder sticky IDs | 2026-07-31 |
| D-49 | **VERWIJDEREN** → **weg 2026-07-31** | 0/6 + kill-switch; Path B alleen strikt | 2026-07-31 |
| D-50 | **VERWIJDEREN** → **weg 2026-07-31** | 0/6 + kill-switch; Path B alleen D-48 | 2026-07-31 |
| D-51 | **VERWIJDEREN** → **weg 2026-07-31** | 0/6 + kill-switch; Path B alleen D-48 | 2026-07-31 |
| D-52 | **VERWIJDEREN** → **weg 2026-07-31** | 0/6 + kill-switch; legacy deur-bbox weg | 2026-07-31 |
| D-53 | **VERWIJDEREN** → **weg 2026-07-31** | 0/6 + kill-switch; anchor alleen strikt | 2026-07-31 |
| R-26 | **VERWIJDEREN** → **weg 2026-07-31** | 0/6; Stage-4 `widthPx` verplicht | 2026-07-31 |
| W-07 | **PROMOVEREN** | Alleen `sampled` (259k); fallback `reference`/`zero` mag blijven als safety-net | 2026-07-31 |
| X-22 | **PROMOVEREN** → **zero-fallback weg 2026-07-31** | Alleen `measured`; thicknessPxMax≤0 → X-07/resolveThicknessCm | 2026-07-31 |
| W-14 | **AFBAKENEN**; dode niveaus **weg** | sampled + faceMedian blijven; reference/policyFallback-escalatie geknipt 2026-08-01 | 2026-08-01 |
| D-44 | **AFBAKENEN** | Path A sticky `doorframeFaceIds` alleen — overal, primair | 2026-07-31 |
| D-47 | **AFBAKENEN** | Path A segment-bind — overal | 2026-07-31 |
| D-48 | **AFBAKENEN** | Path B swing-mask — overal | 2026-07-31 |
| W-13 | **AFBAKENEN** | Spur zonder meting — overal (laag volume) | 2026-07-31 |
| X-01 | **AFBAKENEN** | Export altijd `balance: 0.5` (gemeten hinge niet meenemen) | 2026-07-31 |
| X-02 | **AFBAKENEN** | Dikte → vaste tier — bewust beleid; tekenaar corrigeert in editor | 2026-07-31 |
| X-11 | **BEHOUDEN (F)** | Geen `mirrored` op ramen —zelfde display; niet implementeren | 2026-07-31 |
| X-13 | **BEHOUDEN (F)** | Hardcoded metadata laten; multi-verdieping-refactor | 2026-07-31 |
| X-14 | **BEHOUDEN (F)** | Lege collecties verplicht — anders false FML / Floorplanner.com | 2026-07-31 |
| X-15 | **BEHOUDEN (F)** | Hardcoded settings; later instellingen-pagina | 2026-07-31 |
| X-16 | **HERLEIDEN** → `h = floor.height` | −14 was vloerdikte uit bron-FML; zonder floor-surfaces → volle 280; az/bz = floor.height | 2026-08-01 |
| X-17 | **BEHOUDEN (F)** | Opening-defaults; sidebar + later settings | 2026-07-31 |
| D-46 | **AFBAKENEN** + sticky promote | As-grow blijft; bij hit → `doorframeFaceIds` + class `doorframe`; k/6=2 legitiem | 2026-08-01 |
| W-25 | **AFBAKENEN** | L6 face-accept / bestFaceOk; 3/6 | 2026-08-01 |
| W-35 | **AFBAKENEN** | L6 hvIncidentsNear (endpoint/near_scan); 5/6 | 2026-08-01 |
| X-10 | **AFBAKENEN** | Twin→double_wide in FML-conversie; later settings aan/uit (zoals R-27 ramen); 5/6 | 2026-08-01 |
| X-18 | — (niet bereikt) | 0/6 maar underlay-meting zit niet in E2E-pad | 2026-07-31 |
| X-23 | — (niet bereikt) | OpenCV-load-fail; e2e laadt altijd CV | 2026-07-31 |
| W-09 | **AFBAKENEN** | Mag blijven (T-arm branch guard); 0/6 = zeldzaam safety-net | 2026-08-01 |
| W-21 | **AFBAKENEN** | Micro-loop guard blijft; 0/6 na betere onderlegger; ≠ same-line/parallel-cover | 2026-08-01 |
| W-46 | **AFBAKENEN** (DT-miss); zero-length **weg** | Echte fallback blijft + geteld (`sample_miss`/`no_map`); zero-length-tak verwijderd | 2026-08-01 |
| W-53 | **AFBAKENEN** | fmlReady-gate blijft; geen L8/L9; 0 hits = gezond | 2026-08-01 |
| X-21 | **DRY → W-53** | Alias; skip-loud; dubbele tally weg | 2026-08-01 |
| X-03 | **AFBAKENEN** | Keten-band fallback; safety-net | 2026-08-01 |
| X-04 | **AFBAKENEN** | Dik-dun-dik brug blijft | 2026-08-01 |
| X-05 | **AFBAKENEN** | Non-finite round → 10; safety-net | 2026-08-01 |
| X-07 | **AFBAKENEN** | Dikte kernel/default als semantic ontbreekt | 2026-08-01 |
| X-08 | **AFBAKENEN** | Node-fallback op edge endpoints | 2026-08-01 |
| X-09 | **AFBAKENEN** | Opening edge-index fallback | 2026-08-01 |
| X-12 | **AFBAKENEN** | mirrored flip vs muur-bouwrichting | 2026-08-01 |
| X-24 | **AFBAKENEN** | Opening-span &lt; 0.5 cm drop | 2026-08-01 |
| D-56 | **AFBAKENEN** | Kept wall-mask contact na blob-selectie; geen contact → geen finalize | 2026-08-01 |
| D-59 | **AFBAKENEN** | Geen L12 hinge → deur uit FML | 2026-08-01 |
| D-42 | **AFBAKENEN** | Sync class→doorframeFaceIds (peel+adjacency); ≠ D-46 grow | 2026-08-01 |
| REF-14 | **hard fail** (stille default weg) | Geen meting → throw; geen 12/23 fallback | 2026-08-01 |

Doorspreken 0/N per cascade (geen laag-meng): [`escalatie-doorspreken-0n.md`](escalatie-doorspreken-0n.md).

Plan overige stil → luid: [`escalatie-luid-maken-plan.md`](escalatie-luid-maken-plan.md).

**Golf 0–7 klaar (2026-07-31):** alle golf-checklists 0 stil · ~198 journaal-telsites · E2E escalations bijgewerkt · O-40/F/VERWIJDEREN-weg skip-loud. Rest ~20 A–E stil buiten sets = mop-up.

**Golf 0+1 (detail):** W-16…W-43 · W-21 = 0/6 kandidaat VERWIJDEREN (nog niet geknipt).

**Golf 3 (detail):** X-11/13/14/15/17 alleen `tally` · X-16 `noteDiscardedMeasurement` + comment.

Kill-switch-rapport: [`escalatie-killswitch-report.md`](escalatie-killswitch-report.md). Dekking: [`escalatie-coverage.md`](escalatie-coverage.md).

Kill-switch-rapport: [`escalatie-killswitch-report.md`](escalatie-killswitch-report.md). Dekking: [`escalatie-coverage.md`](escalatie-coverage.md).

## Gegenereerd grootboek

<!-- BEGIN GENERATED GROOTBOEK -->

### Cross-fixture grootboek (2026-07-31)

Fixtures: amstelveenseweg-1092-1e, amstelveenseweg-1092-bg, bg, bouwtek11, kromme-mijdrecht-3e, staedion-10 (6).
Bron: `<slug>.layers.json` escalations — geen re-run.

| Bucket | Betekenis |
|---|---|
| VERWIJDEREN | 0 tekeningen, wel in harnas |
| PROMOVEREN | alle tekeningen; fallback-niveau vuurt nooit |
| AFBAKENEN | alle tekeningen; pad blijft |
| interview | precies 1 tekening |
| meerdere | 2 .. N−1 tekeningen |

#### Kandidaat VERWIJDEREN (0/N) (29)

| ID | Tekeningen | Totaal | Niveaus | Notitie |
|---|---|---|---|---|
| D-42 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| D-45 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| D-49 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| D-50 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| D-51 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| D-52 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| D-53 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| D-56 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| D-59 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| R-26 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| REF-14 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| W-09 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| W-21 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| W-46 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| W-53 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-03 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-04 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-05 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-07 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-08 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-09 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-12 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-17 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-18 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-19 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-20 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-21 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-23 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |
| X-24 | — | 0 | — | 0 tekeningen — kandidaat VERWIJDEREN |

#### Kandidaat PROMOVEREN (2)

| ID | Tekeningen | Totaal | Niveaus | Notitie |
|---|---|---|---|---|
| W-07 | alle | 259459 | sampled=259459 | alle fixtures; fallback-niveaus vuren nooit — kandidaat PROMOVEREN |
| X-22 | alle | 337 | measured=337 | alle fixtures; fallback-niveaus vuren nooit — kandidaat PROMOVEREN |

#### Interview (1/N) (0)

_geen_

#### Gedeeltelijk (k/N) (7)

| ID | Tekeningen | Totaal | Niveaus | Notitie |
|---|---|---|---|---|
| D-46 | amstelveenseweg-1092-1e, bg | 5 | path_a_hit=5 | 2/6 — gedeeltelijk |
| D-54 | bouwtek11, kromme-mijdrecht-3e, staedion-10 | 12 | multi_face_closed=12 | 3/6 — gedeeltelijk |
| R-27 | bouwtek11, kromme-mijdrecht-3e, staedion-10 | 8 | pair=7, triple=1 | 3/6 — gedeeltelijk |
| W-25 | amstelveenseweg-1092-bg, bg, kromme-mijdrecht-3e | 12 | accepted_sanitized=12 | 3/6 — gedeeltelijk |
| W-35 | amstelveenseweg-1092-1e, amstelveenseweg-1092-bg, bg, bouwtek11, staedion-10 | 66 | endpoint=3, incomplete=25, near_scan=38 | 5/6 — gedeeltelijk |
| W-36 | amstelveenseweg-1092-1e, amstelveenseweg-1092-bg, bg, bouwtek11 | 16 | accepted=13, reject_seed_not_on_touch=3 | 4/6 — gedeeltelijk |
| X-10 | amstelveenseweg-1092-1e, amstelveenseweg-1092-bg, bg, bouwtek11, kromme-mijdrecht-3e | 8 | double_wide_merged=8 | 5/6 — gedeeltelijk |

#### AFBAKENEN / overal (55)

| ID | Tekeningen | Totaal | Niveaus | Notitie |
|---|---|---|---|---|
| D-44 | alle | 36 | path_a_hit=36 | alle fixtures — AFBAKENEN / documenteren |
| D-47 | alle | 41 | segment=41 | alle fixtures — AFBAKENEN / documenteren |
| D-48 | alle | 29 | swing_mask=29 | alle fixtures — AFBAKENEN / documenteren |
| D-55 | alle | 16373 | bbox=12269, mask=4104 | alle fixtures — AFBAKENEN / documenteren |
| D-57 | alle | 70 | kept=48, rotated=22 | alle fixtures — AFBAKENEN / documenteren |
| D-58 | alle | 70 | pathA_doorframe=41, pathB_hinge_resolve=29 | alle fixtures — AFBAKENEN / documenteren |
| REF-13 | alle | 77 | classic_axes=4, wall_axis_corner=73 | alle fixtures — AFBAKENEN / documenteren |
| W-08 | alle | 18 | relaxed_merge=18 | alle fixtures — AFBAKENEN / documenteren |
| W-10 | alle | 2504 | merged=2504 | alle fixtures — AFBAKENEN / documenteren |
| W-11 | alle | 16711 | unified=16711 | alle fixtures — AFBAKENEN / documenteren |
| W-12 | alle | 185 | iterated=185 | alle fixtures — AFBAKENEN / documenteren |
| W-13 | alle | 12 | missing_measurement=12 | alle fixtures — AFBAKENEN / documenteren |
| W-14 | alle | 1762 | faceMedian=82, sampled=1680 | alle fixtures; meerdere niveaus — AFBAKENEN |
| W-15 | alle | 50 | axis_only=50 | alle fixtures — AFBAKENEN / documenteren |
| W-16 | alle | 162 | compacted=1, noop=161 | alle fixtures — AFBAKENEN / documenteren |
| W-17 | alle | 156 | accepted=150, connectivity_reject=1, unchanged=5 | alle fixtures — AFBAKENEN / documenteren |
| W-18 | alle | 6 | accepted=6 | alle fixtures — AFBAKENEN / documenteren |
| W-19 | alle | 72 | near_weld=64, noop=6, pair_repair=2 | alle fixtures — AFBAKENEN / documenteren |
| W-20 | alle | 152 | accepted=152 | alle fixtures — AFBAKENEN / documenteren |
| W-22 | alle | 1581 | merged=1304, skip_no_short=277 | alle fixtures — AFBAKENEN / documenteren |
| W-23 | alle | 636 | collapsed=161, skip_not_ll=475 | alle fixtures — AFBAKENEN / documenteren |
| W-24 | alle | 6 | converged=6 | alle fixtures — AFBAKENEN / documenteren |
| W-26 | alle | 39 | sanitize_ok=12, sanitize_skipped_raw_ok=27 | alle fixtures — AFBAKENEN / documenteren |
| W-27 | alle | 45 | connector=13, converged=6, junction=13, landing=13 | alle fixtures — AFBAKENEN / documenteren |
| W-28 | alle | 657 | accepted=496, i_explosion=150, l_became_i=4, tx_lost=3, x_downgrade=4 | alle fixtures — AFBAKENEN / documenteren |
| W-29 | alle | 118 | accepted=23, kind_validate=95 | alle fixtures — AFBAKENEN / documenteren |
| W-30 | alle | 38 | extras_appended=10, landing_only_skip=25, primary_only=3 | alle fixtures — AFBAKENEN / documenteren |
| W-31 | alle | 193 | index_ok=142, reindexed=45, seed_missing=6 | alle fixtures — AFBAKENEN / documenteren |
| W-32 | alle | 25 | skipped_stuck=25 | alle fixtures — AFBAKENEN / documenteren |
| W-33 | alle | 429 | fallback_axis=68, hv_bridge=17, landing=166, local_hv=132, synthetic_v=46 | alle fixtures — AFBAKENEN / documenteren |
| W-34 | alle | 182 | landing=63, multi=42, null=25, simple_L=13, skip_shallow_steep=33, skip_stair=6 | alle fixtures — AFBAKENEN / documenteren |
| W-37 | alle | 79 | skip_far_hit=1, skip_would_zero=26, snapped=52 | alle fixtures — AFBAKENEN / documenteren |
| W-38 | alle | 254 | allow_long_ok=23, snapped=231 | alle fixtures — AFBAKENEN / documenteren |
| W-39 | alle | 539 | accepted=473, rollback=66 | alle fixtures — AFBAKENEN / documenteren |
| W-40 | alle | 340 | l_repaired=269, skip_landing_chamfer=71 | alle fixtures — AFBAKENEN / documenteren |
| W-41 | alle | 137 | removed=32, skip_landing=96, skip_too_long=9 | alle fixtures — AFBAKENEN / documenteren |
| W-42 | alle | 1059 | repaired=269, skip_long_landing_diag=42, skip_no_hv_arms=726, skip_unretractable=22 | alle fixtures — AFBAKENEN / documenteren |
| W-43 | alle | 316 | scaled=316 | alle fixtures — AFBAKENEN / documenteren |
| W-44 | alle | 6 | accepted=6 | alle fixtures — AFBAKENEN / documenteren |
| W-45 | alle | 318 | bridge=1, direct=317 | alle fixtures — AFBAKENEN / documenteren |
| W-47 | alle | 6 | repositioned=6 | alle fixtures — AFBAKENEN / documenteren |
| W-48 | alle | 6 | noop=1, pruned=5 | alle fixtures — AFBAKENEN / documenteren |
| W-49 | alle | 18 | chain_accepted=6, cover_accepted=5, cover_rolled_back=1, stub_accepted=6 | alle fixtures — AFBAKENEN / documenteren |
| W-50 | alle | 6 | accepted=6 | alle fixtures — AFBAKENEN / documenteren |
| W-51 | alle | 6 | straightened=6 | alle fixtures — AFBAKENEN / documenteren |
| W-52 | alle | 6 | accepted=6 | alle fixtures — AFBAKENEN / documenteren |
| X-01 | alle | 614 | measurement_discarded=614 | alle fixtures — AFBAKENEN / documenteren |
| X-02 | alle | 674 | measurement_discarded=674 | alle fixtures — AFBAKENEN / documenteren |
| X-06 | alle | 12 | semantic=12 | alle fixtures — AFBAKENEN / documenteren |
| X-11 | alle | 58 | no_mirrored=58 | alle fixtures — AFBAKENEN / documenteren |
| X-13 | alle | 12 | hardcoded_metadata=12 | alle fixtures — AFBAKENEN / documenteren |
| X-14 | alle | 12 | empty_collections=12 | alle fixtures — AFBAKENEN / documenteren |
| X-15 | alle | 12 | hardcoded_settings=12 | alle fixtures — AFBAKENEN / documenteren |
| X-16 | alle | 12 | measurement_discarded=12 | alle fixtures — AFBAKENEN / documenteren |
| X-27 | alle | 6 | dead_flag_false=6 | alle fixtures — AFBAKENEN / documenteren |

<!-- END GENERATED GROOTBOEK -->
