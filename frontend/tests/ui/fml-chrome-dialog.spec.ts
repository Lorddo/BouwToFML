import { afterEach, describe, expect, it } from 'vitest'
import {
  cancelFmlChromeDialog,
  confirmFmlChrome,
  confirmFmlChromeDialog,
  fmlChromeDialogState,
  promptFacadeGroupName,
  promptFmlChrome,
  promptFmlChromeChoice,
  registerFmlChromeDialogHost,
  resetFmlChromeDialogForTests,
  resolveFmlChromeDialog,
} from '@/ui/composables/fml-chrome-dialog'

describe('fml-chrome-dialog', () => {
  afterEach(() => {
    resetFmlChromeDialogForTests()
  })

  it('confirm resolves true/false via host', async () => {
    const unregister = registerFmlChromeDialogHost()
    const pending = confirmFmlChrome({ title: 'Overwrite', message: 'Set 260 cm?' })
    expect(fmlChromeDialogState().value?.state.request.title).toBe('Overwrite')
    confirmFmlChromeDialog()
    await expect(pending).resolves.toBe(true)

    const rejected = confirmFmlChrome({ title: 'Overwrite', message: 'Again?' })
    cancelFmlChromeDialog()
    await expect(rejected).resolves.toBe(false)
    unregister()
  })

  it('prompt returns typed value and trims empty via resolve', async () => {
    const unregister = registerFmlChromeDialogHost()
    const pending = promptFmlChrome({
      title: 'Facade',
      defaultValue: 'Voorgevel',
    })
    const state = fmlChromeDialogState().value
    expect(state?.state.inputValue).toBe('Voorgevel')
    if (state) state.state.inputValue = ' Westgevel '
    resolveFmlChromeDialog(state?.state.inputValue ?? null)
    await expect(pending).resolves.toBe(' Westgevel ')
    unregister()
  })

  it('promptFacadeGroupName uses current name when editing', async () => {
    const unregister = registerFmlChromeDialogHost()
    const pending = promptFacadeGroupName({ currentName: 'Achtergevel' })
    const state = fmlChromeDialogState().value
    expect(state?.state.inputValue).toBe('Achtergevel')
    confirmFmlChromeDialog()
    await expect(pending).resolves.toBe('Achtergevel')
    unregister()
  })

  it('promptFmlChromeChoice returns selected id', async () => {
    const unregister = registerFmlChromeDialogHost()
    const pending = promptFmlChromeChoice({
      title: 'Bind',
      defaultValue: '0',
      listItems: [
        { id: '0', name: 'BG' },
        { id: '1', name: '1e' },
      ],
    })
    const state = fmlChromeDialogState().value
    expect(state?.state.request.kind).toBe('choice')
    expect(state?.state.inputValue).toBe('0')
    if (state) state.state.inputValue = '1'
    confirmFmlChromeDialog()
    await expect(pending).resolves.toBe('1')
    unregister()
  })

  it('promptFmlChromeChoice cancel returns null', async () => {
    const unregister = registerFmlChromeDialogHost()
    const pending = promptFmlChromeChoice({
      title: 'Bind',
      listItems: [{ id: '0', name: 'BG' }],
    })
    cancelFmlChromeDialog()
    await expect(pending).resolves.toBeNull()
    unregister()
  })

  it('a second dialog cancels the first', async () => {
    const unregister = registerFmlChromeDialogHost()
    const first = confirmFmlChrome({ title: 'One', message: 'a' })
    const second = confirmFmlChrome({ title: 'Two', message: 'b' })
    await expect(first).resolves.toBe(false)
    expect(fmlChromeDialogState().value?.state.request.title).toBe('Two')
    confirmFmlChromeDialog()
    await expect(second).resolves.toBe(true)
    unregister()
  })
})
