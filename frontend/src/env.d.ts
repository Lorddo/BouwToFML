/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Soft access gate for hosted builds; empty/absent = no gate. */
  readonly VITE_APP_ACCESS_PASSWORD?: string
  /** Override POST /api/underlay (default: same origin). */
  readonly VITE_UNDERLAY_UPLOAD_URL?: string
  /** Public r2.dev / custom domain prefix for drawing.url. */
  readonly VITE_UNDERLAY_PUBLIC_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
