import type { Floor } from '@/core/fml/types'
import { resolveOpeningCatalog } from '@/core/fml/opening-refid-catalog'
import { resolveFixtureCatalog } from '@/core/fml/fixture-refid-catalog'
import { buildFixtureSymbol } from '@/core/fml/fixture-symbols'
import { groupDoorOpeningsOnWall } from '@/ui/components/fml-preview-doors'
import { buildWindowOpeningId } from '@/ui/components/fml-preview-openings'
import {
  offsetFlatPointsByWallBalance,
  offsetPointByWallBalance,
} from '@/ui/components/fml-preview-wall-polygons'
import {
  buildOpeningGapPolygon,
  buildWindowSymbol,
  clamp01,
  doorGroupDetail,
  flattenStagePoints,
  resolveWindowPanelCount,
  windowTypeLabel,
} from './fml-preview-opening-render'
import type {
  RenderDoorGroup,
  RenderFixture,
  RenderWall,
  RenderWindowOpening,
} from './fml-preview-render-types'

type StagePointFn = (x: number, y: number) => { x: number; y: number }

export function buildRenderDoorGroupsAndWindows(
  wallLines: RenderWall[],
  toStagePoint: StagePointFn,
): { doorGroups: RenderDoorGroup[]; windows: RenderWindowOpening[] } {
  const doorGroups: RenderDoorGroup[] = []
  const windows: RenderWindowOpening[] = []

  wallLines.forEach((wallLine) => {
    const dx = wallLine.b.x - wallLine.a.x
    const dy = wallLine.b.y - wallLine.a.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) return
    const ux = dx / len
    const uy = dy / len
    const wallUnit = { x: ux, y: uy }
    const thicknessCm = wallLine.wall.thickness
    const balance = wallLine.wall.balance

    const groupedDoors = groupDoorOpeningsOnWall(
      wallLine.id,
      wallLine.a,
      wallLine.b,
      wallLine.wall.openings,
      thicknessCm,
    )
    groupedDoors.forEach((group) => {
      // Balance verschuift de muur t.o.v. de hartlijn — openingen mee naar mid-dikte.
      const startCm = offsetPointByWallBalance(group.startCm, wallUnit, thicknessCm, balance)
      const endCm = offsetPointByWallBalance(group.endCm, wallUnit, thicknessCm, balance)
      const start = toStagePoint(startCm.x, startCm.y)
      const end = toStagePoint(endCm.x, endCm.y)
      doorGroups.push({
        id: group.id,
        wallId: wallLine.id,
        openingIndex: group.openingIndex,
        openingGuid: group.openingGuid,
        openings: group.openings,
        hitPoints: [start.x, start.y, end.x, end.y],
        gapPoints: buildOpeningGapPolygon({
          startCm,
          endCm,
          wallUnit,
          thicknessCm,
          toStagePoint,
        }),
        label: group.catalogLabel,
        detail: doorGroupDetail(group),
        leafLines: group.leafLines.map((line) =>
          flattenStagePoints(
            offsetFlatPointsByWallBalance(line, wallUnit, thicknessCm, balance),
            toStagePoint,
          ),
        ),
        arcPoints: group.arcPoints.map((arc) =>
          flattenStagePoints(
            offsetFlatPointsByWallBalance(arc, wallUnit, thicknessCm, balance),
            toStagePoint,
          ),
        ),
        arrowPoints: group.arrowPoints.map((arrow) =>
          flattenStagePoints(
            offsetFlatPointsByWallBalance(arrow, wallUnit, thicknessCm, balance),
            toStagePoint,
          ),
        ),
      })
    })

    wallLine.wall.openings.forEach((opening, openingIndex) => {
      if (opening.type !== 'window') return

      const center = offsetPointByWallBalance(
        {
          x: wallLine.a.x + clamp01(opening.t) * dx,
          y: wallLine.a.y + clamp01(opening.t) * dy,
        },
        wallUnit,
        thicknessCm,
        balance,
      )
      const half = Math.max(0.5, opening.width / 2)
      const startCm = { x: center.x - ux * half, y: center.y - uy * half }
      const endCm = { x: center.x + ux * half, y: center.y + uy * half }
      const start = toStagePoint(startCm.x, startCm.y)
      const end = toStagePoint(endCm.x, endCm.y)
      const catalog = resolveOpeningCatalog(opening.refid, 'window')
      const panels = resolveWindowPanelCount(opening.width, catalog.kind, catalog.panels)
      const windowSymbol = buildWindowSymbol({
        startCm,
        endCm,
        thicknessCm,
        toStagePoint,
        panelCount: panels,
        kind: catalog.kind,
      })
      windows.push({
        id: buildWindowOpeningId(wallLine.id, opening, openingIndex),
        wallId: wallLine.id,
        opening,
        hitPoints: [start.x, start.y, end.x, end.y],
        gapPoints: buildOpeningGapPolygon({
          startCm,
          endCm,
          wallUnit,
          thicknessCm,
          toStagePoint,
        }),
        label: catalog.label,
        detail: `${windowTypeLabel(panels, catalog.kind)} · ${Math.round(opening.width)} cm`,
        basePoints: windowSymbol.basePoints,
        mullions: windowSymbol.mullions,
        ornament: windowSymbol.ornament,
      })
    })
  })

  return { doorGroups, windows }
}

export function buildRenderFixtures(floor: Floor, toStagePoint: StagePointFn): RenderFixture[] {
  return (floor.items ?? []).flatMap((item, index) => {
    const catalog = resolveFixtureCatalog(item.refid)
    if (catalog.kind === 'hidden') return []
    const symbol = buildFixtureSymbol(catalog.kind, item.width, item.height)
    const center = toStagePoint(item.x, item.y)
    const origin = toStagePoint(0, 0)
    const unit = toStagePoint(1, 0)
    const cmToStage = Math.hypot(unit.x - origin.x, unit.y - origin.y) || 1
    const mirroredX = item.mirrored?.[0] === 1 ? -1 : 1
    const mirroredY = item.mirrored?.[1] === 1 ? -1 : 1
    return [
      {
        id: item.guid ?? `fixture-${index}`,
        label: catalog.label,
        detail: catalog.categorie,
        x: center.x,
        y: center.y,
        rotationDeg: item.rotation ?? 0,
        scaleX: cmToStage * mirroredX,
        scaleY: cmToStage * mirroredY,
        rects: symbol.rects,
        ellipses: symbol.ellipses,
        circles: symbol.circles,
        fillPolygons: symbol.fillPolygons ?? [],
        polylines: symbol.polylines,
        dashPolylines: symbol.dashPolylines ?? [],
        arrowPolylines: symbol.arrowPolylines ?? [],
        stroke: catalog.stroke ?? symbol.stroke,
        fill: catalog.fill ?? symbol.fill,
        circleFill: symbol.circleFill,
        strokeWidth: symbol.strokeWidth ?? 1.2,
        arrowStrokeWidth: symbol.arrowStrokeWidth,
        dash: symbol.dash,
        overWalls: symbol.overWalls,
      },
    ]
  })
}
