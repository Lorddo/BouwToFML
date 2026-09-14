// C-triage clusters C2-C14 + D1 + D2. Zie .cursor/docs/refactor/lean/fml-name-triage.md
// C1 (dikte-catalogus + banden) blijft staan: die gaat mee met fase 6 (core/fml -> core/plan).
// CSS-klassen (`class="fml-fold"`, `.fml-rescale-handle`) blijven ook staan: eigen batch,
// eigen risico (fit-chrome en gesture-ignore-lijsten zoeken op klassenaam).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src', 'tests']
const EXTS = ['.ts', '.vue', '.json']

// 1. i18n-paden eerst: die moeten een ándere naam krijgen dan de prop (label vs percentage).
const I18N_PATHS = [
  ['result.fmlOpacityAria', 'result.contentOpacityAria'],
  ['settings.fmlOpacityAria', 'settings.contentOpacityAria'],
  ['result.fmlOpacity', 'result.contentOpacity'],
  ['settings.fmlOpacity', 'settings.contentOpacity'],
]
const I18N_JSON_KEYS = [
  ['"fmlOpacityAria"', '"contentOpacityAria"'],
  ['"fmlOpacity"', '"contentOpacity"'],
]

// 2. `fmlOpacity` betekent niet overal hetzelfde: 0-1 in de editor, percentage in de prop-keten.
const OPACITY_UNIT_FILES = [
  join('src', 'ui', 'views', 'EditorView.vue'),
  join('src', 'ui', 'composables', 'editor', 'useEditorLoad.ts'),
]

// 3. Identifiers. Langste eerst zodat setFmlX niet half door fmlX wordt geraakt.
const RULES = [
  // D1 — merge hoort bij detectie, niet bij de FML-adapter
  ['createFactoryFmlConversionSettings', 'createFactoryOpeningMergeSettings'],
  ['normalizeFmlConversion', 'normalizeOpeningMerge'],
  ['FmlConversionSettings', 'OpeningMergeSettings'],
  ['fmlConversionHint', 'openingMergeHint'],
  ['fmlConversion', 'openingMerge'],
  // D2 — bij de oriëntatie-rename uit fase 5
  ['fmlOrientFlipX', 'planOrientFlipX'],
  // C2 — dikte-meting op de onderlegger
  ['FML_THICKNESS_PICK_SEARCH_CM', 'THICKNESS_PICK_SEARCH_CM'],
  ['fmlThicknessPickTier', 'thicknessPickTier'],
  ['fmlThicknessPickMessage', 'thicknessPickMessage'],
  ['fmlThicknessPickBusy', 'thicknessPickBusy'],
  // C3 — hoogte-defaults
  ['DEFAULT_FML_WINDOW_SILL_Z_CM', 'DEFAULT_WINDOW_SILL_Z_CM'],
  ['DEFAULT_FML_WINDOW_HEIGHT_CM', 'DEFAULT_WINDOW_HEIGHT_CM'],
  ['DEFAULT_FML_DOOR_HEIGHT_CM', 'DEFAULT_DOOR_HEIGHT_CM'],
  ['DEFAULT_FML_WALL_HEIGHT_CM', 'DEFAULT_WALL_HEIGHT_CM'],
  ['setFmlWindowSillZCm', 'setPlanWindowSillZCm'],
  ['setFmlWindowHeightCm', 'setPlanWindowHeightCm'],
  ['setFmlDoorHeightCm', 'setPlanDoorHeightCm'],
  ['setFmlWallHeightCm', 'setPlanWallHeightCm'],
  ['fmlWindowSillZCm', 'planWindowSillZCm'],
  ['fmlWindowHeightCm', 'planWindowHeightCm'],
  ['fmlDoorHeightCm', 'planDoorHeightCm'],
  ['fmlWallHeightCm', 'planWallHeightCm'],
  // C4 — bovenlicht-defaults
  ['setFmlWindowBovenlichtDefault', 'setPlanWindowBovenlichtDefault'],
  ['setFmlBovenlichtHeightCm', 'setPlanBovenlichtHeightCm'],
  ['setFmlBovenlichtDefault', 'setPlanBovenlichtDefault'],
  ['setFmlBovenlichtGapCm', 'setPlanBovenlichtGapCm'],
  ['fmlWindowBovenlichtDefault', 'planWindowBovenlichtDefault'],
  ['fmlBovenlichtHeightCm', 'planBovenlichtHeightCm'],
  ['fmlBovenlichtDefault', 'planBovenlichtDefault'],
  ['fmlBovenlichtGapCm', 'planBovenlichtGapCm'],
  // C5 — herschalen; voorvoegsel weg, «rescale» zegt het al
  ['fmlRescaleStateFromImageHandles', 'rescaleStateFromImageHandles'],
  ['fmlRescaleDistanceMmX', 'rescaleDistanceMmX'],
  ['fmlRescaleDistanceMmY', 'rescaleDistanceMmY'],
  ['fmlRescaleActive', 'rescaleActive'],
  ['fmlRescaleState', 'rescaleState'],
  // C6 — weergave / doorzichtigheid
  ['fmlOpacityAria', 'contentOpacityAria'],
  ['fmlContentOpacity', 'contentOpacityPct'],
  ['fmlUnderlayOpacity', 'underlayOpacityPct'],
  ['fmlHidePlanText', 'hidePlanText'],
  ['fmlOpacity', 'contentOpacityPct'], // per-bestand overschreven, zie OPACITY_UNIT_FILES
  // C7 — onderlegger
  ['fmlUnderlaySrc', 'underlaySrc'],
  ['fmlUnderlaySize', 'underlaySize'],
  // C8 — verdieping- en plan-identiteit
  ['fmlFloorName', 'floorName'],
  ['fmlFloorLevel', 'floorLevel'],
  ['fmlFloorId', 'floorId'],
  ['fmlPlanName', 'planName'],
  // C9 — UI-refs en panelen
  ['DEFAULT_FML_HELP_KEYS', 'DEFAULT_PLAN_HELP_KEYS'],
  ['fmlChromeDialogState', 'planChromeDialogState'],
  ['fmlDevPanelVisible', 'planDevPanelVisible'],
  ['fmlPreviewHostRef', 'planCanvasHostRef'],
  ['fmlToolbarRef', 'planToolbarRef'],
  ['fmlFold', 'planFold'],
  // C10 — toolbelt + draft-commit
  ['FML_FIELD_COMMIT_DEBOUNCE_MS', 'PLAN_FIELD_COMMIT_DEBOUNCE_MS'],
  ['FML_SELECT_TOOLS', 'PLAN_SELECT_TOOLS'],
  ['FML_EDIT_TOOLS', 'PLAN_EDIT_TOOLS'],
  // C11 — muur-balance-constanten
  ['FML_WALL_BALANCE_ABS_MAX', 'WALL_BALANCE_ABS_MAX'],
  ['FML_WALL_BALANCE_FALLBACK', 'WALL_BALANCE_FALLBACK'],
  ['FML_WALL_BALANCE_MIN', 'WALL_BALANCE_MIN'],
  ['FML_WALL_BALANCE_MAX', 'WALL_BALANCE_MAX'],
  // C12 — detectie-uitvoer
  ['fmlExportPlan', 'generatedPlan'],
  ['fmlWallCount', 'planWallCount'],
  ['fmlPreview', 'planPreview'],
  ['fmlReady', 'planReady'],
  ['fmlStats', 'planStats'],
  // C13 — nulpunt / stempel
  ['fmlZeroBasePx', 'zeroBasePx'],
  ['fmlZeroLivePx', 'zeroLivePx'],
  // C14 — editor-gate
  ['fmlEditorUnlocked', 'editorUnlocked'],
]

function toKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

// Kebab alleen ná een dubbele punt: `:fml-opacity=` en `@update:fml-opacity=`.
// Zo blijven `class="fml-fold"` en de CSS-selector `.fml-fold` ongemoeid.
const KEBAB_RULES = RULES.filter(([from]) => /^[a-z]/.test(from)).map(([from, to]) => [
  toKebab(from),
  toKebab(to),
])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXTS.some((ext) => entry.endsWith(ext))) out.push(full)
  }
  return out
}

const tally = new Map()
let touched = 0

function bump(key, count) {
  if (count > 0) tally.set(key, (tally.get(key) ?? 0) + count)
}

for (const file of ROOTS.flatMap((root) => walk(root))) {
  const before = readFileSync(file, 'utf8')
  let after = before
  const isJson = file.endsWith('.json')
  const opacityUnitFile = OPACITY_UNIT_FILES.some((f) => file === f || file.endsWith(f))

  for (const [from, to] of I18N_PATHS) {
    const count = after.split(from).length - 1
    after = after.split(from).join(to)
    bump(from, count)
  }
  if (isJson) {
    for (const [from, to] of I18N_JSON_KEYS) {
      const count = after.split(from).length - 1
      after = after.split(from).join(to)
      bump(from, count)
    }
  }
  for (const [from, rawTo] of RULES) {
    const to = from === 'fmlOpacity' && opacityUnitFile ? 'contentOpacity' : rawTo
    let count = 0
    after = after.replace(new RegExp(`\\b${from}\\b`, 'g'), () => {
      count++
      return to
    })
    bump(from, count)
  }
  for (const [from, to] of KEBAB_RULES) {
    let count = 0
    after = after.replace(new RegExp(`(?<=:)${from}\\b`, 'g'), () => {
      count++
      return to
    })
    bump(`(kebab) ${from}`, count)
  }

  if (after !== before) {
    writeFileSync(file, after, 'utf8')
    touched++
  }
}

console.log(`bestanden aangepast: ${touched}`)
for (const [from, count] of [...tally].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${from}`)
}
