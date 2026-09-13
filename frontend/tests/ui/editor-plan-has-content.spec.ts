import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@/core/fml/types'
import { editorPlanHasContent } from '@/ui/composables/editor/useEditorLoad'

function emptyPlan(): FloorPlan {
  return {
    name: 'Leeg',
    floors: [{ name: 'Begane grond', level: 0, height: 260, walls: [] }],
  }
}

describe('editorPlanHasContent', () => {
  it('is false voor null en een leeg nieuw plan', () => {
    expect(editorPlanHasContent(null)).toBe(false)
    expect(editorPlanHasContent(emptyPlan())).toBe(false)
  })

  it('is true zodra er een muur, kamer of object op een floor staat', () => {
    const withWall: FloorPlan = {
      ...emptyPlan(),
      floors: [
        {
          name: 'Begane grond',
          level: 0,
          height: 260,
          walls: [{ id: 'w0', a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, thickness: 20, openings: [] }],
        },
      ],
    }
    expect(editorPlanHasContent(withWall)).toBe(true)

    const withArea: FloorPlan = {
      ...emptyPlan(),
      floors: [
        {
          name: 'Begane grond',
          level: 0,
          height: 260,
          walls: [],
          areas: [{ id: 'a0', poly: [], color: '#fff', showAreaLabel: false }],
        },
      ],
    }
    expect(editorPlanHasContent(withArea)).toBe(true)
  })
})
