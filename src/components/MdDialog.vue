<template>
  <Teleport to="body">
    <div v-if="modelValue" class="md-dialog-overlay" @click.self="$emit('update:modelValue', false)">
      <div class="md-dialog">
        <div v-if="title" class="md-dialog__title">{{ title }}</div>
        <div class="md-dialog__content"><slot /></div>
        <div v-if="$slots.actions" class="md-dialog__actions">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean
  title?: string
}>()
defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<style scoped>
.md-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s;
}
.md-dialog {
  background: var(--md-sys-color-surface);
  border-radius: var(--md-sys-shape-corner-extra-large);
  padding: 24px;
  min-width: 320px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--md-sys-elevation-3);
  animation: slideUp 0.2s;
}
.md-dialog__title {
  font-size: 24px;
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 16px;
}
.md-dialog__content {
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
  line-height: 1.5;
}
.md-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
</style>