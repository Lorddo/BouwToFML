import type { ResultViewTab } from '@/cv/pipeline/merge-tab-outputs'
import type { PreprocessPanelLayer, TemplateTab } from '@/cv/preprocess/layer-preprocess-tabs'
import { tGlobal } from '@/ui/i18n'

type FlowStep = 'project' | 'input' | 'preprocess' | 'templates' | 'result'

export function workspaceFlowLabel(step: FlowStep): string {
  return tGlobal(`tabs.flow.${step}`)
}

export function getWorkspaceFlowLabels(): Record<FlowStep, string> {
  return {
    project: workspaceFlowLabel('project'),
    input: workspaceFlowLabel('input'),
    preprocess: workspaceFlowLabel('preprocess'),
    templates: workspaceFlowLabel('templates'),
    result: workspaceFlowLabel('result'),
  }
}

/** Live lookup so Dev/legacy call sites pick up locale changes when re-read. */
export const WORKSPACE_FLOW_LABELS: Record<FlowStep, string> = new Proxy(
  {} as Record<FlowStep, string>,
  {
    get(_target, prop: string | symbol) {
      if (typeof prop !== 'string') return undefined
      return workspaceFlowLabel(prop as FlowStep)
    },
    ownKeys() {
      return ['project', 'input', 'preprocess', 'templates', 'result']
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== 'string') return undefined
      return {
        enumerable: true,
        configurable: true,
        value: workspaceFlowLabel(prop as FlowStep),
      }
    },
  },
)

export function resultTabLabel(tab: ResultViewTab): string {
  return tGlobal(`tabs.canvas.result.${tab}`)
}

export const RESULT_TAB_LABELS: Record<ResultViewTab, string> = new Proxy(
  {} as Record<ResultViewTab, string>,
  {
    get(_target, prop: string | symbol) {
      if (typeof prop !== 'string') return undefined
      return resultTabLabel(prop as ResultViewTab)
    },
    ownKeys() {
      return ['walls', 'vector']
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== 'string') return undefined
      return { enumerable: true, configurable: true, value: resultTabLabel(prop as ResultViewTab) }
    },
  },
)

export function preprocessTabLabel(tab: PreprocessPanelLayer): string {
  return tGlobal(`tabs.canvas.preprocess.${tab}`)
}

export function templateTabLabel(tab: TemplateTab): string {
  return tGlobal(`tabs.canvas.templates.${tab}`)
}

export const PREPROCESS_TAB_LABELS: Record<PreprocessPanelLayer, string> = new Proxy(
  {} as Record<PreprocessPanelLayer, string>,
  {
    get(_target, prop: string | symbol) {
      if (typeof prop !== 'string') return undefined
      return preprocessTabLabel(prop as PreprocessPanelLayer)
    },
    ownKeys() {
      return ['ocr', 'walls', 'inkWall', 'gaps']
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== 'string') return undefined
      return {
        enumerable: true,
        configurable: true,
        value: preprocessTabLabel(prop as PreprocessPanelLayer),
      }
    },
  },
)

export const TEMPLATE_TAB_LABELS: Record<TemplateTab, string> = new Proxy(
  {} as Record<TemplateTab, string>,
  {
    get(_target, prop: string | symbol) {
      if (typeof prop !== 'string') return undefined
      return templateTabLabel(prop as TemplateTab)
    },
    ownKeys() {
      return ['ocr', 'walls', 'gaps', 'doors', 'windows']
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== 'string') return undefined
      return { enumerable: true, configurable: true, value: templateTabLabel(prop as TemplateTab) }
    },
  },
)
