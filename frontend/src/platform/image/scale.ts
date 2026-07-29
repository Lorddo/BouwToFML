export interface Point2 {
  x: number
  y: number
}

export interface Segment2 {
  a: Point2
  b: Point2
}

export interface WallGraph2<Node extends { id: string; x: number; y: number }, Edge extends {
  a: string
  b: string
  segment: Segment2
}> {
  nodes: Node[]
  edges: Edge[]
}

export interface Box2 {
  x: number
  y: number
  width: number
  height: number
}

export function scaleSegmentsToOriginal<T extends Segment2>(segments: T[], scale: number): T[] {
  if (scale >= 1) return segments
  const inv = 1 / scale
  return segments.map((s) => ({
    ...s,
    a: { x: s.a.x * inv, y: s.a.y * inv },
    b: { x: s.b.x * inv, y: s.b.y * inv },
  }))
}

export function scaleBoxesToWork(boxes: Box2[], scale: number): Box2[] {
  if (scale >= 1) return boxes
  return boxes.map((b) => ({
    x: b.x * scale,
    y: b.y * scale,
    width: b.width * scale,
    height: b.height * scale,
  }))
}

export function scaleBoxesToOriginal(boxes: Box2[], scale: number): Box2[] {
  if (scale >= 1) return boxes
  const inv = 1 / scale
  return boxes.map((b) => ({
    x: b.x * inv,
    y: b.y * inv,
    width: b.width * inv,
    height: b.height * inv,
  }))
}

export function scaleWallGraphToOriginal<
  Node extends { id: string; x: number; y: number },
  Edge extends { a: string; b: string; segment: Segment2 },
>(graph: WallGraph2<Node, Edge>, scale: number): WallGraph2<Node, Edge> {
  if (scale >= 1) return graph
  const inv = 1 / scale
  const nodes = graph.nodes.map((node) => ({
    ...node,
    x: node.x * inv,
    y: node.y * inv,
  }))
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const edges = graph.edges.map((edge) => {
    const aNode = nodeById.get(edge.a)
    const bNode = nodeById.get(edge.b)
    return {
      ...edge,
      segment: {
        ...edge.segment,
        a: aNode ? { x: aNode.x, y: aNode.y } : { x: edge.segment.a.x * inv, y: edge.segment.a.y * inv },
        b: bNode ? { x: bNode.x, y: bNode.y } : { x: edge.segment.b.x * inv, y: edge.segment.b.y * inv },
      },
    }
  })
  return { nodes, edges }
}
