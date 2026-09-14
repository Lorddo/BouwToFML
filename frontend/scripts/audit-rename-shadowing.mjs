// Zoekt renames die per ongeluk op een AL BESTAANDE naam in hetzelfde bestand landen.
// Zo'n botsing is in een geneste scope legale shadowing: de typecheck zwijgt,
// het gedrag verandert stil. Dit is het gat dat de C-ronde niet dekte.
import { execSync } from 'node:child_process'

// [oude naam, nieuwe naam, welke ronde, welke git-ref ging eraan vooraf]
const ROUNDS = [
  {
    label: 'fase 5',
    before: 'e40353a',
    rules: [
      ['setFmlNulpuntImageCm', 'setPlanNulpuntImageCm'],
      ['fmlNulpuntImageCm', 'planNulpuntImageCm'],
      ['setFmlOrient', 'setPlanOrient'],
      ['fmlOrient', 'planOrient'],
      ['fmlViewer', 'planDisplay'],
      ['fmlOpacityPct', 'contentOpacityPct'],
      ['DEFAULT_FML_CONTENT_OPACITY_PCT', 'DEFAULT_CONTENT_OPACITY_PCT'],
      ['DEFAULT_FML_UNDERLAY_OPACITY_PCT', 'DEFAULT_UNDERLAY_OPACITY_PCT'],
      ['createFactoryEditorSettings', 'createFactoryPlanDisplaySettings'],
      ['normalizeEditor', 'normalizePlanDisplay'],
      ['EditorSettings', 'PlanDisplaySettings'],
    ],
  },
  {
    label: 'C-clusters',
    before: 'HEAD',
    rules: [
      ['createFactoryFmlConversionSettings', 'createFactoryOpeningMergeSettings'],
      ['normalizeFmlConversion', 'normalizeOpeningMerge'],
      ['FmlConversionSettings', 'OpeningMergeSettings'],
      ['fmlConversionHint', 'openingMergeHint'],
      ['fmlConversion', 'openingMerge'],
      ['fmlOrientFlipX', 'planOrientFlipX'],
      ['FML_THICKNESS_PICK_SEARCH_CM', 'THICKNESS_PICK_SEARCH_CM'],
      ['fmlThicknessPickTier', 'thicknessPickTier'],
      ['fmlThicknessPickMessage', 'thicknessPickMessage'],
      ['fmlThicknessPickBusy', 'thicknessPickBusy'],
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
      ['setFmlWindowBovenlichtDefault', 'setPlanWindowBovenlichtDefault'],
      ['setFmlBovenlichtHeightCm', 'setPlanBovenlichtHeightCm'],
      ['setFmlBovenlichtDefault', 'setPlanBovenlichtDefault'],
      ['setFmlBovenlichtGapCm', 'setPlanBovenlichtGapCm'],
      ['fmlWindowBovenlichtDefault', 'planWindowBovenlichtDefault'],
      ['fmlBovenlichtHeightCm', 'planBovenlichtHeightCm'],
      ['fmlBovenlichtDefault', 'planBovenlichtDefault'],
      ['fmlBovenlichtGapCm', 'planBovenlichtGapCm'],
      ['fmlRescaleStateFromImageHandles', 'rescaleStateFromImageHandles'],
      ['fmlRescaleDistanceMmX', 'rescaleDistanceMmX'],
      ['fmlRescaleDistanceMmY', 'rescaleDistanceMmY'],
      ['fmlRescaleActive', 'rescaleActive'],
      ['fmlRescaleState', 'rescaleState'],
      ['fmlOpacityAria', 'contentOpacityAria'],
      ['fmlContentOpacity', 'contentOpacityPct'],
      ['fmlUnderlayOpacity', 'underlayOpacityPct'],
      ['fmlHidePlanText', 'hidePlanText'],
      ['fmlOpacity', 'contentOpacityPct'],
      ['fmlOpacity', 'contentOpacity'],
      ['fmlUnderlaySrc', 'underlaySrc'],
      ['fmlUnderlaySize', 'underlaySize'],
      ['fmlFloorName', 'floorName'],
      ['fmlFloorLevel', 'floorLevel'],
      ['fmlFloorId', 'floorId'],
      ['fmlPlanName', 'planName'],
      ['DEFAULT_FML_HELP_KEYS', 'DEFAULT_PLAN_HELP_KEYS'],
      ['fmlChromeDialogState', 'planChromeDialogState'],
      ['fmlDevPanelVisible', 'planDevPanelVisible'],
      ['fmlPreviewHostRef', 'planCanvasHostRef'],
      ['fmlToolbarRef', 'planToolbarRef'],
      ['fmlFold', 'planFold'],
      ['FML_FIELD_COMMIT_DEBOUNCE_MS', 'PLAN_FIELD_COMMIT_DEBOUNCE_MS'],
      ['FML_SELECT_TOOLS', 'PLAN_SELECT_TOOLS'],
      ['FML_EDIT_TOOLS', 'PLAN_EDIT_TOOLS'],
      ['FML_WALL_BALANCE_ABS_MAX', 'WALL_BALANCE_ABS_MAX'],
      ['FML_WALL_BALANCE_FALLBACK', 'WALL_BALANCE_FALLBACK'],
      ['FML_WALL_BALANCE_MIN', 'WALL_BALANCE_MIN'],
      ['FML_WALL_BALANCE_MAX', 'WALL_BALANCE_MAX'],
      ['fmlExportPlan', 'generatedPlan'],
      ['fmlWallCount', 'planWallCount'],
      ['fmlPreview', 'planPreview'],
      ['fmlReady', 'planReady'],
      ['fmlStats', 'planStats'],
      ['fmlZeroBasePx', 'zeroBasePx'],
      ['fmlZeroLivePx', 'zeroLivePx'],
      ['fmlEditorUnlocked', 'editorUnlocked'],
    ],
  },
]

function gitFiles(ref) {
  const out = ref === 'HEAD' ? execSync('git diff --name-only HEAD', { encoding: 'utf8' }) : ''
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => /\.(ts|vue)$/.test(s))
}

function changedBetween(before, after) {
  const out = execSync(`git diff --name-only ${before} ${after}`, { encoding: 'utf8' })
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => /\.(ts|vue)$/.test(s))
}

function readAt(ref, file) {
  try {
    return execSync(`git show ${ref}:${file}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return null
  }
}

let findings = 0
for (const round of ROUNDS) {
  const files =
    round.before === 'HEAD' ? gitFiles('HEAD') : changedBetween(round.before, 'HEAD')
  console.log(`\n=== ${round.label}: ${files.length} gewijzigde bestanden`)
  for (const file of files) {
    const before = readAt(round.before, file)
    if (before == null) continue
    for (const [from, to] of round.rules) {
      const hadOld = new RegExp(`\\b${from}\\b`).test(before)
      const hadNew = new RegExp(`\\b${to}\\b`).test(before)
      if (hadOld && hadNew) {
        const oldCount = (before.match(new RegExp(`\\b${from}\\b`, 'g')) ?? []).length
        const newCount = (before.match(new RegExp(`\\b${to}\\b`, 'g')) ?? []).length
        console.log(
          `  BOTSING  ${file}\n           ${from} (${oldCount}x) -> ${to}, maar ${to} bestond al (${newCount}x)`,
        )
        findings++
      }
    }
  }
}

console.log(`\ntotaal botsingen: ${findings}`)
