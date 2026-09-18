import type { FloorPlan } from '@/core/plan/types'

export const DEFAULT_UNDERLAY_PUBLIC_BASE =
  'https://pub-1888612f786c47edb7abe789be446963.r2.dev'

/** Same-origin Worker-pad (COEP). `drawing.url` blijft de public r2.dev-link. */
export const UNDERLAY_WORKER_READ_PREFIX = '/u/'

const KEY_RE = /^v1\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[a-f0-9]{64}\.png$/

export function underlayUploadUrl(): string {
  const explicit = import.meta.env.VITE_UNDERLAY_UPLOAD_URL
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim()
  return '/api/underlay'
}

export function underlayPublicBase(): string {
  const explicit = import.meta.env.VITE_UNDERLAY_PUBLIC_BASE
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim().replace(/\/$/, '')
  }
  return DEFAULT_UNDERLAY_PUBLIC_BASE
}

export function underlayObjectKey(projectId: string, floorId: string, sha256Hex: string): string {
  const safeProject = projectId.replace(/[^A-Za-z0-9._-]/g, '_') || 'project'
  const safeFloor = floorId.replace(/[^A-Za-z0-9._-]/g, '_') || 'floor'
  return `v1/${safeProject}/${safeFloor}/${sha256Hex}.png`
}

export function isUnderlayObjectKey(key: string): boolean {
  return KEY_RE.test(key)
}

/** Key uit r2.dev-, worker- of relatieve `/u/`-URL; anders null. */
export function underlayKeyFromUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return null
  try {
    const path = new URL(trimmed, 'https://local.invalid').pathname.replace(/^\/+/, '')
    const key = path.startsWith('u/') ? path.slice(2) : path
    return KEY_RE.test(key) ? key : null
  } catch {
    return null
  }
}

/** COEP: r2.dev-plaat laden via Worker `/u/{key}` (CORP + CORS). Overige src ongewijzigd. */
export function resolveUnderlayLoadUrl(src: string): string {
  const key = underlayKeyFromUrl(src)
  return key ? `${UNDERLAY_WORKER_READ_PREFIX}${key}` : src
}

export function isHttpsDrawingUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim())
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes.slice())
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function pngBytesFromUnderlaySrc(src: string | null | undefined): Uint8Array | null {
  if (!src?.startsWith('data:image/')) return null
  const comma = src.indexOf(',')
  if (comma < 0) return null
  const header = src.slice(0, comma)
  const payload = src.slice(comma + 1)
  try {
    const binary = header.includes(';base64') ? atob(payload) : decodeURIComponent(payload)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function uploadSrcForFloor(
  drawingUrl: string | undefined,
  plateSrc: string | null | undefined,
): string | null {
  const drawing = drawingUrl?.trim()
  if (drawing?.startsWith('data:image/')) return drawing
  const plate = plateSrc?.trim()
  if (plate?.startsWith('data:image/')) return plate
  return null
}

export async function uploadPlanUnderlayBytes(params: {
  bytes: Uint8Array
  projectId: string
  floorId: string
  token: string
}): Promise<string> {
  const digest = await sha256Hex(params.bytes)
  const key = underlayObjectKey(params.projectId, params.floorId, digest)
  const res = await fetch(underlayUploadUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'image/png',
      'X-Underlay-Token': params.token,
      'X-Underlay-Key': key,
    },
    body: params.bytes.slice(),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail.trim() || `upload ${res.status}`)
  }
  const json = (await res.json()) as { url?: string }
  if (!isHttpsDrawingUrl(json.url)) {
    throw new Error('upload response without https url')
  }
  return json.url!.trim()
}

export type EnsureUnderlaysUploadedResult = {
  plan: FloorPlan
  urls: Array<{ floorIndex: number; url: string }>
}

/**
 * Download-check: https op `drawing.url` laten staan; anders alsnog R2-upload
 * vanuit de data-URL of `plateSrcs` (bronplaat). Fout stopt de download niet.
 */
export async function ensurePlanUnderlaysUploaded(
  plan: FloorPlan,
  params: {
    projectId: string
    floorIds: string[]
    token: string
    /** Bronplaat per floor als drawing.url leeg of niet-https is. */
    plateSrcs?: Array<string | null | undefined>
  },
): Promise<EnsureUnderlaysUploadedResult> {
  const urls: Array<{ floorIndex: number; url: string }> = []
  const nextFloors = [...plan.floors]
  for (let floorIndex = 0; floorIndex < plan.floors.length; floorIndex++) {
    const floor = plan.floors[floorIndex]
    const drawing = floor.drawing
    if (!drawing) continue
    if (isHttpsDrawingUrl(drawing.url)) continue
    const src = uploadSrcForFloor(drawing.url, params.plateSrcs?.[floorIndex])
    const bytes = pngBytesFromUnderlaySrc(src)
    if (!bytes) continue
    const floorId = params.floorIds[floorIndex] ?? `floor-${floorIndex}`
    try {
      const url = await uploadPlanUnderlayBytes({
        bytes,
        projectId: params.projectId,
        floorId,
        token: params.token,
      })
      nextFloors[floorIndex] = { ...floor, drawing: { ...drawing, url } }
      urls.push({ floorIndex, url })
    } catch {
      // Bestand gaat door; writePlg / buildFmlV3 laten data-URL weg.
    }
  }
  return { plan: { ...plan, floors: nextFloors }, urls }
}
