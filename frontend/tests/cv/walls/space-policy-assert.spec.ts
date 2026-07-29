import { describe, expect, it } from 'vitest'
import { assertSpacePolicy } from '@/cv/walls/rooms/space-policy-assert'

describe('assertSpacePolicy', () => {
  it('passes when actual === expected', () => {
    expect(() => assertSpacePolicy('test', 'ink', 'ink')).not.toThrow()
    expect(() => assertSpacePolicy('test', 'white', 'white')).not.toThrow()
    expect(() => assertSpacePolicy('test', 'either', 'either')).not.toThrow()
  })

  it('throws with shared message shape when mismatch', () => {
    expect(() => assertSpacePolicy('door overlay', 'white', 'ink')).toThrow(
      'door overlay: unsupported policy "white" (verwacht "ink")',
    )
  })
})
