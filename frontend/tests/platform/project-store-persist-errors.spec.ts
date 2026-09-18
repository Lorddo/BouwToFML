import { describe, expect, it } from 'vitest'
import {
  isPersistSizeError,
  isQuotaExceeded,
  persistErrorMessage,
} from '@/platform/project-store/persist-errors'

describe('persist-errors', () => {
  it('herkent QuotaExceeded én «too large» / DataClone als persist-size', () => {
    expect(isQuotaExceeded({ name: 'QuotaExceededError' })).toBe(true)
    expect(isPersistSizeError({ name: 'QuotaExceededError' })).toBe(true)
    expect(isPersistSizeError({ name: 'DataCloneError', message: 'could not be cloned' })).toBe(
      true,
    )
    expect(isPersistSizeError(new DOMException('The serialized value is too large'))).toBe(true)
    expect(isPersistSizeError({ name: 'UnknownError', message: 'UnknownError' })).toBe(true)
    expect(isQuotaExceeded({ name: 'DataCloneError', message: 'could not be cloned' })).toBe(false)
    expect(isPersistSizeError(new Error('network down'))).toBe(false)
  })

  it('leest een bruikbare persistErrorMessage', () => {
    expect(persistErrorMessage(new Error('boom'))).toBe('boom')
    expect(persistErrorMessage({ name: 'DataCloneError' })).toBe('DataCloneError')
    expect(persistErrorMessage(null)).toBe('')
  })
})
