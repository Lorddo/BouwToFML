/** OpenCV.js (Emscripten) gooit soms een numerieke code i.p.v. een Error-object. */
export function formatCvError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'number') {
    return `OpenCV-interne fout (code ${e}). Meestal geheugen of te grote afbeelding — verlaag “detectie max px” of herlaad OpenCV.`
  }
  return String(e)
}
