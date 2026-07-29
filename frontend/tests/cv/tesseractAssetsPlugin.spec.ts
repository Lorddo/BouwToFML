import { describe, expect, it } from 'vitest'
import { syncTesseractPublicAssets } from '../../vite/tesseractAssetsPlugin'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('tesseractAssetsPlugin', () => {
  it('syncTesseractPublicAssets schrijft worker + taalbestanden naar public/', () => {
    const targetRoot = syncTesseractPublicAssets(frontendRoot)
    expect(fs.existsSync(path.join(targetRoot, 'worker.min.js'))).toBe(true)
    expect(fs.statSync(path.join(targetRoot, 'worker.min.js')).size).toBeGreaterThan(1000)
    expect(fs.existsSync(path.join(targetRoot, 'lang', 'eng.traineddata.gz'))).toBe(true)
    expect(fs.existsSync(path.join(targetRoot, 'lang', 'nld.traineddata.gz'))).toBe(true)
    const head = fs.readFileSync(path.join(targetRoot, 'worker.min.js'), 'utf8').slice(0, 20)
    expect(head.startsWith('<')).toBe(false)
  })
})
