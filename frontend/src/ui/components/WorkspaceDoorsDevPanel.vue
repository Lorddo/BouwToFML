<script setup lang="ts">
import type { DoorSwingStage } from '@/cv/doors'

const doorSwingStage = defineModel<DoorSwingStage>('doorSwingStage', { required: true })

defineProps<{
  doorSwingStats?: {
    stage: DoorSwingStage
    hypothesisCount: number
    stage1HypothesisCount: number
    acceptedCount: number
    rejectedCount: number
    rejectedTooFull: number
    rejectedTooEmpty: number
    rejectedSurroundedByRoom?: number
    rejectedNoWallTouch?: number
    angleRescueCount?: number
    resolvedDoorCount: number
  } | null
  resolvedDoors?: Array<{
    id: string
    widthPx: number
    widthCm: number
    swingSpanPx: number
    framingPx: number
    overhangAlongPx?: number
    overhangOppositePx?: number
    ratioBlade: number
    kind: string
    fmlRefId: string
    source: 'single' | 'cluster' | 'angle_rescue'
    bbox: { x: number; y: number; width: number; height: number }
  }>
  boundDoors?: Array<{
    doorId: string
    segmentIndex: number
    t: number
    openingAxis: 'h' | 'v'
    outwardSign: -1 | 1
    contactScore: number
    secondaryContactScore: number
    snappedBBox: { x: number; y: number; width: number; height: number }
  }>
  orientedDoors?: Array<{
    doorId: string
    segmentIndex: number
    kind: string
    mirrored: [number, number]
    hingePx: { x: number; y: number }
    openingStartPx: { x: number; y: number }
    openingEndPx: { x: number; y: number }
    displayStartPx?: { x: number; y: number }
    displayEndPx?: { x: number; y: number }
    leafLines: number[][]
    arcPoints: number[][]
    arrowPoints: number[][]
  }>
}>()
</script>

<template>
  <div class="panel">
    <h3>Deuren — stage</h3>
    <div class="mode-col" role="group" aria-label="Deuren stage">
      <label class="mode-option">
        <input
          type="radio"
          value="stage2"
          :checked="doorSwingStage === 'stage2'"
          @change="doorSwingStage = 'stage2'"
        />
        Stage 2 (fill)
      </label>
      <label class="mode-option">
        <input
          type="radio"
          value="stage1"
          :checked="doorSwingStage === 'stage1'"
          @change="doorSwingStage = 'stage1'"
        />
        Stage 1 (raw)
      </label>
    </div>

    <details v-if="doorSwingStats" class="fold">
      <summary>
        Stats · {{ doorSwingStats.stage }} · {{ doorSwingStats.hypothesisCount }} zichtbaar · S2
        {{ doorSwingStats.acceptedCount }}/{{ doorSwingStats.rejectedCount }} · S3
        {{ doorSwingStats.resolvedDoorCount }}
      </summary>
      <ul class="stat-list">
        <li>Stage 1 totaal: {{ doorSwingStats.stage1HypothesisCount }}</li>
        <li>
          Stage 2 rejected: vol {{ doorSwingStats.rejectedTooFull }}, leeg
          {{ doorSwingStats.rejectedTooEmpty }}, room
          {{ doorSwingStats.rejectedSurroundedByRoom ?? 0 }}, no-wall
          {{ doorSwingStats.rejectedNoWallTouch ?? 0 }}, angle-rescue
          {{ doorSwingStats.angleRescueCount ?? 0 }}
        </li>
      </ul>
    </details>

    <details v-if="resolvedDoors?.length" class="fold">
      <summary>Stage 3 · {{ resolvedDoors.length }}</summary>
      <table>
        <thead>
          <tr>
            <th>id</th>
            <th>type</th>
            <th>maat</th>
            <th>model</th>
            <th>bbox</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="door in resolvedDoors" :key="door.id">
            <td>{{ door.id }}</td>
            <td>{{ door.kind }} · {{ door.source }}</td>
            <td>
              {{ door.widthPx.toFixed(1) }}px ({{ door.widthCm.toFixed(2) }}cm)<br />
              swing {{ door.swingSpanPx.toFixed(1) }} · along
              {{ (door.overhangAlongPx ?? 0).toFixed(1) }} · opp
              {{ (door.overhangOppositePx ?? 0).toFixed(1) }} · frame
              {{ door.framingPx.toFixed(1) }} · ratio
              {{ door.ratioBlade.toFixed(2) }}
            </td>
            <td>{{ door.fmlRefId }}</td>
            <td>
              {{ door.bbox.width }}×{{ door.bbox.height }} @ ({{ door.bbox.x }}, {{ door.bbox.y }})
            </td>
          </tr>
        </tbody>
      </table>
    </details>

    <details v-if="boundDoors?.length" class="fold">
      <summary>Laag 11 · {{ boundDoors.length }}</summary>
      <table>
        <thead>
          <tr>
            <th>door</th>
            <th>segment</th>
            <th>as</th>
            <th>contact</th>
            <th>snapped bbox</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="door in boundDoors" :key="door.doorId + '-' + door.segmentIndex">
            <td>{{ door.doorId }}</td>
            <td>#{{ door.segmentIndex }} · t {{ door.t.toFixed(2) }}</td>
            <td>{{ door.openingAxis }} · sign {{ door.outwardSign }}</td>
            <td>
              {{ door.contactScore.toFixed(2) }} (2e {{ door.secondaryContactScore.toFixed(2) }})
            </td>
            <td>
              {{ door.snappedBBox.width.toFixed(1) }}×{{ door.snappedBBox.height.toFixed(1) }} @ ({{
                door.snappedBBox.x.toFixed(1)
              }}, {{ door.snappedBBox.y.toFixed(1) }})
            </td>
          </tr>
        </tbody>
      </table>
    </details>

    <details v-if="orientedDoors?.length" class="fold">
      <summary>Laag 12 · {{ orientedDoors.length }}</summary>
      <table>
        <thead>
          <tr>
            <th>door</th>
            <th>type</th>
            <th>mirrored</th>
            <th>scharnier</th>
            <th>opening span</th>
            <th>symbol</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="door in orientedDoors" :key="door.doorId + '-l12-' + door.segmentIndex">
            <td>{{ door.doorId }} · seg {{ door.segmentIndex }}</td>
            <td>{{ door.kind }}</td>
            <td>[{{ door.mirrored[0] }}, {{ door.mirrored[1] }}]</td>
            <td>({{ door.hingePx.x.toFixed(1) }}, {{ door.hingePx.y.toFixed(1) }})</td>
            <td>
              ({{ door.openingStartPx.x.toFixed(1) }}, {{ door.openingStartPx.y.toFixed(1) }}) → ({{
                door.openingEndPx.x.toFixed(1)
              }}, {{ door.openingEndPx.y.toFixed(1) }})
            </td>
            <td>
              leaf {{ door.leafLines.length }} · arc {{ door.arcPoints.length }} · arrows
              {{ door.arrowPoints.length }}
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
  border: 1px solid #dbe2ea;
  padding: 4px 6px;
  text-align: left;
  vertical-align: top;
}
</style>
