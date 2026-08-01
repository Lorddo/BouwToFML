# Plan: overige ESC-ID's luid maken (~204)

Peildatum: 2026-07-31 · Bron: [`escalatiepaden-aanpak.md`](escalatiepaden-aanpak.md), [`escalatie-coverage.md`](escalatie-coverage.md), [`escalatie-ledger.md`](escalatie-ledger.md)

## Doel

Elke inventaris-ID die nog **alleen getagd** is (`// ESC:…`) krijgt een **journaal-telsite**, zodat we per tekening / E2E-run / DevSession zien welke takken werkelijk afgaan. Geen drempel- of padwijziging in deze batch — alleen observatie (zelfde discipline als batch nul).

## Huidige stand

| Status | Aantal (orde) |
|---|---|
| Getagd | 228/228 |
| Al geïnstrumenteerd | ~24 |
| Rest “stil” | ~204 |
| Daarvan in E2E-harnas-bereik (muren L2–L10 + L11/L14-bind + FML) | ~90 potentieel zichtbaar in fixtures |
| Buiten harnas (Stage 1/2 deur/raam, refs, UI) | ~110 — journaal wél, grootboek via DevSession / aparte runs |

**Belangrijk:** “luid” ≠ “alles in E2E”. Stages die fixtures bakken als lijst blijven buiten `layers.json` tot we die stages live draaien of DevSession-export van het journaal standaardiseren.

## Besluiten FML cat-E (vastgelegd 2026-07-31)

| ID | Besluit |
|---|---|
| **X-11** | Geen `mirrored` op ramen —zelfde display; **BEHOUDEN (F)** / skip implementatie |
| **X-13** | Hardcoded metadata **laten**; meenemen bij multi-verdieping-refactor |
| **X-14** | Lege collecties **laten** — anders false FML / Floorplanner.com opent niet |
| **X-15** | Hardcoded settings **laten**; later instellingen-pagina (zelfde refactor als X-13) |
| **X-16** | −14 was vloerdikte uit bron-FML; **az/bz = floor.height** (geen floor-surfaces) · klaar 2026-08-01 |
| **X-17** | Opening-defaults **laten**; al (deels) sidebar + later settings |
| **W-14** | Dikte-fallbackketen **laten staan**; dode niveaus later |

Deze ID’s horen **niet** in de “luid maken”-implementatie als gedragswijziging; X-16 mag wél een `noteDiscardedMeasurement` / comment-audit krijgen als we FML-instrumentatie raken.

---

## Ontwerp: hoe “luid”

Hergebruik bestaande API (`@/core/diagnostics`):

| Cat / patroon | Journaal-vorm | Hot-path |
|---|---|---|
| **A** cascade-niveau | `noteCascadeLevel(id, site, level)` of `tally(id, level)` | geaggregeerd; events begrensd (bestaande limiet 3/ID) |
| **B** guard/rollback | `noteRollback` / `tally(…, 'rolled_back'\|'accepted')` | per beslissing, niet per pixel |
| **C** meetruimte | `tally(id, 'white'\|'ink'\|'either')` | per hypothese/poging OK |
| **D** orkestratie | `escalate` / `noteGatesDisabled` / bestaande O-31… | per UI-actie |
| **E** meting weg | `noteDiscardedMeasurement` (beide waarden) | alleen bij echte overwrite |
| **F** goedaardig | **geen** teller (bewust stil) — of één `tally` bij eerste gebruik als we F-lijst willen sluiten |

**CI:** na elke golf `npm run esc:coverage` — doel: “getagd zonder journaal” → 0 voor A–E (F mag uitzondering).

**Poort:** `esc:check` blijft tag-sync; optioneel later `esc:coverage --fail-under` voor A–E.

**Gedrag:** geen `isEscalationEnabled`-guards toevoegen in dezelfde diff als “nieuw luid” (kill-switch mag later, apart).

---

## Volgorde (golven)

Werk **per cascade / cluster**, niet per losse ID. Elke golf: instrumenteren → unit smoke → E2E of DevSession-run → `esc:coverage` + grootboek bijwerken → pas daarna volgende golf.

### Golf 0 — inventarisatie (½ dag)

1. `npm run esc:coverage` / `esc:missing`: sectie **Getagd zonder journaal** (ID/Cat/tag, harnas vs buiten, Cat F = skip-loud).
2. Split: **harnas-bereik** vs **buiten**; Cat F markeren als skip.
3. Deliverable: Golf-1 checklist in `escalatie-coverage.md` (**W-16…W-43**).

### Golf 1 — Muren L5/L6 (hoogste dichtheid, wél in harnas)

- Alle W-* in L5 cleanup + L6 connector die nog stil zijn (~25–30).
- Vorm: `tally` / `noteCascadeLevel` per tak (accept / skip / rollback).
- Meet: 6 E2E-fixtures → `layers.json` + `esc:grootboek`.
- Verwacht: veel hits; snelle 0/N-kandidaten voor latere VERWIJDEREN-batch.

### Golf 2 — Muren rest L2–L4, L7–L10 + overige W-E

- Resterende muur-ID’s die stil zijn (jitter, prune, align, dissolve, fml-ready guards).
- Meet: zelfde E2E.
- **W-14** alleen documenteren (al luid); geen pad-knip.

### Golf 3 — FML / conversie stil (X-* behalve besloten skip)

- Instrumenteren wat nog stil is in `core/fml` (niet X-11/13/14/15/17 **gedrag** wijzigen).
- **X-16:** `noteDiscardedMeasurement` of comment + short doc: wat is `floor.height - 14` t.o.v. sidebar 280 cm?
- Meet: E2E FML-snapshots ongewijzigd (alleen journal counts).

### Golf 4 — Deuren L11 rest + Stage 1/2 (deels buiten harnas)

- Stage-cascades: match-niveaus, angle-rescue-takken, fill/surround — `tally` per niveau.
- L11: wat na D-44…D-48 nog stil is.
- Meet:
  - L11/L12: E2E (gebakken doors → snap pad).
  - Stage 1/2: **DevSession** of tijdelijke “live stage”-flag in fixture-harness (apart besluit; default = DevSession-export van journal).

### Golf 5 — Ramen Stage 1–4 + L14 stil

- Evidence (R-16 al deels), axel/strip/merge-takken, bind-fallbacks.
- Meet: E2E voor L14-bind; stages via DevSession / optioneel live-run.

### Golf 6 — Refs

- REF-cascades (opening-units, as-align, crop) — voedt ratio’s elders.
- Meet: **niet** in standaard E2E; stap-2 referentie-analyse HTML of dedicated ref-spec + journal assert, of DevSession vanaf stap 2.

### Golf 7 — Orkestratie (UI)

- Sticky/prune/cascade/gates die nog stil zijn (O-* buiten batch-nul).
- Meet: idempotentie-/composable-tests + handmatige DevSession; geen E2E-layers.json tenzij harness UI-flow krijgt.

---

## Wat “klaar” betekent per golf

1. `esc:coverage`: 0 missing journaal voor de ID’s van die golf (A–E).
2. Minstens één run (E2E of vastgelegd DevSession-journal) met counts in ledger/grootboek.
3. Geen snapshot-diff behalve `escalations` in `*.layers.json` (of bewust `-u`).
4. Memory/ledger: één regel “golf N klaar · N ID’s luid · M hits / K zero”.

---

## Risico’s en mitigatie

| Risico | Mitigatie |
|---|---|
| Hot-path ruis (L2/L5 per segment) | Alleen `tally`, geen per-event stack; bestaande event-cap |
| “0 hits” verkeerd gelezen als dood | Coverage-status: **buiten harnas** vs **in harnas 0/N** |
| Big-bang 204 ID’s | Max ~1 cascade-cluster per PR |
| Kill-switch + nieuw journaal tegelijk | Nee — eerst luid, later kill-switch golf |
| Fixtures bakken stages | Accepteren; DevSession is meetinstrument tot live-stage E2E bestaat |

---

## Status

| Golf | Status | Notitie |
|---|---|---|
| **0** | **klaar 2026-07-31** | coverage/missing + multiline journal-detectie + checklists |
| **1** | **klaar 2026-07-31** | W-16…W-43 · 0/28 stil |
| **2** | **klaar 2026-07-31** | W rest · 0/22 stil |
| **3** | **klaar 2026-07-31** | X-* · 0/23 stil · X-16 noteDiscardedMeasurement |
| **4a** | **klaar 2026-07-31** | L11 D · 0/7 stil |
| **4b** | **klaar 2026-07-31** | Stage D · 0/42 stil |
| **5** | **klaar 2026-07-31** | R · 0/24 stil |
| **6** | **klaar 2026-07-31** | REF · 0/12 stil |
| **7** | **klaar 2026-07-31** | O · 0/36 stil (O-40 skip) |

## Aanbevolen start

~~Golf 0–7~~ gedaan. Rest ~20 A–E stil buiten sets = mop-up; skip-loud blijft.

## Expliciet buiten deze plan-scope

- Drempels herleiden / paden verwijderen (aparte batch ná bewijs).
- X-13…X-17 / X-11 gedragswijzigingen (besloten laten / later refactor).
- W-14 dode niveaus knippen.
- Multi-verdieping / settings-page (X-13/X-15).
