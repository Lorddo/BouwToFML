import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { FloorPlan } from '@/core/fml/types'
import { useFmlViewerSessionDefaults } from '@/ui/composables/fml-viewer/useFmlViewerSessionDefaults'

function planWithWall(): FloorPlan {
  return {
    name: 't',
    floors: [
      {
        name: 'bg',
        level: 0,
        height: 260,
        walls: [
          {
            id: 'w1',
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            thickness: 20,
            openings: [],
          },
        ],
      },
    ],
  }
}

describe('useFmlViewerSessionDefaults overwrite confirm', () => {
  it('past muurhoogte niet toe zonder bevestiging', async () => {
    const plan = ref<FloorPlan | null>(planWithWall())
    const { onFloorDefaultNumber, activeFloorDefaults, hydrateFloorDefaultsFromPlan } =
      useFmlViewerSessionDefaults({
        plan,
        activeFloorIndex: ref(0),
        t: (key) => key,
        confirmOverwrite: () => false,
      })
    hydrateFloorDefaultsFromPlan(plan.value)

    const input = { value: '300' }
    await onFloorDefaultNumber('wallHeightCm', { target: input } as unknown as Event)

    expect(activeFloorDefaults.value.wallHeightCm).toBe(260)
    expect(plan.value?.floors[0]?.height).toBe(260)
    expect(input.value).toBe('260')
  })

  it('overschrijft muurhoogte na bevestiging', async () => {
    const plan = ref<FloorPlan | null>(planWithWall())
    const { onFloorDefaultNumber, activeFloorDefaults, hydrateFloorDefaultsFromPlan } =
      useFmlViewerSessionDefaults({
        plan,
        activeFloorIndex: ref(0),
        t: (key) => key,
        confirmOverwrite: () => true,
      })
    hydrateFloorDefaultsFromPlan(plan.value)

    const input = { value: '300' }
    await onFloorDefaultNumber('wallHeightCm', { target: input } as unknown as Event)

    expect(activeFloorDefaults.value.wallHeightCm).toBe(300)
    expect(plan.value?.floors[0]?.height).toBe(300)
  })
})
