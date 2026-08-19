import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFmlV3 } from '@/core/fml/buildFmlV3'
import { switchFloorDesign } from '@/core/fml/design-sync'
import { importFmlV3 } from '@/core/fml/importFmlV3'
import { translateFloorPlan } from '@/core/fml/translate-floor-plan'
import type { FloorPlan } from '@/core/fml/types'

const KINDERDIJK = resolve(
  __dirname,
  '../../../examples/FML(current)/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam/Kinderdijkstraat 53 1, Amsterdam.json.fml',
)

describe('FML full roundtrip (envelope + annotations)', () => {
  it('Kinderdijkstraat: behoudt counts, project-id, drawing, az.h, item materials, label', () => {
    const raw = JSON.parse(readFileSync(KINDERDIJK, 'utf8'))
    const { plan } = importFmlV3(raw)
    const floor = plan.floors[0]
    expect(floor.areas?.length).toBe(12)
    expect(floor.surfaces?.length).toBe(1)
    expect(floor.dimensions?.length).toBe(19)
    expect(floor.labels?.length).toBe(2)
    expect(floor.lines?.length).toBe(4)
    expect(plan.source?.id).toBe(186515206)
    expect(plan.source?.features).toEqual(['sd', 'hd', 'pano'])
    expect(floor.drawing?.url).toContain('cloudfront.net')

    const wallWith266 = floor.walls.find((w) => {
      const az = w.extras?.az as { h?: number } | undefined
      return az?.h === 266
    })
    expect(wallWith266).toBeTruthy()

    const itemWithMaterials = floor.items?.find(
      (item) =>
        (item.extras?.materials as Record<string, number> | undefined)?.FINISH_FP_PLAIN_WHITE ===
        8627,
    )
    expect(itemWithMaterials).toBeTruthy()

    const heightLabel = floor.labels?.find((l) => l.text.includes('H=2.70m'))
    expect(heightLabel).toBeTruthy()

    const exported = JSON.parse(buildFmlV3(plan))
    expect(exported.id).toBe(186515206)
    expect(exported.features).toEqual(['sd', 'hd', 'pano'])
    expect(exported.floors[0].drawing.url).toContain('cloudfront.net')
    expect(exported.floors[0].designs[0].dimensions).toHaveLength(19)
    expect(exported.floors[0].designs[0].labels).toHaveLength(2)
    expect(exported.floors[0].designs[0].lines).toHaveLength(4)

    const reimported = importFmlV3(exported)
    expect(reimported.plan.floors[0].labels?.some((l) => l.text.includes('H=2.70m'))).toBe(true)
    const azAgain = reimported.plan.floors[0].walls.find((w) => {
      const az = w.extras?.az as { h?: number } | undefined
      return az?.h === 266
    })
    expect(azAgain).toBeTruthy()
  })

  it('twee designs: edit design 1 laat design 0 ongemoeid', () => {
    const plan: FloorPlan = {
      name: 'Two-designs',
      source: { id: 1 },
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [
            {
              id: 'w0',
              a: { x: 0, y: 0 },
              b: { x: 100, y: 0 },
              thickness: 10,
              openings: [],
            },
          ],
          labels: [
            {
              id: 'l0',
              x: 10,
              y: 10,
              text: 'Design0',
              fontFamily: 'arial',
              fontSize: 16,
              letterSpacing: 0,
              fontColor: '#000',
              backgroundColor: '#f4f8f4',
              align: 'left',
              rotation: 0,
            },
          ],
          designs: [
            {
              name: 'First',
              walls: [
                {
                  id: 'w0',
                  a: { x: 0, y: 0 },
                  b: { x: 100, y: 0 },
                  thickness: 10,
                  openings: [],
                },
              ],
              labels: [
                {
                  id: 'l0',
                  x: 10,
                  y: 10,
                  text: 'Design0',
                  fontFamily: 'arial',
                  fontSize: 16,
                  letterSpacing: 0,
                  fontColor: '#000',
                  backgroundColor: '#f4f8f4',
                  align: 'left',
                  rotation: 0,
                },
              ],
            },
            {
              name: 'Second',
              walls: [
                {
                  id: 'w1',
                  a: { x: 0, y: 0 },
                  b: { x: 50, y: 0 },
                  thickness: 10,
                  openings: [],
                },
              ],
              labels: [
                {
                  id: 'l1',
                  x: 20,
                  y: 20,
                  text: 'Design1',
                  fontFamily: 'arial',
                  fontSize: 16,
                  letterSpacing: 0,
                  fontColor: '#000',
                  backgroundColor: '#f4f8f4',
                  align: 'left',
                  rotation: 0,
                },
              ],
            },
          ],
          activeDesignIndex: 0,
        },
      ],
    }

    const switched = {
      ...plan,
      floors: [switchFloorDesign(plan.floors[0], 1)],
    }
    switched.floors[0].walls[0].b = { x: 999, y: 0 }
    switched.floors[0].labels = [
      {
        id: 'l1',
        x: 20,
        y: 20,
        text: 'Edited',
        fontFamily: 'arial',
        fontSize: 16,
        letterSpacing: 0,
        fontColor: '#000',
        backgroundColor: '#f4f8f4',
        align: 'left',
        rotation: 0,
      },
    ]

    const exported = JSON.parse(buildFmlV3(switched))
    expect(exported.floors[0].designs).toHaveLength(2)
    expect(exported.floors[0].designs[0].walls[0].b.x).toBe(100)
    expect(exported.floors[0].designs[0].labels[0].text).toBe('Design0')
    expect(exported.floors[0].designs[1].walls[0].b.x).toBe(999)
    expect(exported.floors[0].designs[1].labels[0].text).toBe('Edited')
  })

  it('nulpunt verschuift labels/lijnen/dimensions en inactive design', () => {
    const plan: FloorPlan = {
      name: 'Nulpunt',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [
            {
              id: 'w0',
              a: { x: 10, y: 10 },
              b: { x: 110, y: 10 },
              thickness: 10,
              openings: [],
            },
          ],
          labels: [
            {
              id: 'l0',
              x: 50,
              y: 50,
              text: 'A',
              fontFamily: 'arial',
              fontSize: 16,
              letterSpacing: 0,
              fontColor: '#000',
              backgroundColor: '#fff',
              align: 'left',
              rotation: 0,
            },
          ],
          lines: [
            {
              id: 'ln0',
              a: { x: 0, y: 0 },
              b: { x: 20, y: 0 },
              type: 'solid_line',
              color: 0,
              thickness: 2,
            },
          ],
          dimensions: [
            {
              id: 'd0',
              type: 'custom_dimension',
              a: { x: 0, y: 100 },
              b: { x: 40, y: 100 },
            },
          ],
          designs: [
            {
              name: 'Active',
              walls: [
                {
                  id: 'w0',
                  a: { x: 10, y: 10 },
                  b: { x: 110, y: 10 },
                  thickness: 10,
                  openings: [],
                },
              ],
              labels: [
                {
                  id: 'l0',
                  x: 50,
                  y: 50,
                  text: 'A',
                  fontFamily: 'arial',
                  fontSize: 16,
                  letterSpacing: 0,
                  fontColor: '#000',
                  backgroundColor: '#fff',
                  align: 'left',
                  rotation: 0,
                },
              ],
              lines: [
                {
                  id: 'ln0',
                  a: { x: 0, y: 0 },
                  b: { x: 20, y: 0 },
                  type: 'solid_line',
                  color: 0,
                  thickness: 2,
                },
              ],
              dimensions: [
                {
                  id: 'd0',
                  type: 'custom_dimension',
                  a: { x: 0, y: 100 },
                  b: { x: 40, y: 100 },
                },
              ],
            },
            {
              name: 'Other',
              walls: [
                {
                  id: 'w1',
                  a: { x: 200, y: 200 },
                  b: { x: 300, y: 200 },
                  thickness: 10,
                  openings: [],
                },
              ],
            },
          ],
          activeDesignIndex: 0,
        },
      ],
    }

    const moved = translateFloorPlan(plan, -10, -10, 0)
    expect(moved.floors[0].labels![0].x).toBe(40)
    expect(moved.floors[0].lines![0].a.x).toBe(-10)
    expect(moved.floors[0].dimensions![0].a.y).toBe(90)
    expect(moved.floors[0].designs![1].walls[0].a.x).toBe(190)
  })

  it('workspace-generate zonder source blijft hardcoded envelope', () => {
    const plan: FloorPlan = {
      name: 'Generated',
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [
            {
              id: 'w1',
              a: { x: 0, y: 0 },
              b: { x: 100, y: 0 },
              thickness: 10,
              balance: 0.5,
              openings: [],
            },
          ],
        },
      ],
    }
    const exported = JSON.parse(buildFmlV3(plan))
    expect(exported.id).toBe(900000001)
    expect(exported.features).toEqual([])
    expect(exported.floors[0].designs[0].labels).toEqual([])
    expect(exported.floors[0].designs[0].lines).toEqual([])
    expect(exported.floors[0].designs[0].dimensions).toEqual([])
    expect(exported.floors[0].drawing).toBeUndefined()
  })

  it('nieuwe label/lijn zit in export', () => {
    const plan: FloorPlan = {
      name: 'Annot',
      source: { id: 42 },
      floors: [
        {
          name: 'BG',
          level: 0,
          height: 280,
          walls: [],
          labels: [
            {
              id: 'new-l',
              x: 1,
              y: 2,
              text: 'Nieuw',
              fontFamily: 'arial',
              fontSize: 16,
              letterSpacing: 0,
              fontColor: '#000',
              backgroundColor: '#f4f8f4',
              align: 'left',
              rotation: 0,
            },
          ],
          lines: [
            {
              id: 'new-ln',
              a: { x: 0, y: 0 },
              b: { x: 5, y: 5 },
              type: 'solid_line',
              color: 0,
              thickness: 2,
            },
          ],
        },
      ],
    }
    const exported = JSON.parse(buildFmlV3(plan))
    expect(exported.floors[0].designs[0].labels[0].text).toBe('Nieuw')
    expect(exported.floors[0].designs[0].lines[0].thickness).toBe(2)
  })
})
