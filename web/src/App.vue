<template>
  <div class="app">
    <Toast position="top-center" />
    <VersionUpdateToast />
    <header>
      <RouterLink :to="authenticated ? '/cycle' : '/'">
        <KetoneLogo />
      </RouterLink>
      <div v-if="showLoginButton">
        <Button
          label="Log in"
          type="button"
          rounded
          size="large"
          variant="outlined"
          aria-label="Log in"
          @click="router.push('/sign-in')"
        />
      </div>
      <div v-if="authenticated" class="app__nav">
        <RouterLink to="/cycle">
          <Button type="button" rounded variant="outlined" aria-label="Cycle" :severity="homeSeverity">
            <template #icon>
              <CycleIcon :iconColor="iconColor" />
            </template>
          </Button>
        </RouterLink>
        <RouterLink to="/statistics">
          <Button
            type="button"
            icon="pi pi-chart-bar"
            rounded
            variant="outlined"
            aria-label="Statistics"
            :severity="statsSeverity"
          />
        </RouterLink>
        <Button
          type="button"
          icon="pi pi-user"
          rounded
          variant="outlined"
          aria-label="Account"
          :severity="accountSeverity"
          @click="toggle"
          aria-haspopup="true"
          aria-controls="overlay_menu"
        />
        <Menu ref="menu" id="overlay_menu" :model="items" :popup="true" />
      </div>
    </header>
    <main class="app__main">
      <RouterView />
    </main>
    <footer v-if="showFooter" class="app__footer">
      <div class="app__footer-top">
        <div class="app__footer-logo">
          <KetoneLogo />
        </div>
        <div class="app__footer-nav">
          <RouterLink to="/about" class="app__footer-link">About us</RouterLink>
          <RouterLink to="/contact" class="app__footer-link">Contact us</RouterLink>
        </div>
      </div>
      <div class="app__footer-bottom">
        <span class="app__footer-copyright">&copy; {{ new Date().getFullYear() }} Ketone</span>
        <div class="app__footer-legal">
          <RouterLink to="/privacy" class="app__footer-link">Privacy Policy</RouterLink>
          <RouterLink to="/terms" class="app__footer-link">Terms of Service</RouterLink>
        </div>
        <div class="app__footer-social">
          <a
            href="https://www.facebook.com/profile.php?id=61585987894066"
            class="app__footer-social-link"
            aria-label="Facebook"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i class="pi pi-facebook"></i>
          </a>
          <a
            href="https://www.tiktok.com/@ketone.dev"
            class="app__footer-social-link"
            aria-label="TikTok"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i class="pi pi-tiktok"></i>
          </a>
          <a
            href="https://x.com/KetoneDev"
            class="app__footer-social-link"
            aria-label="X"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i class="pi pi-twitter"></i>
          </a>
          <a
            href="https://www.instagram.com/ketone.dev/"
            class="app__footer-social-link"
            aria-label="Instagram"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i class="pi pi-instagram"></i>
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { Emit as AuthEmit, authenticationActor, type EmitType } from '@/actors/authenticationActor';
import { versionCheckerActor, Event as VersionEvent } from '@/actors/versionCheckerActor';
import CycleIcon from '@/components/Icons/Menu/CycleIcon.vue';
import VersionUpdateToast from '@/components/VersionUpdateToast.vue';
import { useAuth } from '@/composables/useAuth';
import { useSeo } from '@/composables/useSeo';
import { getOrganizationSchema, getSoftwareApplicationSchema, getWebSiteSchema } from '@/seo';
import { $dt } from '@primevue/themes';
import { useHead } from '@unhead/vue';
import { Match } from 'effect';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import KetoneLogo from './components/KetoneLogo.vue';

// SEO: Activate reactive meta tags based on route
useSeo();

// SEO: Global schemas (Organization, WebSite, SoftwareApplication)
useHead({
  script: [
    { type: 'application/ld+json', innerHTML: JSON.stringify(getOrganizationSchema()) },
    { type: 'application/ld+json', innerHTML: JSON.stringify(getWebSiteSchema()) },
    { type: 'application/ld+json', innerHTML: JSON.stringify(getSoftwareApplicationSchema()) },
  ],
});

const route = useRoute();
const router = useRouter();
const { authenticated, logout } = useAuth();

const menu = ref();
const items = computed(() => [
  {
    label: 'Profile',
    icon: 'pi pi-user',
    command: () => router.push('/profile'),
    class: route.path.startsWith('/profile') ? 'p-focus' : '',
  },
  {
    label: 'Account',
    icon: 'pi pi-key',
    command: () => router.push('/account'),
    class: route.path.startsWith('/account') ? 'p-focus' : '',
  },
  {
    label: 'Logout',
    icon: 'pi pi-sign-out',
    command: () => logout(),
  },
]);

const iconColor = computed<string>(() =>
  route.path === '/cycle' ? ($dt('green.500').value as string) : ($dt('gray.500').value as string),
);
const getActiveSeverity = (paths: string | string[]) => {
  if (typeof paths === 'string') {
    paths = [paths];
  }
  return computed(() =>
    paths.some((path) => route.path === path || (path.endsWith('*') && route.path.startsWith(path.slice(0, -1))))
      ? 'primary'
      : 'secondary',
  );
};

const homeSeverity = getActiveSeverity('/cycle');
const statsSeverity = getActiveSeverity('/statistics');
const accountSeverity = getActiveSeverity(['/account*', '/settings*', '/profile*']);

const showLoginButton = computed(() => !authenticated.value && !['/sign-in', '/sign-up'].includes(route.path));
const showFooter = computed(() => route.meta.showFooter === true);

function toggle(event: Event) {
  menu.value.toggle(event);
}

function handleAuthEmit(emitType: EmitType) {
  Match.value(emitType).pipe(
    Match.when({ type: AuthEmit.AUTHENTICATED }, () => {
      router.push('/cycle');
    }),
    Match.when({ type: AuthEmit.UNAUTHENTICATED }, () => {
      router.push('/sign-in');
    }),
    Match.when({ type: AuthEmit.AUTHENTICATION_ERROR }, (emit) => {
      console.error('Authentication error:', emit.error);
    }),
    Match.exhaustive,
  );
}

const authSubscription = Object.values(AuthEmit).map((emit) => authenticationActor.on(emit, handleAuthEmit));

onMounted(() => {
  versionCheckerActor.send({ type: VersionEvent.START_POLLING });
});

onUnmounted(() => {
  authSubscription.forEach((sub) => sub.unsubscribe());
});
</script>

<style lang="scss">
@use '@/styles/variables' as *;

header {
  max-width: 1280px;
  width: 100%;
  margin: 0 auto 16px;
  padding: 20px $horizontal-gap 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px $color-primary-button-outline solid;
  box-sizing: border-box;
}

.p-toast {
  --p-toast-width: 23.5rem;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;

  &__main {
    flex: 1;
  }

  &__nav {
    display: flex;
    gap: 12px;
  }

  &__footer {
    background-color: $color-white;
    padding: 32px $horizontal-gap;
    max-width: 1280px;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }

  &__footer-top {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding-bottom: 24px;
    border-bottom: 1px solid $color-primary-button-outline;
  }

  &__footer-logo {
    :deep(svg) {
      width: 100px;
      height: auto;
    }
  }

  &__footer-nav {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  &__footer-link {
    font-size: 14px;
    color: $color-primary-button-text;
    text-decoration: none;
    transition: color 0.2s;

    &:hover {
      color: $color-primary;
    }
  }

  &__footer-bottom {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding-top: 24px;
  }

  &__footer-copyright {
    font-size: 14px;
    color: $color-primary-light-text;
  }

  &__footer-legal {
    display: flex;
    gap: 24px;
  }

  &__footer-social {
    display: flex;
    gap: 16px;
  }

  &__footer-social-link {
    color: $color-primary-light-text;
    font-size: 18px;
    transition: color 0.2s;

    &:hover {
      color: $color-primary-button-text;
    }
  }

  @media (min-width: $breakpoint-tablet-min-width) {
    &__footer-top {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }

    &__footer-nav {
      flex-direction: row;
      gap: 24px;
    }

    &__footer-bottom {
      flex-direction: row;
      justify-content: space-between;
    }
  }
}
</style>
