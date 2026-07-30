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

Geen. Alle 228 inventaris-ID's zijn getagd (`npm run esc:check` OK, 249 tags).

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

Nog leeg — vullen na batch nul (grootboek) en interview over single-drawing firers.

| ID | Verdict | Bewijs | Datum |
|---|---|---|---|
| — | — | — | — |
