/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TOOLBELT_HOTKEY_PRIORITY,
  dispatchToolbeltHotkey,
  hasToolbeltHotkey,
  onToolbeltHotkeyKeydown,
  registerToolbeltHotkey,
  resetToolbeltHotkeysForTests,
} from '@/ui/composables/canvas/useToolbeltHotkey'

afterEach(() => {
  resetToolbeltHotkeysForTests()
})

describe('toolbelt hotkeys', () => {
  it('laatste registratie wint bij dezelfde prioriteit', () => {
    const first = vi.fn()
    const second = vi.fn()
    registerToolbeltHotkey('Delete', first, TOOLBELT_HOTKEY_PRIORITY.object)
    registerToolbeltHotkey('Delete', second, TOOLBELT_HOTKEY_PRIORITY.object)
    expect(dispatchToolbeltHotkey('Delete')).toBe(true)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('hogere prioriteit wint van latere lagere', () => {
    const object = vi.fn()
    const chrome = vi.fn()
    registerToolbeltHotkey('Delete', object, TOOLBELT_HOTKEY_PRIORITY.object)
    registerToolbeltHotkey('Delete', chrome, TOOLBELT_HOTKEY_PRIORITY.chrome)
    dispatchToolbeltHotkey('Delete')
    expect(object).toHaveBeenCalledTimes(1)
    expect(chrome).not.toHaveBeenCalled()
  })

  it('Escape sluit de tool, niet deselect, als beide zichtbaar zijn', () => {
    const deselect = vi.fn()
    const deactivate = vi.fn()
    registerToolbeltHotkey('Escape', deselect, TOOLBELT_HOTKEY_PRIORITY.chrome)
    registerToolbeltHotkey('Escape', deactivate, TOOLBELT_HOTKEY_PRIORITY.tool)
    dispatchToolbeltHotkey('Escape')
    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(deselect).not.toHaveBeenCalled()
  })

  it('Delete in een invoerveld laat de selectie staan', () => {
    const remove = vi.fn()
    registerToolbeltHotkey('Delete', remove, TOOLBELT_HOTKEY_PRIORITY.object)
    const input = document.createElement('input')
    const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: input })
    onToolbeltHotkeyKeydown(event)
    expect(remove).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('Escape vanuit een invoerveld voert de zichtbare cancel uit', () => {
    const deactivate = vi.fn()
    registerToolbeltHotkey('Escape', deactivate, TOOLBELT_HOTKEY_PRIORITY.tool)
    const input = document.createElement('input')
    const blur = vi.spyOn(input, 'blur')
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: input })
    onToolbeltHotkeyKeydown(event)
    expect(blur).toHaveBeenCalledTimes(1)
    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('unregister haalt de hotkey weg', () => {
    const run = vi.fn()
    const stop = registerToolbeltHotkey('Escape', run, TOOLBELT_HOTKEY_PRIORITY.tool)
    expect(hasToolbeltHotkey('Escape')).toBe(true)
    stop()
    expect(hasToolbeltHotkey('Escape')).toBe(false)
    expect(dispatchToolbeltHotkey('Escape')).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })
})
