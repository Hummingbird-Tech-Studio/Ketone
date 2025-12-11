import AutophagyIcon from '@/components/Icons/CycleStages/AutophagyIcon.vue';
import DigestionIcon from '@/components/Icons/CycleStages/DigestionIcon.vue';
import HormoneRegulationIcon from '@/components/Icons/CycleStages/HormoneRegulationIcon.vue';
import InsulinDeclineIcon from '@/components/Icons/CycleStages/InsulinDeclineIcon.vue';
import InsulinSensitivityIcon from '@/components/Icons/CycleStages/InsulinSensitivityIcon.vue';
import KetosisIcon from '@/components/Icons/CycleStages/KetosisIcon.vue';
import StemCellRegenerationIcon from '@/components/Icons/CycleStages/StemCellsRegenerationIcon.vue';
import { Chunk, Data } from 'effect';
import type { Component } from 'vue';

export type FastingStageProps = {
  startHour: number;
  endHour: number;
  icon: Component;
  name: string;
  description: string;
  link: string;
};

export type FastingStage = Data.TaggedEnum<{
  Digestion: FastingStageProps;
  InsulinDecline: FastingStageProps;
  Ketosis: FastingStageProps;
  Autophagy: FastingStageProps;
  HormoneRegulation: FastingStageProps;
  InsulinSensitivity: FastingStageProps;
  StemCellsRegeneration: FastingStageProps;
}>;

export const {
  Digestion,
  InsulinDecline,
  Ketosis,
  Autophagy,
  HormoneRegulation,
  InsulinSensitivity,
  StemCellsRegeneration,
} = Data.taggedEnum<FastingStage>();

export const digestion = Digestion({
  startHour: 0,
  endHour: 12,
  icon: DigestionIcon,
  name: 'Digestion',
  description:
    'This is the period immediately after eating when your body is digesting and absorbing nutrients from food. Blood sugar and insulin levels rise to process the carbohydrates.',
  link: 'https://en.wikipedia.org/wiki/Intermittent_fasting',
});
export const insulinDecline = InsulinDecline({
  startHour: 12,
  endHour: 18,
  icon: InsulinDeclineIcon,
  name: 'Insulin Decline',
  description:
    'During this stage, digestion is complete, insulin levels begin to drop, and your body begins to break down glycogen for energy.',
  link: 'https://en.wikipedia.org/wiki/Intermittent_fasting',
});
export const ketosis = Ketosis({
  startHour: 18,
  endHour: 24,
  icon: KetosisIcon,
  name: 'Ketosis',
  description:
    'Once glycogen stores are depleted, the body begins to switch to fat as its main energy source, breaking it down into fatty acids.',
  link: 'https://en.wikipedia.org/wiki/Intermittent_fasting',
});
export const autophagy = Autophagy({
  startHour: 24,
  endHour: 48,
  icon: AutophagyIcon,
  name: 'Autophagy',
  description:
    'During this phase, the body begins to remove damaged cells via autophagy, increases HGH to preserve muscle and burn fat, and reduces inflammation to promote repair and health.',
  link: 'https://en.wikipedia.org/wiki/Intermittent_fasting',
});
export const hormoneRegulation = HormoneRegulation({
  startHour: 48,
  endHour: 54,
  icon: HormoneRegulationIcon,
  name: 'Hormone Regulation',
  description:
    'This stage involves the body regulating hormones like insulin and glucagon to maintain blood sugar levels and promote fat burning.',
  link: 'https://en.wikipedia.org/wiki/Intermittent_fasting',
});
export const insulinSensitivity = InsulinSensitivity({
  startHour: 54,
  endHour: 72,
  icon: InsulinSensitivityIcon,
  name: 'Insulin Sensitivity',
  description:
    'During this stage, fasting helps the body restore insulin sensitivity, improving the ability to regulate blood sugar levels and reducing the risk of insulin resistance.',
  link: 'https://en.wikipedia.org/wiki/Intermittent_fasting',
});
export const stemCellsRegeneration = StemCellsRegeneration({
  startHour: 72,
  endHour: Number.MAX_SAFE_INTEGER,
  icon: StemCellRegenerationIcon,
  name: 'Stem Cells Regeneration',
  description:
    'At this advanced stage, fasting triggers a significant increase in growth hormone levels, which improves fat metabolism, muscle preservation, and provides deeper health benefits.',
  link: 'https://en.wikipedia.org/wiki/Intermittent_fasting',
});

export const stages: Chunk.Chunk<FastingStage> = Chunk.make(
  digestion,
  insulinDecline,
  ketosis,
  autophagy,
  hormoneRegulation,
  insulinSensitivity,
  stemCellsRegeneration,
);

export const getFastingStageByHours = (hours: number): FastingStage => {
  return Chunk.reduce(stages, digestion, (acc: FastingStage, stage: FastingStage) => {
    if (hours >= stage.startHour && hours < stage.endHour) {
      return stage;
    }

    return acc;
  });
};

type SchedulerViewProps = {
  name: string;
};

export type SchedulerView = Data.TaggedEnum<{
  Start: SchedulerViewProps;
  Goal: SchedulerViewProps;
}>;

export enum CycleEnum {
  Idle = 'Idle',
  InProgress = 'InProgress',
  Completed = 'Completed',
}

const { Start, Goal } = Data.taggedEnum<SchedulerView>();
export const start = Start({ name: 'Start Fast' });
export const goal = Goal({ name: 'End Fast' });
