import type { Action, Actor, ActionContext } from './types.ts';
import { dealDamage, isAlive, addSaturation, addItem, removeItem, getItemCount, getEffectiveSpeed } from './actor.ts';
import { rollForResourceDiscovery, getResourceNode } from './resources.ts';
import { getRecipe, canCraftRecipe, applyRecipe } from './recipes.ts';
import { getItem } from './items.ts';

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
    const discovered = rollForResourceDiscovery();

    if (discovered) {
      return {
        success: true,
        message: discovered.discoveryMessage,
        foundResource: discovered.id,
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
    addItem(actor, 'berries', amount);

    return {
      success: true,
      message: `You gather ${amount} berries. (${getItemCount(actor, 'berries')} total)`,
    };
  },
};

export const gatherSticks: Action = {
  id: 'gather-sticks',
  name: 'Gather Sticks',
  description: 'Collect sticks from the ground.',
  tickCost: 100,
  tags: ['gathering', 'non-combat'],
  execute: (actor: Actor, _context?: ActionContext) => {
    const amount = 2 + Math.floor(Math.random() * 3); // 2-4 sticks
    addItem(actor, 'sticks', amount);

    return {
      success: true,
      message: `You gather ${amount} sticks. (${getItemCount(actor, 'sticks')} total)`,
    };
  },
};

export const gatherRocks: Action = {
  id: 'gather-rocks',
  name: 'Gather Rocks',
  description: 'Collect rocks from the ground.',
  tickCost: 120,
  tags: ['gathering', 'non-combat'],
  execute: (actor: Actor, _context?: ActionContext) => {
    const amount = 1 + Math.floor(Math.random() * 2); // 1-2 rocks
    addItem(actor, 'rocks', amount);

    return {
      success: true,
      message: `You gather ${amount} rocks. (${getItemCount(actor, 'rocks')} total)`,
    };
  },
};

// === Crafting Actions ===

export const buildCampfire: Action = {
  id: 'build-campfire',
  name: 'Build Campfire',
  description: 'Build a campfire using sticks and rocks. (5 sticks, 3 rocks)',
  tickCost: 400,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    const recipe = getRecipe('campfire')!;
    const structures = context?.game?.structures ?? new Set();
    const { canCraft, reason } = canCraftRecipe(recipe, actor.inventory, structures);

    if (!canCraft) {
      return { success: false, message: reason! };
    }

    applyRecipe(recipe, actor.inventory);

    if (context?.game && recipe.unlocks) {
      context.game.structures.add(recipe.unlocks);
    }

    return {
      success: true,
      message: 'You build a campfire. You can now cook meat!',
    };
  },
};

export const cookMeat: Action = {
  id: 'cook-meat',
  name: 'Cook Meat',
  description: 'Cook raw meat on the campfire.',
  tickCost: 200,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    const recipe = getRecipe('cookedMeat')!;
    const structures = context?.game?.structures ?? new Set();
    const { canCraft, reason } = canCraftRecipe(recipe, actor.inventory, structures);

    if (!canCraft) {
      return { success: false, message: reason! };
    }

    applyRecipe(recipe, actor.inventory);

    return {
      success: true,
      message: `You cook the meat. (${getItemCount(actor, 'cookedMeat')} cooked meat)`,
    };
  },
};

// === Consumption Actions ===

function createEatAction(itemId: string, actionId: string, name: string, tickCost: number): Action {
  const item = getItem(itemId);

  return {
    id: actionId,
    name,
    description: `Eat ${item?.name?.toLowerCase() ?? itemId} to restore saturation.`,
    tickCost,
    tags: ['consumption', 'non-combat'],
    execute: (actor: Actor, _context?: ActionContext) => {
      const count = getItemCount(actor, itemId);
      if (count <= 0) {
        return {
          success: false,
          message: `You have no ${item?.name?.toLowerCase() ?? itemId} to eat.`,
        };
      }

      removeItem(actor, itemId, 1);
      const satGain = item?.saturationGain ?? 1;
      addSaturation(actor, satGain);

      return {
        success: true,
        message: `You eat the ${item?.name?.toLowerCase() ?? itemId}. (+${satGain} saturation, ${actor.saturation}/${actor.maxSaturation})`,
      };
    },
  };
}

export const eatBerries = createEatAction('berries', 'eat-berries', 'Eat Berries', 50);
export const eatCookedMeat = createEatAction('cookedMeat', 'eat-cooked-meat', 'Eat Cooked Meat', 75);
export const eatRawMeat = createEatAction('rawMeat', 'eat-raw-meat', 'Eat Raw Meat', 50);

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

    const enemy = context.encounter.enemy;
    const playerSpeed = getEffectiveSpeed(actor);
    const enemySpeed = getEffectiveSpeed(enemy);
    const speedRatio = playerSpeed / enemySpeed;
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
    const playerSpeed = getEffectiveSpeed(actor);
    const enemySpeed = getEffectiveSpeed(enemy);
    const speedRatio = playerSpeed / enemySpeed;
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
export const gatheringActions: Action[] = [gatherBerries, gatherSticks, gatherRocks];
export const craftingActions: Action[] = [buildCampfire, cookMeat];
export const consumptionActions: Action[] = [eatBerries, eatCookedMeat, eatRawMeat];

export const initialPlayerActions: Action[] = [
  idle,
  wander,
  ...combatActions,
  ...gatheringActions,
  ...craftingActions,
  ...consumptionActions,
];

// Helper to get gathering action for a resource node
export function getGatherAction(nodeId: string): Action | undefined {
  const node = getResourceNode(nodeId);
  if (!node) return undefined;

  const actionMap: Record<string, Action> = {
    'gather-berries': gatherBerries,
    'gather-sticks': gatherSticks,
    'gather-rocks': gatherRocks,
  };

  return actionMap[node.gatherActionId];
}
