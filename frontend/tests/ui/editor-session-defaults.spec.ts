import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { FloorPlan } from '@/core/plan/types'
import { seedMissingFloorDefaults } from '@/core/plan/floor-defaults'
import { useEditorSessionDefaults } from '@/ui/composables/editor/useEditorSessionDefaults'
import type { DefaultsApplyScope } from '@/core/plan/floor-defaults'

const pickScope = vi.fn<(...args: unknown[]) => Promise<DefaultsApplyScope | null>>()

vi.mock('@/ui/composables/plan-chrome-dialog', () => ({
  promptDefaultsApplyScope: (...args: unknown[]) => pickScope(...args),
}))

function planWithDoor(): FloorPlan {
  return seedMissingFloorDefaults({
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
            openings: [
              {
                id: 'd1',
                kind: 'door.single',
                type: 'door',
                t: 0.5,
                width: 90,
                z_height: 210,
              },
            ],
          },
        ],
      },
    ],
  })
}

describe('useEditorSessionDefaults apply-scope', () => {
  beforeEach(() => {
    pickScope.mockReset()
  })

  it('annuleren laat default en instances staan', async () => {
    const plan = ref<FloorPlan | null>(planWithDoor())
    const { onFloorDefaultCm, activeFloorDefaults } = useEditorSessionDefaults({
      plan,
      activeFloorIndex: ref(0),
      t: (key) => key,
    })
    pickScope.mockResolvedValueOnce(null)

    await onFloorDefaultCm('doorHeightCm', 240)

    expect(activeFloorDefaults.value.doorHeightCm).toBe(210)
    expect(plan.value?.floors[0]?.walls[0]?.openings[0]?.z_height).toBe(210)
  })

  it('Alleen nieuwe zet default, niet de bestaande deur', async () => {
    const plan = ref<FloorPlan | null>(planWithDoor())
    const { onFloorDefaultCm, activeFloorDefaults } = useEditorSessionDefaults({
      plan,
      activeFloorIndex: ref(0),
      t: (key) => key,
    })
    pickScope.mockResolvedValueOnce('defaultsOnly')

    await onFloorDefaultCm('doorHeightCm', 240)

    expect(activeFloorDefaults.value.doorHeightCm).toBe(240)
    expect(plan.value?.floors[0]?.walls[0]?.openings[0]?.z_height).toBe(210)
  })

  it('Verdieping overschrijft bestaande deuren', async () => {
    const plan = ref<FloorPlan | null>(planWithDoor())
    const { onFloorDefaultCm } = useEditorSessionDefaults({
      plan,
      activeFloorIndex: ref(0),
      t: (key) => key,
    })
    pickScope.mockResolvedValueOnce('floor')

    await onFloorDefaultCm('doorHeightCm', 240)

    expect(plan.value?.floors[0]?.walls[0]?.openings[0]?.z_height).toBe(240)
  })
})
