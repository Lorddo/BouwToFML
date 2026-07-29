import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const LANG_SUBDIR = '4.0.0_best_int'
const LANG_CODES = ['eng', 'nld'] as const

function langSourcePaths(frontendRoot: string): string[] {
  return LANG_CODES.map((code) =>
    path.join(
      frontendRoot,
      'node_modules',
      '@tesseract.js-data',
      code,
      LANG_SUBDIR,
      `${code}.traineddata.gz`,
    ),
  )
}

/** Kopieer worker/core/lang naar public/ — Vite serveert dit betrouwbaarder dan custom middleware. */
export function syncTesseractPublicAssets(frontendRoot: string): string {
  const targetRoot = path.join(frontendRoot, 'public', 'tesseract')
  fs.mkdirSync(targetRoot, { recursive: true })

  const workerSrc = path.join(frontendRoot, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js')
  if (!fs.existsSync(workerSrc)) {
    throw new Error(`Tesseract worker ontbreekt: ${workerSrc}`)
  }
  fs.copyFileSync(workerSrc, path.join(targetRoot, 'worker.min.js'))

  const coreSrc = path.join(frontendRoot, 'node_modules', 'tesseract.js-core')
  const coreTarget = path.join(targetRoot, 'core')
  fs.mkdirSync(coreTarget, { recursive: true })
  for (const file of fs.readdirSync(coreSrc)) {
    if (file.endsWith('.js') || file.endsWith('.wasm')) {
      fs.copyFileSync(path.join(coreSrc, file), path.join(coreTarget, file))
    }
  }

  const langTarget = path.join(targetRoot, 'lang')
  fs.mkdirSync(langTarget, { recursive: true })
  for (const src of langSourcePaths(frontendRoot)) {
    if (!fs.existsSync(src)) {
      throw new Error(`Tesseract taalbestand ontbreekt: ${src}`)
    }
    fs.copyFileSync(src, path.join(langTarget, path.basename(src)))
  }

  return targetRoot
}

export function tesseractAssetsPlugin(frontendRoot: string): Plugin {
  return {
    name: 'tesseract-assets',
    enforce: 'pre',
    buildStart() {
      syncTesseractPublicAssets(frontendRoot)
    },
    configureServer() {
      syncTesseractPublicAssets(frontendRoot)
    },
  }
}
