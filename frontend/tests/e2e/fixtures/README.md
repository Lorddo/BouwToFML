# E2E fixtures

Eén map per tekening. Harness-slug = mapnaam.

```
<slug>/
  fixture.json      # gebakken L0/L1 + deuren/ramen (export uit app)
  mask.png          # menselijke inspectie; tests lezen maskRle uit fixture.json
  reference.fml     # handgemaakt FML, één verdieping (metrics)
  snapshot/
    <slug>.walls.fml.json
    <slug>.fml.json          # inclusief reference-metrics
    <slug>.layers.json
    detected.fml             # optioneel: app-export, niet gebruikt door harness
```

## Conventies

- `reference.fml` is de enige bron voor dekking/precisie/recall. Geen fuzzy `*.fml`-scan.
- Multi-verdieping project: per fixture één verdieping extracten naar `reference.fml`.
- Detectie-exports (`Detectie`-floor) horen in `snapshot/detected.fml`, niet als referentie.
- Mapnamen lowercase kebab-case (`staedion-10`, niet `Staedion-10`) — op Windows botst case.

## Huidige set

| Slug                      | Referentie               |
| ------------------------- | ------------------------ |
| `kromme-mijdrecht-3e`     | Derde verdieping         |
| `amstelveenseweg-1092-bg` | Begane grond             |
| `amstelveenseweg-1092-1e` | Eerste verdieping        |
| `staedion-10`             | Aangepaste manual (unit) |
| `bouwtek11`               | BouwTek11                |
| `bg`                      | Project4 begane grond    |
