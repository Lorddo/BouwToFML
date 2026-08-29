import { describe, expect, it } from 'vitest'
import { hitSelectedVertex, pointInPoly } from '@/core/fml/vertex-hit'

const quad = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 80 },
  { x: 0, y: 80 },
]

describe('hitSelectedVertex', () => {
  it('mist buiten de handle-straal — geen nearest over het vlak', () => {
    expect(hitSelectedVertex(quad, { x: 50, y: 40 }, 12)).toBeNull()
  })

  it('pakt het handle dat de klik bevat', () => {
    expect(hitSelectedVertex(quad, { x: 2, y: 1 }, 12)).toBe(0)
    expect(hitSelectedVertex(quad, { x: 98, y: 79 }, 12)).toBe(2)
  })

  it('geselecteerd punt wint bij overlap, ook als een buur dichterbij is', () => {
    const close = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
    ]
    const click = { x: 5, y: 0 }
    expect(hitSelectedVertex(close, click, 12)).toBe(1)
    expect(hitSelectedVertex(close, click, 12, 0)).toBe(0)
  })

  it('kiest een ander handle als de klik buiten het geselecteerde valt', () => {
    expect(hitSelectedVertex(quad, { x: 100, y: 0 }, 12, 0)).toBe(1)
  })
})

describe('pointInPoly', () => {
  it('binnen / buiten een quad', () => {
    expect(pointInPoly({ x: 50, y: 40 }, quad)).toBe(true)
    expect(pointInPoly({ x: -1, y: 40 }, quad)).toBe(false)
  })
})
