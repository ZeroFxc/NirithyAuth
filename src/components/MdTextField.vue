<template>
  <div class="md-text-field" :class="{ 'md-text-field--error': error }">
    <input
      :id="inputId"
      :type="inputType"
      :value="modelValue"
      :placeholder="' '"
      :disabled="disabled"
      class="md-text-field__input"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <label :for="inputId" class="md-text-field__label">
      {{ label }}<span v-if="required" class="md-text-field__required">*</span>
    </label>
    <fieldset class="md-text-field__fieldset">
      <legend class="md-text-field__legend"><span>{{ label }}</span></legend>
    </fieldset>
    <button
      v-if="type === 'password'"
      type="button"
      class="md-text-field__toggle"
      @click="showPassword = !showPassword"
      tabindex="-1"
    >
      {{ showPassword ? '隐藏' : '显示' }}
    </button>
    <span v-if="error" class="md-text-field__error-text">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue: string
  label: string
  type?: string
  error?: string
  disabled?: boolean
  required?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()

const showPassword = ref(false)
const inputId = `md-input-${Math.random().toString(36).slice(2, 8)}`

const inputType = computed(() => {
  if (props.type === 'password' && showPassword.value) return 'text'
  return props.type || 'text'
})
</script>

<style scoped>
.md-text-field {
  position: relative;
  margin: 8px 0 16px;
}
.md-text-field__input {
  width: 100%;
  height: 56px;
  padding: 24px 16px 8px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-extra-small);
  background: transparent;
  font-family: inherit;
  font-size: 16px;
  color: var(--md-sys-color-on-surface);
  outline: none;
  transition: border-color 0.2s;
}
.md-text-field__input:focus {
  border-color: var(--md-sys-color-primary);
  border-width: 2px;
  padding: 23px 15px 7px;
}
.md-text-field__input:focus ~ .md-text-field__label,
.md-text-field__input:not(:placeholder-shown) ~ .md-text-field__label {
  transform: translateY(-12px) scale(0.75);
  color: var(--md-sys-color-primary);
}
.md-text-field__input:not(:focus):not(:placeholder-shown) ~ .md-text-field__label {
  color: var(--md-sys-color-on-surface-variant);
}
.md-text-field__label {
  position: absolute;
  left: 16px;
  top: 16px;
  font-size: 16px;
  color: var(--md-sys-color-on-surface-variant);
  pointer-events: none;
  transition: transform 0.2s, color 0.2s, font-size 0.2s;
  transform-origin: left top;
}
.md-text-field__fieldset, .md-text-field__legend {
  display: none;
}
.md-text-field--error .md-text-field__input {
  border-color: var(--md-sys-color-error);
}
.md-text-field--error .md-text-field__label {
  color: var(--md-sys-color-error);
}
.md-text-field__error-text {
  display: block;
  font-size: 12px;
  color: var(--md-sys-color-error);
  margin-top: 4px;
  padding-left: 16px;
}
.md-text-field__toggle {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--md-sys-color-primary);
  padding: 4px 8px;
  border-radius: var(--md-sys-shape-corner-extra-small);
}
.md-text-field__toggle:hover {
  background: var(--md-sys-color-surface-variant);
}
.md-text-field__required {
  color: var(--md-sys-color-error);
  margin-left: 2px;
}
</style>