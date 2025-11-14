<template>
  <div>
    <Button
      :label="buttonText"
      :loading="isLoading"
      aria-label="Start Fasting Cycle"
      rounded
      @click="$emit('click')"
      outlined
      fluid
    />
  </div>
</template>

<script setup lang="ts">
interface Props {
  buttonText: string;
  isLoading?: boolean;
}

interface Emits {
  click: [];
}

defineProps<Props>();
defineEmits<Emits>();
</script>
