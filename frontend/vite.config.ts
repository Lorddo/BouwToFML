import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pdfJsAssetsPlugin } from './vite/pdfJsAssetsPlugin'
import { tesseractAssetsPlugin } from './vite/tesseractAssetsPlugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function serveRepoStatic() {
  return {
    name: 'serve-repo-static',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''

        if (
          url.startsWith('/examples/') ||
          url.startsWith('/data/')
        ) {
          const filePath = url.startsWith('/data/')
            ? path.join(__dirname, decodeURIComponent(url))
            : path.join(repoRoot, decodeURIComponent(url))
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase()
            const types: Record<string, string> = {
              '.json': 'application/json',
              '.fml': 'application/json',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.onnx': 'application/octet-stream',
            }
            res.setHeader('Content-Type', types[ext] ?? 'application/octet-stream')
            fs.createReadStream(filePath).pipe(res)
            return
          }
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), serveRepoStatic(), pdfJsAssetsPlugin(__dirname), tesseractAssetsPlugin(__dirname)],
  optimizeDeps: {
    exclude: ['@opencvjs/web', 'pdfjs-dist', 'pdfjs-dist/legacy/build/pdf.mjs'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  esbuild: {
    target: 'es2022',
  },
  build: {
    target: 'es2022',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
    fs: {
      allow: [repoRoot],
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    exclude: ['tests/archive/**'],
  },
})
