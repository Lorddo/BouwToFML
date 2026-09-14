import { describe, expect, it } from 'vitest'
import {
  allowsPlanStickyHit,
  resolvePlanStickySelectKind,
  wallPreemptsAreaHit,
} from '@/ui/composables/plan-canvas/plan-canvas-sticky-select'
import {
  isTouchHoverFollowTool,
  shouldCommitTouchTap,
  shouldOneFingerPan,
  shouldStartTouchHoldDrag,
} from '@/ui/composables/plan-canvas/plan-canvas-touch-tap'

describe('resolvePlanStickySelectKind', () => {
  const none = {
    hasWall: false,
    hasJunction: false,
    hasOpening: false,
    hasItem: false,
    hasAnnotation: false,
    hasDimension: false,
  }

  it('kiest muur vóór opening', () => {
    expect(resolvePlanStickySelectKind(none)).toBe(null)
    expect(resolvePlanStickySelectKind({ ...none, hasWall: true })).toBe('wall')
    expect(resolvePlanStickySelectKind({ ...none, hasJunction: true })).toBe('wall')
    expect(resolvePlanStickySelectKind({ ...none, hasOpening: true })).toBe('opening')
    expect(resolvePlanStickySelectKind({ ...none, hasDimension: true })).toBe('dimension')
  })
})

describe('allowsPlanStickyHit', () => {
  it('laat alle hits toe zonder selectie', () => {
    expect(allowsPlanStickyHit(null, 'opening')).toBe(true)
    expect(allowsPlanStickyHit(null, 'wall')).toBe(true)
  })

  it('houdt muur-selectie vast bij een deur-hit', () => {
    expect(allowsPlanStickyHit('wall', 'opening')).toBe(false)
    expect(allowsPlanStickyHit('wall', 'wall')).toBe(true)
    expect(allowsPlanStickyHit('opening', 'wall')).toBe(false)
    expect(allowsPlanStickyHit('opening', 'opening')).toBe(true)
  })

  it('laat deur/muur door bij ruimte-selectie', () => {
    expect(allowsPlanStickyHit('area', 'opening')).toBe(true)
    expect(allowsPlanStickyHit('area', 'wall')).toBe(true)
    expect(allowsPlanStickyHit('area', 'item')).toBe(true)
  })
})

describe('wallPreemptsAreaHit', () => {
  it('laat een muur in de ruimte winnen, ook bij Ctrl-settings', () => {
    expect(wallPreemptsAreaHit('w1', false)).toBe(true)
    expect(wallPreemptsAreaHit(null, false)).toBe(false)
  })

  it('houdt klik op de ruimtenaam bij de ruimte', () => {
    expect(wallPreemptsAreaHit('w1', true)).toBe(false)
    expect(wallPreemptsAreaHit(null, true)).toBe(false)
  })
})

describe('touch tap vs pan', () => {
  it('commit alleen een stille tik, niet pinch of sleep', () => {
    expect(shouldCommitTouchTap({ becameNav: false, sloppy: false, cancelled: false })).toBe(true)
    expect(shouldCommitTouchTap({ becameNav: true, sloppy: false, cancelled: false })).toBe(false)
    expect(shouldCommitTouchTap({ becameNav: false, sloppy: true, cancelled: false })).toBe(false)
    expect(shouldCommitTouchTap({ becameNav: false, sloppy: false, cancelled: true })).toBe(false)
  })

  it('start hold-drag pas na slop, niet tijdens tekenen', () => {
    expect(
      shouldStartTouchHoldDrag({
        sloppy: true,
        moveMod: true,
        tool: null,
        becameNav: false,
      }),
    ).toBe(true)
    expect(
      shouldStartTouchHoldDrag({
        sloppy: true,
        moveMod: false,
        tool: 'measure',
        becameNav: false,
      }),
    ).toBe(true)
    expect(
      shouldStartTouchHoldDrag({
        sloppy: true,
        moveMod: true,
        tool: 'draw_wall',
        becameNav: false,
      }),
    ).toBe(false)
    expect(
      shouldStartTouchHoldDrag({
        sloppy: true,
        moveMod: false,
        tool: null,
        becameNav: false,
      }),
    ).toBe(false)
  })

  it('1-vinger-pan alleen als het geen teken of hold-drag is', () => {
    expect(
      shouldOneFingerPan({
        sloppy: true,
        becameNav: false,
        holdDragStarted: false,
        hoverFollow: false,
      }),
    ).toBe(true)
    expect(
      shouldOneFingerPan({
        sloppy: true,
        becameNav: false,
        holdDragStarted: false,
        hoverFollow: true,
      }),
    ).toBe(false)
  })

  it('herkent click-move-click tools', () => {
    expect(isTouchHoverFollowTool('draw_wall')).toBe(true)
    expect(isTouchHoverFollowTool('split')).toBe(true)
    expect(isTouchHoverFollowTool('measure')).toBe(false)
    expect(isTouchHoverFollowTool('box_select')).toBe(false)
    expect(isTouchHoverFollowTool(null)).toBe(false)
    expect(isTouchHoverFollowTool(null, { wallMoveDrafting: true })).toBe(true)
    expect(isTouchHoverFollowTool(null, { preciseMoveDrafting: true })).toBe(true)
  })

  it('zet hover-follow uit tijdens muur/kamer-draft zodat handles + pan werken', () => {
    expect(isTouchHoverFollowTool('draw_wall', { drafting: true })).toBe(false)
    expect(isTouchHoverFollowTool('draw_room', { drafting: true })).toBe(false)
    expect(isTouchHoverFollowTool('draw_surface', { drafting: true })).toBe(true)
    expect(isTouchHoverFollowTool('draw_roof', { drafting: true })).toBe(true)
  })

  it('start handle-sleep op draft-punten zonder move-tool', () => {
    expect(
      shouldStartTouchHoldDrag({
        sloppy: true,
        moveMod: false,
        tool: 'draw_wall',
        becameNav: false,
        draftHandle: true,
      }),
    ).toBe(true)
    expect(
      shouldStartTouchHoldDrag({
        sloppy: true,
        moveMod: false,
        tool: 'draw_room',
        becameNav: false,
        draftHandle: true,
      }),
    ).toBe(true)
    expect(
      shouldStartTouchHoldDrag({
        sloppy: true,
        moveMod: true,
        tool: null,
        becameNav: false,
        clickMoveHit: true,
      }),
    ).toBe(false)
    expect(
      shouldStartTouchHoldDrag({
        sloppy: true,
        moveMod: true,
        tool: null,
        becameNav: false,
        wallMoveDrafting: true,
      }),
    ).toBe(false)
    expect(
      shouldStartTouchHoldDrag({
        sloppy: true,
        moveMod: true,
        tool: null,
        becameNav: false,
        preciseMoveDrafting: true,
      }),
    ).toBe(false)
  })
})
