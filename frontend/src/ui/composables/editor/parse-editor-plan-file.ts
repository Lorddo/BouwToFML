import { importFmlV3 } from '@/core/fml/importFmlV3'
import type { FloorPlan, ImportWarning } from '@/core/plan/types'
import {
  isPlgDocumentJson,
  readPlg,
  type PlgDocument,
  type PlgSettings,
} from '@/core/plg/plg-document'

/** File-picker accept for the standalone editor (FML + native `.plg`). */
export const EDITOR_PLAN_FILE_ACCEPT = '.fml,.json,.json.fml,.plg'

export type ParsedEditorPlanFile = {
  kind: 'plg' | 'fml'
  plan: FloorPlan
  warnings: ImportWarning[]
  plgSettings?: PlgSettings
}

function tryParseJson(rawText: string): unknown {
  try {
    return JSON.parse(rawText) as unknown
  } catch {
    return undefined
  }
}

function planFromPlg(doc: PlgDocument): FloorPlan {
  const leftover = doc.foreign?.fml
  if (!leftover) return doc.plan
  return {
    ...doc.plan,
    source: { ...doc.plan.source, leftover },
  }
}

/**
 * Open a downloaded editor file. `.plg` is detected by `format`, not extension,
 * so a renamed FML still imports as FML.
 */
export function parseEditorPlanFile(rawText: string): ParsedEditorPlanFile {
  const parsedJson = tryParseJson(rawText)
  if (isPlgDocumentJson(parsedJson)) {
    const doc = readPlg(parsedJson as object)
    return {
      kind: 'plg',
      plan: planFromPlg(doc),
      warnings: [],
      plgSettings: doc.settings,
    }
  }
  const parsed = importFmlV3(rawText)
  return { kind: 'fml', plan: parsed.plan, warnings: parsed.warnings }
}
