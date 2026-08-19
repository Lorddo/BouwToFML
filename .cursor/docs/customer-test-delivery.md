# Customer test delivery — BouwToFML

Short guide for the hosted test build.

**Live test URL:** https://floorplan-fml.lorddo3066.workers.dev/

## What this app does

Convert floor-plan images (PNG/JPG/PDF per floor) into a Floorplanner FML download.
Focus: walls, doors, windows. Semi-automatic — you confirm scale, preprocess, and review detection before export.

## Hosting checklist (operators)

### Cloudflare Worker (current host)

Live URL is a Worker with static assets, not Pages. Config: [`frontend/wrangler.toml`](../../frontend/wrangler.toml).

1. Build in `frontend/`. Production builds pick up [`frontend/.env.production`](../../frontend/.env.production) (`VITE_APP_ACCESS_PASSWORD=Test1234!` for now):

```powershell
npm ci
npm run build
```

Override for one build if needed: `$env:VITE_APP_ACCESS_PASSWORD="…"`. Local `npm run dev` has no gate unless you set the var or a `.env.local`.

**Current test password:** `Test1234!` (soft gate only — not secret).

2. Deploy **only** `frontend/dist/` (`npx wrangler deploy` from `frontend/`, or dashboard upload). Do **not** deploy `frontend/examples/` or the repo root.
3. SPA fallback (`/FML-editor` → `index.html`) is `assets.not_found_handling = "single-page-application"`. In the dashboard: Worker → Settings → Assets → **Not found handling** = Single-page application. There is **no** `public/_redirects`: `/* /index.html 200` is rejected on Workers (error 100324, infinite loop).
4. Isolation headers ship via [`frontend/public/_headers`](../../frontend/public/_headers) (copied into `dist/` by Vite). Confirm on the live URL:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

Without these, OpenCV / SharedArrayBuffer paths can fail in the browser.

5. HTTPS (`workers.dev` default). Modern Chromium/Firefox/Safari.

### Cloudflare Pages (alternative)

Same build and `dist/`-only upload. Pages accepts a `_redirects` SPA rule (`/* /index.html 200`); that file is intentionally absent here because the live host is a Worker. Re-add it only if you switch the host to Pages.

**Soft access gate:** the Vue password prompt is only a deterrent — the password is baked into the JS bundle. For real protection at delivery, use Cloudflare Access (Zero Trust). Unlock lasts for the browser tab (`sessionStorage`).


### Host smoke (before inviting testers)

Empty start → upload underlay → set scale → B/W + reference boxes → detection → download FML. Check DevTools console for COEP/worker errors. Click the alarm bell once mid-flow and once after result.

Audit reference: [audit-2026-08-05-customer-test.md](audit-2026-08-05-customer-test.md).

## Flow for testers

0. **Project** — name, optional address, floors, default heights.
1. **Underlay** — upload PNG/JPG/PDF, set scale, optional crop/erase. Confirm scale.
2. **Preprocess** — tune B/W walls, draw wall/door/window reference boxes. Optional OCR. Continue when wall reference is set.
3. **Detection** — auto wall classify → doors → windows. Review faces (Shift+click). Finish detection.
4. **Result** — review FML preview, adjust openings, **Download** FML (and project FML for multi-floor).

Settings (gear): language (en/nl/th), FML defaults, viewer opacity, scale input unit. Standalone FML editor: `/FML-editor` (outside the project flow).

## Known limitations (test build)

- Detection is train-by-example via your reference boxes; quality varies by drawing style.
- Projects resume from IndexedDB checkpoints (step transitions, floor CRUD, wall finish, FML preview). Prefer downloading FML before leaving a long session.
- Door/window correction is mainly in the FML editor (step 4); step 3 door/window tabs stay in DevTools.
- Large drawings may briefly freeze the UI during detection (CV on the main thread).
- Dev tools remain behind `Ctrl+Shift+H` for support; use the alarm-bell diagnosis download for bug reports.

## Feedback

Please note: drawing type, what worked, false doors/windows/walls, and FML issues in Floorplanner after import.

**Diagnosis package (alarm bell, bottom-right):** when something looks wrong — including mid-detection on step 3 — click the bell to download one HTML file with whatever is available so far (B/W underlay, reference boxes, door/window data, compact L10/L12/L14 JSON, FML if generated). Send that file to support. Missing sections are normal if that step was not finished yet.

**Internal only:** `Ctrl+Shift+H` opens the full debug sidebar (layer debug, probe, DevSession, etc.). Testers should not use this unless asked.
