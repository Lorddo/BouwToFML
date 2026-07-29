import lineIntersect from '@turf/line-intersect'
import RBush from 'rbush'
import type { Segment } from './wallGraph'

export type WallJunctionKind = 'L' | 'T' | 'X' | 'I'

export interface WallNode {
  id: string
  x: number
  y: number
  kind: WallJunctionKind
  /** Afwijking van recht door (0° = collinear, 90° = rechte hoek). */
  angleDeg: number
}

export interface WallEdge {
  id: string
  a: string
  b: string
  segment: Segment
}

export interface WallGraph {
  nodes: WallNode[]
  edges: WallEdge[]
}

type PointItem = { minX: number; minY: number; maxX: number; maxY: number; index: number }

function pointKey(x: number, y: number): string {
  return `${Math.round(x * 10) / 10}:${Math.round(y * 10) / 10}`
}

function makeLine(seg: Segment) {
  return {
    type: 'LineString' as const,
    coordinates: [
      [seg.a.x, seg.a.y],
      [seg.b.x, seg.b.y],
    ],
  }
}

function collectIntersectionPoints(segments: Segment[], snapRadiusPx: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i]
      const b = segments[j]
      const intersects = lineIntersect(makeLine(a), makeLine(b), { removeDuplicates: true })
      for (const feature of intersects.features) {
        const [x, y] = feature.geometry.coordinates
        if (
          Math.hypot(x - a.a.x, y - a.a.y) <= snapRadiusPx ||
          Math.hypot(x - a.b.x, y - a.b.y) <= snapRadiusPx ||
          Math.hypot(x - b.a.x, y - b.a.y) <= snapRadiusPx ||
          Math.hypot(x - b.b.x, y - b.b.y) <= snapRadiusPx
        ) {
          points.push({ x, y })
        }
      }
    }
  }
  return points
}

function clusterPoints(points: Array<{ x: number; y: number }>, snapRadiusPx: number): Array<{ x: number; y: number }> {
  if (points.length === 0) return []
  const tree = new RBush<PointItem>()
  const clusters: Array<{ x: number; y: number; points: Array<{ x: number; y: number }> }> = []
  for (const point of points) {
    const nearby = tree.search({
      minX: point.x - snapRadiusPx,
      minY: point.y - snapRadiusPx,
      maxX: point.x + snapRadiusPx,
      maxY: point.y + snapRadiusPx,
    })
    let chosen: number | null = null
    for (const item of nearby) {
      const cluster = clusters[item.index]
      const d = Math.hypot(cluster.x - point.x, cluster.y - point.y)
      if (d <= snapRadiusPx) {
        chosen = item.index
        break
      }
    }
    if (chosen == null) {
      const index = clusters.length
      clusters.push({ x: point.x, y: point.y, points: [point] })
      tree.insert({ minX: point.x, minY: point.y, maxX: point.x, maxY: point.y, index })
    } else {
      const cluster = clusters[chosen]
      cluster.points.push(point)
      const n = cluster.points.length
      cluster.x = (cluster.x * (n - 1) + point.x) / n
      cluster.y = (cluster.y * (n - 1) + point.y) / n
    }
  }
  return clusters.map((cluster) => ({ x: cluster.x, y: cluster.y }))
}

type Vec2 = { x: number; y: number }

export function directionsAtNode(nodeId: string, edges: WallEdge[], nodes: WallNode[]): Vec2[] {
  const node = nodes.find((n) => n.id === nodeId)
  if (!node) return []
  const dirs: Vec2[] = []
  for (const edge of edges) {
    if (edge.a !== nodeId && edge.b !== nodeId) continue
    const otherId = edge.a === nodeId ? edge.b : edge.a
    const other = nodes.find((n) => n.id === otherId)
    if (!other) continue
    const dx = other.x - node.x
    const dy = other.y - node.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    dirs.push({ x: dx / len, y: dy / len })
  }
  return dirs
}

function angleBetweenDegrees(a: Vec2, b: Vec2): number {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))
  return (Math.acos(dot) * 180) / Math.PI
}

/** Grootste draaihoek tussen takken: 0° = doorlopend recht, 90° = rechte hoek. */
export function computeJunctionTurnAngleDeg(directions: Vec2[]): number {
  if (directions.length < 2) return 0
  let maxTurn = 0
  for (let i = 0; i < directions.length; i += 1) {
    for (let j = i + 1; j < directions.length; j += 1) {
      const between = angleBetweenDegrees(directions[i], directions[j])
      const turn = 180 - between
      if (turn > maxTurn) maxTurn = turn
    }
  }
  return Math.round(maxTurn * 10) / 10
}

function throughPairForT(directions: Vec2[]): { i: number; j: number; betweenDeg: number } | null {
  if (directions.length < 3) return null
  let best: { i: number; j: number; betweenDeg: number } | null = null
  for (let i = 0; i < directions.length; i += 1) {
    for (let j = i + 1; j < directions.length; j += 1) {
      const betweenDeg = angleBetweenDegrees(directions[i], directions[j])
      if (!best || betweenDeg > best.betweenDeg) {
        best = { i, j, betweenDeg }
      }
    }
  }
  return best
}

function axisAngleDeg(direction: Vec2): number {
  const raw = (Math.atan2(direction.y, direction.x) * 180) / Math.PI
  const normalized = ((raw % 180) + 180) % 180
  return normalized
}

export function computeJunctionAnglesDeg(kind: WallJunctionKind, directions: Vec2[]): number[] {
  if (kind === 'I') return []
  if (kind === 'L') return [computeJunctionTurnAngleDeg(directions)]

  if (kind === 'T') {
    const pair = throughPairForT(directions)
    if (!pair) return []
    const throughDeviation = Math.abs(180 - pair.betweenDeg)
    const branchIndex = directions.findIndex((_, index) => index !== pair.i && index !== pair.j)
    if (branchIndex < 0) return [0, throughDeviation]
    const branch = directions[branchIndex]
    const branchToA = angleBetweenDegrees(branch, directions[pair.i])
    const branchToB = angleBetweenDegrees(branch, directions[pair.j])
    const branchAngle = Math.min(branchToA, branchToB)
    return [Math.round(branchAngle * 10) / 10, Math.round(throughDeviation * 10) / 10]
  }

  if (kind === 'X') {
    if (directions.length < 4) return []
    const angles = directions.map(axisAngleDeg).sort((a, b) => a - b)
    const axisA = angles[0]
    const axisB = angles[Math.floor(angles.length / 2)]
    let between = Math.abs(axisA - axisB)
    if (between > 90) between = 180 - between
    const rounded = Math.round(between * 10) / 10
    return [rounded, rounded]
  }

  return []
}

function nearestNodeId(
  p: { x: number; y: number },
  nodes: WallNode[],
  maxDistance: number,
): string | null {
  let best: WallNode | null = null
  let bestD = maxDistance
  for (const node of nodes) {
    const d = Math.hypot(node.x - p.x, node.y - p.y)
    if (d <= bestD) {
      bestD = d
      best = node
    }
  }
  return best?.id ?? null
}

/** Bij snap=0: alleen float-tolerantie endpoint→node, géén snap-clustering. */
const WELDED_GRAPH_NODE_MATCH_EPS_PX = 1e-6

function resolveEndpointNodeMatchPx(snapRadiusPx: number): number {
  return snapRadiusPx > 0 ? snapRadiusPx : WELDED_GRAPH_NODE_MATCH_EPS_PX
}

/**
 * Snelle endpoint→node lookup voor de exact-modus (snapRadiusPx <= 0, match-eps 1e-6):
 * cel-hash op integer-coördinaat + 3×3 buurcellen, daarna dezelfde `d <= bestD` argmin
 * (incl. tie-break op node-volgorde) als `nearestNodeId`. Byte-identiek, maar O(1) i.p.v. O(n).
 */
function buildExactNodeLookup(
  nodes: WallNode[],
): (p: { x: number; y: number }) => string | null {
  const cellMap = new Map<string, Array<{ node: WallNode; index: number }>>()
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]!
    const key = `${Math.floor(n.x)},${Math.floor(n.y)}`
    const bucket = cellMap.get(key)
    if (bucket) bucket.push({ node: n, index: i })
    else cellMap.set(key, [{ node: n, index: i }])
  }
  const eps = WELDED_GRAPH_NODE_MATCH_EPS_PX
  return (p) => {
    const cx = Math.floor(p.x)
    const cy = Math.floor(p.y)
    const candidates: Array<{ node: WallNode; index: number }> = []
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = cellMap.get(`${cx + dx},${cy + dy}`)
        if (bucket) candidates.push(...bucket)
      }
    }
    if (candidates.length === 0) return null
    candidates.sort((a, b) => a.index - b.index)
    let best: WallNode | null = null
    let bestD = eps
    for (const candidate of candidates) {
      const d = Math.hypot(candidate.node.x - p.x, candidate.node.y - p.y)
      if (d <= bestD) {
        bestD = d
        best = candidate.node
      }
    }
    return best?.id ?? null
  }
}

export function buildJunctionGraph(segments: Segment[], snapRadiusPx: number): WallGraph {
  const basePoints = segments.flatMap((seg) => [seg.a, seg.b])
  const intersectionPoints =
    snapRadiusPx > 0 ? collectIntersectionPoints(segments, snapRadiusPx) : []
  const clustered = clusterPoints([...basePoints, ...intersectionPoints], snapRadiusPx)
  const nodeMatchPx = resolveEndpointNodeMatchPx(snapRadiusPx)
  const nodes: WallNode[] = clustered.map((point, index) => ({
    id: `n${index}`,
    x: point.x,
    y: point.y,
    kind: 'I',
    angleDeg: 0,
  }))

  const nodeById = new Map<string, WallNode>()
  for (const node of nodes) nodeById.set(node.id, node)
  const exactLookup = snapRadiusPx > 0 ? null : buildExactNodeLookup(nodes)
  const lookupNodeId = (p: { x: number; y: number }): string | null =>
    exactLookup ? exactLookup(p) : nearestNodeId(p, nodes, nodeMatchPx)

  const edges: WallEdge[] = []
  const degree = new Map<string, number>()
  const adjacency = new Map<string, Vec2[]>()
  const pushDirection = (nodeId: string, dx: number, dy: number): void => {
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) return
    const dir = { x: dx / len, y: dy / len }
    const arr = adjacency.get(nodeId)
    if (arr) arr.push(dir)
    else adjacency.set(nodeId, [dir])
  }

  for (const seg of segments) {
    const aId = lookupNodeId(seg.a)
    const bId = lookupNodeId(seg.b)
    if (!aId || !bId || aId === bId) continue
    const aNode = nodeById.get(aId)!
    const bNode = nodeById.get(bId)!
    edges.push({
      id: `e${edges.length}`,
      a: aId,
      b: bId,
      segment: {
        ...seg,
        a: { ...aNode },
        b: { ...bNode },
      },
    })
    degree.set(aId, (degree.get(aId) ?? 0) + 1)
    degree.set(bId, (degree.get(bId) ?? 0) + 1)
    pushDirection(aId, bNode.x - aNode.x, bNode.y - aNode.y)
    pushDirection(bId, aNode.x - bNode.x, aNode.y - bNode.y)
  }

  for (const node of nodes) {
    const deg = degree.get(node.id) ?? 0
    node.kind = deg >= 4 ? 'X' : deg === 3 ? 'T' : deg === 2 ? 'L' : 'I'
    node.angleDeg = computeJunctionTurnAngleDeg(adjacency.get(node.id) ?? [])
  }

  const connectedNodes = nodes.filter((node) => (degree.get(node.id) ?? 0) > 0)
  return { nodes: connectedNodes, edges }
}

export function graphToSegments(graph: WallGraph): Segment[] {
  const seen = new Set<string>()
  const segments: Segment[] = []
  for (const edge of graph.edges) {
    const key = `${pointKey(edge.segment.a.x, edge.segment.a.y)}-${pointKey(edge.segment.b.x, edge.segment.b.y)}-${edge.segment.templateIndex ?? -1}`
    const reverseKey = `${pointKey(edge.segment.b.x, edge.segment.b.y)}-${pointKey(edge.segment.a.x, edge.segment.a.y)}-${edge.segment.templateIndex ?? -1}`
    if (seen.has(key) || seen.has(reverseKey)) continue
    seen.add(key)
    segments.push(edge.segment)
  }
  return segments
}
