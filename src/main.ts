import { Game } from './game.ts';
import { UI } from './ui.ts';

const game = new Game();
const ui = new UI(game);

ui.render();
game.start();

// Expose for debugging
declare global {
  interface Window {
    game: Game;
  }
}
window.game = game;
