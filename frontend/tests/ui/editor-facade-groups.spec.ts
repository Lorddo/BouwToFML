import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import {
  assignWallsToGroup,
  createFacadeGroup,
  ensureStampFacadeGroup,
  groupIdsForWall,
  STAMP_FACADE_GROUP_ID,
} from '@/core/plan/facade-groups'
import type { FloorPlan } from '@/core/plan/types'
import { useEditorFacadeGroups } from '@/ui/composables/editor/useEditorFacadeGroups'
import type { InspectHit } from '@/ui/composables/plan-canvas/plan-inspect'

function planWithTwoWalls(): FloorPlan {
  return {
    name: 't',
    floors: [
      {
        name: 'bg',
        level: 0,
        height: 260,
        walls: [
          { id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, thickness: 20, openings: [] },
          { id: 'w2', a: { x: 400, y: 0 }, b: { x: 400, y: 400 }, thickness: 20, openings: [] },
        ],
      },
    ],
  }
}

function wallHit(id = 'w1'): InspectHit {
  return { kind: 'wall', id, floorIndex: 0 }
}

function setup(options: { hit?: InspectHit | null } = {}) {
  const plan = ref<FloorPlan | null>(planWithTwoWalls())
  const lastInspectHit = ref<InspectHit | null>(options.hit ?? wallHit())
  const api = useEditorFacadeGroups({ plan, lastInspectHit })
  return { plan, lastInspectHit, ...api }
}

/** Nabootsing van het `<select>` dat de sidebar doorgeeft. */
function selectEvent(value: string) {
  const target = { value }
  return { event: { target } as unknown as Event, target }
}

describe('useEditorFacadeGroups', () => {
  it('splitst groepen in lid en toe-te-voegen', () => {
    const { plan, memberFacadeGroups, addableFacadeGroups } = setup()
    const voor = createFacadeGroup(plan.value!, { name: 'Voor' })
    createFacadeGroup(plan.value!, { name: 'Achter' })
    assignWallsToGroup(plan.value!, voor.id, ['w1'])
    plan.value = { ...plan.value! }

    expect(memberFacadeGroups.value.map((g) => g.name)).toEqual(['Voor'])
    expect(addableFacadeGroups.value.map((g) => g.name)).toEqual(['Achter'])
  })

  it('laat de stempel-groep buiten de lijsten', () => {
    const { plan, memberFacadeGroups, addableFacadeGroups } = setup()
    ensureStampFacadeGroup(plan.value!)
    assignWallsToGroup(plan.value!, STAMP_FACADE_GROUP_ID, ['w1'])
    plan.value = { ...plan.value! }

    expect(memberFacadeGroups.value).toEqual([])
    expect(addableFacadeGroups.value).toEqual([])
  })

  it('zonder muur-hit is niets lid; toevoegbaar blijft de hele catalogus', () => {
    const { plan, memberFacadeGroups, addableFacadeGroups } = setup({
      hit: { kind: 'area', id: 'a1', floorIndex: 0 },
    })
    createFacadeGroup(plan.value!, { name: 'Voor' })
    plan.value = { ...plan.value! }

    expect(memberFacadeGroups.value).toEqual([])
    expect(addableFacadeGroups.value.map((g) => g.name)).toEqual(['Voor'])
  })

  it('kiezen van een groep maakt de muur lid en leegt de dropdown', async () => {
    const { plan, onFacadeChange } = setup()
    const voor = createFacadeGroup(plan.value!, { name: 'Voor' })
    plan.value = { ...plan.value! }

    const { event, target } = selectEvent(voor.id)
    await onFacadeChange(event)

    expect(groupIdsForWall(plan.value!, 'w1')).toContain(voor.id)
    expect(target.value).toBe('')
  })

  it('een lege keuze doet niets', async () => {
    const { plan, onFacadeChange } = setup()
    const voor = createFacadeGroup(plan.value!, { name: 'Voor' })
    plan.value = { ...plan.value! }

    await onFacadeChange(selectEvent('').event)

    expect(groupIdsForWall(plan.value!, 'w1')).not.toContain(voor.id)
  })

  it('verwijderen haalt de muur uit de groep', async () => {
    const { plan, onFacadeRemove } = setup()
    const voor = createFacadeGroup(plan.value!, { name: 'Voor' })
    assignWallsToGroup(plan.value!, voor.id, ['w1'])
    plan.value = { ...plan.value! }

    await onFacadeRemove(voor.id)

    expect(groupIdsForWall(plan.value!, 'w1')).not.toContain(voor.id)
  })

  it('leden selecteren zet de hele groep op de hit', () => {
    const { plan, lastInspectHit, onFacadeSelectMembers } = setup()
    const voor = createFacadeGroup(plan.value!, { name: 'Voor' })
    assignWallsToGroup(plan.value!, voor.id, ['w1', 'w2'])
    plan.value = { ...plan.value! }

    onFacadeSelectMembers(voor.id)

    expect(lastInspectHit.value?.ids).toEqual(['w1', 'w2'])
  })

  it('bij precies één groep breidt toekennen de selectie uit naar de groep', async () => {
    const { plan, lastInspectHit, onFacadeChange } = setup()
    const voor = createFacadeGroup(plan.value!, { name: 'Voor' })
    assignWallsToGroup(plan.value!, voor.id, ['w2'])
    plan.value = { ...plan.value! }

    await onFacadeChange(selectEvent(voor.id).event)

    expect(lastInspectHit.value?.ids).toHaveLength(2)
    expect(lastInspectHit.value?.ids).toContain('w1')
    expect(lastInspectHit.value?.ids).toContain('w2')
  })

  it('bij twee groepen blijft de selectie op de aangeklikte muur', async () => {
    const { plan, lastInspectHit, onFacadeChange } = setup()
    const voor = createFacadeGroup(plan.value!, { name: 'Voor' })
    const achter = createFacadeGroup(plan.value!, { name: 'Achter' })
    assignWallsToGroup(plan.value!, voor.id, ['w1'])
    plan.value = { ...plan.value! }

    await onFacadeChange(selectEvent(achter.id).event)

    expect(groupIdsForWall(plan.value!, 'w1')).toHaveLength(2)
    expect(lastInspectHit.value?.ids).toBeUndefined()
  })
})
