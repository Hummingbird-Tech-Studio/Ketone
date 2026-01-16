<template>
  <svg width="710" height="441" viewBox="0 0 710 441" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M378.642 187.011C448.025 187.89 504 244.408 504 314C504 383.592 448.025 440.11 378.642 440.989L377 441H0V436H377C444.379 436 499 381.379 499 314C499 246.621 444.379 192 377 192H0V187H377L378.642 187.011Z"
      :fill="color"
    />
    <path
      d="M710 5H401C333.621 5.00001 279 59.6213 279 127C279 194.379 333.621 249 401 249H710V254H401C330.86 254 274 197.14 274 127C274 56.8598 330.86 6.18495e-06 401 0H710V5Z"
      :fill="color"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ color?: string }>(), {
  color: '#2ECD68',
});
</script>
