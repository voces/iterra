import type { Actor, Action } from './types.ts';

export function createActor(
  id: string,
  name: string,
  options: {
    maxTicks?: number;
    actions?: Action[];
  } = {}
): Actor {
  const { maxTicks = 100, actions = [] } = options;

  return {
    id,
    name,
    ticks: maxTicks,
    maxTicks,
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

export function addAction(actor: Actor, action: Action): void {
  if (!actor.actions.some((a) => a.id === action.id)) {
    actor.actions.push(action);
  }
}

export function removeAction(actor: Actor, actionId: string): void {
  actor.actions = actor.actions.filter((a) => a.id !== actionId);
}
