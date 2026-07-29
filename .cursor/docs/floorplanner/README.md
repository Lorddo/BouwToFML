# Floorplanner offline documentatie

Lokale kopie van [Floorplanner API docs](https://floorplanner.readme.io/reference/getting-started).
Bij twijfel: online versie of `llms.txt` index raadplegen.

## Index

| Bestand | Onderwerp |
|---------|-----------|
| [llms.txt](./llms.txt) | Volledige API-index (179 endpoints) |
| [v30-specification.md](./v30-specification.md) | FML JSON v3.0 formaat (walls, openings, areas) |
| [getting-started.md](./getting-started.md) | Sandbox vs production, embed flow |
| [authentication.md](./authentication.md) | Basic auth, OAuth, SSO |
| [import-project.md](./import-project.md) | FML importeren via API |
| [download-fml-json.md](./download-fml-json.md) | FML ophalen van bestaand project |
| [token-project.md](./token-project.md) | Editor-token genereren |
| [embedding-the-editor.md](./embedding-the-editor.md) | Editor embedden in eigen app |

## Project-specifieke notities

- **Exportformaat:** JSON v3 in **cm** — zie `.cursor/rules/fml-format.mdc` en `examples/FML(current)/`
- **Import QUIRK:** API import verwacht meters; persistent v3 JSON gebruikt centimeters
- **FML-licentie:** `fml-license-v01c-04102024.pdf` (exportvoorwaarden)

## Vernieuwen

```powershell
# Index ophalen
Invoke-WebRequest -Uri "https://floorplanner.readme.io/llms.txt" -OutFile ".cursor/docs/floorplanner/llms.txt"
```

Individuele pagina's: voeg `.md` toe aan URL-pad uit `llms.txt`, bv.
`https://floorplanner.readme.io/reference/v30-specification.md`
