/** Touch-tap synthesizes mousedown after pointerup — geen live sleep. */
export const BTF_LIVE_POINTER = 'btfLivePointer'

export function isLiveDrawPointer(event: MouseEvent): boolean {
  return (event as MouseEvent & { [BTF_LIVE_POINTER]?: boolean }).btfLivePointer !== false
}

/** Eerste vinger van pinch/pan mag geen selectie/deselectie triggeren. */

export function shouldCommitTouchTap(args: {
  becameNav: boolean
  sloppy: boolean
  cancelled: boolean
}): boolean {
  return args.becameNav !== true && args.sloppy !== true && args.cancelled !== true
}

/**
 * Click-move-click: vinger volgt hover, tik op pointerup.
 * Nok = `draw_wall` + `drawWallKind=ridge`; dakvlak = `draw_surface` + `dakMode`.
 * Elevation `split` / `add_*` horen hier ook (zelfde plaats-tik).
 * Measure/slicer/nulpunt/box_select = hold-drag (`shouldStartTouchHoldDrag`), geen hover-follow.
 * Muur/kamer ná de eerste tik: geen hover-follow — handles + 1-vinger-pan.
 * Precise relocate (muur/knoop/opening): hover-follow tijdens draft.
 */
export function isTouchHoverFollowTool(
  tool: string | null,
  opts?: { drafting?: boolean; wallMoveDrafting?: boolean; preciseMoveDrafting?: boolean },
): boolean {
  if (opts?.preciseMoveDrafting === true || opts?.wallMoveDrafting === true) return true
  if (opts?.drafting === true && (tool === 'draw_wall' || tool === 'draw_room')) return false
  return (
    tool === 'draw_wall' ||
    tool === 'draw_room' ||
    tool === 'draw_surface' ||
    tool === 'draw_label' ||
    tool === 'draw_line' ||
    tool === 'add_door' ||
    tool === 'add_window' ||
    tool === 'add_fixture' ||
    tool === 'split'
  )
}

/** Hold-drag pas ná slop, niet bij de eerste vinger van pinch. */
export function shouldStartTouchHoldDrag(args: {
  sloppy: boolean
  moveMod: boolean
  tool: string | null
  becameNav: boolean
  draftHandle?: boolean
  wallMoveDrafting?: boolean
  preciseMoveDrafting?: boolean
  clickMoveHit?: boolean
}): boolean {
  if (args.becameNav === true || args.sloppy !== true) return false
  if (
    args.preciseMoveDrafting === true ||
    args.wallMoveDrafting === true ||
    args.clickMoveHit === true
  ) {
    return false
  }
  if (args.draftHandle === true && (args.tool === 'draw_wall' || args.tool === 'draw_room')) {
    return true
  }
  if (isTouchHoverFollowTool(args.tool)) return false
  return (
    args.moveMod === true ||
    args.tool === 'measure' ||
    args.tool === 'nulpunt' ||
    args.tool === 'box_select'
  )
}

/** 1-vinger-sleep = pan als het geen teken-hover of hold-drag is. */
export function shouldOneFingerPan(args: {
  sloppy: boolean
  becameNav: boolean
  holdDragStarted: boolean
  hoverFollow: boolean
}): boolean {
  return (
    args.sloppy === true &&
    args.becameNav !== true &&
    args.holdDragStarted !== true &&
    args.hoverFollow !== true
  )
}
