import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/Home.vue';
import Game from '../views/Game.vue';

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/game/:roomId', name: 'Game', component: Game, props: true },
  {
    path: '/spectate/:roomId',
    name: 'Spectate',
    component: Game,
    props: (route) => ({ roomId: route.params.roomId, spectateMode: true }),
  },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});
