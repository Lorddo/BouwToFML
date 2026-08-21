<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import OcrSettingsPanel from './OcrSettingsPanel.vue'
import OcrHitListPanel from './OcrHitListPanel.vue'
import RoomFacePanel from './RoomFacePanel.vue'
import DetectionProfileSwitch from './DetectionProfileSwitch.vue'
import ToolbeltIcon from './canvas/ToolbeltIcon.vue'
import type { PreprocessConfig, ElementClass, OcrTextCandidate } from '@/core/extraction/types'
import type { GeometricSignature } from '@/core/extraction/geometric-signature'
import type { DrawingProfile } from '@/platform/profile'
import type { DrawingProfileId } from '@/platform/profile'
import type { TemplateTab } from '@/cv/preprocess/layer-preprocess'
import type { RoomPhase } from '../composables/workspace/useWorkspaceRoomFaces'

const props = defineProps<{
  profileConfirmed: boolean
  activeDrawingProfile: DrawingProfile
  templateTab: TemplateTab
  referenceWallThicknessPx: number | null
  hasReferenceWallRect: boolean
  classifyingInFlight: boolean
  initialDetectionBusy?: boolean
  ocrScanning: boolean
  imageSrc: string | null
  ocrCandidateCount: number
  ocrMaskedRegionCount: number
  ocrHitList: OcrTextCandidate[]
  activeClass: ElementClass | null
  counts: Partial<Record<ElementClass, number>>
  currentTabDetected: boolean
  roomPhase: RoomPhase
  roomClassificationStats?: {
    wallCount: number
    surfaceCount: number
    unknownCount: number
    doorCount?: number
    windowCount?: number
    doorframeCount?: number
    overrideCount: number
  } | null
  gapsDemoteStats?: {
    demotedCount: number
    keptCount: number
    oversizedDemotedCount?: number
    maxRefFaceAreaPx?: number | null
    refFaceAreaCapPx?: number | null
  } | null
  doorSwingStats?: {
    stage: 'stage1' | 'stage2'
    hypothesisCount: number
    stage1HypothesisCount: number
    singleCount: number
    clusterCount: number
    refBandCount: number
    seedCount: number
    acceptedCount: number
    rejectedCount: number
    sizeBandPx: {
      wallMinPx: number
      wallMaxPx: number
    } | null
  } | null
  windowFaceStats?: {
    stage: 'stage1' | 'stage2' | 'stage3'
    refBandCount: number
    candidateRootCount: number
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
    hypothesisCount: number
    byRef: Array<{
      refIndex: number
      color: string
      stripCount: number
      targetHeightPx: number
      matches: number
    }>
  } | null
  inkEditStale?: boolean
  running: boolean
  signaturePreviewList: GeometricSignature[]
}>()

const preprocess = defineModel<PreprocessConfig>('preprocess', { required: true })

defineEmits<{
  profileSelected: [id: DrawingProfileId]
  runOcrScan: []
  clearOcrCandidates: []
  bakeOcrIntoInk: []
  removeOcrHit: [key: string]
  autoclassifyWalls: []
  recalculateFaces: []
  setTemplatePanMode: []
  setTemplateDrawMode: []
  clearTemplateTypeRects: []
  finalizeWallDetection: []
  updateSignature: [sourceExampleId: string, signature: GeometricSignature]
  redetectRenderStyle: [sourceExampleId: string]
}>()

const { t } = useI18n()

const canAutoclassify = computed(
  () =>
    !props.running &&
    !props.classifyingInFlight &&
    !props.initialDetectionBusy &&
    (props.hasReferenceWallRect || props.referenceWallThicknessPx != null),
)

const autoclassifyButtonLabel = computed(() => {
  if (props.initialDetectionBusy) return t('templates.walls.detectionRunning')
  if (props.classifyingInFlight && props.roomPhase === 'classifying') {
    return t('templates.walls.classifying')
  }
  if (props.roomPhase === 'review' || props.roomPhase === 'done') {
    return t('templates.walls.autoclassifyAgain')
  }
  return t('templates.walls.autoclassify')
})

const canProcessChanges = computed(
  () =>
    !props.running &&
    !props.classifyingInFlight &&
    !props.initialDetectionBusy &&
    props.referenceWallThicknessPx != null &&
    (props.roomPhase === 'review' || props.roomPhase === 'done'),
)

const canFinalize = computed(
  () =>
    !props.running &&
    !props.classifyingInFlight &&
    !props.initialDetectionBusy &&
    (props.roomPhase === 'review' || props.roomPhase === 'done'),
)

function swatchStyle(color: string): Record<string, string> {
  return { backgroundColor: color }
}
</script>

<template>
  <DetectionProfileSwitch
    :model-value="activeDrawingProfile.id"
    @profile-selected="$emit('profileSelected', $event)"
  />

  <OcrSettingsPanel v-if="templateTab === 'ocr'" v-model="preprocess" />

  <div v-if="templateTab === 'ocr'" class="panel">
    <div class="sidebar-icon-row">
      <button
        type="button"
        class="sidebar-icon-btn sidebar-icon-btn--primary"
        :disabled="ocrScanning || !imageSrc"
        @click="$emit('runOcrScan')"
      >
        <ToolbeltIcon name="text" />
        <span>{{
          ocrScanning
            ? t('templates.ocrTab.scanning')
            : ocrCandidateCount > 0
              ? t('templates.ocrTab.rescan', { count: ocrCandidateCount })
              : t('templates.ocrTab.scan')
        }}</span>
      </button>
      <button
        type="button"
        class="sidebar-icon-btn"
        :disabled="ocrCandidateCount === 0 && ocrMaskedRegionCount === 0"
        @click="$emit('clearOcrCandidates')"
      >
        <ToolbeltIcon name="clear" />
        <span>{{ t('templates.ocrTab.clear') }}</span>
      </button>
    </div>
    <OcrHitListPanel :hits="ocrHitList" @remove="$emit('removeOcrHit', $event)" />
  </div>

  <div v-if="templateTab === 'walls' && preprocess.ocrEnabled" class="panel">
    <h3>{{ t('templates.ocrOnWalls.title') }}</h3>
    <p class="hint">{{ t('templates.ocrOnWalls.hint') }}</p>
    <label>
      {{ t('templates.ocrOnWalls.minConfidence') }}
      <div class="field-row">
        <input
          v-model.number="preprocess.ocrMinConfidence"
          type="range"
          min="0"
          max="100"
          step="1"
        />
        <input
          v-model.number="preprocess.ocrMinConfidence"
          type="number"
          min="0"
          max="100"
          step="1"
          class="num-input"
        />
      </div>
    </label>
    <div class="ocr-wall-actions sidebar-icon-row">
      <button
        type="button"
        class="sidebar-icon-btn"
        :disabled="ocrCandidateCount === 0 && ocrMaskedRegionCount === 0"
        @click="$emit('clearOcrCandidates')"
      >
        <ToolbeltIcon name="clear" />
        <span>{{ t('templates.ocrOnWalls.clear') }}</span>
      </button>
      <button
        type="button"
        class="sidebar-icon-btn sidebar-icon-btn--primary"
        :disabled="classifyingInFlight || (ocrCandidateCount === 0 && ocrMaskedRegionCount === 0)"
        @click="$emit('bakeOcrIntoInk')"
      >
        <ToolbeltIcon name="check" />
        <span>{{ t('templates.ocrOnWalls.bake') }}</span>
      </button>
    </div>
  </div>

  <div v-if="templateTab === 'gaps'" class="panel">
    <h3>{{ t('templates.gaps.title') }}</h3>
    <p class="hint">{{ t('templates.gaps.hint') }}</p>
    <p class="metric">
      {{
        currentTabDetected
          ? gapsDemoteStats
            ? t('templates.gaps.demoted', {
                demoted: gapsDemoteStats.demotedCount,
                kept: gapsDemoteStats.keptCount,
              }) +
              (gapsDemoteStats.oversizedDemotedCount
                ? t('templates.gaps.oversized', {
                    count: gapsDemoteStats.oversizedDemotedCount,
                    cap: Math.round(gapsDemoteStats.refFaceAreaCapPx ?? 0),
                  })
                : gapsDemoteStats.maxRefFaceAreaPx
                  ? t('templates.gaps.refMax', {
                      px: Math.round(gapsDemoteStats.maxRefFaceAreaPx),
                    })
                  : '')
            : t('templates.gaps.loading')
          : t('templates.gaps.needWalls')
      }}
    </p>
  </div>

  <div v-if="templateTab === 'doors'" class="panel">
    <h3>{{ t('templates.doors.title') }}</h3>
    <p class="hint">{{ t('templates.doors.hint') }}</p>
    <p class="metric">
      {{
        currentTabDetected
          ? doorSwingStats
            ? doorSwingStats.refBandCount === 0
              ? t('templates.doors.noRef')
              : t('templates.doors.stats', {
                  stage: doorSwingStats.stage,
                  hypotheses: doorSwingStats.hypothesisCount,
                  stage1: doorSwingStats.stage1HypothesisCount,
                  accepted: doorSwingStats.acceptedCount,
                  rejected: doorSwingStats.rejectedCount,
                  single: doorSwingStats.singleCount,
                  clusters: doorSwingStats.clusterCount,
                  refs: doorSwingStats.refBandCount,
                  seeds: doorSwingStats.seedCount,
                })
            : t('templates.doors.loading')
          : t('templates.doors.needWalls')
      }}
    </p>
    <p v-if="doorSwingStats?.sizeBandPx" class="metric">
      {{
        t('templates.doors.sizeBand', {
          min: doorSwingStats.sizeBandPx.wallMinPx,
          max: doorSwingStats.sizeBandPx.wallMaxPx,
        })
      }}
    </p>
  </div>

  <div v-if="templateTab === 'windows'" class="panel">
    <h3>{{ t('templates.windows.title') }}</h3>
    <p class="hint">{{ t('templates.windows.hint') }}</p>
    <p class="metric">
      {{
        currentTabDetected
          ? windowFaceStats
            ? windowFaceStats.refBandCount === 0
              ? t('templates.windows.noRef')
              : t('templates.windows.stats', {
                  stage: windowFaceStats.stage,
                  hypotheses: windowFaceStats.hypothesisCount,
                  stage1: windowFaceStats.stage1HypothesisCount,
                  stage2Accepted: windowFaceStats.stage2AcceptedCount,
                  share: windowFaceStats.stage2RejectedShare,
                  adjacent: windowFaceStats.stage2RejectedAdjacent,
                  directional: windowFaceStats.stage2RejectedDirectional,
                  stage3Accepted: windowFaceStats.stage3AcceptedCount,
                  framing: windowFaceStats.stage3AcceptedByFraming,
                  stripStack: windowFaceStats.stage3AcceptedByStripStack,
                  stage3Rejected: windowFaceStats.stage3RejectedNoEvidence,
                  doorframes: windowFaceStats.stage3DoorframeAcceptedCount ?? 0,
                  stage4Windows: windowFaceStats.stage4ResolvedCount,
                  stage4Doorframes: windowFaceStats.stage4DoorframeCount ?? 0,
                  refs: windowFaceStats.refBandCount,
                  candidates: windowFaceStats.candidateRootCount,
                  accepted: windowFaceStats.acceptedCount,
                  rejected: windowFaceStats.rejectedCount,
                })
            : t('templates.windows.loading')
          : t('templates.windows.needWalls')
      }}
    </p>
    <div v-if="windowFaceStats?.byRef?.length" class="ref-list">
      <div v-for="ref in windowFaceStats.byRef" :key="ref.refIndex" class="ref-row">
        <span class="swatch" :style="swatchStyle(ref.color)" />
        <span class="metric">
          {{
            t('templates.windows.refRow', {
              n: ref.refIndex + 1,
              matches: ref.matches,
              strips: ref.stripCount,
              height: Math.round(ref.targetHeightPx),
            })
          }}
        </span>
      </div>
    </div>
  </div>
  <div v-if="templateTab === 'walls'" class="panel wall-actions">
    <p class="metric">
      {{
        referenceWallThicknessPx != null
          ? t('templates.walls.thicknessKnown', { px: referenceWallThicknessPx })
          : t('templates.walls.thicknessMissing')
      }}
    </p>
    <div class="sidebar-icon-row">
      <button
        type="button"
        class="sidebar-icon-btn"
        :disabled="!canAutoclassify"
        @click="$emit('autoclassifyWalls')"
      >
        <ToolbeltIcon name="classify" />
        <span>{{ autoclassifyButtonLabel }}</span>
      </button>
      <button
        type="button"
        class="sidebar-icon-btn"
        :disabled="!canProcessChanges"
        @click="$emit('recalculateFaces')"
      >
        <ToolbeltIcon name="brush" />
        <span>{{
          classifyingInFlight ? t('templates.walls.processingInk') : t('templates.walls.processInk')
        }}</span>
      </button>
      <button
        type="button"
        class="sidebar-icon-btn sidebar-icon-btn--primary"
        :disabled="!canFinalize"
        @click="$emit('finalizeWallDetection')"
      >
        <ToolbeltIcon name="check" />
        <span>{{
          running && roomPhase === 'finalizing'
            ? t('templates.walls.finalizing')
            : t('templates.walls.finalize')
        }}</span>
      </button>
    </div>
    <p v-if="inkEditStale" class="metric warning">{{ t('templates.walls.inkStale') }}</p>
  </div>

  <RoomFacePanel
    v-if="templateTab === 'walls'"
    :room-phase="roomPhase"
    :stats="roomClassificationStats"
  />
</template>

<style scoped>
.panel {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.hint {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 8px;
  line-height: 1.4;
}

.metric {
  margin: 0;
  font-size: 12px;
  color: #475569;
}

.ref-list {
  margin-top: 8px;
  display: grid;
  gap: 4px;
}

.ref-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.swatch {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  flex-shrink: 0;
}

.ocr-wall-actions {
  margin-top: 10px;
}

.field-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
}

.field-row input[type='range'] {
  flex: 1;
}

.num-input {
  width: 74px;
}

label {
  display: block;
  font-size: 13px;
  margin: 6px 0;
}

.wall-actions .metric {
  margin: 0 0 8px;
  font-size: 11px;
  color: #475569;
}

.wall-actions .metric.warning {
  color: #b45309;
}
</style>
