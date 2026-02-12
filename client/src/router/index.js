import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/Home.vue';
import NumberMine from '../views/NumberMine.vue';

const BluffCard = () => import('../views/BluffCard.vue');

const routes = [
  { path: '/', name: 'Home', component: Home },

  // Number Mine
  { path: '/game/number-mine/:roomId', name: 'NumberMine', component: NumberMine, props: true },
  {
    path: '/spectate/number-mine/:roomId',
    name: 'SpectateNumberMine',
    component: NumberMine,
    props: (route) => ({ roomId: route.params.roomId, spectateMode: true }),
  },

  // Bluff Card
  { path: '/game/bluff-card/:roomId', name: 'BluffCard', component: BluffCard, props: true },
  {
    path: '/spectate/bluff-card/:roomId',
    name: 'SpectateBluffCard',
    component: BluffCard,
    props: (route) => ({ roomId: route.params.roomId, spectateMode: true }),
  },

  // Legacy redirects
  { path: '/game/:roomId', redirect: (to) => `/game/number-mine/${to.params.roomId}` },
  { path: '/spectate/:roomId', redirect: (to) => `/spectate/number-mine/${to.params.roomId}` },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});
