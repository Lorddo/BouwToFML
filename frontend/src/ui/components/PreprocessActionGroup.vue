<script setup lang="ts">
const props = defineProps<{
  title: string
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function onToggle(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update:modelValue', target?.checked ?? false)
}
</script>

<template>
  <section class="group">
    <label class="group-toggle">
      <span class="group-title">
        <input :checked="props.modelValue" type="checkbox" @change="onToggle" />
        <span>{{ props.title }}</span>
      </span>
    </label>
    <div v-show="props.modelValue" class="group-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.group {
  border: 1px solid #d8d8d8;
  border-radius: 8px;
  padding: 6px 8px;
  margin: 6px 0;
  background: #ffffff;
}

.group:nth-child(even) {
  background: #f8fafc;
}

.group-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-weight: 600;
  font-size: 12px;
  min-height: 24px;
  width: 100%;
}

.group-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.group-body {
  min-width: 0;
  margin-top: 4px;
}

</style>
