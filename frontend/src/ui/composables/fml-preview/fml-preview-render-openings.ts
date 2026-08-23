import type { Floor } from '@/core/fml/types'
import { resolveOpeningCatalog, type WindowAssetKind } from '@/core/fml/opening-refid-catalog'
import { insetOpeningRect, resolveOpeningFrame } from '@/core/fml/opening-display-geom'
import { resolveFixtureCatalog } from '@/core/fml/fixture-refid-catalog'
import { buildFixtureSymbol } from '@/core/fml/fixture-symbols'
import {
  buildWindowPlanSymbol,
  samplePlanArc,
  type PlanGlyph,
} from '@/core/fml/opening-plan-symbol'
import { groupDoorOpeningsOnWall } from '@/ui/components/fml-preview-doors'
import { buildWindowOpeningId } from '@/ui/components/fml-preview-openings'
import {
  offsetFlatPointsByWallBalance,
  offsetPointByWallBalance,
} from '@/ui/components/fml-preview-wall-polygons'
import {
  buildOpeningGapPolygon,
  clamp01,
  doorGroupDetail,
  flattenStagePoints,
  resolveWindowPanelCount,
  windowTypeLabel,
} from './fml-preview-opening-render'
import { fixtureSymbolLocalBounds } from './fml-preview-fixture-bounds'
import type {
  RenderDoorGroup,
  RenderFixture,
  RenderPlanGlyph,
  RenderWall,
  RenderWindowOpening,
} from './fml-preview-render-types'
import {
  formatScaleInputLabel,
  type ScaleInputUnit,
} from '@/ui/composables/settings/scale-input-unit'

type StagePointFn = (x: number, y: number) => { x: number; y: number }

function flattenPlanGlyph(
  glyph: PlanGlyph,
  wallUnit: { x: number; y: number },
  thicknessCm: number,
  balance: number | undefined,
  toStagePoint: StagePointFn,
): RenderPlanGlyph {
  if (glyph.kind === 'polyline') {
    return {
      kind: 'polyline',
      role: glyph.role,
      closed: glyph.closed,
      dashed: glyph.dashed,
      points: flattenStagePoints(
        offsetFlatPointsByWallBalance(glyph.points, wallUnit, thicknessCm, balance),
        toStagePoint,
      ),
    }
  }
  const sampleCm = samplePlanArc(glyph)
  const points = flattenStagePoints(
    offsetFlatPointsByWallBalance(sampleCm, wallUnit, thicknessCm, balance),
    toStagePoint,
  )
  const centerCm = offsetPointByWallBalance(
    { x: glyph.cx, y: glyph.cy },
    wallUnit,
    thicknessCm,
    balance,
  )
  const stageC = toStagePoint(centerCm.x, centerCm.y)
  const startPt = toStagePoint(
    centerCm.x + Math.cos(glyph.startRad) * glyph.r,
    centerCm.y + Math.sin(glyph.startRad) * glyph.r,
  )
  const endPt = toStagePoint(
    centerCm.x + Math.cos(glyph.startRad + glyph.sweepRad) * glyph.r,
    centerCm.y + Math.sin(glyph.startRad + glyph.sweepRad) * glyph.r,
  )
  const startRad = Math.atan2(startPt.y - stageC.y, startPt.x - stageC.x)
  const endRad = Math.atan2(endPt.y - stageC.y, endPt.x - stageC.x)
  let sweepRad = endRad - startRad
  while (sweepRad > Math.PI) sweepRad -= Math.PI * 2
  while (sweepRad <= -Math.PI) sweepRad += Math.PI * 2
  const r = Math.hypot(startPt.x - stageC.x, startPt.y - stageC.y)
  return {
    kind: 'arc',
    role: 'swing',
    cx: stageC.x,
    cy: stageC.y,
    r,
    startRad,
    sweepRad,
    points,
  }
}

function flattenPlanGlyphs(
  glyphs: PlanGlyph[],
  wallUnit: { x: number; y: number },
  thicknessCm: number,
  balance: number | undefined,
  toStagePoint: StagePointFn,
): RenderPlanGlyph[] {
  return glyphs.map((g) => flattenPlanGlyph(g, wallUnit, thicknessCm, balance, toStagePoint))
}

export function buildRenderDoorGroupsAndWindows(
  wallLines: RenderWall[],
  toStagePoint: StagePointFn,
  unit: ScaleInputUnit = 'mm',
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
        glyphs: flattenPlanGlyphs(group.glyphs, wallUnit, thicknessCm, balance, toStagePoint),
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
      const frame = insetOpeningRect(
        { width: opening.width, height: 100 },
        resolveOpeningFrame(opening, catalog),
      ).frame
      const windowSymbol = buildWindowPlanSymbol({
        start: startCm,
        end: endCm,
        wallUnit,
        thicknessCm,
        panelCount: panels,
        kind: catalog.kind as WindowAssetKind,
        frameLeftCm: frame.leftCm,
        frameRightCm: frame.rightCm,
        mirrored: opening.mirrored,
        leaf: catalog.leaf,
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
        detail: `${windowTypeLabel(panels, catalog.kind)} · ${formatScaleInputLabel(opening.width, unit)}`,
        glyphs: flattenPlanGlyphs(
          windowSymbol.glyphs,
          wallUnit,
          thicknessCm,
          balance,
          toStagePoint,
        ),
      })
    })
  })

  return { doorGroups, windows }
}

export function buildRenderFixtures(floor: Floor, toStagePoint: StagePointFn): RenderFixture[] {
  const prepared = (floor.items ?? []).map((item, index) => ({
    item,
    index,
    catalog: resolveFixtureCatalog(item.refid, { width: item.width, height: item.height }),
  }))
  prepared.sort((a, b) => {
    const rank = (kind: string) => (kind === 'countertop' ? 0 : kind === 'hidden' ? 99 : 1)
    return rank(a.catalog.kind) - rank(b.catalog.kind) || a.index - b.index
  })
  return prepared.flatMap(({ item, index, catalog }) => {
    if (catalog.kind === 'hidden') return []
    const bakeStairMirror =
      catalog.kind === 'stair_quarter_90' ||
      catalog.kind === 'stair_quarter_90_up' ||
      catalog.kind === 'stair_straight' ||
      catalog.kind === 'stair_straight_double'
    const symbol = buildFixtureSymbol(catalog.kind, item.width, item.height, {
      x: item.mirrored?.[0] === 1,
      y: item.mirrored?.[1] === 1,
      rotation: item.rotation ?? 0,
    })
    const center = toStagePoint(item.x, item.y)
    const origin = toStagePoint(0, 0)
    const unit = toStagePoint(1, 0)
    const cmToStage = Math.hypot(unit.x - origin.x, unit.y - origin.y) || 1
    const mirroredX = bakeStairMirror ? 1 : item.mirrored?.[0] === 1 ? -1 : 1
    const mirroredY = bakeStairMirror ? 1 : item.mirrored?.[1] === 1 ? -1 : 1
    const bounds = fixtureSymbolLocalBounds(symbol)
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
        strokeWidth: symbol.strokeWidth ?? 1.5,
        arrowStrokeWidth: symbol.arrowStrokeWidth,
        dash: symbol.dash,
        cornerRadius: symbol.cornerRadius,
        overWalls: symbol.overWalls,
        localX: bounds.x,
        localY: bounds.y,
        localWidth: bounds.width,
        localHeight: bounds.height,
      },
    ]
  })
}
