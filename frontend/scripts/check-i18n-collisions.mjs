// Meldt welke namen uit de C-triage óók een i18n-sleutel zijn.
// Een gemiste sleutel faalt stil: de UI toont dan het pad in plaats van de tekst.
import { readFileSync } from 'node:fs'

// Namen op de CLI overrulen de lijst hieronder: `node scripts/check-i18n-collisions.mjs naamA naamB`
const NAMES = process.argv.length > 2 ? process.argv.slice(2) : [
  'fmlThicknessPickTier',
  'fmlThicknessPickMessage',
  'fmlThicknessPickBusy',
  'fmlWallHeightCm',
  'fmlDoorHeightCm',
  'fmlWindowHeightCm',
  'fmlWindowSillZCm',
  'fmlBovenlichtDefault',
  'fmlWindowBovenlichtDefault',
  'fmlBovenlichtHeightCm',
  'fmlBovenlichtGapCm',
  'fmlRescaleActive',
  'fmlRescaleState',
  'fmlRescaleDistanceMmX',
  'fmlRescaleDistanceMmY',
  'fmlOpacity',
  'fmlOpacityAria',
  'fmlContentOpacity',
  'fmlUnderlayOpacity',
  'fmlHidePlanText',
  'fmlUnderlaySrc',
  'fmlUnderlaySize',
  'fmlFloorName',
  'fmlFloorLevel',
  'fmlFloorId',
  'fmlPlanName',
  'fmlPreviewHostRef',
  'fmlToolbarRef',
  'fmlDevPanelVisible',
  'fmlFold',
  'fmlChromeDialogState',
  'fmlReady',
  'fmlStats',
  'fmlExportPlan',
  'fmlWallCount',
  'fmlPreview',
  'fmlZeroBasePx',
  'fmlZeroLivePx',
  'fmlEditorUnlocked',
  'fmlOrientFlipX',
  'fmlConversion',
  'fmlConversionHint',
]

function flatten(obj, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') flatten(value, path, out)
    else out.set(path, value)
  }
  return out
}

const keys = flatten(JSON.parse(readFileSync('src/ui/i18n/locales/nl.json', 'utf8')))
const hits = new Map()
for (const [path, value] of keys) {
  const leaf = path.split('.').at(-1)
  if (NAMES.includes(leaf)) {
    if (!hits.has(leaf)) hits.set(leaf, [])
    hits.get(leaf).push(`${path} = ${JSON.stringify(value)}`)
  }
}

console.log(`i18n-sleutels die met een C-naam samenvallen: ${hits.size}`)
for (const [name, paths] of hits) {
  console.log(`  ${name}`)
  for (const path of paths) console.log(`      ${path}`)
}
