<script setup lang="ts">
import { DRAWING_PROFILES, type DrawingProfileId } from '@/platform/profile'

const props = defineProps<{
  modelValue: DrawingProfileId
}>()

const emit = defineEmits<{
  profileSelected: [id: DrawingProfileId]
}>()

function selectProfile(id: DrawingProfileId): void {
  if (id === props.modelValue) return
  emit('profileSelected', id)
}
</script>

<template>
  <div class="panel profile-switch">
    <button
      v-for="profile in DRAWING_PROFILES"
      :key="profile.id"
      type="button"
      :class="{ active: modelValue === profile.id }"
      @click="selectProfile(profile.id)"
    >
      {{ profile.label }}
    </button>
  </div>
</template>

<style scoped>
.profile-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.profile-switch button {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 6px;
}

.profile-switch button.active {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
  font-weight: 600;
}
</style>
