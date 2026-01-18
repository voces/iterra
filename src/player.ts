import type { Actor } from './types.ts';
import { createActor } from './actor.ts';
import { initialPlayerActions } from './actions.ts';

const PLAYER_MAX_TICKS = 100;

export function createPlayer(): Actor {
  return createActor('player', 'Player', {
    maxTicks: PLAYER_MAX_TICKS,
    actions: initialPlayerActions,
  });
}
