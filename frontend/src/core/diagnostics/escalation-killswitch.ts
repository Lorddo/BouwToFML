/**
 * Kill-switch per ESC-ID — instrument voor aanpak §4 vraag 3:
 * "verandert de uitkomst als het pad uit staat?"
 *
 * Gevoed uit `ESC_OFF` (komma-gescheiden ID's). Default: alles aan.
 * Alleen geplaatst bij kandidaten die we beoordelen — niet bij alle 228.
 *
 * Browser: `setEscalationOff([...])` of `import.meta.env.VITE_ESC_OFF`.
 * Node/E2E: `process.env.ESC_OFF`.
 */
import type { EscalationId } from './escalation-ids.generated'
import { ESCALATION_IDS } from './escalation-ids.generated'

const ID_SET = new Set<string>(ESCALATION_IDS)

let overrideOff: Set<EscalationId> | null = null

function parseOffList(raw: string | undefined | null): Set<EscalationId> {
  const out = new Set<EscalationId>()
  if (!raw) return out
  for (const part of raw.split(/[,\s]+/)) {
    const id = part.trim()
    if (!id) continue
    if (ID_SET.has(id)) out.add(id as EscalationId)
  }
  return out
}

function readEnvOff(): Set<EscalationId> {
  let fromProcess: string | undefined
  if (typeof process !== 'undefined' && process.env) {
    fromProcess = process.env.ESC_OFF
  }
  let fromVite: string | undefined
  try {
    // Vite injecteert import.meta.env; buiten Vite is dit undefined.
    const env = (import.meta as { env?: Record<string, string | undefined> }).env
    fromVite = env?.VITE_ESC_OFF
  } catch {
    fromVite = undefined
  }
  return parseOffList(fromProcess ?? fromVite)
}

/** Programmatisch uitzetten (tests / kill-switch runner). Overschrijft env tot `clearEscalationOff`. */
export function setEscalationOff(ids: readonly EscalationId[]): void {
  overrideOff = new Set(ids)
}

export function clearEscalationOff(): void {
  overrideOff = null
}

export function getEscalationOff(): ReadonlySet<EscalationId> {
  return overrideOff ?? readEnvOff()
}

/** True tenzij het ID in ESC_OFF staat. Onbekende ID's → aan (defensief). */
export function isEscalationEnabled(id: EscalationId): boolean {
  return !getEscalationOff().has(id)
}
