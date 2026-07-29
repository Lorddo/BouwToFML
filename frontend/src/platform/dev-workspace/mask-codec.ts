export function encodeMaskBase64(mask: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < mask.length; i += chunk) {
    binary += String.fromCharCode(...mask.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function decodeMaskBase64(base64: string, expectedLength: number): Uint8Array {
  const binary = atob(base64)
  if (binary.length !== expectedLength) {
    throw new Error(
      `Mask-lengte komt niet overeen: verwacht ${expectedLength}, gekregen ${binary.length}.`,
    )
  }
  const out = new Uint8Array(expectedLength)
  for (let i = 0; i < expectedLength; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

export function maskHasInk(mask: Uint8Array): boolean {
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 0) return true
  }
  return false
}
