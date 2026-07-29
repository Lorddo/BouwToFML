/** Zoek bestaande snapshot op onderlegger-bestandsnaam (niet op afmetingen). */
export function findDevSessionIdByImageName<T extends { imageName: string }>(
  entries: Array<{ id: string; session: T }>,
  imageName: string,
): string | null {
  const normalized = imageName.trim()
  if (!normalized) return null
  const match = entries.find((entry) => entry.session.imageName.trim() === normalized)
  return match?.id ?? null
}

export function createDevSessionId(): string {
  return `session-${crypto.randomUUID()}`
}

/**
 * Hergebruik storage-id bij dezelfde imageName (overschrijven), anders nieuwe snapshot.
 */
export function resolveDevSessionStorageId(
  entries: Array<{ id: string; session: { imageName: string } }>,
  imageName: string,
): string {
  return findDevSessionIdByImageName(entries, imageName) ?? createDevSessionId()
}
