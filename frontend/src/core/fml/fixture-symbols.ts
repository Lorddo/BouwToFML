import type { FixtureAssetKind } from './fixture-refid-catalog'

export interface FixtureSymbolShape {
  /** Gefillde rechthoeken [x, y, w, h] in lokale cm (origine = item-midden). */
  rects: number[][]
  /** Ellipsen [cx, cy, rx, ry]. */
  ellipses: number[][]
  /** Circles [cx, cy, r]. */
  circles: number[][]
  /** Gesloten fill-polygonen [x0,y0,x1,y1,...] (geen stroke). */
  fillPolygons?: number[][]
  /** Polyline-punten [x0,y0,x1,y1,...]. */
  polylines: number[][]
  /** Dashed polylines (schuine snede); zelfde stroke, dash [5,4]. */
  dashPolylines?: number[][]
  /** Pijl-polylines (eigen stroke); leeg = geen. */
  arrowPolylines?: number[][]
  stroke: string
  fill: string
  /** Override voor circles (spil, schoorsteen-opening). */
  circleFill?: string
  /** Optionele afronding van rects (cm). */
  cornerRadius?: number
  /**
   * Lijndikte in FML-cm (lokale fixture-coords). Group scaleX = cm→stage;
   * stroke schaalt mee met muren/zoom.
   */
  strokeWidth?: number
  arrowStrokeWidth?: number
  /** Dash-array in FML-cm (lokale coords). */
  dash?: number[]
  /**
   * true = boven muurfill (dak/gevel-symbolen).
   * false = onder muurfill zodat flush-meubels niet door de muur steken.
   */
  overWalls: boolean
}

const STROKE = '#475569'
const FILL = '#e2e8f0'
const METAL_FILL = '#94a3b8'
const METAL_STROKE = '#334155'
const STAIR_STROKE = '#334155'
const STAIR_FILL = '#f1f5f9'
/** Traptreden ~1.5 cm — leesbaar na fit, niet dik bij inzoomen. */
const STAIR_STROKE_W = 1.5
const STAIR_ARROW_W = 2.2

function emptyShape(
  partial: Partial<FixtureSymbolShape> & Pick<FixtureSymbolShape, 'overWalls'>,
): FixtureSymbolShape {
  return {
    rects: [],
    ellipses: [],
    circles: [],
    fillPolygons: [],
    polylines: [],
    dashPolylines: [],
    arrowPolylines: [],
    stroke: STROKE,
    fill: FILL,
    ...partial,
  }
}

/** Meubels tegen een flush-muur (balance=0) overlappen de muurdikte — muren tekenen we eroverheen. */
function isFurnitureKind(kind: FixtureAssetKind): boolean {
  return (
    kind === 'countertop' ||
    kind === 'fridge' ||
    kind === 'cabinet_high' ||
    kind === 'kitchen_sink' ||
    kind === 'cooktop' ||
    kind === 'dishwasher' ||
    kind === 'washing_machine' ||
    kind === 'dryer' ||
    kind === 'washer_dryer' ||
    kind === 'bathtub' ||
    kind === 'sink_double' ||
    kind === 'toilet' ||
    kind === 'toilet_wall_hung' ||
    kind === 'sink_small' ||
    kind === 'sink_large' ||
    kind === 'sink_vanity' ||
    kind === 'shower_head' ||
    kind === 'fuse_box' ||
    kind === 'stair_winder_180' ||
    kind === 'stair_quarter_90' ||
    kind === 'stair_quarter_90_up' ||
    kind === 'stair_straight' ||
    kind === 'stair_straight_double' ||
    kind === 'stair_opening' ||
    kind === 'roof_eave'
  )
}

/** Straal vanuit (ox,oy) tot de binnenrand van de item-bbox (Y omlaag). */
function rayToRect(
  ox: number,
  oy: number,
  ang: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): { x: number; y: number } {
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  let t = 1e6
  if (dx > 1e-9) t = Math.min(t, (maxX - ox) / dx)
  if (dx < -1e-9) t = Math.min(t, (minX - ox) / dx)
  if (dy > 1e-9) t = Math.min(t, (maxY - oy) / dy)
  if (dy < -1e-9) t = Math.min(t, (minY - oy) / dy)
  return { x: ox + dx * t, y: oy + dy * t }
}

function stairWinder180(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  const inset = Math.min(w, h) * 0.03
  const minX = -hw + inset
  const maxX = hw
  const minY = -hh + inset
  const maxY = hh - inset
  /**
   * Lokale asset-ruimte (rot=0, mirrored=[0,0]):
   * spil op de lange +X-rand (onzichtbaar), treden stralen daarvandaan over −X.
   * Mooiland rot=180 + mirrored[1]=1 ⇒ X-spiegel: spil links, brede treden rechts.
   */
  const newelX = hw
  const newelY = 0
  const polylines: number[][] = []

  const winderN = 12
  const aStart = -Math.PI / 2 - 0.1
  const aEnd = -1.5 * Math.PI + 0.1
  for (let i = 0; i <= winderN; i += 1) {
    const a = aStart + (i / winderN) * (aEnd - aStart)
    const outer = rayToRect(newelX, newelY, a, minX, maxX, minY, maxY)
    polylines.push([newelX, newelY, outer.x, outer.y])
  }

  const longX = -hw * 0.34
  const yBottom = hh * 0.46
  const yTop = -hh * 0.46
  const short = Math.min(w * 0.28, hw * 0.55)
  const tipX = longX + short
  const head = Math.min(w, h) * 0.055
  const arrowPolylines = [
    [0, yBottom, longX, yBottom, longX, yTop, tipX, yTop],
    [tipX - head, yTop - head, tipX, yTop, tipX - head, yTop + head],
  ]

  return emptyShape({
    rects: [[-hw, -hh, w, h]],
    polylines,
    arrowPolylines,
    stroke: STAIR_STROKE,
    fill: STAIR_FILL,
    strokeWidth: STAIR_STROKE_W,
    arrowStrokeWidth: STAIR_ARROW_W,
    overWalls: false,
  })
}

function mapPairs(pts: number[], f: (x: number, y: number) => [number, number]): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const [x, y] = f(pts[i] ?? 0, pts[i + 1] ?? 0)
    out.push(x, y)
  }
  return out
}

function arrowHead(fromX: number, fromY: number, toX: number, toY: number, head: number): number[] {
  const dx = toX - fromX
  const dy = toY - fromY
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  return [
    toX - ux * head + px * head,
    toY - uy * head + py * head,
    toX,
    toY,
    toX - ux * head - px * head,
    toY - uy * head - py * head,
  ]
}

type QuarterFrame = {
  a: number
  r: number
  run: number
  toBbox: (x: number, y: number) => [number, number]
}

function quarterStairFrame(w: number, h: number, rotationDeg = 0, mirrorY = false): QuarterFrame {
  const across = Math.min(w, h)
  const run = Math.max(w, h)
  const alongX = w > h
  const a = across / 2
  const r = run / 2
  const rot = ((rotationDeg % 360) + 360) % 360
  /**
   * FML mirrored[1] = Y-spiegel van het item (niet deur-semantiek).
   * Na rot 90 wordt dat een horizontale flip op het scherm — Amstelveenseweg 1e.
   * Landscape: rot 90 → (y,−x); rot 270 anders 180°.
   * Portrait rot 180 niet voorcompenseren — Konva draait die 180° zelf (Amstelveenseweg BG).
   */
  const toBbox = (x: number, y: number): [number, number] => {
    const py = mirrorY ? -y : y
    if (!alongX) return [x, py]
    if (rot > 225 && rot <= 315) return [-py, x]
    return [py, -x]
  }
  return { a, r, run, toBbox }
}

function finishQuarterStair(
  frame: QuarterFrame,
  polylines: number[][],
  dashPolylines: number[][],
  fillPolygons: number[][],
  arrowShaft: number[],
  head: number,
): FixtureSymbolShape {
  const shaft = mapPairs(arrowShaft, frame.toBbox)
  const tipFromX = shaft[shaft.length - 4] ?? 0
  const tipFromY = shaft[shaft.length - 3] ?? 0
  const tipToX = shaft[shaft.length - 2] ?? 0
  const tipToY = shaft[shaft.length - 1] ?? 0
  return emptyShape({
    fillPolygons: fillPolygons.map((poly) => mapPairs(poly, frame.toBbox)),
    polylines: polylines.map((poly) => mapPairs(poly, frame.toBbox)),
    dashPolylines: dashPolylines.map((poly) => mapPairs(poly, frame.toBbox)),
    arrowPolylines: [shaft, arrowHead(tipFromX, tipFromY, tipToX, tipToY, head)],
    stroke: STAIR_STROKE,
    fill: STAIR_FILL,
    strokeWidth: STAIR_STROKE_W,
    arrowStrokeWidth: STAIR_ARROW_W,
    overWalls: false,
  })
}

/**
 * Kwarttrap omhoog — eigen tekening, niet de omgekeerde opkomst.
 * Onder: L-draai; spil op de binnenhoek (bovenkant van de winder-hoek).
 * Daarboven: 3 rechte treden + dashed snede.
 * Ostade mirrored[0]: draai vanuit rechtsonder. Anna: vanuit linksonder.
 */
function stairQuarter90GoingUp(
  w: number,
  h: number,
  mirrorX: boolean,
  rotationDeg = 0,
  mirrorY = false,
): FixtureSymbolShape {
  const frame = quarterStairFrame(w, h, rotationDeg, mirrorY)
  const { a, r, run } = frame
  const pivotX = mirrorX ? a : -a
  const farX = -pivotX
  const straightLen = run * 0.28
  const cutLen = Math.min(a * 0.7, run * 0.18)
  const cutY = -r + cutLen
  const pivotY = cutY + straightLen
  const polylines: number[][] = [
    [farX, pivotY, pivotX, pivotY],
    [pivotX, r, pivotX, -r],
    [farX, r, pivotX, r],
    [farX, r, farX, cutY],
    [-a, -r, a, -r],
  ]
  const nStraight = 3
  for (let i = 1; i <= nStraight; i += 1) {
    const yt = pivotY + (i / (nStraight + 1)) * (cutY - pivotY)
    polylines.push([farX, yt, pivotX, yt])
  }
  const a0 = Math.PI / 2
  const a1 = mirrorX ? Math.PI : 0
  const winderRays = 8
  for (let i = 1; i < winderRays; i += 1) {
    const ang = a0 + (i / winderRays) * (a1 - a0)
    const outer = rayToRect(pivotX, pivotY, ang, -a, a, pivotY, r)
    polylines.push([pivotX, pivotY, outer.x, outer.y])
  }
  const ax = farX * 0.08
  const yMid = (pivotY + r) / 2
  return finishQuarterStair(
    frame,
    polylines,
    [[-a, cutY, a, -r]],
    [[-a, r, a, r, a, -r, -a, cutY]],
    [pivotX * 0.55, yMid, ax, yMid, ax, cutY + run * 0.06],
    Math.min(w, h) * 0.055,
  )
}

/**
 * Kwarttrap opkomend — eigen tekening, niet de omgekeerde omhoog-trap.
 * Onder: 3 rechte treden + dashed snede.
 * Daarna L-draai; spil op de binnenhoek, aan de onderkant van de opening.
 * Ostade mirrored[0]: draai rechts, spil rechts. Anna: draai links, spil links.
 */
function stairQuarter90Arrival(
  w: number,
  h: number,
  mirrorX: boolean,
  rotationDeg = 0,
  mirrorY = false,
): FixtureSymbolShape {
  const frame = quarterStairFrame(w, h, rotationDeg, mirrorY)
  const { a, r, run } = frame
  const pivotX = mirrorX ? a : -a
  const farX = -pivotX
  const straightLen = run * 0.28
  const cutLen = Math.min(a * 0.7, run * 0.18)
  const pivotY = r - straightLen
  const cutY = r - cutLen
  const polylines: number[][] = [
    [farX, pivotY, pivotX, pivotY],
    [pivotX, r, pivotX, -r],
    [farX, cutY, farX, -r],
    [-a, -r, a, -r],
  ]
  const nStraight = 3
  for (let i = 1; i <= nStraight; i += 1) {
    const yt = r - (i / (nStraight + 1)) * straightLen
    polylines.push([farX, yt, pivotX, yt])
  }
  const a0 = mirrorX ? Math.PI : 0
  const a1 = mirrorX ? Math.PI * 1.5 : -Math.PI / 2
  const winderRays = 8
  for (let i = 1; i < winderRays; i += 1) {
    const ang = a0 + (i / winderRays) * (a1 - a0)
    const outer = rayToRect(pivotX, pivotY, ang, -a, a, -r, pivotY)
    polylines.push([pivotX, pivotY, outer.x, outer.y])
  }
  const ax = farX * 0.08
  const yStart = r - straightLen * 0.4
  const yTurn = (pivotY - r) / 2
  return finishQuarterStair(
    frame,
    polylines,
    [[-a, cutY, a, r]],
    [[-a, -r, a, -r, a, r, -a, cutY]],
    [ax, yStart, ax, yTurn, pivotX * 0.62, yTurn],
    Math.min(w, h) * 0.055,
  )
}

/**
 * Rechte trap. Canonical: loop langs Y, omhoog naar −Y (bovenkant bbox).
 * Treden haaks op de loop; dashed snede nabij de bovenkant.
 * rot/mirror via quarterStairFrame (zelfde verankering als kwarttrap).
 * Oosterpoort 85×225 rot=90: Konva-rotatie zet −Y omhoog naar rechts.
 */
function stairStraight(
  w: number,
  h: number,
  mirrorX: boolean,
  rotationDeg = 0,
  mirrorY = false,
): FixtureSymbolShape {
  const frame = quarterStairFrame(w, h, rotationDeg, mirrorY)
  const { a, r, run } = frame
  const left = mirrorX ? a : -a
  const right = -left
  const nTreads = Math.max(8, Math.round(run / 24))
  const cutY = -r + run * 0.16
  const polylines: number[][] = [
    [left, -r, right, -r],
    [left, r, right, r],
    [left, -r, left, r],
    [right, -r, right, r],
  ]
  for (let i = 1; i < nTreads; i += 1) {
    const y = r - (i / nTreads) * (r - cutY)
    polylines.push([left, y, right, y])
  }
  return finishQuarterStair(
    frame,
    polylines,
    [[left, cutY, right, cutY]],
    [[left, -r, right, -r, right, r, left, r]],
    [0, r * 0.55, 0, -r * 0.22],
    Math.min(w, h) * 0.055,
  )
}

/**
 * Twee aangrenzende rechte trappen in één bbox.
 * Lokale X = loop; +Y-vlucht omhoog naar −X, −Y-vlucht omlaag naar +X.
 * Spiegel in de geometrie; Konva roteert. Poort6 203×217 rot=270 → links omhoog, rechts omlaag.
 */
function stairStraightDouble(
  w: number,
  h: number,
  mirrorX: boolean,
  _rotationDeg = 0,
  mirrorY = false,
): FixtureSymbolShape {
  const sx = mirrorX ? -1 : 1
  const sy = mirrorY ? -1 : 1
  const toBbox = (x: number, y: number): [number, number] => [sx * x, sy * y]
  const hw = w / 2
  const hh = h / 2
  const landing = w * 0.12
  const cutLen = Math.min(w * 0.16, hw * 0.4)
  const upCutX = -hw + cutLen
  const downCutX = hw - cutLen
  const nTreads = Math.max(6, Math.round((w - 2 * landing) / 24))
  const polylines: number[][] = [
    [-hw, -hh, hw, -hh],
    [hw, -hh, hw, hh],
    [hw, hh, -hw, hh],
    [-hw, hh, -hw, -hh],
    [-hw + landing, 0, hw - landing, 0],
  ]
  const treadLo = -hw + landing
  const treadHi = hw - landing
  for (let i = 1; i < nTreads; i += 1) {
    const x = treadHi - (i / nTreads) * (treadHi - treadLo)
    if (x > upCutX + 2) polylines.push([x, 0, x, hh])
    if (x < downCutX - 2) polylines.push([x, -hh, x, 0])
  }
  const head = Math.min(w, h) * 0.045
  const upM = mapPairs([hw * 0.32, hh * 0.5, -hw * 0.22, hh * 0.5], toBbox)
  const downM = mapPairs([-hw * 0.32, -hh * 0.5, hw * 0.22, -hh * 0.5], toBbox)
  return emptyShape({
    fillPolygons: [mapPairs([-hw, -hh, hw, -hh, hw, hh, -hw, hh], toBbox)],
    polylines: polylines.map((poly) => mapPairs(poly, toBbox)),
    dashPolylines: [
      mapPairs([upCutX, 0, upCutX, hh], toBbox),
      mapPairs([downCutX, -hh, downCutX, 0], toBbox),
    ],
    arrowPolylines: [
      upM,
      arrowHead(upM[0] ?? 0, upM[1] ?? 0, upM[2] ?? 0, upM[3] ?? 0, head),
      downM,
      arrowHead(downM[0] ?? 0, downM[1] ?? 0, downM[2] ?? 0, downM[3] ?? 0, head),
    ],
    stroke: STAIR_STROKE,
    fill: STAIR_FILL,
    strokeWidth: STAIR_STROKE_W,
    arrowStrokeWidth: STAIR_ARROW_W,
    overWalls: false,
  })
}

/** Trapgat zonder vlucht: dashed opening + kruis. */
function stairOpening(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  return emptyShape({
    rects: [[-hw, -hh, w, h]],
    polylines: [
      [-hw, -hh, hw, hh],
      [-hw, hh, hw, -hh],
    ],
    stroke: STAIR_STROKE,
    fill: 'transparent',
    dash: [6, 4],
    strokeWidth: STAIR_STROKE_W,
    overWalls: false,
  })
}

/** 6-punt vriessymbool (sneeuwvlok) in het midden van de koelkast. */
function freezerSnowflake(r: number): number[][] {
  const lines: number[][] = []
  const hook = r * 0.32
  const branchR = r * 0.58
  const branchA = 0.55
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3 - Math.PI / 2
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    lines.push([0, 0, x, y])
    const bx = Math.cos(a) * branchR
    const by = Math.sin(a) * branchR
    lines.push([
      bx + Math.cos(a + branchA) * hook,
      by + Math.sin(a + branchA) * hook,
      bx,
      by,
      bx + Math.cos(a - branchA) * hook,
      by + Math.sin(a - branchA) * hook,
    ])
  }
  return lines
}

function fridge(w: number, h: number): FixtureSymbolShape {
  const r = Math.min(w, h) * 0.28
  /** Deurzijde = lokale +Y (dubbele lijn). `rotation` / `mirrored` zetten die rand op de 3D-deur. */
  const gap = Math.min(w, h) * 0.08
  const y0 = h / 2
  const y1 = h / 2 - gap
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    polylines: [...freezerSnowflake(r), [-w / 2, y0, w / 2, y0], [-w / 2, y1, w / 2, y1]],
    stroke: STROKE,
    fill: FILL,
    overWalls: false,
  })
}

/** Hoge kast: alleen de dubbele deurlijn, zelfde zijde als koelkast (lokale +Y). */
function cabinetHigh(w: number, h: number): FixtureSymbolShape {
  const gap = Math.min(w, h) * 0.08
  const y0 = h / 2
  const y1 = h / 2 - gap
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    polylines: [
      [-w / 2, y0, w / 2, y0],
      [-w / 2, y1, w / 2, y1],
    ],
    stroke: STROKE,
    fill: FILL,
    overWalls: false,
  })
}

function kitchenSink(w: number, h: number): FixtureSymbolShape {
  const inset = Math.min(w, h) * 0.1
  const faucetSpace = Math.min(w, h) * 0.26
  const faucetR = Math.min(w, h) * 0.07
  const faucetY = -h / 2 + faucetSpace * 0.42
  const basinY = -h / 2 + faucetSpace
  const spoutLen = Math.min(w, h) * 0.12
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    circles: [[0, faucetY, faucetR]],
    polylines: [
      [
        -w / 2 + inset,
        h / 2 - inset,
        w / 2 - inset,
        h / 2 - inset,
        w / 2 - inset,
        basinY,
        -w / 2 + inset,
        basinY,
        -w / 2 + inset,
        h / 2 - inset,
      ],
      [0, faucetY + faucetR, 0, faucetY + faucetR + spoutLen],
    ],
    stroke: METAL_STROKE,
    fill: METAL_FILL,
    circleFill: METAL_FILL,
    overWalls: false,
  })
}

function toiletWallHung(w: number, h: number): FixtureSymbolShape {
  const backY = -h / 2
  const bowlRy = h * 0.47
  const bowlCy = backY + h * 0.06 + bowlRy
  return emptyShape({
    ellipses: [[0, bowlCy, w * 0.48, bowlRy]],
    polylines: [[-w * 0.38, backY, w * 0.38, backY]],
    overWalls: false,
  })
}

function glassWall(widthCm: number, heightCm: number): FixtureSymbolShape {
  const w = Math.max(0.8, widthCm)
  const h = Math.max(0.8, heightCm)
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    stroke: '#38bdf8',
    fill: '#e0f2fe',
    strokeWidth: 1.4,
    overWalls: true,
  })
}

function entranceArrow(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  // Punt langs lokale +X — Floorplanner-rotatie zet die as op de deurrichting.
  return emptyShape({
    fillPolygons: [[hw, 0, -hw, hh, -hw, -hh]],
    stroke: '#0f172a',
    fill: '#0f172a',
    overWalls: true,
  })
}

function northCross(w: number, h: number): FixtureSymbolShape {
  const hh = h / 2
  const headH = h * 0.26
  const headW = w * 0.7
  const apexY = -hh
  const baseY = -hh + headH
  const r = Math.min(w, h) * 0.2
  const cy = baseY + r * 1.08
  const shaftW = w * 0.12
  const shaftTop = cy + r * 0.92
  const shaftBot = hh * 0.92
  const nT = cy - r * 0.48
  const nB = cy + r * 0.48
  const nL = -r * 0.38
  const nR = r * 0.38
  return emptyShape({
    fillPolygons: [[0, apexY, headW / 2, baseY, -headW / 2, baseY]],
    rects: [[-shaftW / 2, shaftTop, shaftW, shaftBot - shaftTop]],
    circles: [[0, cy, r]],
    polylines: [
      [nL, nB, nL, nT],
      [nL, nT, nR, nB],
      [nR, nB, nR, nT],
    ],
    stroke: '#0f172a',
    fill: '#0f172a',
    circleFill: 'transparent',
    strokeWidth: 1.6,
    overWalls: true,
  })
}

function fuseBox(w: number, h: number): FixtureSymbolShape {
  const r = Math.min(w, h) * 0.28
  const switchY = -h / 2 + r * 0.15
  const span = w * 0.28
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    circles: [
      [-span, switchY, r],
      [0, switchY, r],
      [span, switchY, r],
    ],
    stroke: '#0f172a',
    fill: '#1e293b',
    circleFill: '#cbd5e1',
    cornerRadius: Math.min(w, h) * 0.18,
    overWalls: false,
  })
}

/** Top-view couvert: bord midden, vork links, mes rechts. */
function dishwasher(w: number, h: number): FixtureSymbolShape {
  const s = Math.min(w, h)
  const plateR = s * 0.2
  const tine = s * 0.038
  const tineTop = -s * 0.22
  const tineJoin = -s * 0.02
  const stemBot = s * 0.22
  const fx = -s * 0.34
  const kx = s * 0.34
  const bladeW = s * 0.028
  const handleW = s * 0.02
  const tipY = -s * 0.22
  const bolsterY = s * 0.02
  const endY = s * 0.22
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    circles: [
      [0, 0, plateR],
      [0, 0, plateR * 0.45],
    ],
    circleFill: 'transparent',
    polylines: [
      [fx - tine, tineTop, fx - tine, tineJoin],
      [fx, tineTop, fx, stemBot],
      [fx + tine, tineTop, fx + tine, tineJoin],
      [fx - tine, tineJoin, fx + tine, tineJoin],
      [
        kx,
        tipY,
        kx - bladeW,
        tipY + s * 0.07,
        kx - bladeW,
        bolsterY,
        kx - handleW,
        bolsterY,
        kx - handleW,
        endY,
        kx + handleW,
        endY,
        kx + handleW,
        bolsterY,
        kx + bladeW,
        bolsterY,
        kx + bladeW,
        tipY + s * 0.07,
        kx,
        tipY,
      ],
    ],
    fill: FILL,
    overWalls: false,
  })
}

/** ISO waskuip: trapezium (boven breder) + golvende waterlijn. */
function washTubPolylines(cx: number, cy: number, tw: number, th: number): number[][] {
  const topW = tw
  const botW = tw * 0.58
  const topY = cy - th * 0.38
  const botY = cy + th * 0.42
  const bucket = [
    cx - topW / 2,
    topY,
    cx + topW / 2,
    topY,
    cx + botW / 2,
    botY,
    cx - botW / 2,
    botY,
    cx - topW / 2,
    topY,
  ]
  const waveY = topY + th * 0.16
  const waveHalf = topW * 0.34
  const amp = th * 0.075
  const wave: number[] = []
  const n = 10
  for (let i = 0; i <= n; i += 1) {
    const t = i / n
    wave.push(cx - waveHalf + t * waveHalf * 2, waveY + Math.sin(t * Math.PI * 2) * amp)
  }
  return [bucket, wave]
}

function squareOutline(cx: number, cy: number, size: number): number[] {
  const h = size / 2
  return [cx - h, cy - h, cx + h, cy - h, cx + h, cy + h, cx - h, cy + h, cx - h, cy - h]
}

function washingMachine(w: number, h: number): FixtureSymbolShape {
  const s = Math.min(w, h)
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    polylines: washTubPolylines(0, 0, s * 0.62, s * 0.55),
    fill: FILL,
    overWalls: false,
  })
}

function dryer(w: number, h: number): FixtureSymbolShape {
  const s = Math.min(w, h)
  const inner = s * 0.52
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    polylines: [squareOutline(0, 0, inner)],
    circles: [[0, 0, inner * 0.28]],
    circleFill: 'transparent',
    fill: FILL,
    overWalls: false,
  })
}

/** Was-droog: kuip boven, droger (vierkant+cirkel) onder — zelfde ISO-iconen. */
function washerDryer(w: number, h: number): FixtureSymbolShape {
  const s = Math.min(w, h)
  const tubY = -h * 0.22
  const dryY = h * 0.2
  const inner = s * 0.34
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    polylines: [...washTubPolylines(0, tubY, s * 0.5, s * 0.32), squareOutline(0, dryY, inner)],
    circles: [[0, dryY, inner * 0.28]],
    circleFill: 'transparent',
    fill: FILL,
    overWalls: false,
  })
}

function stadiumPoly(
  cx: number,
  cy: number,
  halfStraight: number,
  r: number,
  samples = 12,
): number[] {
  const pts: number[] = []
  for (let i = 0; i <= samples; i += 1) {
    const a = -Math.PI / 2 + (i / samples) * Math.PI
    pts.push(cx + halfStraight + r * Math.cos(a), cy + r * Math.sin(a))
  }
  for (let i = 0; i <= samples; i += 1) {
    const a = Math.PI / 2 + (i / samples) * Math.PI
    pts.push(cx - halfStraight + r * Math.cos(a), cy + r * Math.sin(a))
  }
  pts.push(pts[0] ?? 0, pts[1] ?? 0)
  return pts
}

/**
 * Losstaand bad: stadium (rechte zijden + ronde koppen), kraan op lokale −Y
 * (FML rot 90 zet die zijde tegen de rechtermuur).
 */
function bathtub(w: number, h: number): FixtureSymbolShape {
  const faucetBand = Math.min(w, h) * 0.2
  const bodyH = h - faucetBand
  const r = bodyH / 2
  const halfStraight = Math.max(0, w / 2 - r)
  const cy = -h / 2 + faucetBand + r
  const innerScale = 0.72
  const innerR = r * innerScale
  const innerStraight = halfStraight * innerScale
  const faucetY = -h / 2 + faucetBand * 0.45
  const spoutR = Math.min(w, h) * 0.045
  const knobR = spoutR * 0.72
  const knobSpan = Math.min(w, h) * 0.09
  return emptyShape({
    fillPolygons: [stadiumPoly(0, cy, halfStraight, r)],
    polylines: [stadiumPoly(0, cy, halfStraight, r), stadiumPoly(0, cy, innerStraight, innerR)],
    circles: [
      [0, faucetY, spoutR],
      [-knobSpan, faucetY, knobR],
      [knobSpan, faucetY, knobR],
    ],
    fill: '#f8fafc',
    circleFill: 'transparent',
    overWalls: false,
  })
}

/**
 * Dubbele wastafel: blad + twee kommen. Wandzijde = lokale −Y
 * (FML rot 180 zet die rand op de muur onderin de badkamer).
 */
function sinkDouble(w: number, h: number): FixtureSymbolShape {
  const wallY = -h / 2
  const basinR = Math.min(w * 0.14, h * 0.32)
  const span = w * 0.22
  const basinY = h * 0.06
  const faucetR = Math.min(w, h) * 0.055
  const faucetY = wallY + faucetR * 1.35
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    circles: [
      [-span, basinY, basinR],
      [span, basinY, basinR],
      [-span, faucetY, faucetR],
      [span, faucetY, faucetR],
    ],
    fill: '#f1f5f9',
    circleFill: 'transparent',
    overWalls: false,
  })
}

function sinkVanity(w: number, h: number): FixtureSymbolShape {
  const wallY = -h / 2
  const roomY = h / 2
  const basinRx = w * 0.28
  const basinRy = h * 0.28
  const basinCy = roomY - basinRy - h * 0.06
  const faucetR = Math.min(w, h) * 0.07
  const faucetY = wallY + faucetR * 1.4
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    ellipses: [[0, basinCy, basinRx, basinRy]],
    circles: [[0, faucetY, faucetR]],
    fill: '#f8fafc',
    circleFill: 'transparent',
    stroke: '#334155',
    overWalls: false,
  })
}

function cooktop(w: number, h: number): FixtureSymbolShape {
  const rx = w * 0.22
  const ry = h * 0.22
  const r = Math.min(w, h) * 0.14
  const inner = r * 0.52
  const circles: number[][] = []
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      circles.push([sx * rx, sy * ry, r], [sx * rx, sy * ry, inner])
    }
  }
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    circles,
    stroke: METAL_STROKE,
    fill: METAL_FILL,
    circleFill: 'transparent',
    overWalls: false,
  })
}

function railing(w: number, h: number, stroke = '#0f172a', strokeWidth = 2.2): FixtureSymbolShape {
  const alongW = w >= h
  const along = alongW ? w : h
  const across = alongW ? h : w
  const n = Math.max(4, Math.round(along / 14))
  const polylines: number[][] = []
  for (let i = 1; i < n; i += 1) {
    const t = -along / 2 + (i / n) * along
    if (alongW) polylines.push([t, -across / 2, t, across / 2])
    else polylines.push([-across / 2, t, across / 2, t])
  }
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    polylines,
    stroke,
    fill: 'transparent',
    strokeWidth,
    overWalls: true,
  })
}

function koof(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  return emptyShape({
    rects: [[-hw, -hh, w, h]],
    polylines: [
      [-hw, -hh, hw, hh],
      [-hw, hh, hw, -hh],
    ],
    stroke: '#0f172a',
    fill: '#f8fafc',
    strokeWidth: 1.4,
    overWalls: true,
  })
}

function chimney(w: number, h: number): FixtureSymbolShape {
  const r = Math.min(w, h) * 0.22
  const arm = r * 0.72
  return emptyShape({
    rects: [[-w / 2, -h / 2, w, h]],
    circles: [[0, 0, r]],
    polylines: [
      [-arm, -arm, arm, arm],
      [-arm, arm, arm, -arm],
    ],
    stroke: '#0f172a',
    fill: '#f8fafc',
    circleFill: 'transparent',
    strokeWidth: 2.6,
    overWalls: true,
  })
}

/**
 * Dakkapel: U van muren, open naar de kamer (lokale −Y).
 * Buitenmuur op lokale +Y (FML rot/mirror zet die rand op de gevel) met 2 ramen.
 */
function dormer(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  const t = Math.min(Math.max(h * 0.36, 5.5), Math.min(12, h * 0.48))
  const innerLeft = -hw + t
  const innerRight = hw - t
  const innerSpan = Math.max(16, innerRight - innerLeft)
  const sideJamb = Math.min(3, Math.max(1.6, innerSpan * 0.015))
  const centerPier = Math.min(6, Math.max(3, innerSpan * 0.04))
  const winW = Math.max(4, (innerSpan - 2 * sideJamb - centerPier) / 2)
  const outerTop = hh - t
  const xWin0 = innerLeft + sideJamb
  const xPier1 = xWin0 + winW
  const xWin1 = xPier1 + centerPier
  const xPier2 = xWin1 + winW
  const glassY0 = outerTop + t * 0.32
  const glassY1 = outerTop + t * 0.68
  return emptyShape({
    rects: [
      [-hw, -hh, t, h],
      [hw - t, -hh, t, h],
      [innerLeft, outerTop, sideJamb, t],
      [xPier1, outerTop, centerPier, t],
      [xPier2, outerTop, sideJamb, t],
    ],
    polylines: [
      [xWin0, glassY0, xWin0 + winW, glassY0],
      [xWin0, glassY1, xWin0 + winW, glassY1],
      [xWin1, glassY0, xWin1 + winW, glassY0],
      [xWin1, glassY1, xWin1 + winW, glassY1],
    ],
    stroke: '#0f172a',
    fill: '#111827',
    strokeWidth: 0.9,
    overWalls: true,
  })
}

/**
 * Eenvoudige top-view symbolen voor FML-import (geen place-tool).
 * Coördinaten in cm, gecentreerd op (0,0); caller past rotatie/spiegeling toe.
 */
export function buildFixtureSymbol(
  kind: FixtureAssetKind,
  widthCm: number,
  heightCm: number,
  mirror: { x?: boolean; y?: boolean; rotation?: number } = {},
): FixtureSymbolShape {
  const w = Math.max(8, widthCm)
  const h = Math.max(8, heightCm)
  const overWalls = !isFurnitureKind(kind)

  switch (kind) {
    case 'countertop':
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        stroke: STROKE,
        fill: '#f8fafc',
        overWalls: false,
      })
    case 'fridge':
      return fridge(w, h)
    case 'cabinet_high':
      return cabinetHigh(w, h)
    case 'kitchen_sink':
      return kitchenSink(w, h)
    case 'cooktop':
      return cooktop(w, h)
    case 'dishwasher':
      return dishwasher(w, h)
    case 'washing_machine':
      return washingMachine(w, h)
    case 'dryer':
      return dryer(w, h)
    case 'washer_dryer':
      return washerDryer(w, h)
    case 'bathtub':
      return bathtub(w, h)
    case 'sink_double':
      return sinkDouble(w, h)
    case 'sink_vanity':
      return sinkVanity(w, h)
    case 'toilet_wall_hung':
      return toiletWallHung(w, h)
    case 'glass_wall':
      return glassWall(widthCm, heightCm)
    case 'entrance_arrow':
      return entranceArrow(w, h)
    case 'north_cross':
      return northCross(w, h)
    case 'fuse_box':
      return fuseBox(w, h)
    case 'toilet': {
      const tankH = h * 0.24
      const bowlRy = (h - tankH) / 2
      const bowlCy = -h / 2 + tankH + bowlRy
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, tankH]],
        ellipses: [[0, bowlCy, w * 0.48, bowlRy]],
        overWalls: false,
      })
    }
    case 'sink_small': {
      // Halve cirkel, platte kant op lokale −Y-bbox (muur). Kom tot +Y zodat er geen spleet is.
      const flatY = -h / 2
      const rx = w * 0.48
      const ry = h
      const faucetR = Math.min(w, h) * 0.08
      const points: number[] = [-rx, flatY]
      const samples = 16
      for (let i = 0; i <= samples; i += 1) {
        const a = (i / samples) * Math.PI
        points.push(rx * Math.cos(a), flatY + ry * Math.sin(a))
      }
      points.push(-rx, flatY)
      return emptyShape({
        circles: [[0, flatY + faucetR, faucetR]],
        polylines: [points],
        overWalls: false,
      })
    }
    case 'shower_head': {
      // Wandzijde = lokale +Y (bbox-rand). FML rot/mirror zet die rand op de muur;
      // muurfill dekt overlap, de steel komt visueel tot de binnenkant.
      const headR = Math.min(w, h) * 0.28
      const plateY = h / 2
      const headY = -h / 2 + headR * 1.1
      const plateHalf = w * 0.42
      return emptyShape({
        circles: [[0, headY, headR]],
        polylines: [
          [-plateHalf, plateY, plateHalf, plateY],
          [0, plateY, 0, headY + headR],
        ],
        overWalls: false,
      })
    }
    case 'sink_large': {
      // Volle bbox — geen inset, anders een spleet tot de muur (item-rand ligt al flush).
      const faucetR = Math.min(w, h) * 0.055
      const faucetY = h / 2 - Math.min(w, h) * 0.16
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        circles: [[0, faucetY, faucetR]],
        fill: '#f1f5f9',
        overWalls: false,
      })
    }
    case 'boiler': {
      const r = Math.min(w, h) * 0.12
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        circles: [
          [-w * 0.18, 0, r],
          [w * 0.18, 0, r],
        ],
        overWalls: true,
      })
    }
    case 'heat_pump': {
      const grillTop = -h * 0.42
      const grillBottom = -h * 0.05
      const lines: number[][] = []
      const n = 5
      for (let i = 0; i < n; i += 1) {
        const x = -w * 0.32 + (i / (n - 1)) * w * 0.64
        lines.push([x, grillTop, x, grillBottom])
      }
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        polylines: lines,
        overWalls: true,
      })
    }
    case 'stair_winder_180':
      return stairWinder180(w, h)
    case 'stair_quarter_90':
      return stairQuarter90GoingUp(w, h, Boolean(mirror.x), mirror.rotation ?? 0, Boolean(mirror.y))
    case 'stair_quarter_90_up':
      return stairQuarter90Arrival(w, h, Boolean(mirror.x), mirror.rotation ?? 0, Boolean(mirror.y))
    case 'stair_straight':
      return stairStraight(w, h, Boolean(mirror.x), mirror.rotation ?? 0, Boolean(mirror.y))
    case 'stair_straight_double':
      return stairStraightDouble(w, h, Boolean(mirror.x), mirror.rotation ?? 0, Boolean(mirror.y))
    case 'stair_opening':
      return stairOpening(w, h)
    case 'canopy':
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        stroke: '#475569',
        fill: '#94a3b8',
        dash: [5, 4],
        strokeWidth: 0.65,
        overWalls: true,
      })
    case 'chimney':
      return chimney(w, h)
    case 'koof':
      return koof(w, h)
    case 'railing':
      return railing(w, h)
    case 'balustrade':
      return railing(Math.max(0.8, widthCm), Math.max(0.8, heightCm), '#64748b', 0.95)
    case 'skylight':
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        stroke: '#60a5fa',
        fill: '#dbeafe',
        dash: [8, 5],
        strokeWidth: 1.6,
        overWalls: true,
      })
    case 'roof_eave':
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        stroke: '#94a3b8',
        fill: '#f8fafc',
        overWalls: false,
      })
    case 'dormer':
      return dormer(w, h)
    case 'hidden':
      return emptyShape({ overWalls: true })
    case 'oil_bottle': {
      const r = Math.min(w, h) / 2
      return emptyShape({
        circles: [
          [0, 0, r],
          [0, 0, r * 0.55],
        ],
        stroke: '#334155',
        fill: 'transparent',
        circleFill: 'transparent',
        strokeWidth: 1.25,
        overWalls: true,
      })
    }
    default:
      return emptyShape({
        rects: [[-w / 2, -h / 2, w, h]],
        overWalls,
      })
  }
}
