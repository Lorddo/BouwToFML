import { ref } from 'vue'
import type { ElevTool } from './fml-elevation-tool'

export type { ElevTool } from './fml-elevation-tool'

export function useFmlElevationTool(): {
  activeTool: ReturnType<typeof ref<ElevTool>>
  toggleOpeningTool: (tool: Exclude<ElevTool, 'select'>) => void
  onElevToolChange: (id: string | null) => void
  resetTool: () => void
} {
  const activeTool = ref<ElevTool>('select')

  function resetTool(): void {
    activeTool.value = 'select'
  }

  function toggleOpeningTool(tool: Exclude<ElevTool, 'select'>): void {
    activeTool.value = activeTool.value === tool ? 'select' : tool
  }

  function onElevToolChange(id: string | null): void {
    if (id === 'add_door' || id === 'add_window' || id === 'split') {
      toggleOpeningTool(id)
      return
    }
    resetTool()
  }

  return { activeTool, toggleOpeningTool, onElevToolChange, resetTool }
}
