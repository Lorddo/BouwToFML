# Export: FML-download vs. directe Floorplanner API-import

## Samenvatting

| Aspect | Download `.fml` | API Import (`POST /projects/import.json`) |
|--------|-----------------|-------------------------------------------|
| Gebruikersstappen | Genereer → download → handmatig uploaden in Floorplanner | Genereer → één klik → project staat in Floorplanner |
| API-key nodig | Nee | Ja (Enterprise/partner) |
| Backend nodig | Optioneel (kan client-side) | **Ja** (key mag niet in frontend) |
| Credentials opslag | Geen | `.env` met sandbox/production key |
| Na import | Gebruiker opent bestand zelf | Project-ID + optioneel editor-URL/token |
| Foutafhandeling | Lokaal (XML/JSON validatie) | HTTP 403/validatiefouten van Floorplanner |
| Eenheden | Onze keuze bij generatie | **QUIRK:** import-API verwacht **meters** voor x/y/z |

**Conclusie:** API-import is haalbaar en verbetert UX sterk, maar vereist backend + Floorplanner-account. Download blijft nuttig als fallback en voor offline/test zonder API-key.

---

## Optie A – Download FML (huidige Intro-stap 8)

### Flow

```
Tekening → detectie → vector → FML genereren → browser download → gebruiker uploadt in Floorplanner UI
```

### Voordelen

- Geen Floorplanner API-key of Enterprise-abonnement nodig om te exporteren
- Geen server-side secrets
- Werkt offline / in sandbox zonder externe calls
- Eenvoudig te testen: open `.fml` handmatig in Floorplanner

### Nadelen

- Extra handmatige stap voor de tekenaar
- Geen directe deeplink naar editor
- Gebruiker moet zelf projectnaam/structuur beheren bij upload

### Implementatie (later)

- Backend- of frontend-module `buildFmlV3(plan)` → JSON `Blob` → download
- Validatie: geldig JSON v3; roundtrip tegen `examples/FML(current)/`

---

## Optie B – Direct importeren via Floorplanner API

### Flow

```
Tekening → detectie → vector → FML JSON/XML → POST /projects/import.json → project response
                                                                              ↓
                                    optioneel: GET /projects/{id}/token.json?editor_url=true
                                                                              ↓
                                    redirect of embed editor met projectAccessToken
```

### API-endpoints (relevant)

| Endpoint | Methode | Doel |
|----------|---------|------|
| `/projects/import.json` | POST | FML JSON of XML importeren als nieuw project |
| `/projects/{id}/token.json` | GET | Token voor embedded editor (`editor_url=true`) |
| `/projects/{id}/fml` | GET | Bestaand project als FML ophalen (referentie/validatie) |

**Base URLs:**

- Sandbox: `https://floorplanner.dev/api/v2/`
- Production: `https://floorplanner.com/api/v2/`

**Authenticatie:** HTTP Basic Auth — username = API key, password = `x`.

Zie offline kopieën in `.cursor/docs/floorplanner/`.

### Belangrijke QUIRK – eenheden bij import

De [Import Project](https://floorplanner.readme.io/reference/importproject) documentatie vermeldt expliciet:

> The `x`, `y`, and `z` coordinates must be specified in **meters** instead of centimeters. To set any coordinate to 160cm set it to 1.6.

De [FML v3.0 specificatie](https://floorplanner.readme.io/reference/v30-specification) beschrijft persistent JSON met **centimeters** voor coördinaten.

**Implicatie bij API-import (V2):** persistent export blijft **cm** (JSON v3). Alleen op het import-pad: `cm → m` conversie vóór POST.

Download-flow (V1): geen conversie — direct cm zoals in `examples/FML(current)/`.

### Response bij succes

Import retourneert een `project`-object met o.a.:

- `id` — Floorplanner project-ID
- `name`, `project_url`
- `floors[]` met `designs[]`

Daarmee kan de app direct doorlinken naar de editor.

### Editor openen na import

1. `GET /projects/{id}/token.json?editor_url=true&expires_in=3600`
2. Response: `{ token, editor_url }`
3. Redirect gebruiker naar `editor_url` of embed via `projectAccessToken` (zie embedding docs)

Enterprise-abonnement vereist voor embed + API.

### Meerwerk t.o.v. download

| Onderdeel | Extra werk |
|-----------|------------|
| Backend route `POST /api/export/floorplanner` | Fastify handler die import aanroept |
| Config | `FLOORPLANNER_API_KEY`, `FLOORPLANNER_BASE_URL` (sandbox/prod) |
| Eenheden/conversie | Meters voor import-API; testen tegen Floorplanner |
| Error mapping | 403, netwerkfouten, ongeldige FML → gebruikersvriendelijke melding |
| Token + redirect | Optioneel maar sterk aanbevolen voor UX |
| Sandbox testing | Testprojecten op `floorplanner.dev` |
| Rate limits / credits | Floorplanner project-credits in acht nemen |

**Geschatte extra complexiteit:** ~1–2 dagen backend + integratietest, bovenop FML-generator.

---

## Aanbevolen aanpak

### V1 (MVP export)

- **FML-download** + **onderlegger apart downloaden** (opgepoetste tekening niet in FML)
- Minimale editor vóór download (muurpunt, splitsen, muur toevoegen, deur draaien)
- Per verdieping: plafondhoogte, deurhoogte (0 cm vloer), raamhoogte + sill
- Deuren: standaard **enkeldeur met draaicirkel** (`0434246537840a3326e305dbe7b9c355743e6e93`)
- Geen maatlijnen, geen aanzichten
- Valideer output door handmatig te openen in Floorplanner
- Geen embedded Floorplanner-editor

### V2 (API-import)

- Backend-import toevoegen als optionele knop **"Open in Floorplanner"**
- Download blijft primair — geen embedded FP-editor (factureringsrisico)
- Sandbox eerst, daarna production key

### Fase 3 (optioneel)

- Embedded editor na import (Enterprise)
- OAuth/SSO als meerdere tekenaars eigen Floorplanner-account hebben

---

## Vastgelegde keuzes (2025-06)

1. **API-key:** Enterprise key komt in **V2**, zodra end-to-end demo (verdieping → FML-download) slaagt.
2. **Account:** Eén Floorplanner-account voor de tool. SSO is apart aanbod — alleen bij expliciet meerwerk.
3. **Formaat:** **JSON v3** als primair exportformaat (centimeters). API-import vereist later een `cm → m` conversielaag (zie QUIRK hierboven).

Referentiebestanden: `examples/FML(current)/`. Zie ook `decisions.md`.
