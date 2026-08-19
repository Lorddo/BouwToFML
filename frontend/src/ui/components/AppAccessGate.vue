<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { tryUnlockAccess } from '@/ui/access-gate'

const props = withDefaults(
  defineProps<{
    expectedPassword?: string
    storageKey?: string
    title?: string
    subtitle?: string
  }>(),
  {
    expectedPassword: undefined,
    storageKey: undefined,
    title: undefined,
    subtitle: undefined,
  },
)

const emit = defineEmits<{
  unlocked: []
}>()

const { t } = useI18n()
const password = ref('')
const error = ref(false)

function onSubmit(): void {
  error.value = false
  const ok = tryUnlockAccess(password.value, props.expectedPassword, props.storageKey)
  if (!ok) {
    error.value = true
    password.value = ''
    return
  }
  emit('unlocked')
}
</script>

<template>
  <div class="access-gate">
    <form class="access-gate__panel" @submit.prevent="onSubmit">
      <h1 class="access-gate__title">{{ title ?? t('app.title') }}</h1>
      <p class="access-gate__subtitle">{{ subtitle ?? t('access.subtitle') }}</p>
      <label class="access-gate__label" for="access-password">
        {{ t('access.password') }}
      </label>
      <input
        id="access-password"
        v-model="password"
        class="access-gate__input"
        type="password"
        autocomplete="current-password"
        autofocus
        :aria-invalid="error"
        :aria-describedby="error ? 'access-password-error' : undefined"
      />
      <p v-if="error" id="access-password-error" class="access-gate__error" role="alert">
        {{ t('access.incorrect') }}
      </p>
      <button type="submit" class="primary access-gate__submit">
        {{ t('access.submit') }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.access-gate {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #f4f5f7;
}

.access-gate__panel {
  width: 100%;
  max-width: 360px;
  padding: 28px 24px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
}

.access-gate__title {
  margin: 0;
  font-size: 20px;
  color: #0f172a;
}

.access-gate__subtitle {
  margin: 6px 0 20px;
  font-size: 13px;
  color: #64748b;
}

.access-gate__label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #334155;
}

.access-gate__input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  font-size: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  color: #0f172a;
}

.access-gate__input:focus {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
  border-color: #60a5fa;
}

.access-gate__error {
  margin: 8px 0 0;
  font-size: 13px;
  color: #991b1b;
}

.access-gate__submit {
  display: block;
  width: 100%;
  margin-top: 16px;
  font-size: 14px;
}
</style>
