import type { Actor, Action, Inventory } from './types.ts';

export function createActor(
  id: string,
  name: string,
  options: {
    maxTicks?: number;
    speed?: number;
    maxHealth?: number;
    damage?: number;
    saturation?: number;
    maxSaturation?: number;
    inventory?: Partial<Inventory>;
    actions?: Action[];
  } = {}
): Actor {
  const {
    maxTicks = 10000,
    speed = 100,
    maxHealth = 100,
    damage = 10,
    saturation = 10,
    maxSaturation = 20,
    inventory = {},
    actions = [],
  } = options;

  return {
    id,
    name,
    ticks: maxTicks,
    maxTicks,
    speed,
    health: maxHealth,
    maxHealth,
    damage,
    saturation,
    maxSaturation,
    inventory: {
      berries: 0,
      ...inventory,
    },
    actions: [...actions],
  };
}

export function canAffordAction(actor: Actor, action: Action): boolean {
  return actor.ticks >= action.tickCost;
}

export function addTicks(actor: Actor, amount: number): void {
  actor.ticks = Math.min(actor.ticks + amount, actor.maxTicks);
}

export function spendTicks(actor: Actor, amount: number): boolean {
  if (actor.ticks < amount) {
    return false;
  }
  actor.ticks -= amount;
  return true;
}

export function dealDamage(target: Actor, amount: number): void {
  target.health = Math.max(0, target.health - amount);
}

export function heal(actor: Actor, amount: number): void {
  actor.health = Math.min(actor.maxHealth, actor.health + amount);
}

export function isAlive(actor: Actor): boolean {
  return actor.health > 0;
}

export function addSaturation(actor: Actor, amount: number): void {
  actor.saturation = Math.min(actor.maxSaturation, actor.saturation + amount);
}

export function drainSaturation(actor: Actor, amount: number): void {
  actor.saturation = Math.max(0, actor.saturation - amount);
}

// Saturation thresholds (with maxSaturation = 20):
// - Below 4: starving, takes damage
// - 4-16: nominal, no effects
// - Above 16: overfull, allows healing
const SATURATION_LOW_THRESHOLD = 4;
const SATURATION_HIGH_THRESHOLD = 16;

export function isOverfull(actor: Actor): boolean {
  return actor.saturation > SATURATION_HIGH_THRESHOLD;
}

export function isStarving(actor: Actor): boolean {
  return actor.saturation < SATURATION_LOW_THRESHOLD;
}

export function getStarvationDamage(actor: Actor): number {
  if (!isStarving(actor)) {
    return 0;
  }
  // Damage scales with how low saturation is: 0 sat = 4 dmg, 3 sat = 1 dmg
  return SATURATION_LOW_THRESHOLD - actor.saturation;
}

export function addAction(actor: Actor, action: Action): void {
  if (!actor.actions.some((a) => a.id === action.id)) {
    actor.actions.push(action);
  }
}

export function removeAction(actor: Actor, actionId: string): void {
  actor.actions = actor.actions.filter((a) => a.id !== actionId);
}
