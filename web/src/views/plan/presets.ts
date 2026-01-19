export type Preset = {
  id: string;
  ratio: string;
  fastingDuration: number;
  eatingWindow: number;
  duration: string;
  tagline: string;
};

export type Theme = 'green' | 'teal' | 'purple' | 'pink' | 'blue';

export type Section = {
  id: string;
  title: string;
  description: string;
  icon: string;
  theme: Theme;
  presets?: Preset[];
};

export const sections: Section[] = [
  {
    id: 'beginner',
    title: 'Beginner',
    description: 'Perfect for your first fasting experience',
    icon: 'pi pi-sparkles',
    theme: 'green',
    presets: [
      {
        id: '12:12',
        ratio: '12:12',
        fastingDuration: 12,
        eatingWindow: 12,
        duration: '12h fasting · 12h eating',
        tagline: 'Gentle start',
      },
      {
        id: '13:11',
        ratio: '13:11',
        fastingDuration: 13,
        eatingWindow: 11,
        duration: '13h fasting · 11h eating',
        tagline: 'Easy progress',
      },
      {
        id: '14:10',
        ratio: '14:10',
        fastingDuration: 14,
        eatingWindow: 10,
        duration: '14h fasting · 10h eating',
        tagline: 'Daily balance',
      },
      {
        id: '15:9',
        ratio: '15:9',
        fastingDuration: 15,
        eatingWindow: 9,
        duration: '15h fasting · 9h eating',
        tagline: 'Step up',
      },
    ],
  },
  {
    id: 'intermediate',
    title: 'Intermediate',
    description: 'Balanced plans to deepen your practice',
    icon: 'pi pi-star',
    theme: 'teal',
    presets: [
      {
        id: '16:8',
        ratio: '16:8',
        fastingDuration: 16,
        eatingWindow: 8,
        duration: '16h fasting · 8h eating',
        tagline: 'The classic protocol',
      },
      {
        id: '17:7',
        ratio: '17:7',
        fastingDuration: 17,
        eatingWindow: 7,
        duration: '17h fasting · 7h eating',
        tagline: 'Extended balance',
      },
      {
        id: '18:6',
        ratio: '18:6',
        fastingDuration: 18,
        eatingWindow: 6,
        duration: '18h fasting · 6h eating',
        tagline: 'Metabolic balance',
      },
      {
        id: '19:5',
        ratio: '19:5',
        fastingDuration: 19,
        eatingWindow: 5,
        duration: '19h fasting · 5h eating',
        tagline: 'Focused routine',
      },
    ],
  },
  {
    id: 'advanced',
    title: 'Advanced',
    description: 'For those who already know their rhythm',
    icon: 'pi pi-bolt',
    theme: 'purple',
    presets: [
      {
        id: '20:4',
        ratio: '20:4',
        fastingDuration: 20,
        eatingWindow: 4,
        duration: '20h fasting · 4h eating',
        tagline: 'High discipline',
      },
      {
        id: '21:3',
        ratio: '21:3',
        fastingDuration: 21,
        eatingWindow: 3,
        duration: '21h fasting · 3h eating',
        tagline: 'Peak control',
      },
      {
        id: '22:2',
        ratio: '22:2',
        fastingDuration: 22,
        eatingWindow: 2,
        duration: '22h fasting · 2h eating',
        tagline: 'Extreme focus',
      },
      {
        id: '23:1',
        ratio: '23:1 OMAD',
        fastingDuration: 23,
        eatingWindow: 1,
        duration: '23h fasting · 1h eating',
        tagline: 'One meal a day',
      },
    ],
  },
  {
    id: 'long-fasts',
    title: 'Long Fasts',
    description: 'Extended fasting for deeper metabolic benefits',
    icon: 'pi pi-clock',
    theme: 'pink',
    presets: [
      {
        id: '24h',
        ratio: '24h',
        fastingDuration: 24,
        eatingWindow: 1,
        duration: '1 day of fasting',
        tagline: 'Full-day fast',
      },
      {
        id: '36h',
        ratio: '36h',
        fastingDuration: 36,
        eatingWindow: 1,
        duration: '1.5 days of fasting',
        tagline: 'Extended reset',
      },
      {
        id: '48h',
        ratio: '48h',
        fastingDuration: 48,
        eatingWindow: 1,
        duration: '2 days of fasting',
        tagline: 'Deep metabolic shift',
      },
      {
        id: '72h',
        ratio: '72h',
        fastingDuration: 72,
        eatingWindow: 1,
        duration: '3 days of fasting',
        tagline: 'Extended endurance',
      },
    ],
  },
];

export function findPresetById(id: string): Preset | undefined {
  for (const section of sections) {
    const preset = section.presets?.find((p) => p.id === id);
    if (preset) return preset;
  }
  return undefined;
}
