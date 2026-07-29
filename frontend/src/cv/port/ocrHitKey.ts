import type { OcrTextCandidate } from '@/core/extraction'

/** Stabiele sleutel voor handmatige uitsluiting (bbox + tekst). */
export function ocrHitKey(
  hit: Pick<OcrTextCandidate, 'text' | 'x' | 'y' | 'width' | 'height'>,
): string {
  return [
    hit.text.trim().toLowerCase(),
    Math.round(hit.x),
    Math.round(hit.y),
    Math.round(hit.width),
    Math.round(hit.height),
  ].join('|')
}
