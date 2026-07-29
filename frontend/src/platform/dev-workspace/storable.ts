/** IndexedDB / JSON-safe kopie — strip Vue proxies, typed arrays en non-cloneables. */
export function toStorableDevSession<T>(session: T): T {
  return JSON.parse(JSON.stringify(session)) as T
}
