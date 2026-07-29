<script setup lang="ts">
import { computed } from 'vue'
import type { ProbeResult } from '@/cv/debug/probe-at-point'
import { formatProbeLayerLabel } from '@/cv/debug/flatten-output-layers'
import type { DebugProbeMode } from '@/ui/composables/workspace/useWorkspaceDebugProbe'

const props = defineProps<{
  enabled: boolean
  active: boolean
  canvasAvailable: boolean
  mode: DebugProbeMode
  lastResult: ProbeResult | null
  clipboardStatus: 'idle' | 'copied' | 'error'
}>()

const emit = defineEmits<{
  toggle: []
  setMode: [mode: DebugProbeMode]
  copy: []
}>()

const statusLabel = computed(() => {
  if (props.clipboardStatus === 'copied') return 'Gekopieerd naar klembord'
  if (props.clipboardStatus === 'error') return 'Kopiëren mislukt'
  return ''
})
</script>

<template>
  <div class="probe-section">
    <div class="probe-header">
      <h3>Debug-probe</h3>
      <p class="hint">
        Markeer een plek op het canvas; FaceID/class (na muren-classify) + nabije segmenten gaan
        naar je klembord.
      </p>
    </div>

    <div class="probe-actions">
      <button
        type="button"
        class="probe-toggle"
        :class="{ active: enabled && active }"
        :disabled="!canvasAvailable"
        :title="enabled ? 'Probe uit' : 'Probe aan'"
        @click="emit('toggle')"
      >
        <svg class="probe-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <path
            d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1l2.1-2.1M17 7l2.1-2.1"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            fill="none"
          />
        </svg>
        <span>{{ enabled && active ? 'Probe actief' : 'Probe starten' }}</span>
      </button>
    </div>

    <div v-if="!canvasAvailable" class="probe-warn">
      Schakel naar de Muren-weergave (niet Vector/FML) om pixel-coördinaten te pakken.
    </div>

    <div v-else class="mode-row">
      <label class="mode-option">
        <input
          type="radio"
          name="probe-mode"
          value="region"
          :checked="mode === 'region'"
          @change="emit('setMode', 'region')"
        />
        Sleep venster
      </label>
      <label class="mode-option">
        <input
          type="radio"
          name="probe-mode"
          value="point"
          :checked="mode === 'point'"
          @change="emit('setMode', 'point')"
        />
        Klik punt
      </label>
    </div>

    <p v-if="enabled && active" class="usage-hint">
      <template v-if="mode === 'region'">
        Sleep een rechthoek op de tekening · spatie = pan · scroll = zoom
      </template>
      <template v-else> Klik op de tekening · spatie = pan · scroll = zoom </template>
    </p>

    <div v-if="lastResult" class="probe-result">
      <div class="result-head">
        <strong>Laatste sample</strong>
        <button type="button" class="link-btn" @click="emit('copy')">Opnieuw kopiëren</button>
      </div>
      <p v-if="lastResult.kind === 'point'" class="coords">
        Punt ({{ lastResult.point.x }}, {{ lastResult.point.y }})
      </p>
      <p v-else-if="lastResult.region" class="coords">
        Gebied ({{ Math.round(lastResult.region.x) }},{{ Math.round(lastResult.region.y) }})
        {{ Math.round(lastResult.region.width) }}×{{ Math.round(lastResult.region.height) }}px
      </p>
      <ul class="hit-list">
        <li v-if="lastResult.faceSourceMissing" class="missing">
          Geen face-labels — eerst Muren classificeren
        </li>
        <template v-else>
          <li class="section">Wall-ink</li>
          <li
            v-for="face in (lastResult.wallInkFaces ?? lastResult.faces).slice(0, 5)"
            :key="'wi' + face.faceId"
          >
            FaceID {{ face.faceId }} · {{ face.className }} · {{ face.pixelCount }}px ·
            {{ face.bbox.width }}×{{ face.bbox.height }}
          </li>
          <li v-if="!(lastResult.wallInkFaces ?? lastResult.faces).length" class="empty">(geen)</li>
          <li class="section">Opening-wit</li>
          <li
            v-for="face in (lastResult.openingWhiteFaces ?? []).slice(0, 5)"
            :key="'ow' + face.faceId"
          >
            FaceID {{ face.faceId }} · {{ face.className }} · {{ face.pixelCount }}px ·
            {{ face.bbox.width }}×{{ face.bbox.height }}
          </li>
          <li v-if="!(lastResult.openingWhiteFaces ?? []).length" class="empty">(geen)</li>
        </template>
        <li v-for="(hit, i) in lastResult.segments.slice(0, 4)" :key="'s' + i">
          {{ formatProbeLayerLabel(hit.layer) }} #{{ hit.index }} ·
          {{ Math.round(hit.distancePx) }}px
        </li>
        <li v-for="(hit, i) in lastResult.junctions.slice(0, 3)" :key="'j' + i">
          {{ formatProbeLayerLabel(hit.layer) }} junction {{ hit.junction.kind }} @ ({{
            hit.junction.x
          }},{{ hit.junction.y }})
        </li>
      </ul>
      <p v-if="statusLabel" class="status" :class="clipboardStatus">{{ statusLabel }}</p>
    </div>
  </div>
</template>

<style scoped>
.probe-section {
  border-bottom: 1px solid #e2e8f0;
}

.probe-header {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.probe-header h3 {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.probe-actions {
  padding: 12px 16px;
}

.probe-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.probe-toggle:hover:not(:disabled) {
  border-color: #94a3b8;
  background: #f1f5f9;
}

.probe-toggle.active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}

.probe-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.probe-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.probe-warn {
  margin: 0 16px 12px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #fff7ed;
  color: #9a3412;
  font-size: 12px;
  line-height: 1.4;
}

.mode-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 16px 12px;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
}

.usage-hint {
  margin: 0 16px 12px;
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
}

.probe-result {
  margin: 0 16px 16px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

.result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
}

.coords {
  margin: 0 0 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: #0f172a;
}

.hit-list {
  margin: 0;
  padding-left: 16px;
  font-size: 11px;
  color: #475569;
  line-height: 1.5;
}

.hit-list .missing {
  color: #9a3412;
  list-style: disc;
}

.hit-list .section {
  list-style: none;
  margin-left: -16px;
  margin-top: 6px;
  font-weight: 600;
  color: #0f172a;
}

.hit-list .empty {
  color: #94a3b8;
  font-style: italic;
}

.status {
  margin: 8px 0 0;
  font-size: 11px;
  font-weight: 600;
}

.status.copied {
  color: #15803d;
}

.status.error {
  color: #b91c1c;
}

.link-btn {
  border: none;
  background: none;
  padding: 0;
  color: #2563eb;
  font-size: 11px;
  cursor: pointer;
  text-decoration: underline;
}
</style>
