import { Game } from './game.ts';
import { UI } from './ui.ts';

const game = new Game();
const ui = new UI(game);

ui.render();

// Try to load saved game, otherwise start fresh
if (game.loadFromSave()) {
  console.log('Game loaded from save');
} else {
  game.start();
}

// Expose for debugging
declare global {
  interface Window {
    game: Game;
  }
}
window.game = game;
