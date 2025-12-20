import AutophagyIcon from '@/components/Icons/CycleStages/AutophagyIcon.vue';
import CellularRegenerationIcon from '@/components/Icons/CycleStages/CellularRegenerationIcon.vue';
import DeepRenewalIcon from '@/components/Icons/CycleStages/DeepRenewalIcon.vue';
import DigestionIcon from '@/components/Icons/CycleStages/DigestionIcon.vue';
import GlycogenolysisIcon from '@/components/Icons/CycleStages/GlycogenolysisIcon.vue';
import KetosisIcon from '@/components/Icons/CycleStages/KetosisIcon.vue';
import MetabolicSwitchIcon from '@/components/Icons/CycleStages/MetabolicSwitchIcon.vue';
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
  Glycogenolysis: FastingStageProps;
  MetabolicSwitch: FastingStageProps;
  Ketosis: FastingStageProps;
  Autophagy: FastingStageProps;
  CellularRegeneration: FastingStageProps;
  DeepRenewal: FastingStageProps;
}>;

export const { Digestion, Glycogenolysis, MetabolicSwitch, Ketosis, Autophagy, CellularRegeneration, DeepRenewal } =
  Data.taggedEnum<FastingStage>();

export const digestion = Digestion({
  startHour: 0,
  endHour: 4,
  icon: DigestionIcon,
  name: 'Digestion',
  description:
    'The body is in anabolic mode, absorbing and storing glucose from the previous meal. Insulin levels peak, which suppresses fat burning.',
  link: 'https://www.ncbi.nlm.nih.gov/books/NBK544242/',
});

export const glycogenolysis = Glycogenolysis({
  startHour: 4,
  endHour: 12,
  icon: GlycogenolysisIcon,
  name: 'Glycogenolysis',
  description:
    'As glucose and insulin levels decrease, the liver begins breaking down stored glycogen to maintain blood sugar levels. The body prepares to switch to a different fuel source.',
  link: 'https://www.ncbi.nlm.nih.gov/books/NBK554417/',
});

export const metabolicSwitch = MetabolicSwitch({
  startHour: 12,
  endHour: 18,
  icon: MetabolicSwitchIcon,
  name: 'Metabolic Switch',
  description:
    'Glycogen reserves are depleted. In response, the body activates lipolysis to accelerate the burning of stored fat and begins gluconeogenesis to produce new glucose from proteins and glycerol.',
  link: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5783752/',
});

export const ketosis = Ketosis({
  startHour: 18,
  endHour: 24,
  icon: KetosisIcon,
  name: 'Ketosis',
  description:
    "The liver produces ketone bodies from fat. These ketones then become the brain's main source of energy, which is associated with greater mental clarity and reduced appetite.",
  link: 'https://my.clevelandclinic.org/health/articles/24003-ketosis',
});

export const autophagy = Autophagy({
  startHour: 24,
  endHour: 48,
  icon: AutophagyIcon,
  name: 'Autophagy',
  description:
    'Autophagy, the process of cellular "cleaning and recycling," is at its most active. During this process, cells break down damaged components to generate energy and renew the cellular structure.',
  link: 'https://my.clevelandclinic.org/health/articles/24058-autophagy',
});

export const cellularRegeneration = CellularRegeneration({
  startHour: 48,
  endHour: 72,
  icon: CellularRegenerationIcon,
  name: 'Cellular Regeneration',
  description:
    'Autophagy peaks, driving deep cellular cleaning and mitochondrial renewal. Ketones become the brain’s primary fuel as stem cell activation begins, initiating systemic tissue repair.',
  link: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4102383/',
});

export const deepRenewal = DeepRenewal({
  startHour: 72,
  endHour: Number.MAX_SAFE_INTEGER,
  icon: DeepRenewalIcon,
  name: 'Deep Renewal',
  description:
    'This phase triggers a biological reset. Lower IGF-1 and PKA levels signal stem cells to regenerate and rebuild the immune system. These longevity benefits are profound but require strict medical supervision.',
  link: 'https://stemcell.keck.usc.edu/fasting-triggers-stem-cell-regeneration-of-damaged-old-immune-system/',
});

export const stages: Chunk.Chunk<FastingStage> = Chunk.make(
  digestion,
  glycogenolysis,
  metabolicSwitch,
  ketosis,
  autophagy,
  cellularRegeneration,
  deepRenewal,
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
