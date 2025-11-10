<template>
  <div class="app">
    <header>
      <AppLogo />
      <div class="app__nav">
        <RouterLink to="/">
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
    <RouterView />
  </div>
</template>

<script setup lang="ts">
import AppLogo from '@/components/AppLogo.vue';
import CycleIcon from '@/components/Icons/Menu/CycleIcon.vue';
import router from '@/router';
import { $dt } from '@primevue/themes';
import { Match } from 'effect';
import { computed, onUnmounted, ref } from 'vue';
import { RouterView, useRoute } from 'vue-router';

const route = useRoute();

const menu = ref();
const items = computed(() => [
  {
    label: 'Profile',
    icon: 'pi pi-user',
    command: () => router.push('/profile/personal'),
    class: route.path.startsWith('/profile') ? 'p-focus' : '',
  },
  {
    label: 'Account',
    icon: 'pi pi-key',
    command: () => router.push('/account'),
    class: route.path.startsWith('/account') ? 'p-focus' : '',
  },
  {
    label: 'Settings',
    icon: 'pi pi-cog',
    command: () => router.push('/settings'),
    class: route.path.startsWith('/settings') ? 'p-focus' : '',
  },
]);

const iconColor = computed<string>(() =>
  route.path === '/' ? ($dt('green.500').value as string) : ($dt('gray.500').value as string),
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

const homeSeverity = getActiveSeverity('/');
const statsSeverity = getActiveSeverity('/statistics');
const accountSeverity = getActiveSeverity(['/account*', '/settings*', '/profile*']);

function toggle(event: Event) {
  menu.value.toggle(event);
}
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
  &__nav {
    display: flex;
    gap: 12px;
  }
}
</style>
