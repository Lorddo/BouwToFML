type ProgressListener = (step: string) => void

let listener: ProgressListener | null = null

export function setPipelineProgressListener(next: ProgressListener | null): void {
  listener = next
}

export function reportPipelineProgress(step: string): void {
  listener?.(step)
}
