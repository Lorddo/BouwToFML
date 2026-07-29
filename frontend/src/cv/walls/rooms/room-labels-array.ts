/** Int32 labels-array normaliseren (CC / classify state). */
export function normalizeLabelsArray(data: Int32Array | ArrayLike<number>): Int32Array {
  return data instanceof Int32Array ? data : new Int32Array(data)
}
