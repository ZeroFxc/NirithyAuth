<template>
  <div class="md-avatar" :style="{ width: size + 'px', height: size + 'px', fontSize: size * 0.4 + 'px' }">
    <img v-if="src" :src="src" :alt="name" class="md-avatar__img" />
    <span v-else class="md-avatar__text">{{ initial }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<{
  src?: string
  name: string
  size?: number
}>(), {
  size: 40
})
const initial = computed(() => props.name.charAt(0).toUpperCase())
</script>

<style scoped>
.md-avatar {
  border-radius: 50%;
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.md-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.md-avatar__text {
  font-weight: 500;
}
</style>