import { tally } from '@/core/diagnostics'
import { buildBovenlichtOpening, resolveDoorBovenlicht } from './bovenlicht'
import type { FloorPlan, Opening } from './types'
import { CONCEPT_DOOR_REFID, CONCEPT_WINDOW_REFID } from './types'
import {
  DEFAULT_FML_DOOR_HEIGHT_CM,
  DEFAULT_FML_WALL_HEIGHT_CM,
  DEFAULT_FML_WINDOW_HEIGHT_CM,
  DEFAULT_FML_WINDOW_SILL_Z_CM,
} from './extraction-to-plan-types'

export interface BuildFmlV3Options {
  name?: string
  /** Projectdefault: bovenlicht op deuren zonder per-deur override. */
  bovenlichtDefault?: boolean
}

/**
 * Bouwt een Floorplanner v3 (persistent JSON) string.
 * Veldenvolgorde en verplichte velden volgen het echte formaat (zie
 * examples/FML(current)/*): muren incl. decor/az/bz/groupMarkerConfig,
 * openings incl. materials + guid, design/floor/project-meta compleet.
 * Zonder decor/materials crasht Floorplanner.com op import.
 */

const WHITE = { type: 'color', value: '#ffffff' }

function openingMaterials(opening: Opening): Record<string, { type: string; value: string }> {
  if (opening.materials) return opening.materials
  if (opening.type === 'window') {
    return {
      FP_FRAME_OUT: WHITE,
      FP_FRAME_IN: WHITE,
    }
  }
  return {
    FP_DOOR: WHITE,
    FP_DOORFRAME: WHITE,
  }
}

function shortGuid(): string {
  // 6-char hex, zoals Floorplanner ("279d8a")
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
}

function openingGuid(opening: Opening): string {
  return opening.guid ?? shortGuid()
}

function serializeOpening(op: Opening): Record<string, unknown> {
  return {
    refid: op.refid || (op.type === 'window' ? CONCEPT_WINDOW_REFID : CONCEPT_DOOR_REFID),
    t: op.t,
    type: op.type,
    width: op.width,
    // ESC:X-17 (E)
    z_height:
      op.z_height ??
      (op.type === 'window' ? DEFAULT_FML_WINDOW_HEIGHT_CM : DEFAULT_FML_DOOR_HEIGHT_CM),
    z: op.z ?? (op.type === 'window' ? DEFAULT_FML_WINDOW_SILL_Z_CM : 0),
    mirrored: op.mirrored ?? [0, 0],
    materials: openingMaterials(op),
    guid: openingGuid(op),
  }
}

function expandOpeningsForExport(
  openings: Opening[],
  floorHeightCm: number,
  bovenlichtDefault: boolean,
): Opening[] {
  const out: Opening[] = []
  for (const op of openings) {
    out.push(op)
    if (op.type !== 'door') continue
    if (!resolveDoorBovenlicht(op, bovenlichtDefault)) continue
    const doorGuid = openingGuid(op)
    const bovenlicht = buildBovenlichtOpening(op, {
      floorHeightCm,
      doorGuid,
    })
    if (bovenlicht) out.push(bovenlicht)
  }
  return out
}

export function buildFmlV3(plan: FloorPlan, options: BuildFmlV3Options = {}): string {
  // ESC:X-13 (E) — vaste project/floor/design-id's + timestamps; geen multi-verdieping-identiteit.
  tally('X-13', 'hardcoded_metadata')
  // ESC:X-14 (E) — areas/surfaces altijd leeg (verplicht voor Floorplanner.com-import).
  tally('X-14', 'empty_collections')
  // ESC:X-15 (E) — hardcoded project-settings; geen instellingen-pagina.
  tally('X-15', 'hardcoded_settings')
  for (const floor of plan.floors) {
    // ESC:X-16 (E) — was floor.height-14 (vloerdikte uit bron-FML); zonder vloer-surfaces
    // = volle muurhoogte = floor.height (sidebar default 280).
    tally('X-16', 'full_height')
    for (const wall of floor.walls) {
      for (const op of wall.openings) {
        // ESC:X-17 (E) — opening-defaults (raam 150/70, deur 220/0) alleen bij ontbrekend veld.
        if (op.z_height == null)
          tally('X-17', op.type === 'window' ? 'window_default' : 'door_default')
      }
    }
  }
  const projectId = 900000001
  const wallHeightCm = plan.floors[0]?.height ?? DEFAULT_FML_WALL_HEIGHT_CM
  const bovenlichtDefault = options.bovenlichtDefault === true
  const output = {
    id: projectId,
    name: options.name ?? plan.name,
    public: false,
    features: [],
    // ESC:X-15 (E) — hardcoded project-settings; geen instellingen-pagina.
    settings: {
      wallHeight: wallHeightCm,
      wallSectionHeight: 150,
      wallThickness: 10,
      wallOuterThickness: 30,
      useMetric: true,
      showGrid: true,
      showDims: true,
      showShortDims: false,
      showAreaDims: false,
      generateOuterDimension: false,
      dimensionMode: 'interior',
      showDropShadows: false,
      showObjects: true,
      showFixtures: true,
      showItemOutline: false,
      showObjectColour: false,
      showStructuralColour: true,
      showFloorsBelow: false,
      showObjects3D: true,
      showObjectMono: false,
      showLights: false,
      showLabels: true,
      areaLabelOutline: false,
      areaLabelLetterSpacing: 7,
      dimLineLabelHorizontal: false,
      exportLabels3D: false,
      showShadows3D: true,
      exportOrtho3D: false,
      visuals: 'BWC',
      showTexts: true,
      arrowHeadType: 'arrow',
      showNorthArrow: false,
      northArrowRotation: 0,
      northArrowKind: 1,
      blueprintMode: false,
    },
    floors: plan.floors.map((floor, floorIndex) => ({
      id: projectId + 10 + floorIndex,
      project_id: projectId,
      name: floor.name,
      level: floor.level,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      height: floor.height,
      cameras: [],
      designs: [
        {
          id: 1 + floorIndex,
          name: floor.name,
          lines: [],
          dimensions: [],
          labels: [],
          // ESC:X-14 (E)
          areas: [],
          surfaces: [],
          items: (floor.items ?? []).map((item) => ({
            refid: item.refid,
            x: item.x,
            y: item.y,
            z: item.z ?? 0,
            width: item.width,
            height: item.height,
            z_height: item.z_height,
            rotation: item.rotation ?? 0,
            mirrored: item.mirrored ?? [0, 0],
            guid: item.guid ?? shortGuid(),
            ...(item.name ? { name: item.name } : {}),
          })),
          annotations: [],
          cameras: [],
          walls: floor.walls.map((wall) => ({
            guid: wall.id,
            a: { x: wall.a.x, y: wall.a.y },
            b: { x: wall.b.x, y: wall.b.y },
            c: wall.c ?? null,
            // ESC:X-16 (E) — volle floor.height (geen −14 vloerdikte; wij exporteren nog geen floors)
            az: { z: 0, h: floor.height },
            bz: { z: 0, h: floor.height },
            thickness: wall.thickness,
            // ESC:X-01 (E) — default bij ontbrekende meting; harmonize forceert daarna 0.5.
            balance: wall.balance ?? 0.5,
            groupMarkerConfig: { locked: false },
            decor: { left: null, right: null, top: null, outline: 0 },
            openings: expandOpeningsForExport(wall.openings, floor.height, bovenlichtDefault).map(
              serializeOpening,
            ),
          })),
          settings: {
            engineAutoDims: false,
            areaLabelMultiplier: 1,
            scaleMultiplierDimensions: 1.5,
            scaleMultiplierComments: 1,
            dimLineLabelHorizontal: false,
            showCeilings3D: true,
            minWallLength: 4,
          },
        },
      ],
    })),
  }

  return JSON.stringify(output, null, 2)
}
