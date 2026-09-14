// Zoekt renames die per ongeluk op een AL BESTAANDE naam in hetzelfde bestand landen.
// Zo'n botsing is in een geneste scope legale shadowing: de typecheck zwijgt,
// het gedrag verandert stil. Dit is het gat dat de C-ronde niet dekte.
import { execSync } from 'node:child_process'
import { FILES, NAMES } from './phase6-name-map.mjs'

// [oude naam, nieuwe naam, welke ronde, welke git-ref ging eraan vooraf]
const ROUNDS = [
  {
    label: 'fase 6 (core/plan + C1 + infix-namen)',
    // Nog niet gecommit: 'HEAD' vergelijkt de werkboom met de laatste commit.
    before: 'HEAD',
    rules: [...Object.entries(NAMES), ...Object.entries(FILES)],
  },
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

/**
 * Nieuw pad -> oud pad, voor bestanden die zijn verhuisd. Zonder dit slaat de audit
 * elk verplaatst bestand over (het nieuwe pad bestaat niet in de oude ref), en dat zijn
 * precies de bestanden waar ook identifiers zijn hernoemd.
 */
function renameMap(ref) {
  const map = new Map()
  const out = execSync(`git diff --name-status -M ${ref}`, { encoding: 'utf8' })
  for (const line of out.split('\n')) {
    const parts = line.split('\t')
    if (parts.length === 3 && parts[0].startsWith('R')) map.set(parts[2].trim(), parts[1].trim())
  }
  return map
}

function readAt(ref, file, renames) {
  const path = renames?.get(file) ?? file
  try {
    return execSync(`git show ${ref}:${path}`, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

let findings = 0
for (const round of ROUNDS) {
  const files =
    round.before === 'HEAD' ? gitFiles('HEAD') : changedBetween(round.before, 'HEAD')
  const renames = renameMap(round.before)
  let skipped = 0
  console.log(
    `\n=== ${round.label}: ${files.length} gewijzigde bestanden, ${renames.size} verhuisd`,
  )
  for (const file of files) {
    const before = readAt(round.before, file, renames)
    if (before == null) {
      skipped += 1
      continue
    }
    for (const [from, to] of round.rules) {
      const hadOld = new RegExp(`\\b${from}\\b`).test(before)
      // Bij een rename met streepjes zit de nieuwe naam ín de oude
      // (`fml-wall-thickness-limits` bevat `wall-thickness-limits`, want `-` is geen
      // woordteken). Zonder de oude naam eruit te knippen meldt élke zo'n rename een
      // botsing met zichzelf, en valse meldingen verbergen de echte.
      const withoutOld = before.replace(new RegExp(`\\b${from}\\b`, 'g'), '')
      const hadNew = new RegExp(`\\b${to}\\b`).test(withoutOld)
      if (hadOld && hadNew) {
        const oldCount = (before.match(new RegExp(`\\b${from}\\b`, 'g')) ?? []).length
        const newCount = (withoutOld.match(new RegExp(`\\b${to}\\b`, 'g')) ?? []).length
        console.log(
          `  BOTSING  ${file}\n           ${from} (${oldCount}x) -> ${to}, maar ${to} bestond al (${newCount}x)`,
        )
        findings++
      }
    }
  }
  // Overgeslagen = nieuw bestand zonder voorganger. Meer dan een handvol betekent dat
  // de rename-detectie niet werkte en de audit stilzwijgend niets deed.
  if (skipped > 0) console.log(`  (${skipped} overgeslagen: geen versie in ${round.before})`)
}

console.log(`\ntotaal botsingen: ${findings}`)
