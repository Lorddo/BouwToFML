function hueToChannel(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const r = hueToChannel(p, q, h + 1 / 3)
  const g = hueToChannel(p, q, h)
  const b = hueToChannel(p, q, h - 1 / 3)
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function toHex(v: number): string {
  return v.toString(16).padStart(2, '0')
}

/** Vaste, goed onderscheidbare kleur per raam-referentie index. */
export function colorForWindowRef(refIndex: number): [number, number, number] {
  const hue = (refIndex * 137.508 + 15) % 360
  return hslToRgb(hue / 360, 0.72, 0.5)
}

export function windowRefColorHex(refIndex: number): string {
  const [r, g, b] = colorForWindowRef(refIndex)
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
