# Escalatiepaden

Peildatum: 2026-08-01 · Inventaris (bevroren): [`escalatiepaden-inventaris.md`](escalatiepaden-inventaris.md)

**Dit is het enige living document** voor aanpak, stand en verdicts. Gegenereerde outputs (tagindex, coverage, kill-switch, grootboek-blok hieronder) komen uit `npm run esc:*` en horen in [`archive/escalatie/`](archive/escalatie/).

---

## 1. Doel

Niet “minder takken”, maar: **elke tak heeft een precondititie die de situatie beschrijft** (niet de mislukking), en **elke drempel is herleidbaar** tot meting of expliciet beleid.

| | Legitieme tak | Over-fit |
|---|---|---|
| Trigger | Gemeten situatie | “Vorige poging leverde niets” |
| Drempel | Meting of vast beleid | Gekozen voor n=1 |
| Op nieuwe input | Voorspelbaar | Alleen door uitproberen |

Eenheid van werk = **cascade** (met al haar tuning), niet laag of bestand. Nooit pad én drempel in dezelfde diff.

---

## 2. Instrument

| Vraag | Hoe |
|---|---|
| Vuurt dit pad? | Run-journaal (`core/diagnostics`) → `escalations` in layer-debug / E2E `*.layers.json` |
| Op >1 tekening? | `npm run esc:grootboek` |
| Uit → andere uitkomst? | `npm run esc:killswitch` |

| Script | Doel |
|---|---|
| `esc:check` | Alle inventaris-ID’s getagd |
| `esc:index` | Code-vindplaatsen → `archive/escalatie/tagindex.md` |
| `esc:coverage` | Getagd / geïnstrumenteerd / in harnas → `archive/escalatie/coverage.md` |
| `esc:grootboek` | Cross-fixture buckets → sectie hieronder |
| `esc:killswitch` | ESC_OFF per kandidaat → `archive/escalatie/killswitch-report.md` |

ID’s in code: `// ESC:<ID> (<Cat>)`. Inventarisregelnummers zijn historisch; actuele locatie = tagindex.

---

## 3. Verdicts

| Verdict | Betekenis |
|---|---|
| **PROMOVEREN** | Pad is de hoofdweg; dode aanloop opruimen |
| **HERLEIDEN** | Drempel = ratio van gemeten grootheid |
| **AFBAKENEN** | Blijft, met precondititie + journaal |
| **VERWIJDEREN** | Vuurt nooit, of gedekt elders |
| **BEHOUDEN (F)** | Bewuste keuze; documenteren + test |

### Besloten (harnas-ronde L2–L10 + L11/L12/L14-bind + FML)

| ID | Verdict | Bewijs | Datum |
|---|---|---|---|
| D-45, D-49…D-53, R-26 | **VERWIJDEREN** → weg | 0/6 + kill-switch | 2026-07-31 |
| W-07 | **PROMOVEREN** | Alleen `sampled`; fallback mag als safety-net | 2026-07-31 |
| X-22 | **PROMOVEREN** → zero-fallback weg | Alleen `measured`; ≤0 → X-07 | 2026-07-31 |
| W-14 | **AFBAKENEN**; dode niveaus weg | `sampled`+`faceMedian`; reference/policyFallback geknipt | 2026-08-01 |
| D-44, D-47, D-48 | **AFBAKENEN** | Path A sticky / segment / Path B swing-mask | 2026-07-31 |
| W-13 | **AFBAKENEN** | Spur zonder meting | 2026-07-31 |
| X-01 | **AFBAKENEN** | Export altijd `balance: 0.5` | 2026-07-31 |
| X-02 | **AFBAKENEN** | Dikte → vaste tier (beleid) | 2026-07-31 |
| X-11, X-13…X-15, X-17 | **BEHOUDEN (F)** | Metadata/settings/lege collecties/`mirrored` ramen | 2026-07-31 |
| X-16 | **HERLEIDEN** | `h = floor.height` (geen −14) | 2026-08-01 |
| D-46 | **AFBAKENEN** + sticky promote | As-grow + class doorframe; 2/6 | 2026-08-01 |
| W-25, W-35, W-36 | **AFBAKENEN** | L6 face/hv/seed; k/6 | 2026-08-01 |
| X-10 | **AFBAKENEN** | Twin→double_wide; later toggle zoals R-27 | 2026-08-01 |
| R-28 | **AFBAKENEN** | L14 1D muurgat-NMS vóór R-27 (smaller-first) | 2026-08-04 |
| X-28 | **AFBAKENEN** | Deur wint bijna-coïncident raam (strak) | 2026-08-04 |
| W-09, W-21 | **AFBAKENEN** | T-arm / micro-loop guards; 0/6 = zeldzaam | 2026-08-01 |
| W-46 | **AFBAKENEN**; zero-length weg | DT-miss blijft; geteld | 2026-08-01 |
| W-53 | **AFBAKENEN** | fmlReady-gate | 2026-08-01 |
| X-21 | **DRY → W-53** | Alias; skip-loud | 2026-08-01 |
| X-03…05, X-07…09, X-12, X-24 | **AFBAKENEN** | FML safety-nets | 2026-08-01 |
| D-42, D-56, D-59 | **AFBAKENEN** | Sync DF / wall-mask / geen L12→geen FML | 2026-08-01 |
| REF-14 | **hard fail** | Geen stille 12/23 default | 2026-08-01 |
| X-18, X-23 | — (niet bereikt) | Outside E2E-pad / CV altijd geladen | 2026-07-31 |

### Cat-toewijzing (tabellen zonder Cat in inventaris)

| ID’s | Cat | Reden |
|---|---|---|
| D-01…D-08 | C | `DOOR_SPACE_POLICY` |
| D-44 | P | Primair, geen escalatie |
| O-01…O-04, O-31…O-41 | D | Orkestratie |
| O-42…O-46 | B | Gates |
| X-27 | P | Dode vlag |

---

## 4. Stand

**Klaar**

- Batch nul + Golf 0–7 luid-maken (~198 telsites; ~20 A–E stil = mop-up buiten golf-sets).
- Harnas-ronde doorspreken (L2–L10 + bind + FML): verdicts hierboven; code-knippen waar besloten.
- 6 E2E-fixtures met `escalations` in snapshots.

**Scope harnas** (gedragswijzigingen eerst alleen hier): muren L2–L10, L11/L12, L14-bind, FML-conversie.

**Buiten harnas** (alleen journaal tot eigen meetdekking): deur Stage 1/2, raam Stage 1–4, REF-analyse, UI-orkestratie (~113 geïnstrumenteerd).

**Initial detectie (bespreken, geen meet-poort):** [`detectie-initial-bespreken.md`](detectie-initial-bespreken.md) — **rondes A–G klaar**. Klaar voor ontwikkeling; geen VERWIJDEREN-batch uit deze ronde.

**Open**

- Mop-up ~20 stille A–E-ID’s.
- AFBAKENEN ≠ verwijderd — precondities in code/comment waar nog dun.
- Optioneel: judging-skill; idempotentie orkestratie (inventaris §10.5); O-23 leaner invalidatie / sticky asymmetrie (schuld, geen blokker).

Spelregels: kill-switch vóór code-VERWIJDEREN; inventaris niet bijwerken met besluiten (alleen hier / `decisions.md` bij formele keuzes).

---

## 5. Gegenereerd grootboek

`npm run esc:grootboek` overschrijft tussen de markers. Bron: fixture `*.layers.json` (geen re-run).

<!-- BEGIN GENERATED GROOTBOEK -->

### Cross-fixture grootboek (2026-08-01)

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
| X-16 | alle | 12 | full_height=12 | alle fixtures — AFBAKENEN / documenteren |
| X-27 | alle | 6 | dead_flag_false=6 | alle fixtures — AFBAKENEN / documenteren |

<!-- END GENERATED GROOTBOEK -->
