import type { Actor } from './types.ts';
import { createActor } from './actor.ts';
import { initialPlayerActions } from './actions.ts';

const PLAYER_MAX_TICKS = 100;
const PLAYER_TICK_REGEN_RATE = 1; // ticks per second

export function createPlayer(): Actor {
  return createActor('player', 'Player', {
    maxTicks: PLAYER_MAX_TICKS,
    tickRegenRate: PLAYER_TICK_REGEN_RATE,
    actions: initialPlayerActions,
  });
}
