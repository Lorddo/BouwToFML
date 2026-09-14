import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { BOVENLICHT_GAP_CM, BOVENLICHT_HEIGHT_CM } from '@/core/fml/bovenlicht'
import {
  resolveBovenlichtDefaults,
  watchBovenlichtDefaults,
} from '@/ui/composables/plan-canvas/plan-canvas-session-defaults'

describe('resolveBovenlichtDefaults', () => {
  it('valt zonder sessie terug op de catalogusmaten', () => {
    const defaults = resolveBovenlichtDefaults({})
    expect(defaults.value).toEqual({
      doorDefault: false,
      windowDefault: false,
      heightCm: BOVENLICHT_HEIGHT_CM,
      gapCm: BOVENLICHT_GAP_CM,
    })
  })

  it('volgt de sessie live', () => {
    const bovenlichtDefault = ref(false)
    const defaults = resolveBovenlichtDefaults({ bovenlichtDefault, bovenlichtHeightCm: ref(42) })
    expect(defaults.value.heightCm).toBe(42)
    bovenlichtDefault.value = true
    expect(defaults.value.doorDefault).toBe(true)
  })
})

describe('watchBovenlichtDefaults', () => {
  it('trekt de geselecteerde opening mee bij elk van de vier defaults', async () => {
    const session = {
      bovenlichtDefault: ref(false),
      windowBovenlichtDefault: ref(false),
      bovenlichtHeightCm: ref(30),
      bovenlichtGapCm: ref(2),
    }
    let syncs = 0
    watchBovenlichtDefaults(session, () => {
      syncs += 1
    })

    session.bovenlichtDefault.value = true
    session.windowBovenlichtDefault.value = true
    session.bovenlichtHeightCm.value = 40
    session.bovenlichtGapCm.value = 3
    await nextTick()
    expect(syncs).toBe(4)
  })

  it('laat `bovenlichtPacked` met rust — dat is weergave, geen waarde in de draft', async () => {
    const bovenlichtPacked = ref(true)
    let syncs = 0
    watchBovenlichtDefaults({ bovenlichtPacked }, () => {
      syncs += 1
    })

    bovenlichtPacked.value = false
    await nextTick()
    expect(syncs).toBe(0)
  })
})
