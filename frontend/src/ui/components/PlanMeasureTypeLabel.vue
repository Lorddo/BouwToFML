<script setup lang="ts">
import type { ScaleInputUnit } from '@/ui/composables/settings/scale-input-unit'

withDefaults(
  defineProps<{
    x: number
    y: number
    text: string
    unit: ScaleInputUnit | string
    typing?: boolean
    showAccept?: boolean
    acceptTitle?: string
    acceptAria?: string
    tone?: 'plan' | 'elev'
    axis?: 'wall' | 'h' | 'v'
  }>(),
  {
    typing: false,
    showAccept: false,
    acceptTitle: '',
    acceptAria: '',
    tone: 'plan',
    axis: 'wall',
  },
)

const emit = defineEmits<{
  accept: []
}>()
</script>

<template>
  <div
    class="draw-measure-label"
    :class="[
      `draw-measure-label--${axis}`,
      `draw-measure-label--${tone}`,
      { 'draw-measure-label--typing': typing },
    ]"
    :style="{ left: `${x}px`, top: `${y}px` }"
  >
    {{ text }}<span class="draw-measure-label__unit">{{ unit }}</span>
    <button
      v-if="showAccept"
      type="button"
      class="draw-measure-label__accept"
      :title="acceptTitle"
      :aria-label="acceptAria"
      @pointerdown.stop
      @click.stop="emit('accept')"
    >
      ✓
    </button>
  </div>
</template>

<style scoped>
.draw-measure-label {
  position: absolute;
  z-index: 10;
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgb(255 255 255 / 0.94);
  border: 1px solid #f97316;
  color: #9a3412;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
}

.draw-measure-label--wall,
.draw-measure-label--h {
  transform: translate(-50%, calc(-100% - 8px));
}

.draw-measure-label--v {
  transform: translate(10px, -50%);
}

.draw-measure-label--typing {
  border-width: 2px;
  box-shadow: 0 0 0 2px rgb(249 115 22 / 0.28);
}

.draw-measure-label__unit {
  margin-left: 3px;
  color: #c2410c;
  font-size: 10px;
}

.draw-measure-label__accept {
  margin-left: 6px;
  padding: 0 4px;
  border: 0;
  border-radius: 3px;
  background: #f97316;
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
  pointer-events: auto;
}

.draw-measure-label--elev {
  z-index: 8;
  gap: 4px;
  transform: translate(-50%, -50%);
  background: rgb(15 23 42 / 0.88);
  border: 0;
  color: #fff;
  box-shadow: none;
}

.draw-measure-label--elev.draw-measure-label--typing {
  outline: 2px solid #f97316;
  outline-offset: 1px;
  border-width: 0;
  box-shadow: none;
}

.draw-measure-label--elev .draw-measure-label__unit {
  margin-left: 0;
  color: inherit;
  opacity: 0.75;
  font-size: 11px;
}

.draw-measure-label--elev .draw-measure-label__accept {
  margin-left: 0;
  padding: 0;
  width: 18px;
  height: 18px;
  line-height: 18px;
  background: #22c55e;
  color: #052e16;
  font-size: 12px;
}
</style>
