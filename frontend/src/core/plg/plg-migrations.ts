/**
 * Migratieketen voor versioned `.plg`-documenten (Fase C2).
 *
 * Vanaf v1 is elke modelwijziging een migratie — ook zonder klantbestanden —
 * omdat `.plg` tevens het IDB-opslagschema wordt.
 *
 * Key in `MIGRATIONS` = bronversie; de functie migreert `v → v+1`.
 * Bij v1 is de map leeg; het skelet + de tests staan klaar vóór v2.
 */
import { CURRENT_PLG_VERSION } from './plg-version'

export class PlgMigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlgMigrationError'
  }
}

/**
 * Migraties per bronversie. Ontbreekt een stap → leesbare fout.
 * Voorbeeld later: `1: (doc) => ({ ...doc, version: 2, ... })`.
 */
export const MIGRATIONS: Record<number, (doc: unknown) => unknown> = {
  // v1 → v2: nog geen migratie nodig
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Migreert een raw `.plg`-object van `raw.version` naar `CURRENT_PLG_VERSION`.
 * No-op wanneer al op de huidige versie. Faalt bij ontbrekende/onbekende of te hoge versie.
 */
export function migratePlg(raw: unknown): unknown {
  if (!isRecord(raw)) {
    throw new PlgMigrationError('PLG migration requires a JSON object')
  }

  const version = raw.version
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new PlgMigrationError('PLG version must be an integer')
  }
  if (version < 1) {
    throw new PlgMigrationError(`PLG version ${version} is not supported (minimum is 1)`)
  }
  if (version > CURRENT_PLG_VERSION) {
    throw new PlgMigrationError(
      `PLG version ${version} is newer than this app supports (max ${CURRENT_PLG_VERSION})`,
    )
  }

  let current: unknown = raw
  let from = version
  while (from < CURRENT_PLG_VERSION) {
    const step = MIGRATIONS[from]
    if (!step) {
      throw new PlgMigrationError(
        `No PLG migration registered from version ${from} to ${from + 1}`,
      )
    }
    current = step(current)
    from += 1
    if (!isRecord(current) || current.version !== from) {
      throw new PlgMigrationError(
        `PLG migration from ${from - 1} did not produce version ${from}`,
      )
    }
  }

  return current
}
