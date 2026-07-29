/** Diepe kopie van plain JSON-data — werkt ook op Vue reactive proxies. */
export function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
