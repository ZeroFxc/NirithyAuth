<template>
  <header class="md-app-bar">
    <div class="md-app-bar__left">
      <slot name="left" />
    </div>
    <div class="md-app-bar__title">{{ title }}</div>
    <div class="md-app-bar__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<style scoped>
.md-app-bar {
  display: flex;
  align-items: center;
  height: 64px;
  padding: 0 16px;
  background: var(--md-sys-color-surface);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  position: sticky;
  top: 0;
  z-index: 100;
}
.md-app-bar__left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.md-app-bar__title {
  font-size: 22px;
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
  flex: 1;
}
.md-app-bar__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>