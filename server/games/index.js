const NumberMine = require('./NumberMine');
const BluffCard = require('./BluffCard');
const BottleCap = require('./BottleCap');
const HalliGalli = require('./HalliGalli');
const Gomoku = require('./Gomoku');

const GAME_TYPES = {
  'number-mine': NumberMine,
  'bluff-card': BluffCard,
  'bottle-cap': BottleCap,
  'halli-galli': HalliGalli,
  'gomoku': Gomoku,
};

function createGame(roomId, gameType, config = {}) {
  const GameClass = GAME_TYPES[gameType];
  if (!GameClass) {
    return null;
  }
  return new GameClass(roomId, config);
}

function isValidGameType(gameType) {
  return gameType in GAME_TYPES;
}

module.exports = { createGame, isValidGameType, GAME_TYPES };
