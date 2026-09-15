/**
 * Catalogus-cm tijdens typen: de committed maat blijft staan tot blur / Enter /
 * stepper. Anders wordt 20 → Backspace → 2 meteen de catalogus, de rijen
 * worden opnieuw gebouwd, en het veld (plus de actieve tekenrij) valt weg.
 */

export type CatalogThicknessCommitResult =
  | { kind: 'replace'; oldCm: number; newCm: number }
  | { kind: 'add'; cm: number }

export function createThicknessCatalogEditSession() {
  const pending = new Map<number, number>()

  return {
    type(rowId: number, cm: number): void {
      if (!(cm > 0) || !Number.isFinite(cm)) return
      pending.set(rowId, cm)
    },
    peek(rowId: number): number | undefined {
      return pending.get(rowId)
    },
    take(rowId: number): number | undefined {
      const cm = pending.get(rowId)
      pending.delete(rowId)
      return cm
    },
    commitExisting(rowId: number, committedCm: number | null): CatalogThicknessCommitResult | null {
      const typed = pending.get(rowId)
      pending.delete(rowId)
      if (committedCm == null || typed == null || committedCm === typed) return null
      return { kind: 'replace', oldCm: committedCm, newCm: typed }
    },
    commitNew(rowId: number, existingCms: readonly number[]): CatalogThicknessCommitResult | null {
      const typed = pending.get(rowId)
      pending.delete(rowId)
      if (typed == null || existingCms.includes(typed)) return null
      return { kind: 'add', cm: typed }
    },
  }
}
