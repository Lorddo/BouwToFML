import { afterEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { createEmptyFloorPlan } from '@/core/plan/empty-floor-plan'
import type { ElevationSkylight } from '@/core/plan/facade-elevation'
import type { FloorItem, FloorPlan } from '@/core/plan/types'
import { useElevationSkylightDrag } from '@/ui/composables/elevation/useElevationSkylightDrag'

type Listener = (event: PointerEvent) => void

const moveListeners = new Set<Listener>()
const upListeners = new Set<Listener>()

function shimWindow(): void {
  const g = globalThis as unknown as { window?: Window }
  g.window = {
    addEventListener(type: string, fn: EventListenerOrEventListenerObject) {
      const listener = fn as Listener
      if (type === 'pointermove') moveListeners.add(listener)
      if (type === 'pointerup') upListeners.add(listener)
    },
    removeEventListener(type: string, fn: EventListenerOrEventListenerObject) {
      const listener = fn as Listener
      if (type === 'pointermove') moveListeners.delete(listener)
      if (type === 'pointerup') upListeners.delete(listener)
    },
  } as Window
}

function resetListeners(): void {
  moveListeners.clear()
  upListeners.clear()
}

function fireMove(clientX: number, clientY: number): void {
  for (const fn of [...moveListeners]) {
    fn({ clientX, clientY } as PointerEvent)
  }
}

function skyItem(): FloorItem {
  return {
    id: 'sky-1',
    kind: 'skylight',
    x: 200,
    y: 200,
    width: 80,
    height: 80,
    rotation: 0,
    mirrored: [0, 0],
    roofSurfaceId: 'roof-s',
  }
}

function skyHit(): ElevationSkylight {
  return {
    id: 'sky-1',
    itemId: 'sky-1',
    floorIndex: 0,
    surfaceId: 'roof-s',
    points: [
      { x: 160, y: -300 },
      { x: 240, y: -300 },
      { x: 240, y: -220 },
      { x: 160, y: -220 },
    ],
    depthCm: 80,
    fill: '#dbeafe',
    stroke: '#60a5fa',
  }
}

afterEach(() => {
  resetListeners()
})

describe('useElevationSkylightDrag', () => {
  it('move voorbij 4px-drempel leest startCm niet van genullde pending', () => {
    shimWindow()
    const plan = createEmptyFloorPlan({ name: 'Sky', wallHeightCm: 280 })
    plan.floors[0].items = [skyItem()]
    const props = { plan, groupId: 'g1' }
    const drag = useElevationSkylightDrag({
      props,
      elevation: ref(null),
      clientToCm: (x, y) => ({ x, y }),
      snapGuide: ref(null),
      pushUndo: () => {},
      commitPlan: (next: FloorPlan) => {
        props.plan = next
      },
    })

    drag.beginSkylightDrag(skyHit(), 'move', { clientX: 10, clientY: 20 })
    expect(moveListeners.size).toBe(1)
    expect(() => fireMove(20, 20)).not.toThrow()
    drag.cleanup()
  })
})
