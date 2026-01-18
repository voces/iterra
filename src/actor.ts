import type { Actor, Action } from './types.ts';

export function createActor(
  id: string,
  name: string,
  options: {
    maxTicks?: number;
    speed?: number;
    maxHealth?: number;
    damage?: number;
    actions?: Action[];
  } = {}
): Actor {
  const {
    maxTicks = 10000,
    speed = 100,
    maxHealth = 100,
    damage = 10,
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

export function addAction(actor: Actor, action: Action): void {
  if (!actor.actions.some((a) => a.id === action.id)) {
    actor.actions.push(action);
  }
}

export function removeAction(actor: Actor, actionId: string): void {
  actor.actions = actor.actions.filter((a) => a.id !== actionId);
}
