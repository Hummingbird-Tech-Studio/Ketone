<template>
  <Dialog
    :visible="visible"
    modal
    header="Confirm Completion"
    :style="{ width: '350px' }"
    :draggable="false"
    @update:visible="handleClose"
  >
    <div class="cycle-summary">
      <div class="cycle-summary__section">
        <div class="cycle-summary__label">Total Fasting Time:</div>
        <div class="cycle-summary__time">{{ totalFastingTime }}</div>
      </div>

      <div class="cycle-summary__section">
        <div class="cycle-summary__scheduler">
          <div class="cycle-summary__scheduler-header">
            <div class="cycle-summary__scheduler-title">Start:</div>
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
          <div class="cycle-summary__scheduler-hour">{{ startHour }}</div>
          <div class="cycle-summary__scheduler-date">{{ startDateFormatted }}</div>
        </div>
      </div>

      <Divider />

      <div class="cycle-summary__section">
        <div class="cycle-summary__scheduler">
          <div class="cycle-summary__scheduler-header">
            <div class="cycle-summary__scheduler-title">End:</div>
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
          <div class="cycle-summary__scheduler-hour">{{ endHour }}</div>
          <div class="cycle-summary__scheduler-date">{{ endDateFormatted }}</div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="cycle-summary__footer">
        <Button label="Close" outlined @click="handleClose" />
        <Button label="Save" :loading="false" @click="handleSave" />
      </div>
    </template>
  </Dialog>

  <DateTimePickerDialog
    :visible="datePickerVisible"
    :title="datePickerTitle"
    :dateTime="datePickerValue"
    :loading="datePickerLoading"
    @update:visible="handleDatePickerVisibilityChange"
    @update:dateTime="handleDateTimeUpdate"
  />
</template>

<script setup lang="ts">
import DateTimePickerDialog from '@/components/DateTimePickerDialog/DateTimePickerDialog.vue';
import { formatDate, formatHour, formatTime } from '@/utils/formatting';
import { useSelector } from '@xstate/vue';
import { startOfMinute } from 'date-fns';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Divider from 'primevue/divider';
import { computed, onUnmounted, ref, watch } from 'vue';
import type { ActorRefFrom } from 'xstate';
import { Emit, Event, type cycleMachine } from '../../actors/cycle.actor';

const props = defineProps<{
  visible: boolean;
  actorRef: ActorRefFrom<typeof cycleMachine>;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'complete'): void;
}>();

// Extract dates from actor context
const startDate = useSelector(props.actorRef, (state) => state.context.startDate);
const endDate = useSelector(props.actorRef, (state) => state.context.endDate);
const pendingStartDate = useSelector(props.actorRef, (state) => state.context.pendingStartDate);
const pendingEndDate = useSelector(props.actorRef, (state) => state.context.pendingEndDate);

// DateTimePicker state
const editingField = ref<'start' | 'end' | null>(null);
const datePickerVisible = ref(false);
const datePickerLoading = ref(false);

// Use pending dates if available, otherwise use regular dates
const effectiveStartDate = computed(() => pendingStartDate.value ?? startDate.value);
const effectiveEndDate = computed(() => pendingEndDate.value ?? endDate.value);

// Calculate total fasting time (from start date to moment modal was opened)
const totalFastingTime = ref(formatTime(0, 0, 0));
const acceptTime = ref<Date>(new Date());

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * 60;

function updateTotalFastingTime() {
  // Calculate from effective start date to the captured accept time (NOW when modal opened)
  const start = effectiveStartDate.value;
  const end = acceptTime.value;

  const elapsedSeconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));

  const hours = Math.floor(elapsedSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((elapsedSeconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE);
  const seconds = elapsedSeconds % SECONDS_PER_MINUTE;

  totalFastingTime.value = formatTime(hours, minutes, seconds);
}

// Watch for modal opening to capture accept time, and recalculate when start date changes
watch(
  () => props.visible,
  (newVisible, oldVisible) => {
    // Capture accept time when modal opens
    if (newVisible && !oldVisible) {
      acceptTime.value = new Date();
      updateTotalFastingTime();
    }
  },
  { immediate: true }
);

// Recalculate when pending start date changes (user editing start date)
watch(pendingStartDate, () => {
  if (props.visible) {
    updateTotalFastingTime();
  }
});

// Format start date and time
const startHour = computed(() => formatHour(effectiveStartDate.value));
const startDateFormatted = computed(() => formatDate(effectiveStartDate.value));

// Format end date and time
const endHour = computed(() => formatHour(effectiveEndDate.value));
const endDateFormatted = computed(() => formatDate(effectiveEndDate.value));

// DateTimePicker computed values
const datePickerTitle = computed(() => (editingField.value === 'start' ? 'Edit Start Date' : 'Edit End Date'));
const datePickerValue = computed(() =>
  editingField.value === 'start' ? effectiveStartDate.value : effectiveEndDate.value
);

// Handlers
function handleClose() {
  emit('update:visible', false);
}

function handleSave() {
  props.actorRef.send({ type: Event.SAVE_EDITED_DATES });
  emit('complete');
}

function handleStartCalendarClick() {
  editingField.value = 'start';
  datePickerVisible.value = true;
}

function handleEndCalendarClick() {
  editingField.value = 'end';
  datePickerVisible.value = true;
}

function handleDateTimeUpdate(newDate: Date) {
  datePickerLoading.value = true;
  const event = editingField.value === 'start' ? Event.EDIT_START_DATE : Event.EDIT_END_DATE;

  props.actorRef.send({ type: event, date: startOfMinute(newDate) });
}

function handleDatePickerVisibilityChange(value: boolean) {
  if (!value) {
    datePickerVisible.value = false;
    datePickerLoading.value = false;
    editingField.value = null;
  }
}

// Subscribe to actor events
const validationSubscription = props.actorRef.on(Emit.VALIDATION_INFO, () => {
  datePickerLoading.value = false;
  // Validation failed - keep dialog open for user to try again
});

// When editing succeeds, close the date picker
watch([pendingStartDate, pendingEndDate], () => {
  // If we were editing and the pending date was updated, close the picker
  if (datePickerVisible.value && datePickerLoading.value) {
    datePickerLoading.value = false;
    datePickerVisible.value = false;
    editingField.value = null;
  }
});

onUnmounted(() => {
  validationSubscription.unsubscribe();
});
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
    gap: 8px;
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
    width: 100%;
    display: flex;
    flex-direction: column;
  }
  &__scheduler-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
  }
  &__scheduler-title {
    font-weight: 700;
    font-size: 16px;
    color: $color-primary-button-text;
  }
  &__scheduler-hour {
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }
  &__scheduler-date {
    margin-top: 5px;
    font-weight: 400;
    font-size: 14px;
    color: $color-primary-button-text;
  }
  &__footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
}
</style>
