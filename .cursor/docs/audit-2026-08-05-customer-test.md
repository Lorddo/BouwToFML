# Audit BouwToFML — Cloudflare klanttest (5 augustus 2026)

Pre-publicatie-review gericht op **semi-productie / hosted klanttest**. Devtools (Ctrl+Shift+H, diagnose-FAB) blijven bewust aan.

**Referentie:** [audit-2026-07-29.md](audit-2026-07-29.md) · [customer-test-delivery.md](customer-test-delivery.md)

**Peildatum checks:** 2026-08-05 (lokale poorten + code/spotcheck; live host bevestigd).

**Live host:** https://floorplan-fml.lorddo3066.workers.dev/

---

## 1. Managementsamenvatting

Sinds juli is de app van “niet te bouwen / geen git / geen persistentie” naar een **deploybare Vue-build** met CI, IndexedDB-projectresume, lege cold start, privacy-scrub en diagnose-export. Dat is genoeg basis voor een klanttest-host.

**Blokkerend voor Cloudflare go-live (auditmoment):**

1. Geen `frontend/public/_headers` — Vite preview heeft COOP/COEP/CORP, Cloudflare Pages niet automatisch.
2. CI-poorten rood lokaal: Prettier (16 files), ESLint (8 errors), E2E snapshots (12 mismatches, alleen trailing commas).
3. Host-smoke op echte Pages-URL nog niet gedaan (geen deploy in deze ronde).

Unit tests (1109) en `npm run build` zijn groen. Dist bevat geen `examples/`; sourcemaps uit.

**Verdict na P0-fixes in dezelfde sessie:** zie §8 — eerst **Conditional Go**, daarna **Go** na live host + dry-run.

---

## 2. Scope

| In | Uit |
|---|---|
| Cloudflare Pages static, `base: '/'`, headers | Devtools strippen |
| Flow 0–4, FML download, diagnose, DevTools | Detectie-retune / Cat C |
| Privacy, cold start, foutbanner, resume | Worker-CV, Mat-lekken, facade-knip |
| Operator + tester guide | Backend, auth, V2-features |

**Klaar-criterium:** tekenaar start leeg → 4 stappen → FML; bij problemen diagnose-HTML; support via Ctrl+Shift+H; host respecteert COOP/COEP/CORP.

---

## 3. Delta t.o.v. juli 2026

| Juli-blokker / ernstig | Status 2026-08-05 |
|---|---|
| Geen git | Dicht (repo + CI) |
| Build kapot (134 TS) | Dicht (`vue-tsc -b && vite build` groen) |
| Geen lint/CI | Dicht (workflow aanwezig; lokaal format/lint/e2e tijdelijk rood door recente unformatted files) |
| Geen persistentie | Dicht (IndexedDB `projects` + checkpoints) |
| Cold start Project4 | Dicht (`createEmptyProjectState`, geen `poc-reference`) |
| Detectie onmeetbaar | Deels dicht (6 E2E-fixtures in CI; geen 80%-claim) |
| FML zonder validatie / balance 0.5 / raam mirrored | Open → **P2** |
| `core ↔ cv`, facade, worker-CV, Mat-lek | Open → **P2** |
| Hosting-headers op echte host | **P0** (alleen Vite `server`/`preview`) |

---

## 4. Scorekaart (klanttest-risico)

| As | Juli | Nu | Onderbouwing |
|---|:---:|:---:|---|
| 1 Deploy & hosting | — | 4 | Preview-headers OK; Pages `_headers` ontbrak bij audit |
| 2 Build & CI-poorten | 3 | 6 | Build + unit groen; format/lint/e2e faalden bij audit |
| 3 Productflow 0–4 | 5 | 7 | Project/floors, diagnose, Settings, FML-viewer; code-paden aanwezig |
| 4 Persistentie | 2 | 7 | IndexedDB resume/reset; geen cloud-save (bewust) |
| 5 Foutafhandeling & support | 4 | 7 | Fatal banner, beforeunload, diagnose-FAB, DevTools |
| 6 Detectie & FML-export | 6 | 6 | E2E regressie; geen Floorplanner-host-smoke in deze audit |
| 7 UX / i18n | 5 | 7 | en/nl/th; generieke placeholders |
| 8 Privacy / assets | — | 8 | Catalog scrub; geen examples in dist; sourcemap uit |
| 9 Kwaliteitsborging | 3 | 7 | 1109 unit + 6 E2E; snapshot-style drift bij audit |
| 10 Documentatie | 5 | 7 | Delivery-guide; Pages-runbook bijgewerkt na P0 |

---

## 5. Poorten (lokaal, auditmoment)

| Poort | Exit | Notitie |
|---|:---:|---|
| `npm run format:check` | 1 | 16 files (o.a. project-store, diagnosis, app-error) |
| `npm run lint` | 1 | 8× `no-unnecessary-type-assertion` (fixbaar) |
| `npm test` | 0 | 1109 passed / 163 files |
| `npm run test:e2e` | 1 | 12 snapshot mismatches — **alleen trailing commas**, geen geometrie-diff |
| `npm run build` | 0 | ~11.3 MB OpenCV chunk + ~2.1 MB app; geen `dist/examples`; geen `dist/_headers` |
| GitHub Actions (`gh`) | n/a | `gh` niet geïnstalleerd op auditmachine; CI-config aanwezig |

**Vite preview headers** (`npx vite preview --host 127.0.0.1 --port 4173`):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

---

## 6. Spotchecks

### Hosting

- `frontend/public/` bestond niet → Pages zou zonder `_headers` SharedArrayBuffer/OpenCV-pad breken.
- Deploy-artefact = alleen `frontend/dist/`.
- `base: '/'`, `build.sourcemap: false` in `vite.config.ts`.

### Privacy / cold start

- `createEmptyProjectState`: lege naam/adres, één lege floor.
- Opening-refid-catalog: geen echte adressen/projectnamen in spotcheck.
- i18n placeholders generiek (`Main Street 12`, `Street, city`).

### Support / flow (code-pad, geen interactieve 2-tekening UI-smoke)

| Concern | Bevinding |
|---|---|
| Diagnose-FAB | `WorkspaceDiagnosisFab` zichtbaar als `imageSrc` en niet op stap `project` |
| DevTools | Ctrl+Shift+H in `WorkspaceDebugSidebar` |
| beforeunload | Aan bij `imageSrc` in `useWorkspaceLifecycle` |
| Fatal errors | `app.config.errorHandler` + window handlers → banner |
| Resume | ProjectSetupPanel + IndexedDB stores |

**P1 open / accepted voor go-live:** handmatige smoke op ≥2 tekenstijlen + Floorplanner-import op de host; i18n en→nl klik-smoke.

---

## 7. Gates

### P0 — blokkerend

| # | Item | Status bij audit | Actie in deze sessie |
|---|---|---|---|
| 1 | `frontend/public/_headers` COOP/COEP/CORP | Ontbrak | **Gedaan** — zit in `dist/_headers` |
| 2 | CI-poorten groen (format, lint, e2e) | Rood | **Gedaan** — plus `.prettierignore` voor e2e snapshots |
| 3 | Alleen `dist/` deployen | OK (geen examples) | Documenteren |
| 4 | Privacy-spotcheck | OK | — |
| 5 | Host-smoke echte Pages-URL | Niet gedaan | **Gedaan** — https://floorplan-fml.lorddo3066.workers.dev/ (user-tested; headers geverifieerd 2026-08-05) |
| 6 | Delivery-runbook Pages + `_headers` | Onvolledig | **Gedaan** |

### P1 — sterk aanbevolen (anders accepted)

- Handmatige 0→4 smoke ≥2 tekeningen + Floorplanner-roundtrip → **gedaan** (user dry-run, multi-plattegrond + settings + FML-viewer)
- IndexedDB resume + Nieuw project UI-klik → **gedaan** (onderdeel dry-run)
- Diagnose mid stap 3 + na resultaat → code aanwezig; bel gebruikt in dry-run
- i18n language switch → keys aanwezig; onderdeel settings-check

### P2 — later (niet voor deze go-live)

FML-validatie vóór download; `balance` altijd 0.5; ramen zonder `mirrored`; worker-CV; Mat try/finally; `core↔cv`; `useWorkspace`-facade; onboarding; Kinderdijk-fixture; Cat C; abs-px rest (R7/R8).

---

## 8. Go / No-go

### Bij start van de audit

**No-go** — ontbrekende Pages-headers + rode format/lint/e2e.

### Na P0-fixes in deze sessie

**Conditional Go** voor Cloudflare-klanttest (devtools aan), onder voorwaarden:

1. Eerste deploy van `frontend/dist/` naar Cloudflare Pages (domain root).
2. Operator host-smoke: lege start → upload → schaal → B/W+refs → detectie → FML download; DevTools console vrij van COEP/worker-fouten; response headers verifiëren.
3. Interne dry-run met diagnose-FAB vóór klantuitnodiging.
4. Bekende limieten communiceren via [customer-test-delivery.md](customer-test-delivery.md).

### Na live host + dry-run (zelfde dag)

**Go** — https://floorplan-fml.lorddo3066.workers.dev/

Live headers geverifieerd:

```
cross-origin-embedder-policy: require-corp
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
```

Interne dry-run (multi-plattegrond, settings, FML-viewer) user-OK. Klaar om testers uit te nodigen met [customer-test-delivery.md](customer-test-delivery.md).

**Niet geclaimd:** 80% detectie, productie-hardening, cloud project-sync.

---

## 9. Geaccepteerde risico’s (expliciet)

- Detectiekwaliteit varieert per tekenstijl (train-by-example).
- Zware CV kan UI-thread blokkeren op grote scans.
- Correctie deuren/ramen vooral in FML-editor (stap 3 tabs verborgen).
- IndexedDB is browser-lokaal; refresh mid-stap zonder checkpoint kan werk kosten — FML downloaden vóór lange pauze.
- DevTools bereikbaar voor testers die Ctrl+Shift+H kennen (support-feature, geen geheim).
