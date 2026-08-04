import { ref } from 'vue'
import type Konva from 'konva'

/** Velden waar Space tekst/activatie is — niet canvas-pannen. */
function shouldIgnoreSpaceForTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  const type = ((target as HTMLInputElement).type || 'text').toLowerCase()
  // Range mag Space niet vasthouden: anders blijft de slider “actief” en faalt Space+pan.
  if (type === 'range') return false
  return (
    type === 'text' ||
    type === 'search' ||
    type === 'password' ||
    type === 'email' ||
    type === 'number' ||
    type === 'url' ||
    type === 'tel' ||
    type === 'date' ||
    type === 'time' ||
    type === 'datetime-local' ||
    type === 'month' ||
    type === 'week' ||
    type === 'checkbox' ||
    type === 'radio' ||
    type === 'button' ||
    type === 'submit' ||
    type === 'reset' ||
    type === 'file' ||
    type === 'color'
  )
}

export function useStage() {
  const scale = ref(1)
  const position = ref({ x: 0, y: 0 })
  const spacePressed = ref(false)
  const shiftPressed = ref(false)

  function onKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space') {
      if (shouldIgnoreSpaceForTarget(e.target)) return
      spacePressed.value = true
      e.preventDefault()
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      shiftPressed.value = true
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') spacePressed.value = false
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      shiftPressed.value = false
    }
  }

  function wheelZoom(stage: Konva.Stage, e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault()
    const oldScale = stage.scaleX()
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const scaleBy = 1.08
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy
    const clamped = Math.max(0.05, Math.min(20, newScale))

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    }

    stage.scale({ x: clamped, y: clamped })
    const newPos = {
      x: pointer.x - mousePointTo.x * clamped,
      y: pointer.y - mousePointTo.y * clamped,
    }
    stage.position(newPos)
    scale.value = clamped
    position.value = newPos
  }

  function fitToScreen(stage: Konva.Stage, imgWidth: number, imgHeight: number, padding = 40) {
    const container = stage.container()
    const cw = container.clientWidth
    const ch = container.clientHeight
    const s = Math.min((cw - padding) / imgWidth, (ch - padding) / imgHeight)
    stage.scale({ x: s, y: s })
    stage.position({
      x: (cw - imgWidth * s) / 2,
      y: (ch - imgHeight * s) / 2,
    })
    scale.value = s
    position.value = stage.position()
  }

  return {
    scale,
    position,
    spacePressed,
    shiftPressed,
    onKeyDown,
    onKeyUp,
    wheelZoom,
    fitToScreen,
  }
}
