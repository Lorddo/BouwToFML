# Baseline-rood — kernel-campagne fase 0

Gemeten: 2026-09-13, working tree met rename fase 0–3 (ongecommit), HEAD `a02891a`.
Herijkt ná batch 1 van fase 1 (drie dode bestanden weg).

Dit is de nullijn voor [`editor_kernel_plugins_v2_d0e1ed1b.plan.md`](../../../plans/editor_kernel_plugins_v2_d0e1ed1b.plan.md). "Groen" tijdens de campagne = **deze lijst en niets meer**. Elke andere rode test = stop.

## Runtime (`npx vitest run`)

310 testbestanden, 2453 tests. **9 rood in 4 bestanden.** Suite liep door (geen Windows-hang, duur ~30 s).

Verloop van de campagne, telkens **dezelfde 9 rood**: fase 3.0 (pointer-cascade-spec) 311 bestanden / 2499 tests → fase 3 batch 1 (Selected-store) 312 / 2518 → fase 4b (snap + sessie-defaults) 314 / 2531 → fase 1 batch 2 (alias-test viel mee weg) 314 / 2530 → fase 5 (4 specs op de shell-composables) 318 / 2559 → fase 3 batch 2 (tweede lane + gevelgroep) 318 / **2563**.

| # | Test | Status |
|---|---|---|
| 1 | `tests/core/rebase-plan-to-item-refid.spec.ts` — schuift drawing-midden mee en muteert | bekend |
| 2–6 | `tests/ui/plan-canvas-test-doors.spec.ts` — 5 tests (fixturepad) | bekend |
| 7–8 | `tests/ui/plan-nulpunt-bake.spec.ts` — 2 tests | bekend |
| 9 | `tests/core/fml/opening-fixture-catalog.spec.ts` — stair `strokeWidth` < 0.8 (krijgt 1.5) | bekend |

Alle negen staan als bekend-rood in [`memory.mdc`](../../../rules/memory.mdc). De 2 `user-settings`-tests die daar ook genoemd staan zijn **niet meer rood**.

### Meetfout in de eerste ronde (bewaard als waarschuwing)

De eerste meting om 16:20 gaf 10 rood, met `bind-walls-to-roofs > "tweede bind is no-op"` als extra. Die was niet echt: er liep een tweede agent-sessie in dezelfde working tree. `bind-walls-to-roofs.spec.ts` werd om 16:20:21 geschreven — vier seconden ná de start van de suite — en de bijbehorende `bind-walls-to-roofs.ts` pas om 16:23:27. De run zag dus de nieuwe assertie zonder de implementatie. Na batch 1 is die test groen.

Les voor de rest van de campagne: **meet niet met een tweede sessie in dezelfde tree.** Een baseline uit een bewegende tree is geen baseline.

## Typecheck (`npx vue-tsc -b`)

`src/` is **schoon**. Vijf fouten die er bij het starten van fase 0 stonden zijn gerepareerd:

| Bestand | Was | Actie |
|---|---|---|
| `src/ui/composables/plan-canvas/useElevationInteraction.ts` | `wallAxisEndHandles` werd niet doorgegeven aan de view (TS2551 in `ElevationStageHandles.vue`) | doorgifte toegevoegd naast `ridgeEndHandles` |
| `src/core/fml/dormer-edge-walls.ts` | ongebruikte `slack` in `findDormerEdgeSurface` | weg |
| `src/core/fml/roof-clear-height.ts` | ongebruikte functie `clipAreaCm2` | weg (`toClipRing` / `ringArea` / `resolveIntersectionFn` blijven, die zijn elders in het bestand in gebruik) |
| `src/core/fml/roof-overlap.ts` | ongebruikte import `isDormerRoof` | weg |
| `src/core/fml/facade-elevation.ts` | ongebruikte import `DORMER_ROOF_SURFACE_COLOR` | weg |

De eerste was een **echte kapotte feature**: `v-for="handle in wallAxisEndHandles"` liep over `undefined`, dus de muur-as-eindgrepen in het aanzicht werden niet getekend.

Bij de eerste meting stonden er nog **108 typefouten in 28 testbestanden** (fixtures met `refid` in plaats van `id` + `kind`, uit de opening-identiteit-cutover), waardoor `npm run build` faalde. Die zijn in een parallelle sessie opgelost. Stand 17:35: **`npx vue-tsc -b` geeft nul fouten**, `src/` en `tests/` beide schoon. Build is niet langer een blokkade.

## Wat "stop" betekent

Per kernel-fase draaien: `npx vue-tsc -b` (alleen `src/`-regels vergelijken) en `npx vitest run tests/ui`. Nieuwe rode test buiten deze 9, of een nieuwe `src/`-typefout: terug, niet doorbouwen.
