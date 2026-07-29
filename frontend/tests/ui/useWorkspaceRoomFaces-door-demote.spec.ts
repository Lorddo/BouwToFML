import { describe, expect, it } from 'vitest'
import {
  didDemoteDoorFace,
  didDemoteWindowPipelineFace,
  isWindowPipelineFaceClass,
  shouldRefreshDoorOverlayAfterBoxDemote,
  shouldRefreshWindowOverlayAfterBoxDemote,
} from '@/ui/composables/workspace/room-face-demote-guards'

describe('useWorkspaceRoomFaces door demote guards', () => {
  it('detects click demotion from door to non-door', () => {
    expect(didDemoteDoorFace('door', 'wall')).toBe(true)
    expect(didDemoteDoorFace('door', 'unknown')).toBe(true)
    expect(didDemoteDoorFace('door', 'surface')).toBe(true)
    expect(didDemoteDoorFace('door', 'door')).toBe(false)
    expect(didDemoteDoorFace('wall', 'unknown')).toBe(false)
    expect(didDemoteDoorFace('outside', null)).toBe(false)
  })

  it('refreshes overlay only for box demote with changed door faces', () => {
    expect(
      shouldRefreshDoorOverlayAfterBoxDemote({
        targetClass: 'wall',
        changedCount: 1,
        hadDoorFaceBefore: true,
      }),
    ).toBe(true)
    expect(
      shouldRefreshDoorOverlayAfterBoxDemote({
        targetClass: 'unknown',
        changedCount: 2,
        hadDoorFaceBefore: true,
      }),
    ).toBe(true)
    expect(
      shouldRefreshDoorOverlayAfterBoxDemote({
        targetClass: 'door',
        changedCount: 3,
        hadDoorFaceBefore: true,
      }),
    ).toBe(false)
    expect(
      shouldRefreshDoorOverlayAfterBoxDemote({
        targetClass: 'wall',
        changedCount: 0,
        hadDoorFaceBefore: true,
      }),
    ).toBe(false)
    expect(
      shouldRefreshDoorOverlayAfterBoxDemote({
        targetClass: 'wall',
        changedCount: 2,
        hadDoorFaceBefore: false,
      }),
    ).toBe(false)
  })
})

describe('useWorkspaceRoomFaces window demote guards', () => {
  it('recognizes window pipeline classes', () => {
    expect(isWindowPipelineFaceClass('window')).toBe(true)
    expect(isWindowPipelineFaceClass('doorframe')).toBe(true)
    expect(isWindowPipelineFaceClass('wall')).toBe(false)
    expect(isWindowPipelineFaceClass('door')).toBe(false)
  })

  it('detects click demotion from window/doorframe to non-pipeline', () => {
    expect(didDemoteWindowPipelineFace('window', 'wall')).toBe(true)
    expect(didDemoteWindowPipelineFace('window', 'unknown')).toBe(true)
    expect(didDemoteWindowPipelineFace('doorframe', 'wall')).toBe(true)
    expect(didDemoteWindowPipelineFace('window', 'doorframe')).toBe(false)
    expect(didDemoteWindowPipelineFace('doorframe', 'window')).toBe(false)
    expect(didDemoteWindowPipelineFace('wall', 'unknown')).toBe(false)
    expect(didDemoteWindowPipelineFace('window', null)).toBe(false)
  })

  it('refreshes overlay only for box demote with changed window-pipeline faces', () => {
    expect(
      shouldRefreshWindowOverlayAfterBoxDemote({
        targetClass: 'wall',
        changedCount: 1,
        hadWindowPipelineFaceBefore: true,
      }),
    ).toBe(true)
    expect(
      shouldRefreshWindowOverlayAfterBoxDemote({
        targetClass: 'unknown',
        changedCount: 2,
        hadWindowPipelineFaceBefore: true,
      }),
    ).toBe(true)
    expect(
      shouldRefreshWindowOverlayAfterBoxDemote({
        targetClass: 'window',
        changedCount: 3,
        hadWindowPipelineFaceBefore: true,
      }),
    ).toBe(false)
    expect(
      shouldRefreshWindowOverlayAfterBoxDemote({
        targetClass: 'doorframe',
        changedCount: 1,
        hadWindowPipelineFaceBefore: true,
      }),
    ).toBe(false)
    expect(
      shouldRefreshWindowOverlayAfterBoxDemote({
        targetClass: 'wall',
        changedCount: 0,
        hadWindowPipelineFaceBefore: true,
      }),
    ).toBe(false)
    expect(
      shouldRefreshWindowOverlayAfterBoxDemote({
        targetClass: 'wall',
        changedCount: 2,
        hadWindowPipelineFaceBefore: false,
      }),
    ).toBe(false)
  })
})
