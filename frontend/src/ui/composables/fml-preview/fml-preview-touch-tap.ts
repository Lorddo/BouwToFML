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
 */
export function isTouchHoverFollowTool(tool: string | null): boolean {
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
}): boolean {
  if (args.becameNav === true || args.sloppy !== true) return false
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
