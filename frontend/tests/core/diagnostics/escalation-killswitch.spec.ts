import { afterEach, describe, expect, it } from 'vitest'
import {
  clearEscalationOff,
  getEscalationOff,
  isEscalationEnabled,
  setEscalationOff,
} from '@/core/diagnostics'

describe('escalation-killswitch', () => {
  afterEach(() => {
    clearEscalationOff()
    delete process.env.ESC_OFF
  })

  it('default: alles aan', () => {
    expect(isEscalationEnabled('D-52')).toBe(true)
    expect(getEscalationOff().size).toBe(0)
  })

  it('setEscalationOff schakelt specifieke ID uit', () => {
    setEscalationOff(['D-52', 'D-51'])
    expect(isEscalationEnabled('D-52')).toBe(false)
    expect(isEscalationEnabled('D-51')).toBe(false)
    expect(isEscalationEnabled('D-44')).toBe(true)
  })

  it('ESC_OFF env (komma-gescheiden)', () => {
    process.env.ESC_OFF = 'R-26, W-07'
    expect(isEscalationEnabled('R-26')).toBe(false)
    expect(isEscalationEnabled('W-07')).toBe(false)
    expect(isEscalationEnabled('W-14')).toBe(true)
  })

  it('override wint van env', () => {
    process.env.ESC_OFF = 'D-52'
    setEscalationOff(['D-45'])
    expect(isEscalationEnabled('D-52')).toBe(true)
    expect(isEscalationEnabled('D-45')).toBe(false)
  })
})
