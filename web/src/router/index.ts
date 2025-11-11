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
      name: 'signup',
      component: () => import('@/views/signUp/SignUpView.vue'),
    },
  ],
});

export default router;
