import { describe, expect, it } from 'vitest'
import {
  isFaceIdSignatureSubset,
  signatureForFaceIdSet,
} from '@/ui/composables/workspace/window-faces-helpers'

describe('isFaceIdSignatureSubset', () => {
  it('treats empty as subset of any signature', () => {
    expect(isFaceIdSignatureSubset('', '1,2,3')).toBe(true)
    expect(isFaceIdSignatureSubset('', '')).toBe(true)
  })

  it('accepts equal and proper subsets', () => {
    expect(isFaceIdSignatureSubset('1,2', '1,2')).toBe(true)
    expect(isFaceIdSignatureSubset('1,3', '1,2,3')).toBe(true)
    expect(isFaceIdSignatureSubset('2', '1,2,3')).toBe(true)
  })

  it('rejects additions or unrelated ids', () => {
    expect(isFaceIdSignatureSubset('1,4', '1,2,3')).toBe(false)
    expect(isFaceIdSignatureSubset('1,2,3', '1,2')).toBe(false)
    expect(isFaceIdSignatureSubset('9', '')).toBe(false)
  })

  it('matches signatureForFaceIdSet formatting', () => {
    const before = signatureForFaceIdSet(new Set([3, 1, 2]))
    const after = signatureForFaceIdSet(new Set([1, 3]))
    expect(isFaceIdSignatureSubset(after, before)).toBe(true)
  })
})
