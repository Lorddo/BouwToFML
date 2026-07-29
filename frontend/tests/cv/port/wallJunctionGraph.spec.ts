import { describe, expect, it } from 'vitest'
import { buildJunctionGraph, computeJunctionTurnAngleDeg } from '@/cv/port/wallJunctionGraph'
import type { Segment } from '@/cv/port/wallGraph'

describe('computeJunctionTurnAngleDeg', () => {
  it('geeft 0° voor één richting (eindpunt)', () => {
    expect(computeJunctionTurnAngleDeg([{ x: 1, y: 0 }])).toBe(0)
  })

  it('geeft ~0° voor collineaire takken', () => {
    const turn = computeJunctionTurnAngleDeg([
      { x: 1, y: 0 },
      { x: -1, y: 0 },
    ])
    expect(turn).toBeLessThan(1)
  })

  it('geeft ~90° voor rechte hoek', () => {
    const turn = computeJunctionTurnAngleDeg([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ])
    expect(turn).toBeGreaterThanOrEqual(89)
    expect(turn).toBeLessThanOrEqual(91)
  })
})

describe('buildJunctionGraph', () => {
  it('labelt eindpunten als I met angleDeg 0', () => {
    const segments: Segment[] = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }]
    const graph = buildJunctionGraph(segments, 2)
    const endpoints = graph.nodes.filter((n) => n.kind === 'I')
    expect(endpoints).toHaveLength(2)
    expect(endpoints.every((n) => n.angleDeg === 0)).toBe(true)
  })

  it('meet ~90° op L-hoek', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 0, y: 10 } },
      { a: { x: 0, y: 10 }, b: { x: 10, y: 10 } },
    ]
    const graph = buildJunctionGraph(segments, 2)
    const corner = graph.nodes.find((n) => n.kind === 'L')
    expect(corner?.angleDeg).toBeGreaterThanOrEqual(85)
  })

  it('slaat losse snijpunt-clusters zonder segment zonder degree 0 I', () => {
    const segments: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 40, y: 0 } },
      { a: { x: 20, y: -20 }, b: { x: 20, y: 20 } },
    ]
    const graph = buildJunctionGraph(segments, 2)
    expect(
      graph.nodes.every((node) => graph.edges.some((e) => e.a === node.id || e.b === node.id)),
    ).toBe(true)
    expect(graph.nodes.filter((n) => n.kind === 'I')).toHaveLength(4)
  })
})
