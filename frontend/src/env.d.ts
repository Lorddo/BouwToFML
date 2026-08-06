/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Soft access gate for hosted builds; empty/absent = no gate. */
  readonly VITE_APP_ACCESS_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
