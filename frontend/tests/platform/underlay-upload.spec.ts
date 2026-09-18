import { describe, expect, it } from 'vitest'
import {
  resolveUnderlayLoadUrl,
  underlayKeyFromUrl,
} from '@/platform/underlay-upload'

const KEY =
  'v1/proj-mu5fohro-toftt3/floor-mu5fohrn-0ukb9b/bf1532a788e54cc97fecc1c9c50890384207fa9339df172e383ccba89e7d7b54.png'

describe('underlayKeyFromUrl / resolveUnderlayLoadUrl', () => {
  it('haalt de key uit de public r2.dev-URL', () => {
    expect(
      underlayKeyFromUrl(`https://pub-1888612f786c47edb7abe789be446963.r2.dev/${KEY}`),
    ).toBe(KEY)
  })

  it('haalt de key uit de worker-/u/-URL', () => {
    expect(
      underlayKeyFromUrl(`https://converter.palassoftwarestudio.workers.dev/u/${KEY}`),
    ).toBe(KEY)
  })

  it('laadt via same-origin /u/{key} (COEP)', () => {
    expect(
      resolveUnderlayLoadUrl(`https://pub-1888612f786c47edb7abe789be446963.r2.dev/${KEY}`),
    ).toBe(`/u/${KEY}`)
  })

  it('laat data-URL en willekeurige https met rust', () => {
    expect(resolveUnderlayLoadUrl('data:image/png;base64,xx')).toBe('data:image/png;base64,xx')
    expect(resolveUnderlayLoadUrl('https://example.com/scan.png')).toBe(
      'https://example.com/scan.png',
    )
  })
})
