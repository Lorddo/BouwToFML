/**
 * FML-adapter B4: elevationViews + elevationProjection ↔ plan.elevations.
 * serializePlanSettings schrijft vóór stripFloorplannerHostileSettings (blijven gestript).
 */
import {
  DEFAULT_ELEVATION_PROJECTION,
  ELEVATION_PROJECTION_SETTINGS_KEY,
  ELEVATION_VIEWS_SETTINGS_KEY,
  listElevationViews,
  readElevationProjection,
} from '../../fml/elevation-views'
import type { FmlConceptAdapter } from './registry'

function clearElevationSettingsKeys(plan: {
  source?: { settings?: Record<string, unknown> }
}): void {
  const settings = plan.source?.settings
  if (!settings) return
  delete settings[ELEVATION_VIEWS_SETTINGS_KEY]
  delete settings[ELEVATION_PROJECTION_SETTINGS_KEY]
}

export const elevationsAdapter: FmlConceptAdapter = {
  id: 'elevations',
  hydrate(plan) {
    const views = listElevationViews(plan)
    const projection = readElevationProjection(plan)
    const hasProjectionKey =
      plan.source?.settings?.[ELEVATION_PROJECTION_SETTINGS_KEY] != null ||
      plan.elevations?.projection != null
    if (views.length > 0 || hasProjectionKey || projection !== DEFAULT_ELEVATION_PROJECTION) {
      plan.elevations = {
        projection,
        views: views.map((view) => ({
          facadeGroupId: view.facadeGroupId,
          ...(view.drawing ? { drawing: { ...view.drawing } } : {}),
        })),
      }
    } else {
      delete plan.elevations
    }
    clearElevationSettingsKeys(plan)
  },
  serializePlanSettings(plan, settings) {
    const views = listElevationViews(plan)
    const projection = readElevationProjection(plan)
    if (views.length > 0) {
      settings[ELEVATION_VIEWS_SETTINGS_KEY] = views.map((view) => ({
        facadeGroupId: view.facadeGroupId,
        ...(view.drawing ? { drawing: { ...view.drawing } } : {}),
      }))
    } else {
      delete settings[ELEVATION_VIEWS_SETTINGS_KEY]
    }
    if (plan.elevations != null || projection !== DEFAULT_ELEVATION_PROJECTION) {
      settings[ELEVATION_PROJECTION_SETTINGS_KEY] = projection
    } else {
      delete settings[ELEVATION_PROJECTION_SETTINGS_KEY]
    }
  },
}
