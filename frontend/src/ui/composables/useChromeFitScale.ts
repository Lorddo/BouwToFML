import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

const DEFAULT_MIN_SCALE = 0.72
const COMPACT_BELOW = 0.9

/**
 * Fit a chrome bar (toolbelt / topbar) to the canvas width by setting
 * `--fml-chrome-fit-scale` on the target. Keeps transform-origin at the
 * element; callers combine with existing centering transforms in CSS.
 */
export function useChromeFitScale(
  targetRef: Ref<HTMLElement | null>,
  options?: {
    containerSelector?: string
    minScale?: number
    insetPx?: number
  },
): { scale: Ref<number>; compact: Ref<boolean> } {
  const scale = ref(1)
  const compact = ref(false)
  const minScale = options?.minScale ?? DEFAULT_MIN_SCALE
  const insetPx = options?.insetPx ?? 16
  const containerSelector = options?.containerSelector ?? '.fml-preview-wrap, .canvas-wrap'

  let resizeObserver: ResizeObserver | null = null
  let mutationObserver: MutationObserver | null = null
  let raf = 0

  function resolveContainer(el: HTMLElement): HTMLElement | null {
    const found = el.closest(containerSelector)
    if (found instanceof HTMLElement) return found
    return el.parentElement
  }

  function measure(): void {
    const el = targetRef.value
    if (!el) return
    const container = resolveContainer(el)
    if (!container) return

    const budget = Math.max(0, container.clientWidth - insetPx)
    if (budget <= 0) return

    el.style.setProperty('--fml-chrome-fit-scale', '1')
    el.classList.remove('is-chrome-compact')
    // Force layout at scale 1 before reading natural width.
    void el.offsetWidth
    const natural = Math.max(el.scrollWidth, el.getBoundingClientRect().width)
    if (natural <= 0) return

    const next = Math.min(1, Math.max(minScale, budget / natural))
    const rounded = Math.round(next * 100) / 100
    scale.value = rounded
    compact.value = rounded < COMPACT_BELOW
    el.style.setProperty('--fml-chrome-fit-scale', String(rounded))
    el.classList.toggle('is-chrome-compact', compact.value)
  }

  function schedule(): void {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(measure)
  }

  function bind(el: HTMLElement | null): void {
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
    if (!el) return

    resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(el)
    const container = resolveContainer(el)
    if (container) resizeObserver.observe(container)

    mutationObserver = new MutationObserver(schedule)
    mutationObserver.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    schedule()
  }

  onMounted(() => bind(targetRef.value))
  watch(targetRef, (el) => bind(el))

  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
  })

  return { scale, compact }
}
