import { SEO_CONFIG, routesSeoMeta, type SeoMeta } from '@/seo';
import { useHead, useSeoMeta } from '@unhead/vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

export interface UseSeoOptions {
  title?: string;
  description?: string;
  ogImage?: string;
  noIndex?: boolean;
}

export function useSeo(options?: UseSeoOptions) {
  const route = useRoute();

  const currentMeta = computed((): SeoMeta => {
    const routeMeta = routesSeoMeta[route.path];
    return {
      title: options?.title ?? routeMeta?.title ?? SEO_CONFIG.defaultTitle,
      description: options?.description ?? routeMeta?.description ?? SEO_CONFIG.defaultDescription,
      ogImage: options?.ogImage ?? routeMeta?.ogImage ?? `${SEO_CONFIG.siteUrl}/og-image.png`,
      noIndex: options?.noIndex ?? routeMeta?.noIndex ?? false,
    };
  });

  const canonicalUrl = computed(() => `${SEO_CONFIG.siteUrl}${route.path}`);

  useSeoMeta({
    title: () => currentMeta.value.title,
    description: () => currentMeta.value.description,
    ogTitle: () => currentMeta.value.title,
    ogDescription: () => currentMeta.value.description,
    ogImage: () => currentMeta.value.ogImage,
    ogUrl: () => canonicalUrl.value,
    ogType: 'website',
    ogSiteName: SEO_CONFIG.siteName,
    ogLocale: SEO_CONFIG.locale,
    twitterCard: 'summary_large_image',
    twitterTitle: () => currentMeta.value.title,
    twitterDescription: () => currentMeta.value.description,
    twitterImage: () => currentMeta.value.ogImage,
    robots: () => (currentMeta.value.noIndex ? 'noindex, nofollow' : 'index, follow'),
  });

  useHead({
    link: [
      {
        rel: 'canonical',
        href: () => canonicalUrl.value,
      },
    ],
  });

  return {
    currentMeta,
    canonicalUrl,
  };
}
