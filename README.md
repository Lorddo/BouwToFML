# BouwToFML

Bouwtekening → Floorplanner FML conversietool.

## Status

Voorbereiding — nog geen applicatiecode. Documentatie en JSON v3 referentie-examples aanwezig.

## Documentatie

Alle specs, beslissingen en Floorplanner-referenties staan in **`.cursor/`**:

- `.cursor/docs/project-brief.md` — volledige projectbeschrijving
- `.cursor/docs/decisions.md` — vastgelegde keuzes
- `.cursor/docs/examples-inventory.md` — `FML(current)` analyse
- `.cursor/docs/poc-test-plan.md` — POC-fasen A–D (start: Kinderdijkstraat)
- `.cursor/docs/export-options.md` — download vs. API-import (V2)
- `.cursor/docs/crosscheck-reference.md` — hergebruik uit Crosscheck
- `.cursor/docs/floorplanner/` — offline Floorplanner API + FML v3 docs
- `.cursor/rules/` — Cursor rules (o.a. `fml-format.mdc`)

## Kern (V1)

- Semi-automatisch: repetitief tekenwerk wegnemen
- Input: PNG/JPG per verdieping; onderlegger uit FML `drawing.url` of eigen scan
- Train-by-example per project; OpenCV client-side
- Export: **JSON v3** — `walls[]` + `openings[]` in **cm**
- Concept-refids: deur `04342465…`, raam `b88cd3f4…`
- Minimale editor vóór download; geen embedded Floorplanner-editor
- POC-startcase: **Kinderdijkstraat 53 1** (53 muren, 1 verdieping)

## Mappen

| Map | Doel |
|-----|------|
| `examples/FML(current)/` | JSON v3 enterprise-exports (grondwaarheid) |
| `frontend/` | Vue 3 + Quasar + KonvaJS + client-side OpenCV |
| `backend/` | Fastify — V2 (API-import) |

## Referentieproject

`C:\Pranimate\Crosscheck` — kalibratie-UI, intern muur-model; FML-export naar v3 opnieuw bouwen.
