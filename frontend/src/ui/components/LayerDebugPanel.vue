<script setup lang="ts">
import type { PipelineWallDebug } from '@/core/extraction/types'
import type { WallPipelineVersion } from '@/platform/wall-pipeline-version'

const props = defineProps<{
  showSkeleton: boolean
  showLayer2: boolean
  showLayer3: boolean
  showLayer4: boolean
  showLayer5: boolean
  showLayer6: boolean
  showLayer7: boolean
  showLayer8: boolean
  showLayer9: boolean
  showLayer10: boolean
  showLayer11: boolean
  showLayer12: boolean
  showLayer14: boolean
  showLines: boolean
  showOcrText: boolean
  pipelineDebug?: PipelineWallDebug
  wallPipelineVersion?: WallPipelineVersion
}>()

const emit = defineEmits<{
  toggleSkeleton: [value: boolean]
  toggleLayer2: [value: boolean]
  toggleLayer3: [value: boolean]
  toggleLayer4: [value: boolean]
  toggleLayer5: [value: boolean]
  toggleLayer6: [value: boolean]
  toggleLayer7: [value: boolean]
  toggleLayer8: [value: boolean]
  toggleLayer9: [value: boolean]
  toggleLayer10: [value: boolean]
  toggleLayer11: [value: boolean]
  toggleLayer12: [value: boolean]
  toggleLayer14: [value: boolean]
  toggleLines: [value: boolean]
  toggleOcrText: [value: boolean]
}>()

/** Laatste laag per detectie — standaard zichtbaar in de panel. */
const FINAL_LAYER_TOGGLES = [
  {
    n: 10,
    title: 'Muren FML input',
    checked: () => props.showLayer10,
    event: 'toggleLayer10' as const,
  },
  {
    n: 12,
    title: 'Deur swing orient',
    checked: () => props.showLayer12,
    event: 'toggleLayer12' as const,
  },
  {
    n: 14,
    title: 'Raam segment-bind',
    checked: () => props.showLayer14,
    event: 'toggleLayer14' as const,
  },
]

/** Tussenlagen — standaard uit; in details. */
const INTERMEDIATE_LAYER_TOGGLES = [
  { n: 1, title: 'Ruw WASM', checked: () => props.showSkeleton, event: 'toggleSkeleton' as const },
  { n: 2, title: 'Segment-merge', checked: () => props.showLayer2, event: 'toggleLayer2' as const },
  { n: 3, title: 'I-spur prune', checked: () => props.showLayer3, event: 'toggleLayer3' as const },
  { n: 4, title: 'H/V position', checked: () => props.showLayer4, event: 'toggleLayer4' as const },
  {
    n: 5,
    title: 'Segment cleanup',
    checked: () => props.showLayer5,
    event: 'toggleLayer5' as const,
  },
  {
    n: 6,
    title: 'Junction repair',
    checked: () => props.showLayer6,
    event: 'toggleLayer6' as const,
  },
  {
    n: 7,
    title: 'Keten-collapse',
    checked: () => props.showLayer7,
    event: 'toggleLayer7' as const,
  },
  {
    n: 8,
    title: 'H/V + I-prune (finalize)',
    checked: () => props.showLayer8,
    event: 'toggleLayer8' as const,
  },
  {
    n: 9,
    title: 'Dissolve (stub/cover)',
    checked: () => props.showLayer9,
    event: 'toggleLayer9' as const,
  },
  {
    n: 11,
    title: 'Door-wall snap',
    checked: () => props.showLayer11,
    event: 'toggleLayer11' as const,
  },
]

type LayerToggleEvent =
  | (typeof FINAL_LAYER_TOGGLES)[number]['event']
  | (typeof INTERMEDIATE_LAYER_TOGGLES)[number]['event']

function countFor(key: string): number | null {
  const summary = props.pipelineDebug?.summary?.segmentCounts
  if (!summary) return null
  return summary[key] ?? null
}

function junctionCountFor(key: string): number | null {
  const summary = props.pipelineDebug?.summary?.junctionCounts
  if (!summary) return null
  return summary[key] ?? null
}

function segmentCountForLayer(n: number): number {
  const key = `layer${n}`
  return (
    countFor(key) ??
    props.pipelineDebug?.layers[key as keyof PipelineWallDebug['layers']]?.segments.length ??
    0
  )
}

function junctionCountForLayer(n: number): number {
  const key = `layer${n}`
  return (
    junctionCountFor(key) ??
    props.pipelineDebug?.layers[key as keyof PipelineWallDebug['layers']]?.junctions.length ??
    0
  )
}

function junctionKindSummaryForLayer(n: number): string | null {
  const key = `layer${n}` as keyof NonNullable<PipelineWallDebug['summary']>['junctionKindCounts']
  const counts = props.pipelineDebug?.summary?.junctionKindCounts?.[key] ?? countKindsFromLayer(n)
  if (!counts) return null
  return `I=${counts.I} L=${counts.L} T=${counts.T} X=${counts.X}`
}

function countKindsFromLayer(n: number): Record<'I' | 'L' | 'T' | 'X', number> | null {
  const layer = props.pipelineDebug?.layers[`layer${n}` as keyof PipelineWallDebug['layers']]
  if (!layer?.junctions?.length) return null
  const counts = { I: 0, L: 0, T: 0, X: 0 }
  for (const junction of layer.junctions) counts[junction.kind] += 1
  return counts
}

function onLayerToggle(event: LayerToggleEvent, checked: boolean) {
  switch (event) {
    case 'toggleSkeleton':
      emit('toggleSkeleton', checked)
      break
    case 'toggleLayer2':
      emit('toggleLayer2', checked)
      break
    case 'toggleLayer3':
      emit('toggleLayer3', checked)
      break
    case 'toggleLayer4':
      emit('toggleLayer4', checked)
      break
    case 'toggleLayer5':
      emit('toggleLayer5', checked)
      break
    case 'toggleLayer6':
      emit('toggleLayer6', checked)
      break
    case 'toggleLayer7':
      emit('toggleLayer7', checked)
      break
    case 'toggleLayer8':
      emit('toggleLayer8', checked)
      break
    case 'toggleLayer9':
      emit('toggleLayer9', checked)
      break
    case 'toggleLayer10':
      emit('toggleLayer10', checked)
      break
    case 'toggleLayer11':
      emit('toggleLayer11', checked)
      break
    case 'toggleLayer12':
      emit('toggleLayer12', checked)
      break
    case 'toggleLayer14':
      emit('toggleLayer14', checked)
      break
  }
}

function activeVersionLabel(): string {
  const fromDebug = props.pipelineDebug?.pipelineVersion
  if (fromDebug && fromDebug !== 'v3') return `v3 (last run: ${fromDebug})`
  return 'v3'
}

function bridgeHint(): string | null {
  if (props.pipelineDebug?.pipelineVersion !== 'v3') return null
  const summary = props.pipelineDebug.summary as
    | {
        bridgeMode?: string
        completedThroughLayer?: number
        fmlReady?: boolean
        incompleteLayers?: number[]
      }
    | undefined
  if (!summary) return null
  const through = summary.completedThroughLayer
  const incomplete = summary.incompleteLayers ?? []
  if (summary.fmlReady) return through != null ? `V3 compleet t/m L${through}` : 'V3 FML ready'
  if (through != null) {
    return `V3 stopt na L${through} — incomplete [${incomplete.join(',')}] — geen FML`
  }
  return null
}
</script>

<template>
  <div class="panel layer-debug">
    <h3>Layer Debug</h3>

    <div class="pipeline-version">
      <span class="version-label">Pipeline</span>
      <span class="hint">{{ activeVersionLabel() }}</span>
    </div>
    <p v-if="bridgeHint()" class="hint warn">{{ bridgeHint() }}</p>

    <p class="section-label">Eindlagen (muur / deur / raam)</p>
    <div class="toggle-list layer-toggles">
      <label v-for="layer in FINAL_LAYER_TOGGLES" :key="layer.n" :title="layer.title">
        <input
          type="checkbox"
          :checked="layer.checked()"
          @change="onLayerToggle(layer.event, ($event.target as HTMLInputElement).checked)"
        />
        Laag {{ layer.n }}
        <span class="layer-hint">{{ layer.title }}</span>
      </label>
    </div>

    <details class="intermediate-details">
      <summary>Tussenlagen (standaard uit)</summary>
      <div class="toggle-list layer-toggles">
        <label v-for="layer in INTERMEDIATE_LAYER_TOGGLES" :key="layer.n" :title="layer.title">
          <input
            type="checkbox"
            :checked="layer.checked()"
            @change="onLayerToggle(layer.event, ($event.target as HTMLInputElement).checked)"
          />
          Laag {{ layer.n }}
          <span class="layer-hint">{{ layer.title }}</span>
        </label>
      </div>
    </details>

    <div class="toggle-list overlay-toggles">
      <label>
        <input
          type="checkbox"
          :checked="showLines"
          @change="emit('toggleLines', ($event.target as HTMLInputElement).checked)"
        />
        Ruwe lijnen
      </label>
      <label>
        <input
          type="checkbox"
          :checked="showOcrText"
          @change="emit('toggleOcrText', ($event.target as HTMLInputElement).checked)"
        />
        OCR-tekstboxen
      </label>
    </div>

    <details class="stats-details">
      <summary>Tellingen per laag</summary>
      <ul class="stats-list">
        <li v-for="n in 10" :key="n">
          L{{ n }}: {{ segmentCountForLayer(n) }} seg · {{ junctionCountForLayer(n) }} junc
          <span v-if="junctionKindSummaryForLayer(n)" class="kind-hint">
            ({{ junctionKindSummaryForLayer(n) }})
          </span>
        </li>
      </ul>
      <p v-if="pipelineDebug?.summary?.incompleteLayers?.length" class="hint warn">
        Incomplete: {{ pipelineDebug.summary.incompleteLayers.join(', ') }}
      </p>
    </details>
  </div>
</template>

<style scoped>
.pipeline-version {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}

.version-label {
  font-weight: 600;
}

.section-label {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.toggle-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
}

.toggle-list label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  min-height: 24px;
  cursor: pointer;
}

.layer-hint {
  color: #888;
  font-size: 11px;
}

.intermediate-details,
.stats-details {
  margin-top: 8px;
  font-size: 12px;
}

.intermediate-details summary,
.stats-details summary {
  cursor: pointer;
  color: #64748b;
}

.stats-list {
  margin: 4px 0 0;
  padding-left: 16px;
}

.kind-hint {
  color: #888;
  font-size: 11px;
}

.hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #888;
}

.hint.warn {
  color: #b45309;
}

.overlay-toggles {
  margin-top: 8px;
}
</style>
