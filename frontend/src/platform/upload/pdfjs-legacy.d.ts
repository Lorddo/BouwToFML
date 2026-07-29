declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export * from 'pdfjs-dist'
}

declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' {
  const workerUrl: string
  export default workerUrl
}
