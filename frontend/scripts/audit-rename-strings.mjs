// Zoekt renames die BINNEN een string-literal zijn geland.
// Identifiers hernoemen is veilig; strings zijn contracten met de buitenwereld
// (localStorage-sleutels, i18n-paden, CSS-klassen, data-attributen, IDB-velden).
// Een rename daarin faalt stil: geen typecheck, geen test.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { FILES, NAMES } from './phase6-name-map.mjs'

const NEW_NAMES = [
  // fase 6: de hele kaart, inclusief de tien bestandsnamen
  ...Object.values(NAMES),
  ...Object.values(FILES),
  // fase 5
  'planNulpuntImageCm',
  'setPlanNulpuntImageCm',
  'planOrient',
  'setPlanOrient',
  'planDisplay',
  'contentOpacityPct',
  'PlanDisplaySettings',
  // C-clusters + D
  'openingMerge',
  'openingMergeHint',
  'OpeningMergeSettings',
  'planOrientFlipX',
  'thicknessPickTier',
  'thicknessPickMessage',
  'thicknessPickBusy',
  'THICKNESS_PICK_SEARCH_CM',
  'DEFAULT_WINDOW_SILL_Z_CM',
  'DEFAULT_WINDOW_HEIGHT_CM',
  'DEFAULT_DOOR_HEIGHT_CM',
  'DEFAULT_WALL_HEIGHT_CM',
  'planWindowSillZCm',
  'planWindowHeightCm',
  'planDoorHeightCm',
  'planWallHeightCm',
  'planWindowBovenlichtDefault',
  'planBovenlichtHeightCm',
  'planBovenlichtDefault',
  'planBovenlichtGapCm',
  'rescaleStateFromImageHandles',
  'rescaleDistanceMmX',
  'rescaleDistanceMmY',
  'rescaleActive',
  'rescaleState',
  'contentOpacity',
  'contentOpacityAria',
  'underlayOpacityPct',
  'hidePlanText',
  'underlaySrc',
  'underlaySize',
  'floorName',
  'floorLevel',
  'floorId',
  'planName',
  'DEFAULT_PLAN_HELP_KEYS',
  'planChromeDialogState',
  'planDevPanelVisible',
  'planCanvasHostRef',
  'planToolbarRef',
  'planFold',
  'PLAN_FIELD_COMMIT_DEBOUNCE_MS',
  'PLAN_SELECT_TOOLS',
  'PLAN_EDIT_TOOLS',
  'WALL_BALANCE_ABS_MAX',
  'WALL_BALANCE_FALLBACK',
  'WALL_BALANCE_MIN',
  'WALL_BALANCE_MAX',
  'generatedPlan',
  'harmonizedPlan',
  'planWallCount',
  'planPreview',
  'planReady',
  'planStats',
  'zeroBasePx',
  'zeroLivePx',
  'editorUnlocked',
  'planThicknessCms',
  'planLimitsDirty',
]

const files = execSync('git diff --name-only HEAD~2', { encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => /\.(ts|vue)$/.test(s))

const alt = NEW_NAMES.join('|')
// Alleen treffers die tussen quotes staan (enkel, dubbel of backtick).
const inString = new RegExp(`(['"\`])[^'"\`\\n]*\\b(${alt})\\b[^'"\`\\n]*\\1`, 'g')

let hits = 0
for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    // i18n-paden (`t('...')`) en klassen in template zijn eigen categorieën; toon alles,
    // beoordeling per treffer.
    const found = [...line.matchAll(inString)]
    if (found.length === 0) return
    console.log(`${file}:${i + 1}  ${line.trim().slice(0, 160)}`)
    hits += found.length
  })
}
console.log(`\ntreffers in strings: ${hits}`)
