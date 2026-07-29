# V3 child-plan sjabloon

Gebruik dit sjabloon voor **elk** laag-plan (L3–L9).  
Kopieer naar `.cursor/plans/v3-layer-N-….plan.md` of `.cursor/docs/v3-layer-N-decision.md`.

## Meta

- **Laag:** N
- **Volgorde:** streng sequentieel — prerequisite `V3_NATIVE_THROUGH_LAYER >= N-1`
- **Engines:** (weld / hv / junction / connector / collapse / prune / topology)
- **Policies:** `pipeline-v3/policies/layer-N.ts`
- **Baselines:** Copy(6) / Copy(7) / CURRENT — zie [`v3-baseline-index.md`](v3-baseline-index.md)
- **Contract:** [`v3-engine-contract.md`](v3-engine-contract.md)

**Child-plan volgorde (Stage 3):** L3 → L4 → L5 → L6 → L7 → L8 → L9 (niet L4 vóór L3).

---

## 1. Interview (15–30 min)

Vragen aan de gebruiker:

1. Wat mag deze laag **wel** (verwijderen / verplaatsen / toevoegen)?
2. Wat mag deze laag **niet** (fouten van vorige laag “repareren”)?
3. Welke plattegronden / zones zijn acceptatiecriteria?
4. Wat is “kapot” in CURRENT vs “beter” in Copy(6) of Copy(7)?

**Antwoorden (invullen):**

| Vraag | Antwoord |
|-------|----------|
| Wel | |
| Niet | |
| Criteria | |
| Visueel oordeel | |

---

## 2. Research (read-only, 3 bomen)

- [ ] Diff orchestrator + constants: Copy6 vs Copy7 vs CURRENT
- [ ] Coupling: welke engines / policies?
- [ ] Kandidaten A/B/C (gedrag + bronbestand)

| Kandidaat | Bron | Kort | Risico |
|-----------|------|------|--------|
| A | | | |
| B | | | |
| C | | | |

---

## 3. Reproduce

- [ ] Zelfde fixture/probe door CURRENT V2
- [ ] Vergelijk metrics (seg count, I/L/T/X, probe-coords)
- [ ] Overlay-checklist

| Metric | Copy6 | Copy7 | CURRENT | V3 target |
|--------|-------|-------|---------|-----------|
| | | | | |

---

## 4. Pick

- **Golden:** …
- **Policy-waarden:** …
- **Niet meenemen (anti-soup):** …

---

## 5. Integrate in V3

- [ ] Alleen `engines/*` + `policies/layer-N` + dunne `layer-N-*.ts`
- [ ] Geen `layer-N` → `layer-M` imports
- [ ] Tests in `frontend/tests/cv/walls/pipeline-v3/`
- [ ] Toggle v3; default v2 groen
- [ ] Korte decision-doc: `v3-layer-N-decision.md`

---

## 6. Gate (done = alle checks)

- [ ] Interview akkoord
- [ ] Reproduce-tabel ingevuld
- [ ] Policy frozen
- [ ] V3-laag stabiel op afgesproken tekeningen
- [ ] Default V2 ongewijzigd / groen

## Anti-patronen (verboden)

- L6 “even L5-merge doen”
- L4 die L5-weld importeert
- Constants zonder LayerPolicy
- V1 `skeleton-cleanup` terug in runtime
