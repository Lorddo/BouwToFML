/**
 * FNV-1a 32-bit — sync, stabiel over Node/browser, geen crypto-dependency.
 */
export function fnv1aHex(parts: ArrayLike<number>[]): string {
  let hash = 0x811c9dc5
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) {
      hash ^= part[i] & 0xff
      hash = Math.imul(hash, 0x01000193)
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function encodeInt32Rle(data: Int32Array, width: number, height: number): string {
  const total = Math.max(0, width * height)
  if (total === 0 || data.length === 0) {
    return int32ArrayToBase64(new Int32Array(0))
  }
  const runs: number[] = []
  let current = data[0]
  let count = 1
  const limit = Math.min(total, data.length)
  for (let i = 1; i < limit; i += 1) {
    const value = data[i]
    if (value === current) {
      count += 1
      continue
    }
    runs.push(current, count)
    current = value
    count = 1
  }
  runs.push(current, count)
  return int32ArrayToBase64(Int32Array.from(runs))
}

export function decodeInt32Rle(rleBase64: string, width: number, height: number): Int32Array {
  const total = Math.max(0, width * height)
  const runs = base64ToInt32Array(rleBase64)
  const out = new Int32Array(total)
  let offset = 0
  for (let i = 0; i + 1 < runs.length && offset < total; i += 2) {
    const value = runs[i]
    const count = Math.max(0, runs[i + 1])
    for (let c = 0; c < count && offset < total; c += 1) {
      out[offset] = value
      offset += 1
    }
  }
  return out
}

export function int32ArrayToBase64(data: Int32Array): string {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return bytesToBase64(bytes)
}

export function base64ToInt32Array(base64: string): Int32Array {
  const bytes = base64ToBytes(base64)
  if (bytes.byteLength % 4 !== 0) {
    throw new Error(`Int32 RLE base64 length must be a multiple of 4 (got ${bytes.byteLength})`)
  }
  return new Int32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}
