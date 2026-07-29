export function otsuThresholdFromHistogram(hist: Uint32Array, total: number): number {
  if (total <= 0) return 128

  let sum = 0
  for (let i = 0; i < 256; i += 1) {
    sum += i * hist[i]
  }

  let sumBackground = 0
  let weightBackground = 0
  let maxVariance = -1
  let threshold = 128

  for (let t = 0; t < 256; t += 1) {
    weightBackground += hist[t]
    if (weightBackground === 0) continue

    const weightForeground = total - weightBackground
    if (weightForeground === 0) break

    sumBackground += t * hist[t]
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sum - sumBackground) / weightForeground
    const betweenClassVariance =
      weightBackground * weightForeground * (meanBackground - meanForeground) ** 2

    if (betweenClassVariance > maxVariance) {
      maxVariance = betweenClassVariance
      threshold = t
    }
  }

  return threshold
}

export function otsuThresholdFromGray(grayData: Uint8Array): number {
  if (grayData.length === 0) return 128
  const hist = new Uint32Array(256)
  for (let i = 0; i < grayData.length; i += 1) {
    hist[grayData[i]] += 1
  }
  return otsuThresholdFromHistogram(hist, grayData.length)
}
