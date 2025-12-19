import type { FastingFeeling } from '@ketone/shared';
import type { Component } from 'vue';

import AnxiousIcon from './AnxiousIcon.vue';
import CalmIcon from './CalmIcon.vue';
import DizzyIcon from './DizzyIcon.vue';
import EnergeticIcon from './EnergeticIcon.vue';
import HungryIcon from './HungryIcon.vue';
import IrritableIcon from './IrritableIcon.vue';
import MotivatedIcon from './MotivatedIcon.vue';
import NormalIcon from './NormalIcon.vue';
import SufferingIcon from './SufferingIcon.vue';
import SwollenIcon from './SwollenIcon.vue';
import TiredIcon from './TiredIcon.vue';
import WeakIcon from './WeakIcon.vue';

export const feelingIconMap: Record<FastingFeeling, Component> = {
  energetic: EnergeticIcon,
  motivated: MotivatedIcon,
  calm: CalmIcon,
  normal: NormalIcon,
  hungry: HungryIcon,
  tired: TiredIcon,
  swollen: SwollenIcon,
  anxious: AnxiousIcon,
  dizzy: DizzyIcon,
  weak: WeakIcon,
  suffering: SufferingIcon,
  irritable: IrritableIcon,
};

export function getFeelingIcon(feeling: string): Component {
  return feelingIconMap[feeling as FastingFeeling] || NormalIcon;
}
