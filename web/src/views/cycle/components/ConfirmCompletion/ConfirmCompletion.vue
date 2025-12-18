<template>
  <Dialog
    :visible="visible"
    modal
    header="Confirm Completion"
    :style="{ width: '360px' }"
    :draggable="false"
    @update:visible="handleClose"
  >
    <div class="cycle-summary">
      <div class="cycle-summary__section">
        <div class="cycle-summary__label">Total Fasting Time:</div>
        <div class="cycle-summary__time">{{ totalFastingTime }}</div>
      </div>

      <div class="cycle-summary__section">
        <div class="cycle-summary__scheduler cycle-summary__scheduler--start">
          <div class="cycle-summary__scheduler-icon">
            <StartTimeIcon />
          </div>
          <div class="cycle-summary__scheduler-content">
            <div class="cycle-summary__scheduler-title">Start:</div>
            <div class="cycle-summary__scheduler-datetime">
              {{ formatDate(pendingStartDate!) }}, {{ formatHour(pendingStartDate!) }}
            </div>
          </div>
          <Button
            type="button"
            icon="pi pi-calendar"
            rounded
            variant="outlined"
            severity="secondary"
            aria-label="Start Date"
            @click="handleStartCalendarClick"
          />
        </div>
      </div>

      <Divider class="cycle-summary__divider" />

      <div class="cycle-summary__section">
        <div class="cycle-summary__scheduler cycle-summary__scheduler--end">
          <div class="cycle-summary__scheduler-icon">
            <EndTimeIcon />
          </div>
          <div class="cycle-summary__scheduler-content">
            <div class="cycle-summary__scheduler-title">End:</div>
            <div class="cycle-summary__scheduler-datetime">
              {{ formatDate(pendingEndDate!) }}, {{ formatHour(pendingEndDate!) }}
            </div>
          </div>
          <Button
            type="button"
            icon="pi pi-calendar"
            rounded
            variant="outlined"
            severity="secondary"
            aria-label="End Date"
            @click="handleEndCalendarClick"
          />
        </div>
      </div>

      <NotesCard class="cycle-summary__notes" @edit="openNotesDialog" />
    </div>

    <template #footer>
      <div class="cycle-summary__footer">
        <Button label="Close" severity="secondary" outlined @click="handleClose" />
        <Button label="Finish Fast" :loading="loading" @click="handleComplete" />
      </div>
    </template>
  </Dialog>

  <DateTimePickerDialog
    :visible="dialogVisible"
    :title="dialogTitle"
    :dateTime="dialogDate || new Date()"
    @update:visible="handleDatePickerVisibilityChange"
    @update:dateTime="handleDateTimeUpdate"
  />

  <NotesDialog
    :visible="notesDialogVisible"
    :notes="notes"
    :loading="savingNotes"
    @update:visible="handleNotesDialogVisibilityChange"
    @save="handleNotesSave"
  />
</template>

<script setup lang="ts">
import DateTimePickerDialog from '@/components/DateTimePickerDialog/DateTimePickerDialog.vue';
import EndTimeIcon from '@/components/Icons/EndTime.vue';
import StartTimeIcon from '@/components/Icons/StartTime.vue';
import NotesCard from '@/components/NotesCard/NotesCard.vue';
import NotesDialog from '@/components/NotesDialog/NotesDialog.vue';
import { formatDate, formatHour } from '@/utils/formatting';
import { onScopeDispose } from 'vue';
import type { ActorRefFrom } from 'xstate';
import { Emit, type cycleMachine } from '../../actors/cycle.actor';
import { useNotesDialog } from '../../composables/useNotesDialog';
import { useSchedulerDialog } from '../../composables/useSchedulerDialog';
import { useConfirmCompletion } from './useConfirmCompletion';

const props = defineProps<{ visible: boolean; loading: boolean; actorRef: ActorRefFrom<typeof cycleMachine> }>();

const emit = defineEmits<{ (e: 'update:visible', value: boolean): void; (e: 'complete'): void }>();

const { pendingStartDate, pendingEndDate, totalFastingTime, actorRef } = useConfirmCompletion({
  actorRef: props.actorRef,
});

const {
  dialogVisible: notesDialogVisible,
  notes,
  savingNotes,
  openDialog: openNotesDialog,
  closeDialog: closeNotesDialog,
  saveNotes,
} = useNotesDialog(props.actorRef);

const subscription = props.actorRef.on(Emit.NOTES_SAVED, () => {
  closeNotesDialog();
});

onScopeDispose(() => subscription.unsubscribe());

function handleNotesDialogVisibilityChange(value: boolean) {
  if (!value) {
    closeNotesDialog();
  }
}

function handleNotesSave(notesText: string) {
  saveNotes(notesText);
}

const { dialogVisible, dialogTitle, dialogDate, openStartDialog, openEndDialog, closeDialog, submitDialog } =
  useSchedulerDialog(actorRef);

function handleStartCalendarClick() {
  openStartDialog();
}

function handleEndCalendarClick() {
  openEndDialog();
}

function handleDateTimeUpdate(newDate: Date) {
  submitDialog(newDate);
}

function handleDatePickerVisibilityChange(value: boolean) {
  if (!value) {
    closeDialog();
  }
}

function handleClose() {
  emit('update:visible', false);
}

function handleComplete() {
  emit('complete');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.cycle-summary {
  display: flex;
  flex-direction: column;
  padding-top: 8px;

  &__section {
    display: flex;
    flex-direction: column;
  }

  &__label {
    align-self: center;
    font-size: 16px;
    color: $color-primary-button-text;
  }

  &__time {
    font-size: 24px;
    font-weight: 700;
    color: $color-primary-button-text;
    text-align: center;
    padding: 8px 0;
  }

  &__scheduler {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 0;
  }

  &__scheduler-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  &__scheduler--start &__scheduler-icon {
    background: rgba(45, 179, 94, 0.1);
  }

  &__scheduler--end &__scheduler-icon {
    background: rgba(171, 67, 234, 0.1);
  }

  &__scheduler-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__scheduler-title {
    font-weight: 600;
    font-size: 16px;
    color: $color-primary-button-text;
  }

  &__scheduler-datetime {
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }

  &__footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  &__divider {
    --p-divider-border-color: #{$color-purple};
  }

  &__notes {
    margin-top: 1.5rem;
  }
}
</style>
