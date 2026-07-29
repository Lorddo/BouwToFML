// OpenCV.js heeft geen officiële typings; typed wrappers komen later (audit A8).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenCV WASM surface
export type OpenCV = any

let initPromise: Promise<OpenCV> | null = null

export function waitForOpenCV(): Promise<OpenCV> {
  if (!initPromise) {
    initPromise = import('@opencvjs/web')
      .then(({ loadOpenCV }) => loadOpenCV())
      .catch((err) => {
        initPromise = null
        throw err
      })
  }
  return initPromise
}

export function resetOpenCvLoader(): void {
  initPromise = null
}
