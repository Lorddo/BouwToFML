<script setup lang="ts">
import { computed } from 'vue'
import OcrSettingsPanel from './OcrSettingsPanel.vue'
import OcrHitListPanel from './OcrHitListPanel.vue'
import RoomFacePanel from './RoomFacePanel.vue'
import DetectionProfileSwitch from './DetectionProfileSwitch.vue'
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

const canAutoclassify = computed(
  () =>
    !props.running &&
    !props.classifyingInFlight &&
    !props.initialDetectionBusy &&
    (props.hasReferenceWallRect || props.referenceWallThicknessPx != null),
)

const autoclassifyButtonLabel = computed(() => {
  if (props.initialDetectionBusy) return 'Detectie loopt…'
  if (props.classifyingInFlight && props.roomPhase === 'classifying') return 'Classificeren…'
  if (props.roomPhase === 'review' || props.roomPhase === 'done') return 'Opnieuw autoclassificeren'
  return 'Autoclassificeer'
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
    <button
      type="button"
      class="primary"
      :disabled="ocrScanning || !imageSrc"
      @click="$emit('runOcrScan')"
    >
      {{
        ocrScanning
          ? 'Scannen…'
          : ocrCandidateCount > 0
            ? `Opnieuw scannen (${ocrCandidateCount})`
            : 'Scan tekst'
      }}
    </button>
    <button
      type="button"
      :disabled="ocrCandidateCount === 0 && ocrMaskedRegionCount === 0"
      @click="$emit('clearOcrCandidates')"
    >
      Wis OCR
    </button>
    <OcrHitListPanel :hits="ocrHitList" @remove="$emit('removeOcrHit', $event)" />
  </div>

  <div v-if="templateTab === 'walls' && preprocess.ocrEnabled" class="panel">
    <h3>OCR</h3>
    <p class="hint">
      Tekst-highlights zijn actief (nog niet gebakken). Pas confidence aan, wis, of bak naar inkt.
    </p>
    <label>
      OCR min confidence:
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
    <div class="ocr-wall-actions">
      <button
        type="button"
        class="action-btn"
        :disabled="ocrCandidateCount === 0 && ocrMaskedRegionCount === 0"
        @click="$emit('clearOcrCandidates')"
      >
        Wis OCR
      </button>
      <button
        type="button"
        class="action-btn primary"
        :disabled="classifyingInFlight || (ocrCandidateCount === 0 && ocrMaskedRegionCount === 0)"
        @click="$emit('bakeOcrIntoInk')"
      >
        Bake OCR
      </button>
    </div>
  </div>

  <div v-if="templateTab === 'gaps'" class="panel">
    <h3>Gaten</h3>
    <p class="hint">
      Solid: dezelfde vlakken als Muren, maar vlakken die onder het Gaten-muurmasker (stap 2, zwart)
      vallen worden als buiten gezet — vloeren en gaten blijven gekleurd. Vlakken groter dan 3× het
      grootste deur/raam-refvlak (head/interior, geen buitenrand) worden ook wit. Eerst Muren
      classificeren. Detail-modus (debug-sidebar): Otsu-wit alleen in gaten-zwart carveën.
    </p>
    <p class="metric">
      {{
        currentTabDetected
          ? gapsDemoteStats
            ? `Muurvlakken weg: ${gapsDemoteStats.demotedCount} · behouden: ${gapsDemoteStats.keptCount}${
                gapsDemoteStats.oversizedDemotedCount
                  ? ` · te groot weg: ${gapsDemoteStats.oversizedDemotedCount} (cap ${Math.round(gapsDemoteStats.refFaceAreaCapPx ?? 0)} px)`
                  : gapsDemoteStats.maxRefFaceAreaPx
                    ? ` · ref-max ${Math.round(gapsDemoteStats.maxRefFaceAreaPx)} px`
                    : ''
              }`
            : 'Vlakken laden…'
          : 'Eerst muren classificeren op de Muren-tab.'
      }}
    </p>
  </div>

  <div v-if="templateTab === 'doors'" class="panel">
    <h3>Deuren</h3>
    <p class="hint">
      Fase 1 draaiboog-filter: ref-gestuurde kandidaten op face-niveau (non-outside seeds,
      shared-edge clustering, schaalband 40-120 cm en aspect ±5%).
    </p>
    <p class="metric">
      {{
        currentTabDetected
          ? doorSwingStats
            ? doorSwingStats.refBandCount === 0
              ? 'Geen bruikbare draaiboog-ref gevonden. Teken een deur-ref met draaicirkel op stap 1.'
              : `Actief ${doorSwingStats.stage}: ${doorSwingStats.hypothesisCount} · stage1 totaal: ${doorSwingStats.stage1HypothesisCount} · accepted: ${doorSwingStats.acceptedCount} · rejected: ${doorSwingStats.rejectedCount} · single: ${doorSwingStats.singleCount} · clusters: ${doorSwingStats.clusterCount} · refs: ${doorSwingStats.refBandCount} · seeds: ${doorSwingStats.seedCount}`
            : 'Deurkandidaten laden…'
          : 'Eerst muren classificeren op de Muren-tab.'
      }}
    </p>
    <p v-if="doorSwingStats?.sizeBandPx" class="metric">
      {{
        `Muur-as px-band: ${doorSwingStats.sizeBandPx.wallMinPx}-${doorSwingStats.sizeBandPx.wallMaxPx} (diepte uit deur-ref)`
      }}
    </p>
  </div>

  <div v-if="templateTab === 'windows'" class="panel">
    <h3>Ramen</h3>
    <p class="hint">
      Stage 1 axel-filter + Stage 2 deurboog-reject + Stage 3 evidence-filter (framing op
      as-uiteinden, fallback top+bottom).
    </p>
    <p class="metric">
      {{
        currentTabDetected
          ? windowFaceStats
            ? windowFaceStats.refBandCount === 0
              ? 'Geen bruikbare raam-axel-ref gevonden. Teken een raam-ref met duidelijke binnenstrips op stap 1.'
              : `Actief ${windowFaceStats.stage}: ${windowFaceStats.hypothesisCount} · stage1 totaal: ${windowFaceStats.stage1HypothesisCount} · stage2 accepted: ${windowFaceStats.stage2AcceptedCount} · doorframe: shared ${windowFaceStats.stage2RejectedShare}, adjacent ${windowFaceStats.stage2RejectedAdjacent}, directional ${windowFaceStats.stage2RejectedDirectional} · stage3 accepted: ${windowFaceStats.stage3AcceptedCount} (framing ${windowFaceStats.stage3AcceptedByFraming}, strip-stack ${windowFaceStats.stage3AcceptedByStripStack}) · stage3 rejected: ${windowFaceStats.stage3RejectedNoEvidence} · doorframes: ${windowFaceStats.stage3DoorframeAcceptedCount ?? 0} · stage4 windows: ${windowFaceStats.stage4ResolvedCount} · doorframes: ${windowFaceStats.stage4DoorframeCount ?? 0} · refs: ${windowFaceStats.refBandCount} · candidate faces: ${windowFaceStats.candidateRootCount} · accepted: ${windowFaceStats.acceptedCount} · rejected: ${windowFaceStats.rejectedCount}`
            : 'Raamkandidaten laden…'
          : 'Eerst muren classificeren op de Muren-tab.'
      }}
    </p>
    <div v-if="windowFaceStats?.byRef?.length" class="ref-list">
      <div v-for="ref in windowFaceStats.byRef" :key="ref.refIndex" class="ref-row">
        <span class="swatch" :style="swatchStyle(ref.color)" />
        <span class="metric">
          {{
            `Ref ${ref.refIndex + 1}: ${ref.matches} matches · patroon ${ref.stripCount} strips · h ${Math.round(ref.targetHeightPx)}px`
          }}
        </span>
      </div>
    </div>
  </div>

  <div v-if="templateTab === 'walls'" class="panel wall-actions">
    <p class="metric">
      {{
        referenceWallThicknessPx != null
          ? `Referentie muurdikte: ${referenceWallThicknessPx}px · banden &lt;40% / 40–80% / &gt;80%`
          : 'Geen muurdikte — teken een referentievak op stap 1.'
      }}
    </p>
    <button
      type="button"
      class="action-btn"
      :disabled="!canAutoclassify"
      @click="$emit('autoclassifyWalls')"
    >
      {{ autoclassifyButtonLabel }}
    </button>
    <button
      type="button"
      class="action-btn"
      :disabled="!canProcessChanges"
      @click="$emit('recalculateFaces')"
    >
      {{ classifyingInFlight ? 'Inkt verwerken…' : 'Verwerk inkt' }}
    </button>
    <p v-if="inkEditStale" class="metric warning">
      Toolbar-inkt gewijzigd: verwerk inkt — alleen geraakte vlakken worden opnieuw geclassificeerd.
    </p>
    <button
      type="button"
      class="action-btn primary"
      :disabled="!canFinalize"
      @click="$emit('finalizeWallDetection')"
    >
      {{ running && roomPhase === 'finalizing' ? 'Afronden…' : 'Afronden' }}
    </button>
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

.wall-actions .action-btn {
  width: 100%;
  margin-bottom: 8px;
  text-align: left;
}

.wall-actions .action-btn.primary {
  font-weight: 600;
}

.ocr-wall-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.ocr-wall-actions .action-btn {
  width: 100%;
  text-align: left;
}

.ocr-wall-actions .action-btn.primary {
  font-weight: 600;
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
