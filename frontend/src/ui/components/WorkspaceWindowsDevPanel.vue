<script setup lang="ts">
import { computed } from 'vue'
import {
  CONCEPT_WINDOW_REFID,
  WINDOW_DOUBLE_REFID,
  WINDOW_TRIPLE_REFID,
} from '@/core/fml/types'
import type {
  BoundWindow,
  ResolvedWindowCandidate,
  WindowAxelStage,
  WindowBindRejection,
} from '@/cv/windows'

const windowAxelStage = defineModel<WindowAxelStage>('windowAxelStage', { required: true })

const props = defineProps<{
  windowFaceStats?: {
    stage: WindowAxelStage
    hypothesisCount: number
    stage1HypothesisCount: number
    acceptedCount: number
    rejectedCount: number
    stage2AcceptedCount: number
    stage2RejectedShare: number
    stage2RejectedAdjacent: number
    stage2RejectedDirectional: number
    stage3AcceptedCount: number
    stage3AcceptedByFraming: number
    stage3AcceptedByStripStack: number
    stage3RejectedNoEvidence: number
    stage3DoorframeAcceptedCount?: number
    stage4ResolvedCount: number
    stage4DoorframeCount?: number
    refBandCount: number
    candidateRootCount: number
  } | null
  resolvedWindows?: ResolvedWindowCandidate[]
  boundWindows?: BoundWindow[]
  windowBindRejections?: WindowBindRejection[]
}>()

const bindRejectSummary = computed(() => {
  const rejected = props.windowBindRejections ?? []
  if (rejected.length <= 0) return ''
  const counts = new Map<string, number>()
  for (const entry of rejected) {
    counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1)
  }
  return [...counts.entries()].map(([reason, count]) => `${reason}=${count}`).join(', ')
})

function shortRefId(refid: string): string {
  if (refid === CONCEPT_WINDOW_REFID) return '1-delig'
  if (refid === WINDOW_DOUBLE_REFID) return '2-delig'
  if (refid === WINDOW_TRIPLE_REFID) return '3-delig'
  return refid.slice(0, 8)
}
</script>

<template>
  <div class="panel">
    <h3>Ramen — stage</h3>
    <div class="mode-col" role="group" aria-label="Ramen stage">
      <label class="mode-option">
        <input
          type="radio"
          value="stage3"
          :checked="windowAxelStage === 'stage3'"
          @change="windowAxelStage = 'stage3'"
        />
        Stage 3 (framing / strip-stack)
      </label>
      <label class="mode-option">
        <input
          type="radio"
          value="stage2"
          :checked="windowAxelStage === 'stage2'"
          @change="windowAxelStage = 'stage2'"
        />
        Stage 2 (doorframe / windows)
      </label>
      <label class="mode-option">
        <input
          type="radio"
          value="stage1"
          :checked="windowAxelStage === 'stage1'"
          @change="windowAxelStage = 'stage1'"
        />
        Stage 1 (raw)
      </label>
    </div>

    <details v-if="windowFaceStats" class="fold">
      <summary>
        Stats · {{ windowFaceStats.stage }} · {{ windowFaceStats.hypothesisCount }} zichtbaar · S3
        {{ windowFaceStats.stage3AcceptedCount }} · S4 {{ windowFaceStats.stage4ResolvedCount }} · L14
        {{ boundWindows?.length ?? 0 }}
      </summary>
      <ul class="stat-list">
        <li>Stage 1: {{ windowFaceStats.stage1HypothesisCount }}</li>
        <li>
          Stage 2: accepted {{ windowFaceStats.stage2AcceptedCount }} · doorframe shared
          {{ windowFaceStats.stage2RejectedShare }}, adjacent
          {{ windowFaceStats.stage2RejectedAdjacent }}, directional
          {{ windowFaceStats.stage2RejectedDirectional }}
        </li>
        <li>
          Stage 3: framing {{ windowFaceStats.stage3AcceptedByFraming }}, strip-stack
          {{ windowFaceStats.stage3AcceptedByStripStack }}, rejected
          {{ windowFaceStats.stage3RejectedNoEvidence }} · doorframes
          {{ windowFaceStats.stage3DoorframeAcceptedCount ?? 0 }}
        </li>
        <li>
          Stage 4: windows {{ windowFaceStats.stage4ResolvedCount }}, doorframes
          {{ windowFaceStats.stage4DoorframeCount ?? 0 }}
        </li>
        <li>
          Refs {{ windowFaceStats.refBandCount }} · candidates
          {{ windowFaceStats.candidateRootCount }} · L14 rejected
          {{ windowBindRejections?.length ?? 0 }}
          <template v-if="bindRejectSummary"> ({{ bindRejectSummary }})</template>
        </li>
      </ul>
    </details>

    <details v-if="boundWindows?.length" class="fold">
      <summary>L14 bound · {{ boundWindows.length }}</summary>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Seg</th>
            <th>t</th>
            <th>Width</th>
            <th>Axis</th>
            <th>Evidence</th>
            <th>Ref</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="window in boundWindows" :key="window.windowId">
            <td>{{ window.windowId }}</td>
            <td>{{ window.segmentIndex }}</td>
            <td>{{ window.t.toFixed(3) }}</td>
            <td>{{ window.widthPx.toFixed(1) }}px / {{ window.widthCm.toFixed(2) }}cm</td>
            <td>{{ window.openingAxis }}</td>
            <td>{{ window.evidence }}</td>
            <td class="refid">{{ shortRefId(window.fmlRefId) }}</td>
          </tr>
        </tbody>
      </table>
    </details>

    <details v-if="resolvedWindows?.length" class="fold">
      <summary>Stage 4 resolved · {{ resolvedWindows.length }}</summary>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Ref</th>
            <th>Evidence</th>
            <th>Afmeting</th>
            <th>Locatie</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="window in resolvedWindows" :key="window.id">
            <td>{{ window.id }}</td>
            <td>{{ window.matchedRefIndex + 1 }}</td>
            <td>{{ window.evidence }}</td>
            <td>
              {{ window.widthPx.toFixed(1) }}px / {{ window.widthCm.toFixed(2) }}cm ·
              {{ window.heightPx.toFixed(1) }}px / {{ window.heightCm.toFixed(2) }}cm
            </td>
            <td>
              bbox {{ window.bbox.width.toFixed(1) }}×{{ window.bbox.height.toFixed(1) }} @
              ({{ window.bbox.x.toFixed(1) }}, {{ window.bbox.y.toFixed(1) }}) · centroid
              ({{ window.centroidPx.x.toFixed(1) }}, {{ window.centroidPx.y.toFixed(1) }})
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  </div>
</template>

<style scoped>
.panel {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.mode-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
}

.fold {
  margin-top: 10px;
  font-size: 11px;
  color: #475569;
}

.fold summary {
  cursor: pointer;
  font-weight: 600;
  color: #334155;
  list-style-position: outside;
}

.stat-list {
  margin: 6px 0 0;
  padding-left: 18px;
}

table {
  width: 100%;
  margin-top: 6px;
  border-collapse: collapse;
  font-size: 11px;
}

th,
td {
  border: 1px solid #cbd5e1;
  padding: 4px 6px;
  text-align: left;
  vertical-align: top;
}

th {
  background: #f8fafc;
}

.refid {
  white-space: nowrap;
}
</style>
