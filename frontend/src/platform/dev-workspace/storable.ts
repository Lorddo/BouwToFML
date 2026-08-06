import { toRaw, isProxy } from 'vue'

function isTypedArray(value: unknown): value is ArrayBufferView {
  return ArrayBuffer.isView(value) && !(value instanceof DataView)
}

/**
 * Structured-clone-veilige deep clone voor IndexedDB:
 * - Vue proxies via `toRaw`
 * - TypedArrays via `.slice()` (geen number[]-expansie)
 * - functies / `undefined`-keys overslaan
 *
 * `structuredClone()` zelf werkt niet op Vue reactive proxies (`DataCloneError`).
 */
export function toStorableDevSession<T>(session: T): T {
  return deepCloneStorable(session) as T
}

function deepCloneStorable(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'undefined') return undefined
    return value
  }

  // Vue reactive proxy → plain target vóór verdere clone.
  const unwrapped = isProxy(value) ? toRaw(value) : value
  if (unwrapped === null || typeof unwrapped !== 'object') return unwrapped

  if (seen.has(unwrapped)) return seen.get(unwrapped)

  if (isTypedArray(unwrapped)) {
    const copy = (unwrapped as unknown as { slice(): ArrayBufferView }).slice()
    seen.set(unwrapped, copy)
    return copy
  }

  if (unwrapped instanceof ArrayBuffer) {
    const copy = unwrapped.slice(0)
    seen.set(unwrapped, copy)
    return copy
  }

  if (unwrapped instanceof Date) {
    const copy = new Date(unwrapped.getTime())
    seen.set(unwrapped, copy)
    return copy
  }

  if (Array.isArray(unwrapped)) {
    const copy: unknown[] = []
    seen.set(unwrapped, copy)
    for (const item of unwrapped) {
      if (typeof item === 'function') continue
      if (typeof item === 'undefined') {
        copy.push(undefined)
        continue
      }
      copy.push(deepCloneStorable(item, seen))
    }
    return copy
  }

  if (Object.prototype.toString.call(unwrapped) !== '[object Object]') {
    try {
      return structuredClone(unwrapped)
    } catch {
      return undefined
    }
  }

  const copy: Record<string, unknown> = {}
  seen.set(unwrapped, copy)
  for (const key of Object.keys(unwrapped)) {
    const item = (unwrapped as Record<string, unknown>)[key]
    if (typeof item === 'function' || typeof item === 'undefined') continue
    copy[key] = deepCloneStorable(item, seen)
  }
  return copy
}
