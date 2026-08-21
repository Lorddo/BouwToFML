/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import {
  emptyFitInsets,
  layoutInFitInsets,
  measureFitChromeInsets,
  resolveFitChromeHost,
} from '@/platform/canvas/fit-chrome-insets'

function mockRect(
  el: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
): void {
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  el.getBoundingClientRect = () => ({
    x: rect.left,
    y: rect.top,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right,
    bottom,
    toJSON: () => ({}),
  })
}

describe('layoutInFitInsets', () => {
  it('centreert in het vrije vlak onder/boven de chrome', () => {
    const insets = { top: 60, right: 24, bottom: 80, left: 24 }
    const fit = layoutInFitInsets(1000, 800, 400, 200, insets)
    const availW = 1000 - 24 - 24
    const availH = 800 - 60 - 80
    const scale = Math.min(availW / 400, availH / 200)
    expect(fit.scale).toBe(scale)
    expect(fit.x).toBe(24 + (availW - 400 * scale) / 2)
    expect(fit.y).toBe(60 + (availH - 200 * scale) / 2)
  })

  it('schaalt terug als content groter is dan het vrije vlak', () => {
    const fit = layoutInFitInsets(400, 400, 800, 400, emptyFitInsets(20))
    expect(fit.scale).toBeCloseTo(360 / 800)
    expect(fit.x).toBe(20)
    expect(fit.y).toBeCloseTo(20 + (360 - 400 * (360 / 800)) / 2)
  })
})

describe('measureFitChromeInsets', () => {
  it('houdt pad aan zonder chrome', () => {
    const host = document.createElement('div')
    mockRect(host, { left: 0, top: 0, width: 800, height: 600 })
    expect(measureFitChromeInsets(host, 24)).toEqual(emptyFitInsets(24))
  })

  it('telt topbar + toolbelt + rail, geen unmarked corner-widget', () => {
    const host = document.createElement('div')
    mockRect(host, { left: 0, top: 0, width: 800, height: 600 })

    const topbar = document.createElement('div')
    topbar.setAttribute('data-fit-chrome', 'top')
    mockRect(topbar, { left: 300, top: 8, width: 200, height: 44 })

    const dock = document.createElement('div')
    dock.setAttribute('data-fit-chrome', 'bottom')
    mockRect(dock, { left: 200, top: 548, width: 400, height: 40 })

    const rail = document.createElement('div')
    rail.setAttribute('data-fit-chrome', 'left')
    mockRect(rail, { left: 8, top: 180, width: 44, height: 240 })

    const fab = document.createElement('div')
    mockRect(fab, { left: 8, top: 8, width: 44, height: 44 })

    host.append(topbar, dock, rail, fab)

    expect(measureFitChromeInsets(host, 24, 8)).toEqual({
      top: 8 + 44 + 8,
      right: 24,
      bottom: 600 - 548 + 8,
      left: 8 + 44 + 8,
    })
  })
})

describe('resolveFitChromeHost', () => {
  it('kiest canvas-main zodat de workspace-toolbelt meetbaar is', () => {
    const main = document.createElement('div')
    main.className = 'canvas-main'
    const wrap = document.createElement('div')
    wrap.className = 'canvas-wrap'
    const inner = document.createElement('div')
    main.appendChild(wrap)
    wrap.appendChild(inner)
    expect(resolveFitChromeHost(inner)).toBe(main)
  })
})
