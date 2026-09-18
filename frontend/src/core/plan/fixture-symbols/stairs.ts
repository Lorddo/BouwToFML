import {
  emptyShape,
  STAIR_ARROW_W,
  STAIR_FILL,
  STAIR_STROKE,
  STAIR_STROKE_W,
  type FixtureSymbolShape,
} from './types'

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

export function stairWinder180(w: number, h: number): FixtureSymbolShape {
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

/**
 * U-trap met tussenbordes. rot=0: start linksonder, 7 treden omhoog,
 * bordes over de volle breedte, 7 treden naar rechtsonder.
 */
export function stairULanding(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  const landing = h * 0.3
  const landY = -hh + landing
  const nTreads = 7
  const polylines: number[][] = [
    [-hw, -hh, hw, -hh],
    [hw, -hh, hw, hh],
    [hw, hh, -hw, hh],
    [-hw, hh, -hw, -hh],
    [-hw, landY, hw, landY],
    [0, landY, 0, hh],
  ]
  for (let i = 1; i < nTreads; i += 1) {
    const y = landY + (i / nTreads) * (hh - landY)
    polylines.push([-hw, y, 0, y], [0, y, hw, y])
  }
  const leftX = -hw * 0.5
  const rightX = hw * 0.5
  const yBot = hh * 0.72
  const yTop = landY + (hh - landY) * 0.12
  const head = Math.min(w, h) * 0.055
  return emptyShape({
    fillPolygons: [[-hw, -hh, hw, -hh, hw, hh, -hw, hh]],
    polylines,
    arrowPolylines: [
      [leftX, yBot, leftX, yTop, rightX, yTop, rightX, yBot],
      arrowHead(rightX, yTop, rightX, yBot, head),
    ],
    stroke: STAIR_STROKE,
    fill: STAIR_FILL,
    strokeWidth: STAIR_STROKE_W,
    arrowStrokeWidth: STAIR_ARROW_W,
    overWalls: false,
  })
}

/**
 * L-trap. rot=0: start rechtsonder (90°-winder), 8 rechte treden, pijl naar −Y (boven).
 * Spil = binnenhoek rechtsonder; bestaande `stair_quarter_90` (Ostade/Anna) blijft apart.
 */
export function stairL90(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  const pivotX = hw * 0.28
  const pivotY = hh * 0.28
  const minX = -hw
  const maxX = hw
  const minY = -hh
  const maxY = hh
  const polylines: number[][] = [
    [minX, minY, maxX, minY],
    [maxX, minY, maxX, maxY],
    [maxX, maxY, minX, maxY],
    [minX, maxY, minX, minY],
    [pivotX, pivotY, pivotX, maxY],
    [pivotX, pivotY, maxX, pivotY],
  ]
  const nStraight = 8
  for (let i = 1; i <= nStraight; i += 1) {
    const y = minY + (i / (nStraight + 1)) * (pivotY - minY)
    polylines.push([minX, y, maxX, y])
  }
  const nWinder = 5
  const a0 = 0.08
  const a1 = Math.PI / 2 - 0.08
  for (let i = 1; i < nWinder; i += 1) {
    const ang = a0 + (i / nWinder) * (a1 - a0)
    const outer = rayToRect(pivotX, pivotY, ang, minX, maxX, minY, maxY)
    polylines.push([pivotX, pivotY, outer.x, outer.y])
  }
  const tipY = minY + h * 0.06
  const tailY = minY + h * 0.2
  const head = Math.min(w, h) * 0.055
  return emptyShape({
    fillPolygons: [[minX, minY, maxX, minY, maxX, maxY, minX, maxY]],
    polylines,
    arrowPolylines: [[0, tailY, 0, tipY], arrowHead(0, tailY, 0, tipY, head)],
    stroke: STAIR_STROKE,
    fill: STAIR_FILL,
    strokeWidth: STAIR_STROKE_W,
    arrowStrokeWidth: STAIR_ARROW_W,
    overWalls: false,
  })
}

/**
 * L-trap opkomst. rot=0: 8 rechte treden vanaf onder, 90°-winder naar rechtsboven.
 * Spil op de rechterrand; pijl naar +X. Niet `stair_quarter_90_up` (Ostade/Anna).
 */
export function stairL90Up(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  const wellL = 0
  const pivotX = hw
  const pivotY = -hh * 0.28
  const minX = -hw
  const maxX = hw
  const minY = -hh
  const maxY = hh
  const polylines: number[][] = [
    [minX, minY, maxX, minY],
    [maxX, minY, maxX, maxY],
    [maxX, maxY, minX, maxY],
    [minX, maxY, minX, minY],
    [wellL, pivotY, wellL, maxY],
    [wellL, pivotY, pivotX, pivotY],
  ]
  const nStraight = 8
  for (let i = 1; i <= nStraight; i += 1) {
    const y = pivotY + (i / (nStraight + 1)) * (maxY - pivotY)
    polylines.push([minX, y, maxX, y])
  }
  const nWinder = 5
  const a0 = -Math.PI * 0.82
  const a1 = -0.04
  for (let i = 1; i < nWinder; i += 1) {
    const ang = a0 + (i / nWinder) * (a1 - a0)
    const outer = rayToRect(pivotX, pivotY, ang, minX, maxX, minY, maxY)
    polylines.push([pivotX, pivotY, outer.x, outer.y])
  }
  const tailX = wellL + w * 0.12
  const tipX = hw * 0.82
  const head = Math.min(w, h) * 0.055
  return emptyShape({
    fillPolygons: [[minX, minY, maxX, minY, maxX, maxY, minX, maxY]],
    polylines,
    arrowPolylines: [
      [tailX, pivotY, tipX, pivotY],
      arrowHead(tailX, pivotY, tipX, pivotY, head),
    ],
    stroke: STAIR_STROKE,
    fill: STAIR_FILL,
    strokeWidth: STAIR_STROKE_W,
    arrowStrokeWidth: STAIR_ARROW_W,
    overWalls: false,
  })
}

/**
 * C-trap. rot=0: start rechtsonder, 90°-winder, 3 rechte treden, 90°-winder, uit rechtsboven.
 * Put rechts (open C); pijl langs de bovenkant naar +X.
 */
export function stairC90(w: number, h: number): FixtureSymbolShape {
  const hw = w / 2
  const hh = h / 2
  const wellL = -hw * 0.06
  const wellR = hw * 0.4
  const wellT = -hh * 0.34
  const wellB = hh * 0.34
  const minX = -hw
  const maxX = hw
  const minY = -hh
  const maxY = hh
  const polylines: number[][] = [
    [minX, minY, maxX, minY],
    [maxX, minY, maxX, maxY],
    [maxX, maxY, minX, maxY],
    [minX, maxY, minX, minY],
    [wellL, wellT, wellL, wellB],
    [wellL, wellT, wellR, wellT],
    [wellL, wellB, wellR, wellB],
  ]
  const nStraight = 3
  for (let i = 1; i <= nStraight; i += 1) {
    const y = wellT + (i / (nStraight + 1)) * (wellB - wellT)
    polylines.push([minX, y, maxX, y])
  }
  const nWinder = 8
  const botA0 = Math.PI * 0.92
  const botA1 = Math.PI * 0.16
  for (let i = 1; i < nWinder; i += 1) {
    const ang = botA0 + (i / nWinder) * (botA1 - botA0)
    const outer = rayToRect(wellR, wellB, ang, minX, maxX, minY, maxY)
    polylines.push([wellR, wellB, outer.x, outer.y])
  }
  const topA0 = Math.PI * 0.92
  const topA1 = -0.02
  for (let i = 1; i < nWinder; i += 1) {
    const ang = topA0 + (i / nWinder) * (topA1 - topA0)
    const outer = rayToRect(wellR, wellT, ang, minX, maxX, minY, maxY)
    polylines.push([wellR, wellT, outer.x, outer.y])
  }
  const tipX = hw * 0.92
  const head = Math.min(w, h) * 0.055
  return emptyShape({
    fillPolygons: [[minX, minY, maxX, minY, maxX, maxY, minX, maxY]],
    polylines,
    arrowPolylines: [[wellR, wellT, tipX, wellT], arrowHead(wellR, wellT, tipX, wellT, head)],
    stroke: STAIR_STROKE,
    fill: STAIR_FILL,
    strokeWidth: STAIR_STROKE_W,
    arrowStrokeWidth: STAIR_ARROW_W,
    overWalls: false,
  })
}

/**
 * Ronde ¾-spiltrap. rot=0: open linksboven (12→9 uur).
 * Loop 9 uur → 6 uur → 12 uur (klok tegen).
 */
export function stairWinder270(w: number, h: number): FixtureSymbolShape {
  const r = Math.min(w, h) / 2
  const aStart = Math.PI
  const aEnd = -Math.PI / 2
  const sweep = aEnd - aStart
  const nTreads = Math.max(10, Math.round((1.5 * Math.PI * r) / 25))
  const samples = 36
  const pie: number[] = [0, 0]
  const arc: number[] = []
  for (let i = 0; i <= samples; i += 1) {
    const a = aStart + (i / samples) * sweep
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    pie.push(x, y)
    arc.push(x, y)
  }
  pie.push(0, 0)
  const polylines: number[][] = [
    arc,
    [0, 0, Math.cos(aStart) * r, Math.sin(aStart) * r],
    [0, 0, Math.cos(aEnd) * r, Math.sin(aEnd) * r],
  ]
  for (let i = 1; i < nTreads; i += 1) {
    const a = aStart + (i / nTreads) * sweep
    polylines.push([0, 0, Math.cos(a) * r, Math.sin(a) * r])
  }
  const aArrow0 = aStart + sweep * 0.06
  const aArrow1 = aStart + sweep * 0.94
  const arrowR = r * 0.58
  const arrowN = 24
  const shaft: number[] = []
  for (let i = 0; i <= arrowN; i += 1) {
    const a = aArrow0 + (i / arrowN) * (aArrow1 - aArrow0)
    shaft.push(Math.cos(a) * arrowR, Math.sin(a) * arrowR)
  }
  const tipX = Math.cos(aArrow1) * arrowR
  const tipY = Math.sin(aArrow1) * arrowR
  const tangX = Math.sin(aArrow1)
  const tangY = -Math.cos(aArrow1)
  const fromX = tipX - tangX
  const fromY = tipY - tangY
  return emptyShape({
    fillPolygons: [pie],
    polylines,
    arrowPolylines: [shaft, arrowHead(fromX, fromY, tipX, tipY, r * 0.08)],
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
export function stairQuarter90GoingUp(
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
export function stairQuarter90Arrival(
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
export function stairStraight(
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
  const nTreads = Math.max(4, Math.round(run / 25))
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
export function stairStraightDouble(
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

/**
 * Rolstoelhelling. rot=0: pijl van +X naar −X (rechts → links).
 */
export function wheelchairRamp(w: number, h: number): FixtureSymbolShape {
  const tailX = (w / 2) * 0.55
  const tipX = -(w / 2) * 0.55
  const head = Math.min(w, h) * 0.08
  return emptyShape({
    arrowPolylines: [
      [tailX, 0, tipX, 0],
      arrowHead(tailX, 0, tipX, 0, head),
    ],
    stroke: STAIR_STROKE,
    fill: 'transparent',
    strokeWidth: STAIR_STROKE_W,
    arrowStrokeWidth: STAIR_ARROW_W,
    overWalls: false,
  })
}

function hatchCrossLines(w: number, h: number): number[][] {
  const hw = w / 2
  const hh = h / 2
  return [
    [-hw, -hh, hw, -hh],
    [hw, -hh, hw, hh],
    [hw, hh, -hw, hh],
    [-hw, hh, -hw, -hh],
    [-hw, -hh, hw, hh],
    [-hw, hh, hw, -hh],
  ]
}

/** Vlizotrap: kader + kruis, dichte lijnen. */
export function stairLoft(w: number, h: number): FixtureSymbolShape {
  return emptyShape({
    polylines: hatchCrossLines(w, h),
    stroke: STAIR_STROKE,
    fill: 'transparent',
    strokeWidth: STAIR_STROKE_W,
    overWalls: false,
  })
}

/** Vlizotrap (catalogus 26): zelfde kruis, stippellijn. */
export function stairLoftDashed(w: number, h: number): FixtureSymbolShape {
  return emptyShape({
    dashPolylines: hatchCrossLines(w, h),
    stroke: STAIR_STROKE,
    fill: 'transparent',
    dash: [6, 4],
    strokeWidth: STAIR_STROKE_W,
    overWalls: false,
  })
}

/** Trapgat zonder vlucht: dashed kader + kruis. */
export function stairOpening(w: number, h: number): FixtureSymbolShape {
  return stairLoftDashed(w, h)
}
