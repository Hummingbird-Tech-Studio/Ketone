<template>
  <div class="app">
    <Toast position="top-center" />
    <header>
      <RouterLink :to="authenticated ? '/cycle' : '/'">
        <KetoneLogo />
      </RouterLink>
      <div v-if="showLoginButton">
        <Button
          label="Login"
          type="button"
          rounded
          size="large"
          variant="outlined"
          aria-label="Login"
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
          <a href="#" class="app__footer-link">Contact us</a>
        </div>
      </div>
      <div class="app__footer-bottom">
        <span class="app__footer-copyright">&copy; 2025 Ketone</span>
        <div class="app__footer-legal">
          <a href="#" class="app__footer-link">Privacy Policy</a>
          <a href="#" class="app__footer-link">Terms of Service</a>
        </div>
        <div class="app__footer-social">
          <a href="#" class="app__footer-social-link" aria-label="GitHub">
            <i class="pi pi-github"></i>
          </a>
          <a href="#" class="app__footer-social-link" aria-label="Patreon">
            <i class="pi pi-heart"></i>
          </a>
          <a href="#" class="app__footer-social-link" aria-label="X">
            <i class="pi pi-twitter"></i>
          </a>
          <a href="#" class="app__footer-social-link" aria-label="Instagram">
            <i class="pi pi-instagram"></i>
          </a>
          <a href="#" class="app__footer-social-link" aria-label="TikTok">
            <i class="pi pi-video"></i>
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { Emit as AuthEmit, authenticationActor, type EmitType } from '@/actors/authenticationActor';
import CycleIcon from '@/components/Icons/Menu/CycleIcon.vue';
import { useAuth } from '@/composables/useAuth';
import router from '@/router';
import { $dt } from '@primevue/themes';
import { Match } from 'effect';
import { computed, onUnmounted, ref } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import KetoneLogo from './components/KetoneLogo.vue';

const route = useRoute();
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
const showFooter = computed(() => !route.matched.some((record) => record.meta.requiresAuth));

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

onUnmounted(() => {
  authSubscription.forEach((sub) => sub.unsubscribe());
});
</script>

<style lang="scss">
@use '@/styles/variables' as *;

header {
  max-height: 100vh;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px $color-primary-button-outline solid;
  padding-bottom: 8px;
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
