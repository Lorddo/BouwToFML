import { afterEach, describe, expect, it } from 'vitest'
import {
  cancelPlanChromeDialog,
  confirmPlanChrome,
  confirmPlanChromeDialog,
  planChromeDialogState,
  promptFacadeGroupName,
  promptFacadeSelectScope,
  promptPlanChrome,
  promptDefaultsApplyScope,
  promptPlanChromeChoice,
  promptPlanExportFormat,
  registerPlanChromeDialogHost,
  resetPlanChromeDialogForTests,
  resolvePlanChromeDialog,
} from '@/ui/composables/plan-chrome-dialog'

describe('plan-chrome-dialog', () => {
  afterEach(() => {
    resetPlanChromeDialogForTests()
  })

  it('confirm resolves true/false via host', async () => {
    const unregister = registerPlanChromeDialogHost()
    const pending = confirmPlanChrome({ title: 'Overwrite', message: 'Set 260 cm?' })
    expect(planChromeDialogState().value?.state.request.title).toBe('Overwrite')
    confirmPlanChromeDialog()
    await expect(pending).resolves.toBe(true)

    const rejected = confirmPlanChrome({ title: 'Overwrite', message: 'Again?' })
    cancelPlanChromeDialog()
    await expect(rejected).resolves.toBe(false)
    unregister()
  })

  it('prompt returns typed value and trims empty via resolve', async () => {
    const unregister = registerPlanChromeDialogHost()
    const pending = promptPlanChrome({
      title: 'Facade',
      defaultValue: 'Voorgevel',
    })
    const state = planChromeDialogState().value
    expect(state?.state.inputValue).toBe('Voorgevel')
    if (state) state.state.inputValue = ' Westgevel '
    resolvePlanChromeDialog(state?.state.inputValue ?? null)
    await expect(pending).resolves.toBe(' Westgevel ')
    unregister()
  })

  it('promptFacadeGroupName uses current name when editing', async () => {
    const unregister = registerPlanChromeDialogHost()
    const pending = promptFacadeGroupName({ currentName: 'Achtergevel' })
    const state = planChromeDialogState().value
    expect(state?.state.inputValue).toBe('Achtergevel')
    confirmPlanChromeDialog()
    await expect(pending).resolves.toBe('Achtergevel')
    unregister()
  })

  it('promptPlanChromeChoice returns selected id', async () => {
    const unregister = registerPlanChromeDialogHost()
    const pending = promptPlanChromeChoice({
      title: 'Bind',
      defaultValue: '0',
      listItems: [
        { id: '0', name: 'BG' },
        { id: '1', name: '1e' },
      ],
    })
    const state = planChromeDialogState().value
    expect(state?.state.request.kind).toBe('choice')
    expect(state?.state.inputValue).toBe('0')
    if (state) state.state.inputValue = '1'
    confirmPlanChromeDialog()
    await expect(pending).resolves.toBe('1')
    unregister()
  })

  it('promptFacadeSelectScope returns floor or all', async () => {
    const unregister = registerPlanChromeDialogHost()
    const pending = promptFacadeSelectScope({ name: 'Voorgevel' })
    const state = planChromeDialogState().value
    expect(state?.state.request.kind).toBe('choice')
    expect(state?.state.inputValue).toBe('floor')
    expect(state?.state.request.listItems?.map((row) => row.id)).toEqual(['floor', 'all'])
    if (state) state.state.inputValue = 'all'
    confirmPlanChromeDialog()
    await expect(pending).resolves.toBe('all')
    unregister()
  })

  it('promptDefaultsApplyScope slaat overwrite over bij count 0', async () => {
    await expect(
      promptDefaultsApplyScope({
        title: 'Defaults',
        message: 'Set?',
        floorCount: 2,
        existingCount: 0,
      }),
    ).resolves.toBe('defaultsOnly')
  })

  it('promptDefaultsApplyScope verbergt Project bij één floor', async () => {
    const unregister = registerPlanChromeDialogHost()
    const pending = promptDefaultsApplyScope({
      title: 'Defaults',
      message: 'Set?',
      floorCount: 1,
      existingCount: 2,
    })
    const state = planChromeDialogState().value
    expect(state?.state.request.listItems?.map((row) => row.id)).toEqual([
      'defaultsOnly',
      'floor',
    ])
    if (state) state.state.inputValue = 'floor'
    confirmPlanChromeDialog()
    await expect(pending).resolves.toBe('floor')
    unregister()
  })

  it('promptPlanExportFormat returns fml or plg', async () => {
    const unregister = registerPlanChromeDialogHost()
    const pending = promptPlanExportFormat()
    const state = planChromeDialogState().value
    expect(state?.state.request.kind).toBe('choice')
    expect(state?.state.inputValue).toBe('fml')
    expect(state?.state.request.listItems?.map((row) => row.id)).toEqual(['fml', 'plg'])
    if (state) state.state.inputValue = 'plg'
    confirmPlanChromeDialog()
    await expect(pending).resolves.toBe('plg')
    unregister()
  })

  it('promptPlanChromeChoice cancel returns null', async () => {
    const unregister = registerPlanChromeDialogHost()
    const pending = promptPlanChromeChoice({
      title: 'Bind',
      listItems: [{ id: '0', name: 'BG' }],
    })
    cancelPlanChromeDialog()
    await expect(pending).resolves.toBeNull()
    unregister()
  })

  it('a second dialog cancels the first', async () => {
    const unregister = registerPlanChromeDialogHost()
    const first = confirmPlanChrome({ title: 'One', message: 'a' })
    const second = confirmPlanChrome({ title: 'Two', message: 'b' })
    await expect(first).resolves.toBe(false)
    expect(planChromeDialogState().value?.state.request.title).toBe('Two')
    confirmPlanChromeDialog()
    await expect(second).resolves.toBe(true)
    unregister()
  })
})
