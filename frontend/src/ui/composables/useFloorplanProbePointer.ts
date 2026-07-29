import { ref } from 'vue'
import type { DebugProbeMode } from '@/ui/composables/workspace/useWorkspaceDebugProbe'

type Point = { x: number; y: number }
type Rect = { x: number; y: number; width: number; height: number }

export function useFloorplanProbePointer(deps: {
  probeMode: () => DebugProbeMode
  spacePressed: () => boolean
  isProbeMode: () => boolean
  onProbeSample: (sample: { kind: 'point' | 'region'; point: Point; region?: Rect }) => void
}) {
  const probeStrokeActive = ref(false)
  const probeDraftStart = ref<Point | null>(null)
  const probePreviewRect = ref<Rect | null>(null)
  const probeResultPoint = ref<Point | null>(null)
  const probeResultRect = ref<Rect | null>(null)

  function resetProbeDraft() {
    probeStrokeActive.value = false
    probeDraftStart.value = null
    probePreviewRect.value = null
  }

  function clearProbeResults() {
    resetProbeDraft()
    probeResultPoint.value = null
    probeResultRect.value = null
  }

  function emitProbeSample(kind: 'point' | 'region', point: Point, region?: Rect) {
    const roundedPoint = { x: Math.round(point.x), y: Math.round(point.y) }
    probeResultPoint.value = roundedPoint
    if (kind === 'region' && region) {
      const x = region.width < 0 ? region.x + region.width : region.x
      const y = region.height < 0 ? region.y + region.height : region.y
      probeResultRect.value = {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.max(1, Math.round(Math.abs(region.width))),
        height: Math.max(1, Math.round(Math.abs(region.height))),
      }
    } else {
      probeResultRect.value = null
    }
    deps.onProbeSample({
      kind,
      point: roundedPoint,
      region: probeResultRect.value ?? undefined,
    })
  }

  function onProbeMouseDown(p: Point, stopDrag: () => void): boolean {
    if (!deps.isProbeMode() || deps.spacePressed()) return false
    stopDrag()
    if (deps.probeMode() === 'point') {
      emitProbeSample('point', p)
      return true
    }
    probeStrokeActive.value = true
    probeDraftStart.value = { ...p }
    probePreviewRect.value = { x: p.x, y: p.y, width: 0, height: 0 }
    return true
  }

  function onProbeMouseMove(p: Point): boolean {
    if (!probeStrokeActive.value || !probeDraftStart.value || deps.spacePressed()) return false
    const start = probeDraftStart.value
    probePreviewRect.value = {
      x: start.x,
      y: start.y,
      width: p.x - start.x,
      height: p.y - start.y,
    }
    return true
  }

  function onProbeMouseUp(): boolean {
    if (!probeStrokeActive.value || !probeDraftStart.value) return false
    const rect = probePreviewRect.value
    const start = probeDraftStart.value
    resetProbeDraft()
    if (rect && (Math.abs(rect.width) >= 4 || Math.abs(rect.height) >= 4)) {
      emitProbeSample(
        'region',
        {
          x: start.x + rect.width / 2,
          y: start.y + rect.height / 2,
        },
        rect,
      )
    } else {
      emitProbeSample('point', start)
    }
    return true
  }

  return {
    probeStrokeActive,
    probeDraftStart,
    probePreviewRect,
    probeResultPoint,
    probeResultRect,
    resetProbeDraft,
    clearProbeResults,
    onProbeMouseDown,
    onProbeMouseMove,
    onProbeMouseUp,
  }
}
