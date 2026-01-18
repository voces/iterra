import type { Actor, Stats } from './types.ts';
import { createActor } from './actor.ts';
import { initialPlayerActions } from './actions.ts';

const PLAYER_MAX_TICKS = 10000;
const PLAYER_SPEED = 100;
const PLAYER_MAX_HEALTH = 100;
const PLAYER_DAMAGE = 15;

// Starting stats for a new player
// These represent a basic adventurer with balanced abilities
const STARTING_STATS: Partial<Stats> = {
  vitality: 5, // +25 HP
  strength: 5, // Good melee damage bonus
  agility: 5, // Decent dodge and speed
  precision: 5, // Decent hit chance
  endurance: 3, // Some hunger resistance
  arcane: 0, // No magic yet
  luck: 2, // A bit of luck
};

export function createPlayer(): Actor {
  return createActor('player', 'Player', {
    maxTicks: PLAYER_MAX_TICKS,
    speed: PLAYER_SPEED,
    maxHealth: PLAYER_MAX_HEALTH,
    damage: PLAYER_DAMAGE,
    actions: initialPlayerActions,
    stats: STARTING_STATS,
    level: 0,
  });
}
