import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/Home.vue';
import NumberMine from '../views/NumberMine.vue';

const BluffCard = () => import('../views/BluffCard.vue');
const BottleCap = () => import('../views/BottleCap.vue');
const HalliGalli = () => import('../views/HalliGalli.vue');
const Gomoku = () => import('../views/Gomoku.vue');

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

  // Bottle Cap
  { path: '/game/bottle-cap/:roomId', name: 'BottleCap', component: BottleCap, props: true },
  {
    path: '/spectate/bottle-cap/:roomId',
    name: 'SpectateBottleCap',
    component: BottleCap,
    props: (route) => ({ roomId: route.params.roomId, spectateMode: true }),
  },

  // Halli Galli
  { path: '/game/halli-galli/:roomId', name: 'HalliGalli', component: HalliGalli, props: true },
  {
    path: '/spectate/halli-galli/:roomId',
    name: 'SpectateHalliGalli',
    component: HalliGalli,
    props: (route) => ({ roomId: route.params.roomId, spectateMode: true }),
  },

  // Gomoku
  { path: '/game/gomoku/:roomId', name: 'Gomoku', component: Gomoku, props: true },
  {
    path: '/spectate/gomoku/:roomId',
    name: 'SpectateGomoku',
    component: Gomoku,
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
