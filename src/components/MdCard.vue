<template>
  <div class="md-card" :class="`md-card--${variant}`">
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  variant?: 'elevated' | 'filled' | 'outlined'
}>()
</script>

<style scoped>
.md-card {
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 24px;
  transition: box-shadow 0.2s;
}
.md-card--elevated {
  background: var(--md-sys-color-surface);
  box-shadow: var(--md-sys-elevation-1);
}
.md-card--filled {
  background: var(--md-sys-color-surface-variant);
}
.md-card--outlined {
  background: var(--md-sys-color-surface);
  border: 1px solid var(--md-sys-color-outline-variant);
}
</style>