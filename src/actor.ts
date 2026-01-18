import type { Actor, Action, Inventory } from './types.ts';

export function createActor(
  id: string,
  name: string,
  options: {
    maxTicks?: number;
    speed?: number;
    carryCapacity?: number;
    maxHealth?: number;
    damage?: number;
    saturation?: number;
    maxSaturation?: number;
    inventory?: Inventory;
    actions?: Action[];
  } = {}
): Actor {
  const {
    maxTicks = 10000,
    speed = 100,
    carryCapacity = 30, // Default carry capacity in weight units
    maxHealth = 100,
    damage = 10,
    saturation = 10, // Start at nominal max
    maxSaturation = 15, // Can go 5 above nominal for healing
    inventory = {},
    actions = [],
  } = options;

  return {
    id,
    name,
    ticks: maxTicks,
    maxTicks,
    speed,
    carryCapacity,
    health: maxHealth,
    maxHealth,
    damage,
    saturation,
    maxSaturation,
    inventory: { ...inventory },
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

// Saturation thresholds:
// - 0: starving, takes damage
// - 1-10: nominal, no effects
// - Above 10: overfull, allows healing
const SATURATION_OVERFULL_THRESHOLD = 10;

export function isOverfull(actor: Actor): boolean {
  return actor.saturation > SATURATION_OVERFULL_THRESHOLD;
}

export function isStarving(actor: Actor): boolean {
  return actor.saturation <= 0;
}

export function getStarvationDamage(_actor: Actor): number {
  // Fixed damage when starving (saturation = 0)
  return 5;
}

export function addAction(actor: Actor, action: Action): void {
  if (!actor.actions.some((a) => a.id === action.id)) {
    actor.actions.push(action);
  }
}

export function removeAction(actor: Actor, actionId: string): void {
  actor.actions = actor.actions.filter((a) => a.id !== actionId);
}

// Inventory helpers
export function getItemCount(actor: Actor, itemId: string): number {
  return actor.inventory[itemId] ?? 0;
}

export function addItem(actor: Actor, itemId: string, amount: number): void {
  actor.inventory[itemId] = (actor.inventory[itemId] ?? 0) + amount;
}

export function removeItem(actor: Actor, itemId: string, amount: number): boolean {
  const current = actor.inventory[itemId] ?? 0;
  if (current < amount) {
    return false;
  }
  actor.inventory[itemId] = current - amount;
  return true;
}

export function hasItem(actor: Actor, itemId: string, amount: number = 1): boolean {
  return (actor.inventory[itemId] ?? 0) >= amount;
}

export function transferInventory(from: Actor, to: Actor): void {
  for (const [itemId, amount] of Object.entries(from.inventory)) {
    if (amount > 0) {
      addItem(to, itemId, amount);
    }
  }
}

// Weight system
import { getItem } from './items.ts';

export function getTotalWeight(actor: Actor): number {
  let total = 0;
  for (const [itemId, count] of Object.entries(actor.inventory)) {
    if (count > 0) {
      const item = getItem(itemId);
      if (item) {
        total += item.weight * count;
      }
    }
  }
  return total;
}

export function getLoadFactor(actor: Actor): number {
  return getTotalWeight(actor) / actor.carryCapacity;
}

// Speed modifier based on load:
// - Light load (0-50%): bonus up to +20 speed
// - Normal load (50-100%): 0 modifier, linearly decreasing
// - Overloaded (>100%): penalty of -25 per 50% over capacity
export function getSpeedModifier(actor: Actor): number {
  const loadFactor = getLoadFactor(actor);

  if (loadFactor <= 0.5) {
    // Light load: +20 at 0%, +0 at 50%
    return 20 * (1 - loadFactor * 2);
  } else if (loadFactor <= 1.0) {
    // Normal to full: 0 modifier (linear from +0 at 50% to 0 at 100%)
    return 0;
  } else {
    // Overloaded: -50 speed per 100% over capacity
    const overload = loadFactor - 1.0;
    return -50 * overload;
  }
}

export function getEffectiveSpeed(actor: Actor): number {
  return Math.max(10, actor.speed + getSpeedModifier(actor)); // Min speed of 10
}
