<template>
  <button
    :class="['md-button', `md-button--${variant}`]"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <span class="md-button__label"><slot /></span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  variant?: 'filled' | 'outlined' | 'text' | 'tonal'
  disabled?: boolean
}>()
defineEmits<{
  click: []
}>()
</script>

<style scoped>
.md-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  padding: 0 24px;
  border: none;
  border-radius: var(--md-sys-shape-corner-extra-large);
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.1px;
  cursor: pointer;
  transition: background-color 0.2s, box-shadow 0.2s;
  user-select: none;
  position: relative;
  overflow: hidden;
}
.md-button:hover { box-shadow: var(--md-sys-elevation-1); }
.md-button:active { box-shadow: none; }
.md-button:disabled { opacity: 0.38; cursor: not-allowed; box-shadow: none; }

.md-button--filled {
  background-color: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
}
.md-button--filled:hover:not(:disabled) {
  background-color: var(--md-sys-color-primary);
  filter: brightness(1.08);
}

.md-button--outlined {
  background: transparent;
  color: var(--md-sys-color-primary);
  border: 1px solid var(--md-sys-color-outline);
}
.md-button--outlined:hover:not(:disabled) {
  background-color: rgba(103, 80, 164, 0.08);
}

.md-button--text {
  background: transparent;
  color: var(--md-sys-color-primary);
}
.md-button--text:hover:not(:disabled) {
  background-color: rgba(103, 80, 164, 0.08);
}

.md-button--tonal {
  background-color: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}
.md-button--tonal:hover:not(:disabled) {
  filter: brightness(1.05);
}
</style>