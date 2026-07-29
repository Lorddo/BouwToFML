# Archive (parking lot)

Lege parkplek voor code die we uit het actieve pad willen halen tijdens opruiming/refactor.

**Regels**

- Niets hier wordt geïmporteerd vanuit `frontend/src/**` (actief pad).
- Knip/tsconfig/vitest negeren `src/archive/**` — zie `knip.json`, `tsconfig.json`.
- Zet hier alleen weg wat je bewust wilt bewaren voor latere review of rollback; anders hard delete.
- Runtime muurfinalize is **V3-only** (`rooms/pipeline-v3`). Oude V1/V2 pipelines zijn verwijderd (2026-07-25).
