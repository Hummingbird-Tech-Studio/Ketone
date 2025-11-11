import { createRouter, createWebHistory } from 'vue-router'
import SignUpView from '@/views/signUp/SignUpView.vue'
import Home from '@/views/Home.vue'

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
      component: () => SignUpView,
    },
  ],
})

export default router
