export interface SeoMeta {
  title: string;
  description: string;
  ogImage?: string;
  noIndex?: boolean;
}

export const routesSeoMeta: Record<string, SeoMeta> = {
  '/': {
    title: 'Ketone - Free Intermittent Fasting Tracker',
    description:
      'Track your intermittent fasting journey with Ketone. A free, simple, and privacy-focused fasting tracker with no ads, no cookies, and no data selling.',
  },
  '/about': {
    title: 'About Us | Ketone',
    description:
      'Learn about Ketone - a small team passionate about building free, simple, and accessible health tracking software with complete privacy.',
  },
  '/contact': {
    title: 'Contact Us | Ketone',
    description:
      'Get in touch with the Ketone team. Share feedback, suggest ideas, report issues, or just say hello at contact@ketone.dev.',
  },
  '/privacy': {
    title: 'Privacy Policy | Ketone',
    description:
      "Read Ketone's privacy policy. We use zero cookies, zero tracking, and never sell your data. Full transparency on how we handle your information.",
  },
  '/terms': {
    title: 'Terms of Service | Ketone',
    description:
      "Read Ketone's terms of service. Important information about using our free intermittent fasting tracking service.",
  },
  '/sign-up': {
    title: 'Create Account | Ketone',
    description:
      'Sign up for Ketone - start tracking your intermittent fasting journey for free. No subscriptions, no hidden costs.',
  },
  '/sign-in': {
    title: 'Log In | Ketone',
    description: 'Log in to your Ketone account to continue tracking your intermittent fasting progress.',
  },
};
