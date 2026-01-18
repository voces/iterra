import type { Action, Actor, ActionContext } from './types.ts';
import { dealDamage, isAlive, addSaturation } from './actor.ts';

// === Basic Actions ===

export const idle: Action = {
  id: 'idle',
  name: 'Idle',
  description: 'Rest and recover ticks.',
  tickCost: 100,
  tickGain: 200,
  tags: ['basic', 'recovery'],
  execute: (_actor: Actor, _context?: ActionContext) => ({
    success: true,
    message: 'You rest, recovering some energy.',
  }),
};

export const wander: Action = {
  id: 'wander',
  name: 'Wander',
  description: 'Wander aimlessly, perhaps discovering something.',
  tickCost: 300,
  tags: ['basic', 'exploration', 'movement', 'non-combat'],
  execute: (_actor: Actor, _context?: ActionContext) => {
    // 25% chance to find berries
    if (Math.random() < 0.25) {
      return {
        success: true,
        message: 'You stumble upon a bush laden with ripe berries!',
        foundResource: 'berries',
      };
    }

    const outcomes = [
      'You wander through familiar paths.',
      'You explore a quiet corner.',
      'You meander without purpose, but feel refreshed.',
      'Your wandering reveals nothing new, but clears your mind.',
    ];
    const message = outcomes[Math.floor(Math.random() * outcomes.length)];
    return {
      success: true,
      message,
    };
  },
};

// === Gathering Actions ===

export const gatherBerries: Action = {
  id: 'gather-berries',
  name: 'Gather Berries',
  description: 'Pick berries from the bush.',
  tickCost: 150,
  tags: ['gathering', 'non-combat'],
  execute: (actor: Actor, _context?: ActionContext) => {
    const amount = 2 + Math.floor(Math.random() * 3); // 2-4 berries
    actor.inventory.berries += amount;

    return {
      success: true,
      message: `You gather ${amount} berries. (${actor.inventory.berries} total)`,
    };
  },
};

export const eatBerries: Action = {
  id: 'eat-berries',
  name: 'Eat Berries',
  description: 'Eat berries to restore saturation.',
  tickCost: 50,
  tags: ['consumption', 'non-combat'],
  execute: (actor: Actor, _context?: ActionContext) => {
    if (actor.inventory.berries <= 0) {
      return {
        success: false,
        message: 'You have no berries to eat.',
      };
    }

    actor.inventory.berries -= 1;
    const satGain = 4;
    addSaturation(actor, satGain);

    return {
      success: true,
      message: `You eat a berry. (+${satGain} saturation, ${actor.saturation}/${actor.maxSaturation})`,
    };
  },
};

// === Combat Actions ===

export const attack: Action = {
  id: 'attack',
  name: 'Attack',
  description: 'Strike your enemy.',
  tickCost: 200,
  tags: ['combat', 'offensive'],
  execute: (actor: Actor, context?: ActionContext) => {
    if (!context?.encounter) {
      return { success: false, message: 'Nothing to attack.' };
    }

    const enemy = context.encounter.enemy;
    const damage = actor.damage;
    dealDamage(enemy, damage);

    if (!isAlive(enemy)) {
      return {
        success: true,
        message: `You strike the ${enemy.name} for ${damage} damage, defeating it!`,
        encounterEnded: true,
      };
    }

    return {
      success: true,
      message: `You strike the ${enemy.name} for ${damage} damage. (${enemy.health}/${enemy.maxHealth} HP)`,
    };
  },
};

export const flee: Action = {
  id: 'flee',
  name: 'Flee',
  description: 'Attempt to escape from combat.',
  tickCost: 150,
  tags: ['combat', 'defensive'],
  execute: (actor: Actor, context?: ActionContext) => {
    if (!context?.encounter) {
      return { success: false, message: 'Nothing to flee from.' };
    }

    // Speed affects flee chance: faster = better chance
    const enemy = context.encounter.enemy;
    const speedRatio = actor.speed / enemy.speed;
    const baseChance = 0.4;
    const fleeChance = Math.min(0.9, baseChance * speedRatio);

    if (Math.random() < fleeChance) {
      return {
        success: true,
        message: `You turn and run from the ${enemy.name}!`,
        fled: true,
      };
    }

    return {
      success: true,
      message: `You try to flee but the ${enemy.name} blocks your escape!`,
      fled: false,
    };
  },
};

export const chase: Action = {
  id: 'chase',
  name: 'Chase',
  description: 'Pursue a fleeing enemy.',
  tickCost: 250,
  tags: ['combat', 'offensive'],
  execute: (actor: Actor, context?: ActionContext) => {
    if (!context?.encounter) {
      return { success: false, message: 'Nothing to chase.' };
    }

    if (!context.encounter.enemyFleeing) {
      return { success: false, message: 'The enemy is not fleeing.' };
    }

    const enemy = context.encounter.enemy;
    const speedRatio = actor.speed / enemy.speed;
    const baseChance = 0.5;
    const catchChance = Math.min(0.85, baseChance * speedRatio);

    if (Math.random() < catchChance) {
      context.encounter.enemyFleeing = false;
      return {
        success: true,
        message: `You catch up to the fleeing ${enemy.name}!`,
      };
    }

    return {
      success: true,
      message: `The ${enemy.name} escapes into the distance.`,
      encounterEnded: true,
    };
  },
};

export const letGo: Action = {
  id: 'let-go',
  name: 'Let Go',
  description: 'Allow the enemy to escape.',
  tickCost: 50,
  tags: ['combat'],
  execute: (_actor: Actor, context?: ActionContext) => {
    if (!context?.encounter) {
      return { success: false, message: 'Nothing to let go.' };
    }

    const enemy = context.encounter.enemy;
    return {
      success: true,
      message: `You let the ${enemy.name} flee.`,
      encounterEnded: true,
    };
  },
};

// === Action Collections ===

export const combatActions: Action[] = [attack, flee, chase, letGo];
export const gatheringActions: Action[] = [gatherBerries, eatBerries];

export const initialPlayerActions: Action[] = [
  idle,
  wander,
  ...combatActions,
  ...gatheringActions,
];
