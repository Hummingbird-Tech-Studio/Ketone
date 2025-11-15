<template>
  <div class="action-button-wrapper">
    <Skeleton v-if="loading" width="128px" height="36px" border-radius="20px" />
    <Button
      v-else
      :label="buttonText"
      :loading="isLoading"
      :aria-label="buttonText"
      rounded
      @click="$emit('click')"
      outlined
    />
  </div>
</template>

<script setup lang="ts">
interface Props {
  buttonText: string;
  isLoading?: boolean;
  loading?: boolean;
}

interface Emits {
  click: [];
}

defineProps<Props>();
defineEmits<Emits>();
</script>

<style scoped lang="scss">
.action-button-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
