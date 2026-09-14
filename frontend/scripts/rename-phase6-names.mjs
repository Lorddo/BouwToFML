// Fase 6, tweede helft: bestandsnamen + identifiers met `Fml` erin.
//
// Drie categorieën, en de derde is de reden dat dit script een expliciete kaart heeft
// in plaats van een regex-veeg:
//   - C1: dikte-catalogus + banden. FML_-voorvoegsel valt weg (het zijn dikte-constanten).
//   - core/plan-domein: sanitize / harmonize / extras / layer-openingen.
//   - UI-state met een FML-naam: toolbar, sticky, defaults, laadfase, nulpunt, orient.
//
// BLIJFT (groep A) staat in STAY en wordt gecontroleerd: de echte adapter, de merknaam,
// en de persist-lees-aliassen. Eén ervan per ongeluk hernoemen is stille schade —
// `fmlEditorUnlocked` is een localStorage-sleutel en `fmlViewer`/`fmlOrient` zijn
// velden die oude browsers en oude IDB-records nog schrijven.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DRY = process.argv.includes('--dry')

/** Bestandsnaam -> nieuwe bestandsnaam, binnen src/core/plan. */
const FILES = {
  'apply-fml-thickness-pick': 'apply-thickness-pick',
  'fml-dimension-settings': 'plan-dimension-settings',
  'fml-dimension-vis': 'plan-dimension-vis',
  'fml-wall-geom': 'plan-wall-geom',
  'fml-wall-thickness-catalog': 'wall-thickness-catalog',
  'fml-wall-thickness-limits': 'wall-thickness-limits',
  'fml-wall-thickness-tiers': 'wall-thickness-tiers',
  'harmonize-fml-wall-thickness': 'harmonize-wall-thickness',
  'layer-openings-to-fml': 'layer-openings-to-plan',
  'sanitize-fml-walls': 'sanitize-plan-walls',
}

/** Identifier -> nieuwe identifier. Exacte token-match, dus geen deelwoord-verrassingen. */
const NAMES = {
  // ---- C1: dikte-catalogus + banden
  fmlThicknessMinCm: 'planThicknessMinCm',
  fmlThicknessMidCm: 'planThicknessMidCm',
  fmlThicknessMaxCm: 'planThicknessMaxCm',
  setFmlThicknessMinCm: 'setPlanThicknessMinCm',
  setFmlThicknessMidCm: 'setPlanThicknessMidCm',
  setFmlThicknessMaxCm: 'setPlanThicknessMaxCm',
  fmlBandMidBoundaryCm: 'planBandMidBoundaryCm',
  fmlBandMaxBoundaryCm: 'planBandMaxBoundaryCm',
  setFmlBandMidBoundaryCm: 'setPlanBandMidBoundaryCm',
  setFmlBandMaxBoundaryCm: 'setPlanBandMaxBoundaryCm',
  fmlBandDirty: 'planBandDirty',
  FML_BAND_MID_RATIO: 'THICKNESS_BAND_MID_RATIO',
  FML_BAND_MAX_RATIO: 'THICKNESS_BAND_MAX_RATIO',
  FML_BAND_MID_BOUNDARY_CM: 'THICKNESS_BAND_MID_BOUNDARY_CM',
  FML_BAND_MAX_BOUNDARY_CM: 'THICKNESS_BAND_MAX_BOUNDARY_CM',
  FML_CATALOG_MIN_HEADROOM: 'THICKNESS_CATALOG_MIN_HEADROOM',
  FML_CATALOG_MAX_FOOTROOM: 'THICKNESS_CATALOG_MAX_FOOTROOM',
  DEFAULT_FML_BAND_BOUNDARIES: 'DEFAULT_THICKNESS_BAND_BOUNDARIES',
  DEFAULT_FML_WALL_THICKNESS_LIMITS: 'DEFAULT_WALL_THICKNESS_LIMITS',
  FmlWallThicknessLimits: 'WallThicknessLimits',
  FmlThicknessBandBoundaries: 'ThicknessBandBoundaries',
  FmlThicknessBand: 'ThicknessBand',
  classifyFmlThicknessBand: 'classifyThicknessBand',
  fmlWallThicknessLimits: 'wallThicknessLimits',
  fmlThicknessBandBoundaries: 'thicknessBandBoundaries',
  loadFmlWallThicknessLimits: 'loadWallThicknessLimits',
  saveFmlWallThicknessLimits: 'saveWallThicknessLimits',
  loadFmlThicknessBandBoundaries: 'loadThicknessBandBoundaries',
  saveFmlThicknessBandBoundaries: 'saveThicknessBandBoundaries',
  resolveEffectiveFmlWallThicknessLimits: 'resolveEffectiveWallThicknessLimits',
  resolveEffectiveFmlBandBoundaries: 'resolveEffectiveBandBoundaries',
  deriveFmlBandBoundariesFromCatalogExtrema: 'deriveBandBoundariesFromCatalogExtrema',
  deriveFmlBandBoundariesCmFromRefPx: 'deriveBandBoundariesCmFromRefPx',
  appliedFmlBandBoundaries: 'appliedBandBoundaries',
  appliedFmlThicknessLimits: 'appliedThicknessLimits',
  roundFmlThicknessCm: 'roundThicknessCm',
  buildFmlThicknessChains: 'buildThicknessChains',
  FmlThicknessPickTier: 'ThicknessPickTier',
  FmlThicknessPickState: 'ThicknessPickState',
  FmlThicknessPickResult: 'ThicknessPickResult',
  applyFmlThicknessPick: 'applyThicknessPick',
  startFmlThicknessPick: 'startThicknessPick',
  cancelFmlThicknessPick: 'cancelThicknessPick',
  handleFmlThicknessWallPick: 'handleThicknessWallPick',
  createHandleFmlThicknessWallPick: 'createHandleThicknessWallPick',
  WorkspaceFmlThicknessPreview: 'WorkspaceThicknessPreview',
  WorkspaceFmlThicknessUiDeps: 'WorkspaceThicknessUiDeps',
  WorkspaceFmlThicknessUiApi: 'WorkspaceThicknessUiApi',
  createWorkspaceFmlThicknessUi: 'createWorkspaceThicknessUi',

  // ---- core/plan-domein
  sanitizeFmlWalls: 'sanitizePlanWalls',
  sanitizeFmlWallsDetailed: 'sanitizePlanWallsDetailed',
  SanitizeFmlWallsResult: 'SanitizePlanWallsResult',
  harmonizeFmlWallThickness: 'harmonizeWallThickness',
  FmlExtras: 'PlanExtras',
  cloneFmlExtras: 'clonePlanExtras',
  Layer12DoorForFml: 'Layer12DoorForPlan',
  toLayer12DoorForFml: 'toLayer12DoorForPlan',
  Layer14WindowForFml: 'Layer14WindowForPlan',
  toLayer14WindowForFml: 'toLayer14WindowForPlan',
  toLayer14WindowsForFml: 'toLayer14WindowsForPlan',

  // ---- CV: «FML-laag» betekende hier de plattegrond-laag, niet een .fml-bestand
  buildSemanticGraphFromFmlLayer: 'buildSemanticGraphFromPlanLayer',
  SemanticGraphFromFmlLayer: 'SemanticGraphFromPlanLayer',
  resolveFmlSourceLayer: 'resolvePlanSourceLayer',
  resolveFmlSourceJunctionCount: 'resolvePlanSourceJunctionCount',
  hasFmlSemanticSource: 'hasPlanSemanticSource',
  resolveLayer10FmlPolicy: 'resolveLayer10PlanPolicy',
  Layer10FmlPolicy: 'Layer10PlanPolicy',
  runLayer10Fml: 'runLayer10Plan',

  // ---- UI-state met een FML-naam
  isFmlToolbarSettingsOpen: 'isPlanToolbarSettingsOpen',
  allowsFmlStickyHit: 'allowsPlanStickyHit',
  resolveFmlStickySelectKind: 'resolvePlanStickySelectKind',
  FmlStickySelectKind: 'PlanStickySelectKind',
  getFmlSelectTools: 'getPlanSelectTools',
  getFmlDrawTools: 'getPlanDrawTools',
  getFmlEditTools: 'getPlanEditTools',
  getFmlLibraryTools: 'getPlanLibraryTools',
  parseFmlHex: 'parsePlanHex',
  ProjectFmlDefaults: 'ProjectPlanDefaults',
  createDefaultFloorFmlDefaults: 'createDefaultFloorDefaults',
  createFactoryFmlDefaults: 'createFactoryPlanDefaults',
  applyFmlDefaultsToUi: 'applyPlanDefaultsToUi',
  restoreFmlDefaultsFromActiveFloor: 'restorePlanDefaultsFromActiveFloor',
  resetFmlSessionDefaults: 'resetPlanSessionDefaults',
  hydrateFmlWallHeightCm: 'hydratePlanWallHeightCm',
  hydrateFmlDoorHeightCm: 'hydratePlanDoorHeightCm',
  hydrateFmlWindowHeightCm: 'hydratePlanWindowHeightCm',
  hydrateFmlWindowSillZCm: 'hydratePlanWindowSillZCm',
  hydrateFmlBovenlichtDefault: 'hydratePlanBovenlichtDefault',
  hydrateFmlWindowBovenlichtDefault: 'hydratePlanWindowBovenlichtDefault',
  appliedFmlWallHeightCm: 'appliedWallHeightCm',
  appliedFmlDoorHeightCm: 'appliedDoorHeightCm',
  appliedFmlWindowHeightCm: 'appliedWindowHeightCm',
  appliedFmlWindowSillZCm: 'appliedWindowSillZCm',
  isLoadingFml: 'isLoadingPlan',
  FmlLoadPhase: 'PlanLoadPhase',
  isV3FmlReady: 'isV3PlanReady',
  hasAnyFloorFml: 'hasAnyFloorPlan',
  hasActiveFloorFml: 'hasActiveFloorPlan',
  hasResultFml: 'hasResultPlan',
  noFloorReadyForFml: 'noFloorReadyForPlan',
  noFmlWalls: 'noPlanWalls',
  onFmlResultTab: 'onPlanResultTab',
  isOnFmlResultTab: 'isOnPlanResultTab',
  FmlUnderlayStageGeom: 'PlanUnderlayStageGeom',
  getFmlNulpuntImageCm: 'getPlanNulpuntImageCm',
  applyFmlNulpuntImageCm: 'applyPlanNulpuntImageCm',
  applyNulpuntAtFmlCm: 'applyNulpuntAtPlanCm',
  getFmlOrient: 'getPlanOrient',
  applyFmlOrient: 'applyPlanOrient',
  rescaleFmlFromRulers: 'rescalePlanFromRulers',
  regenerateFml: 'regeneratePlan',
  alertFmlChrome: 'alertPlanChrome',
  createFmlHarness: 'createPlanHarness',
  sliceFml: 'slicePlanState',
  WorkspaceFmlStampInject: 'WorkspaceStampInject',
  createWorkspaceFmlGenerate: 'createWorkspacePlanGenerate',
  WorkspaceFmlGenerateDeps: 'WorkspacePlanGenerateDeps',
  WorkspaceFmlGenerateApplied: 'WorkspacePlanGenerateApplied',
  WorkspaceFmlGenerateApi: 'WorkspacePlanGenerateApi',
  onFmlOpacityInput: 'onContentOpacityInput',
}

/**
 * Blijft staan. Niet decoratief: de eerste drie zijn de adapter, `fmlEditorUnlocked` is
 * een localStorage-sleutel, en de laatste vijf zijn lees-aliassen voor bestaande
 * IDB-records en localStorage-blobs. Hernoemen = stille dataverlies.
 */
const STAY = [
  'importFmlV3', 'buildFmlV3', 'downloadFml', 'BuildFmlV3Options', 'RawFmlV3',
  'fmlRefId', 'fmlText', 'FML_REFID_EXTRA', 'FmlConceptAdapter', 'FML_CONCEPT_ADAPTERS',
  'fmlRefidForOpeningKind', 'fmlRefidForFixtureKind', 'openingKindFromFmlRefid',
  'fixtureKindFromFmlRefid', 'isKnownWindowFmlRefid', 'isKnownDoorFmlRefid',
  'fixtureSizeUpgradeFromFmlRefid', 'FML_ALIGN_FIXTURE_REFID', 'FML_ALIGN_FIXTURE_KIND',
  'importedFmlText', 'buildGeneratedFmlText', 'buildCurrentFmlText', 'getGeneratedFmlText',
  'downloadCurrentFml', 'downloadGeneratedFml', 'copyGeneratedFml', 'downloadProjectFml',
  'importFmlFile', 'chooseFml', 'clearImportedFml', 'fromFml', 'fmlImport', 'fmlExport',
  'fmlEditorUnlocked', 'fmlViewer', 'fmlOpacityPct', 'fmlOrient', 'fmlNulpuntImageCm',
  'fmlConversion', 'semanticFmlExportFingerprint', 'FmlSnapshot', 'buildFmlSnapshot',
  'FmlWallSnapshot', 'fmlSnapshot', 'resolveReferenceFmlPath', 'E2eFixtureFmlSettings',
  'fmlBody',
]

for (const stay of STAY) {
  if (NAMES[stay]) {
    console.error(`FOUT: ${stay} staat in NAMES én in STAY`)
    process.exit(1)
  }
}

function git(...args) {
  if (DRY) return ''
  return execFileSync('git', args, { encoding: 'utf8' })
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function toKebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

// ------------------------------------------------------------- 1. bestanden verhuizen

const DIR = 'src/core/plan'
for (const [from, to] of Object.entries(FILES)) {
  const src = `${DIR}/${from}.ts`
  if (!existsSync(src)) {
    console.error(`FOUT: ${src} bestaat niet`)
    process.exit(1)
  }
  if (!DRY) git('mv', src, `${DIR}/${to}.ts`)
}
console.log(`bestanden hernoemd: ${Object.keys(FILES).length}`)

// De spec die de bestandsnaam volgt.
const SPEC = ['tests/core/fml/fml-dimension-settings.spec.ts', 'tests/core/fml/plan-dimension-settings.spec.ts']
if (existsSync(SPEC[0]) && !DRY) git('mv', SPEC[0], SPEC[1])

// ----------------------------------------------------------------------- 2. sweepen

const files = ['src', 'tests', 'scripts']
  .filter((r) => existsSync(r))
  .flatMap((r) => walk(r))
  .filter((f) => /\.(ts|vue|mts|js|mjs|css)$/.test(f))
  .filter((f) => !f.includes('rename-phase6-names'))

/** [regex, vervanging, label, teller] */
const rules = []
for (const [from, to] of Object.entries(FILES)) {
  rules.push([new RegExp(`(?<=core/plan/)${from}\\b`, 'g'), to, `pad ${from}`, 0])
}
for (const [from, to] of Object.entries(NAMES)) {
  rules.push([new RegExp(`\\b${from}\\b`, 'g'), to, from, 0])
  // Kebab alleen ná een dubbele punt: props gaan mee, CSS-klassen en losse strings niet.
  const kebab = toKebab(from)
  if (kebab !== from) {
    rules.push([new RegExp(`(?<=:)${kebab}\\b`, 'g'), toKebab(to), `${from} (kebab)`, 0])
  }
}

let touched = 0
for (const file of files) {
  const original = readFileSync(file, 'utf8')
  let next = original
  for (const rule of rules) {
    next = next.replace(rule[0], () => {
      rule[3] += 1
      return rule[1]
    })
  }
  if (next !== original) {
    touched += 1
    if (!DRY) writeFileSync(file, next)
  }
}

const hit = rules.filter((r) => r[3] > 0)
const missed = rules.filter((r) => r[3] === 0)
const total = rules.reduce((sum, r) => sum + r[3], 0)

console.log(`\nvervangingen: ${total} in ${touched} bestanden${DRY ? ' (dry run)' : ''}`)
console.log(`regels die raakten: ${hit.length} / ${rules.length}`)
if (missed.length > 0) {
  console.log(`\nNUL treffers (naam verkeerd gegokt of al weg):`)
  for (const rule of missed) console.log(`  ${rule[2]}`)
}
