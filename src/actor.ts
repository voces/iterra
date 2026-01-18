import type { Actor, Action, Inventory } from './types.ts';

export function createActor(
  id: string,
  name: string,
  options: {
    maxTicks?: number;
    speed?: number;
    maxHealth?: number;
    damage?: number;
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
    saturation: 0,
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

export function isOverfull(actor: Actor): boolean {
  return actor.saturation >= actor.maxSaturation * 0.9; // 90% full = overfull
}

export function addAction(actor: Actor, action: Action): void {
  if (!actor.actions.some((a) => a.id === action.id)) {
    actor.actions.push(action);
  }
}

export function removeAction(actor: Actor, actionId: string): void {
  actor.actions = actor.actions.filter((a) => a.id !== actionId);
}
