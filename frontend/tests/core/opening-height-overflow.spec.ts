import { describe, expect, it } from 'vitest'
import {
  findOpeningHeightOverflows,
  summarizeOpeningHeightOverflows,
} from '@/core/fml/opening-height-overflow'
import type { Floor, Opening, Wall } from '@/core/fml/types'

const wall = (openings: Opening[]): Wall => ({
  id: 'w1',
  a: { x: 0, y: 0 },
  b: { x: 400, y: 0 },
  thickness: 20,
  openings,
})

const floorOf = (height: number, openings: Opening[]): Pick<Floor, 'height' | 'walls'> => ({
  height,
  walls: [wall(openings)],
})

const door = (overrides: Partial<Opening> = {}): Opening => ({
  refid: 'door',
  t: 0.5,
  width: 90,
  type: 'door',
  z: 0,
  z_height: 220,
  guid: 'd1',
  ...overrides,
})

const windowOpening = (overrides: Partial<Opening> = {}): Opening => ({
  refid: 'win',
  t: 0.5,
  width: 120,
  type: 'window',
  z: 70,
  z_height: 150,
  guid: 'w1',
  ...overrides,
})

describe('findOpeningHeightOverflows', () => {
  it('meldt deuren boven een te lage muur zonder az/bz (fallback floor.height)', () => {
    const hits = findOpeningHeightOverflows(floorOf(55, [door(), door({ guid: 'd2' })]))
    expect(hits).toHaveLength(2)
    expect(hits.every((hit) => hit.kind === 'door' && hit.side === 'above')).toBe(true)
    expect(summarizeOpeningHeightOverflows(hits)).toMatchObject({
      doors: 2,
      windows: 0,
      bovenlichten: 0,
      below: 0,
      floorHeightCm: 55,
      maxTopCm: 220,
    })
  })

  it('negeert floor.height als de muur zelf 330 cm is (Poort6 trapmuur)', () => {
    const tall = wall([door({ z_height: 220, bovenlicht: true })])
    tall.extras = { az: { z: 0, h: 330 }, bz: { z: 0, h: 330 } }
    expect(
      findOpeningHeightOverflows({ height: 55, walls: [tall] }, { doorBovenlichtDefault: true }),
    ).toEqual([])
  })

  it('meldt deur onder de muurbodem', () => {
    const w = wall([door({ z: -20, z_height: 220 })])
    w.extras = { az: { z: 0, h: 330 }, bz: { z: 0, h: 330 } }
    const hits = findOpeningHeightOverflows({ height: 55, walls: [w] })
    expect(hits).toMatchObject([{ kind: 'door', side: 'below', topCm: -20, floorHeightCm: 0 }])
  })

  it('negeert openingen die onder het plafond blijven', () => {
    expect(findOpeningHeightOverflows(floorOf(255, [door({ z_height: 205 })]))).toEqual([])
  })

  it('telt gevraagd bovenlicht dat niet onder het plafond past', () => {
    const hits = findOpeningHeightOverflows(
      floorOf(255, [door({ z_height: 220, bovenlicht: true })]),
    )
    expect(hits.map((hit) => hit.kind)).toEqual(['bovenlicht'])
    expect(hits[0]?.topCm).toBe(270)
  })

  it('telt deur én bovenlicht als de deur zelf al boven de muur uitkomt', () => {
    const hits = findOpeningHeightOverflows(floorOf(55, [door({ bovenlicht: true })]))
    expect(hits.map((hit) => hit.kind).sort()).toEqual(['bovenlicht', 'door'])
  })

  it('telt ramen boven de muur', () => {
    const hits = findOpeningHeightOverflows(floorOf(200, [windowOpening({ z: 70, z_height: 150 })]))
    expect(hits).toHaveLength(1)
    expect(hits[0]?.kind).toBe('window')
    expect(hits[0]?.topCm).toBe(220)
  })
})
