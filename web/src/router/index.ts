import { authenticationActor, State } from '@/actors/authenticationActor';
import Home from '@/views/Home.vue';
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home,
    },
    {
      path: '/sign-up',
      name: 'sign-up',
      component: () => import('@/views/signUp/SignUpView.vue'),
    },
    {
      path: '/sign-in',
      name: 'sign-in',
      component: () => import('@/views/signIn/SignInView.vue'),
    },
    {
      path: '/cycle',
      name: 'cycle',
      component: () => import('@/views/cycle/CycleView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/statistics',
      name: 'statistics',
      component: () => import('@/views/statistics/StatisticsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/cycles/:id',
      name: 'cycle-detail',
      component: () => import('@/views/cycleDetail/CycleDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile',
      component: () => import('@/views/profile/ProfileView.vue'),
      meta: { requiresAuth: true },
      redirect: '/profile/personal',
      children: [
        {
          path: 'personal',
          name: 'profile-personal',
          component: () => import('@/views/profile/components/PersonalInformationForm.vue'),
        },
        {
          path: 'physical',
          name: 'profile-physical',
          component: () => import('@/views/profile/components/PhysicalInformationForm.vue'),
        },
      ],
    },
    {
      path: '/account',
      component: () => import('@/views/account/AccountView.vue'),
      meta: { requiresAuth: true },
      redirect: '/account/email',
      children: [
        {
          path: 'email',
          name: 'account-email',
          component: () => import('@/views/account/components/EmailView.vue'),
        },
        {
          path: 'password',
          name: 'account-password',
          component: () => import('@/views/account/components/PasswordView.vue'),
        },
        {
          path: 'delete',
          name: 'account-delete',
          component: () => import('@/views/account/components/DeleteAccountView.vue'),
        },
      ],
    },
  ],
});

router.beforeEach((to, from, next) => {
  const snapshot = authenticationActor.getSnapshot();
  const isAuthenticated = snapshot.matches(State.AUTHENTICATED);
  const isInitializing = snapshot.matches(State.INITIALIZING);
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);

  if (isInitializing) {
    next();
    return;
  }

  if (requiresAuth && !isAuthenticated) {
    next({ name: 'sign-in' });
    return;
  }

  next();
});

export default router;
