<template>
  <div class="export-data-view">
    <div class="export-data-view__card">
      <h2 class="export-data-view__title">Export Data</h2>
      <Message severity="info" icon="pi pi-info-circle">
        Download all your fasting cycle data in your preferred format.
      </Message>

      <div class="export-data-view__buttons">
        <Button
          label="Export as JSON"
          icon="pi pi-file"
          variant="outlined"
          rounded
          :loading="exportingJson"
          :disabled="exportingJson || exportingCsv"
          @click="exportJson"
        />
        <Button
          label="Export as CSV"
          icon="pi pi-file-excel"
          variant="outlined"
          rounded
          :loading="exportingCsv"
          :disabled="exportingJson || exportingCsv"
          @click="exportCsv"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted } from 'vue';
import { accountActor, Emit, type EmitType } from '../actors/account.actor';
import { useAccount } from '../composables/useAccount';
import { useAccountNotifications } from '../composables/useAccountNotifications';

const { exportingJson, exportingCsv, exportJson, exportCsv, actorRef } = useAccount();

useAccountNotifications(actorRef);

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function handleExportEmit(emitType: EmitType) {
  if (emitType.type === Emit.EXPORT_JSON_SUCCESS) {
    const blob = new Blob([JSON.stringify(emitType.result.cycles, null, 2)], { type: 'application/json' });
    downloadFile(blob, 'cycles-export.json');
  } else if (emitType.type === Emit.EXPORT_CSV_SUCCESS) {
    const blob = new Blob([emitType.result], { type: 'text/csv' });
    downloadFile(blob, 'cycles-export.csv');
  }
}

const subscriptions = [
  accountActor.on(Emit.EXPORT_JSON_SUCCESS, handleExportEmit),
  accountActor.on(Emit.EXPORT_CSV_SUCCESS, handleExportEmit),
];

onUnmounted(() => {
  subscriptions.forEach((sub) => sub.unsubscribe());
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.export-data-view {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__title {
    font-size: 18px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: white;
    border: 1px solid $color-primary-button-outline;
    border-radius: 12px;
    padding: 20px;
  }

  &__buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 8px;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      flex-direction: row;
    }
  }
}
</style>
