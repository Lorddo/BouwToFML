# E2E fixtures

Peildatum: 2026-07-31 · Besluit: [`decisions.md`](decisions.md) § E2E fixtures · Harness: `frontend/tests/e2e/harness/`

## Doel

Verandering-detector op late lagen (L2–L10, L11/L12, L14, FML). Geen kwaliteitscijfer op zichzelf — dekking/precisie/recall t.o.v. handwerk staan wél in de snapshot als richting.

## Layout

Eén map per tekening. Harness-slug = mapnaam.

```
frontend/tests/e2e/fixtures/<slug>/
  fixture.json      # gebakken L0/L1 + deuren/ramen (export uit app)
  mask.png          # menselijke inspectie; tests lezen maskRle uit fixture.json
  reference.fml     # handgemaakt FML, één verdieping (metrics)
  snapshot/
    <slug>.walls.fml.json
    <slug>.fml.json          # inclusief reference-metrics
    <slug>.layers.json       # lagen + escalatie-grootboek
    detected.fml             # optioneel: app-export, niet gebruikt door harness
```

Zie ook `frontend/tests/e2e/fixtures/README.md`.

## Wat de harness draait

| Stap | Bron | Module |
|---|---|---|
| L2–L10 | `fixture.layer1` + `maskRle` | `runWalls` → `runPipelineV3` |
| Semantic + FML (muren) | L10 | `buildSemanticWallsForOutput` → `extractionToPlan` → harmonize |
| L11/L12 | `fixture.resolvedDoors` | `snapDoorsToWalls` → `orientBoundDoors` |
| L14 | `fixture.stage4ResolvedWindows` | `bindWindowsToWalls` → merge |
| Metrics | `reference.fml` | `reference-report.ts` |

**Niet in de harness:** deur Stage 1/2, raam Stage 1–4, REF-analyse, UI-orkestratie — die zitten als lijsten in `fixture.json`. Escalatiepaden daar zijn alleen meetbaar via app-runs + journaal (zie [`escalatie.md`](escalatie.md) §2–4).

## Poorten

| Check | Drempel |
|---|---|
| `fmlReady` | true |
| Muursegmenten L10 | > 0 |
| Openingen | ≥ 5 (deuren + ramen) |
| Lengte vs `reference.fml` | ±25% |
| Journaal | `degraded === false` |
| Snapshots | `toMatchFileSnapshot` op walls/fml/layers |

## Huidige set

| Slug | Referentie |
|------|------------|
| `kromme-mijdrecht-3e` | Derde verdieping |
| `amstelveenseweg-1092-bg` | Begane grond |
| `amstelveenseweg-1092-1e` | Eerste verdieping |
| `staedion-10` | Aangepaste manual |
| `bouwtek11` | BouwTek11 |
| `bg` | Project4 begane grond |

Open: Kinderdijkstraat 53-1.

## Opname (UI → fixture)

1. Tekening door de workspace-flow tot afronden (muren + deuren + ramen).
2. Dev-panel / export: E2E-fixture exporteren → `fixture.json` + `mask.png`.
3. Handgemaakt Floorplanner-FML (één verdieping) als `reference.fml`.
4. `npm run test:e2e -u` om snapshots te vullen.
5. Commit fixtures + snapshots.

Bouw: `frontend/src/platform/e2e-fixture/` (`buildE2eFixture`, RLE-codec).

## Commando's

```bash
cd frontend
npm run test:e2e          # vitest.e2e.config.ts
npm run test:e2e -- -u    # snapshots bijwerken
npm run esc:grootboek     # cross-fixture escalatie-rapport → ledger
npm run esc:killswitch    # ESC_OFF=<id> per kandidaat, snapshot-hash-diff
npm run esc:coverage      # getagd / geïnstrumenteerd / in-harnas
```

CI: na unit-tests een aparte stap `npm run test:e2e` (unit-suite exclude `tests/e2e/**`).

## Escalatie-grootboek

`<slug>.layers.json` bevat `escalations` (`counts` + `levels` + `degraded`). Cross-fixture aggregatie: [`escalatie.md`](escalatie.md) (gegenereerde grootboek-sectie) + `npm run esc:coverage` → `archive/escalatie/coverage.md`.
