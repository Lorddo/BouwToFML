import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const PDFJS_ASSET_DIRS = ['cmaps', 'standard_fonts', 'wasm'] as const
const PDFJS_URL_PREFIX = '/pdfjs-dist/'

function contentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const types: Record<string, string> = {
    '.bcmap': 'application/octet-stream',
    '.pfb': 'application/octet-stream',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
  }
  return types[ext] ?? 'application/octet-stream'
}

function isInsidePdfRoot(pdfRoot: string, filePath: string): boolean {
  const root = path.resolve(pdfRoot) + path.sep
  const resolved = path.resolve(filePath)
  return resolved.startsWith(root)
}

function servePdfJsAssets(pdfRoot: string) {
  return (req: import('http').IncomingMessage, res: import('http').ServerResponse, next: () => void) => {
    const url = req.url?.split('?')[0] ?? ''
    if (!url.startsWith(PDFJS_URL_PREFIX)) {
      next()
      return
    }

    const rel = decodeURIComponent(url.slice(PDFJS_URL_PREFIX.length))
    const filePath = path.resolve(pdfRoot, rel)
    if (!isInsidePdfRoot(pdfRoot, filePath) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      next()
      return
    }

    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    res.setHeader('Content-Type', contentType(filePath))
    fs.createReadStream(filePath).pipe(res)
  }
}

function copyPdfJsAssets(pdfRoot: string, outDir: string) {
  const targetRoot = path.join(outDir, 'pdfjs-dist')
  fs.mkdirSync(targetRoot, { recursive: true })
  for (const dir of PDFJS_ASSET_DIRS) {
    fs.cpSync(path.join(pdfRoot, dir), path.join(targetRoot, dir), { recursive: true })
  }
}

export function pdfJsAssetsPlugin(frontendRoot: string): Plugin {
  const pdfRoot = path.join(frontendRoot, 'node_modules', 'pdfjs-dist')

  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use(servePdfJsAssets(pdfRoot))
    },
    configurePreviewServer(server) {
      server.middlewares.use(servePdfJsAssets(pdfRoot))
    },
    closeBundle() {
      copyPdfJsAssets(pdfRoot, path.join(frontendRoot, 'dist'))
    },
  }
}
