import type { extractComponentsFromLabelsData } from '@/cv/walls/rooms/room-raster'

/** Same sanitize regex as `sanitizeFilename` in workspace-fml-generate; custom fallbacks. */
function sanitizeWithFallback(raw: string, fallback: string): string {
  return raw.replace(/[^\w.\- ()]/g, '_').trim() || fallback
}

export function underlayDownloadFilename(
  imageName: string | null | undefined,
  suffix = 'onderlegger',
): string {
  const raw = imageName?.replace(/\.[^.]+$/i, '') ?? 'onderlegger'
  const safe = sanitizeWithFallback(raw, 'onderlegger')
  return `${safe}-${suffix}.png`
}

export function exportBasename(imageName: string | null | undefined, fallback: string): string {
  const raw = imageName?.replace(/\.[^.]+$/i, '') ?? fallback
  return sanitizeWithFallback(raw, fallback)
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}

export function countIntersectingRootsInRect(params: {
  components: ReturnType<typeof extractComponentsFromLabelsData>
  parentMap: Map<number, number>
  rect: { x: number; y: number; width: number; height: number }
}): number {
  const roots = new Set<number>()
  for (const component of params.components) {
    if (!rectsOverlap(component.bbox, params.rect)) continue
    roots.add(params.parentMap.get(component.label) ?? component.label)
  }
  return roots.size
}
