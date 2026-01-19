import type { Action, Actor, ActionContext } from './types.ts';
import {
  dealDamage,
  isAlive,
  addSaturation,
  addItem,
  removeItem,
  getItemCount,
  getEffectiveSpeed,
  rollDamage,
  getEquipmentRangedBonus,
  getEquipmentArmorBonus,
  applyArmor,
  getWeaponAccuracy,
  getArmorDodgePenalty,
} from './actor.ts';
import { rollForResourceDiscovery, getResourceNode } from './resources.ts';
import { getRecipe, canCraftRecipe, applyRecipe, attemptCraft } from './recipes.ts';
import { getItem } from './items.ts';
import {
  calculateAttack,
  trackStatUsage,
  getRangedDamageBonus,
} from './stats.ts';
import {
  addSkillXp,
  getWeaponSkill,
  SKILL_XP_AWARDS,
} from './skills.ts';
import {
  rollForLocationDiscovery,
  rollForExitDiscovery,
  getLocation,
} from './locations.ts';

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
  execute: (_actor: Actor, context?: ActionContext) => {
    // Can't wander away from a placed campfire
    if (context?.game?.structures.has('campfire')) {
      return {
        success: false,
        message: "You can't wander off with a campfire burning! Pick it up or smother it first.",
      };
    }

    const currentLocation = context?.game?.currentLocation ?? null;

    // Check for exit discovery if inside a location
    if (currentLocation !== null && !context?.game?.foundExit) {
      const foundExit = rollForExitDiscovery(currentLocation);
      if (foundExit) {
        const location = getLocation(currentLocation);
        return {
          success: true,
          message: `You find a way out of ${location?.name ?? 'this location'}!`,
          foundExit: true,
        };
      }
    }

    // Check for location discovery
    const discoveredLocation = rollForLocationDiscovery(currentLocation);
    if (discoveredLocation) {
      return {
        success: true,
        message: discoveredLocation.discoveryMessage,
        foundLocation: discoveredLocation.id,
      };
    }

    // Check for resource discovery (filtered by location)
    const discovered = rollForResourceDiscovery(currentLocation);
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

export const gatherFiber: Action = {
  id: 'gather-fiber',
  name: 'Gather Fiber',
  description: 'Collect fiber from tall grass.',
  tickCost: 100,
  tags: ['gathering', 'non-combat'],
  execute: (actor: Actor, _context?: ActionContext) => {
    const amount = 3 + Math.floor(Math.random() * 3); // 3-5 fiber
    addItem(actor, 'fiber', amount);

    return {
      success: true,
      message: `You gather ${amount} fiber. (${getItemCount(actor, 'fiber')} total)`,
    };
  },
};

// === Crafting Actions ===

export const craftCampfire: Action = {
  id: 'craft-campfire',
  name: 'Craft Campfire',
  description: 'Craft a portable campfire. (5 sticks, 3 rocks)',
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

    return {
      success: true,
      message: 'You craft a campfire. Place it to cook meat!',
    };
  },
};

export const placeCampfire: Action = {
  id: 'place-campfire',
  name: 'Place Campfire',
  description: 'Place your campfire on the ground.',
  tickCost: 50,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    if (getItemCount(actor, 'campfire') <= 0) {
      return { success: false, message: 'You have no campfire to place.' };
    }

    if (context?.game?.structures.has('campfire')) {
      return { success: false, message: 'A campfire is already placed.' };
    }

    removeItem(actor, 'campfire', 1);
    if (context?.game) {
      context.game.structures.add('campfire');
    }

    return {
      success: true,
      message: 'You place the campfire. You can now cook meat!',
    };
  },
};

export const pickupCampfire: Action = {
  id: 'pickup-campfire',
  name: 'Pick Up Campfire',
  description: 'Pick up your placed campfire.',
  tickCost: 50,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    if (!context?.game?.structures.has('campfire')) {
      return { success: false, message: 'No campfire is placed.' };
    }

    context.game.structures.delete('campfire');
    addItem(actor, 'campfire', 1);

    return {
      success: true,
      message: 'You pick up the campfire.',
    };
  },
};

export const smotherCampfire: Action = {
  id: 'smother-campfire',
  name: 'Smother Campfire',
  description: 'Extinguish and discard your placed campfire.',
  tickCost: 25,
  tags: ['crafting', 'non-combat'],
  execute: (_actor: Actor, context?: ActionContext) => {
    if (!context?.game?.structures.has('campfire')) {
      return { success: false, message: 'No campfire is placed.' };
    }

    context.game.structures.delete('campfire');

    return {
      success: true,
      message: 'You smother the campfire. It is destroyed.',
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

export const craftStoneKnife: Action = {
  id: 'craft-stone-knife',
  name: 'Craft Stone Knife',
  description: 'Craft a stone knife. (2 rocks, 1 stick)',
  tickCost: 250,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    const recipe = getRecipe('stoneKnife')!;
    const structures = context?.game?.structures ?? new Set();

    const turn = context?.game?.turn ?? 0;
    const result = attemptCraft(recipe, actor, actor.inventory, structures, turn);

    if (!result.success && !result.failed) {
      return { success: false, message: result.message };
    }

    if (result.failed) {
      return { success: true, message: result.message };
    }

    return {
      success: true,
      message: result.message + ' A fast weapon that scales with agility!',
    };
  },
};

export const craftStoneSpear: Action = {
  id: 'craft-stone-spear',
  name: 'Craft Stone Spear',
  description: 'Craft a stone spear. (1 rock, 3 sticks, 2 fiber)',
  tickCost: 300,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    const recipe = getRecipe('stoneSpear')!;
    const structures = context?.game?.structures ?? new Set();

    const turn = context?.game?.turn ?? 0;
    const result = attemptCraft(recipe, actor, actor.inventory, structures, turn);

    if (!result.success && !result.failed) {
      return { success: false, message: result.message };
    }

    if (result.failed) {
      return { success: true, message: result.message };
    }

    return {
      success: true,
      message: result.message + ' A powerful weapon that scales with strength!',
    };
  },
};

export const craftBow: Action = {
  id: 'craft-bow',
  name: 'Craft Bow',
  description: 'Craft a bow. (3 sticks, 5 fiber)',
  tickCost: 400,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    const recipe = getRecipe('bow')!;
    const structures = context?.game?.structures ?? new Set();

    const turn = context?.game?.turn ?? 0;
    const result = attemptCraft(recipe, actor, actor.inventory, structures, turn);

    if (!result.success && !result.failed) {
      return { success: false, message: result.message };
    }

    if (result.failed) {
      return { success: true, message: result.message };
    }

    return {
      success: true,
      message: result.message + ' Equip it and craft arrows to shoot!',
    };
  },
};

export const craftArrows: Action = {
  id: 'craft-arrows',
  name: 'Craft Arrows',
  description: 'Craft 5 arrows. (2 sticks, 1 rock)',
  tickCost: 150,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    const recipe = getRecipe('arrow')!;
    const structures = context?.game?.structures ?? new Set();
    const { canCraft, reason } = canCraftRecipe(recipe, actor.inventory, structures);

    if (!canCraft) {
      return { success: false, message: reason! };
    }

    applyRecipe(recipe, actor.inventory);

    return {
      success: true,
      message: `You craft 5 arrows. (${getItemCount(actor, 'arrow')} total)`,
    };
  },
};

export const craftWoodenShield: Action = {
  id: 'craft-wooden-shield',
  name: 'Craft Wooden Shield',
  description: 'Craft a wooden shield. (6 sticks, 3 fiber)',
  tickCost: 350,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    const recipe = getRecipe('woodenShield')!;
    const structures = context?.game?.structures ?? new Set();

    const turn = context?.game?.turn ?? 0;
    const result = attemptCraft(recipe, actor, actor.inventory, structures, turn);

    if (!result.success && !result.failed) {
      return { success: false, message: result.message };
    }

    if (result.failed) {
      return { success: true, message: result.message };
    }

    return {
      success: true,
      message: result.message + ' Equip it for blocking!',
    };
  },
};

export const processLeather: Action = {
  id: 'process-leather',
  name: 'Process Leather',
  description: 'Process raw leather at campfire. (2 raw leather)',
  tickCost: 300,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    const recipe = getRecipe('leather')!;
    const structures = context?.game?.structures ?? new Set();
    const { canCraft, reason } = canCraftRecipe(recipe, actor.inventory, structures);

    if (!canCraft) {
      return { success: false, message: reason! };
    }

    applyRecipe(recipe, actor.inventory);

    return {
      success: true,
      message: `You process the leather. (${getItemCount(actor, 'leather')} leather)`,
    };
  },
};

export const craftLeatherHelm: Action = {
  id: 'craft-leather-helm',
  name: 'Craft Leather Helm',
  description: 'Craft a leather helmet. (2 leather)',
  tickCost: 200,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    const recipe = getRecipe('leatherHelm')!;
    const structures = context?.game?.structures ?? new Set();

    const turn = context?.game?.turn ?? 0;
    const result = attemptCraft(recipe, actor, actor.inventory, structures, turn);

    if (!result.success && !result.failed) {
      return { success: false, message: result.message };
    }

    if (result.failed) {
      return { success: true, message: result.message };
    }

    return {
      success: true,
      message: result.message,
    };
  },
};

export const craftLeatherChest: Action = {
  id: 'craft-leather-chest',
  name: 'Craft Leather Chest',
  description: 'Craft a leather chestpiece. (4 leather)',
  tickCost: 300,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    const recipe = getRecipe('leatherChest')!;
    const structures = context?.game?.structures ?? new Set();

    const turn = context?.game?.turn ?? 0;
    const result = attemptCraft(recipe, actor, actor.inventory, structures, turn);

    if (!result.success && !result.failed) {
      return { success: false, message: result.message };
    }

    if (result.failed) {
      return { success: true, message: result.message };
    }

    return {
      success: true,
      message: result.message,
    };
  },
};

export const craftLeatherLegs: Action = {
  id: 'craft-leather-legs',
  name: 'Craft Leather Leggings',
  description: 'Craft leather leggings. (3 leather)',
  tickCost: 250,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    const recipe = getRecipe('leatherLegs')!;
    const structures = context?.game?.structures ?? new Set();

    const turn = context?.game?.turn ?? 0;
    const result = attemptCraft(recipe, actor, actor.inventory, structures, turn);

    if (!result.success && !result.failed) {
      return { success: false, message: result.message };
    }

    if (result.failed) {
      return { success: true, message: result.message };
    }

    return {
      success: true,
      message: result.message,
    };
  },
};

export const craftLeatherBoots: Action = {
  id: 'craft-leather-boots',
  name: 'Craft Leather Boots',
  description: 'Craft leather boots. (2 leather)',
  tickCost: 200,
  tags: ['crafting', 'non-combat'],
  execute: (actor: Actor, context?: ActionContext) => {
    const recipe = getRecipe('leatherBoots')!;
    const structures = context?.game?.structures ?? new Set();

    const turn = context?.game?.turn ?? 0;
    const result = attemptCraft(recipe, actor, actor.inventory, structures, turn);

    if (!result.success && !result.failed) {
      return { success: false, message: result.message };
    }

    if (result.failed) {
      return { success: true, message: result.message };
    }

    return {
      success: true,
      message: result.message,
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
  description: 'Strike your enemy with equipped weapon.',
  tickCost: 200,
  tags: ['combat', 'offensive'],
  execute: (actor: Actor, context?: ActionContext) => {
    if (!context?.encounter) {
      return { success: false, message: 'Nothing to attack.' };
    }

    const enemy = context.encounter.enemy;

    // Track stat usage for auto-leveling
    trackStatUsage(actor.levelInfo, 'strength', 1);
    trackStatUsage(actor.levelInfo, 'precision', 0.5);

    // Determine weapon skill
    const weaponId = actor.equipment.mainHand;
    const weaponSkill = getWeaponSkill(weaponId);

    // Roll damage (weapon range + stat scaling)
    const baseDamage = rollDamage(actor);
    const weaponAccuracy = getWeaponAccuracy(actor);
    const enemyDodgePenalty = getArmorDodgePenalty(enemy);

    // Use new AR vs DR combat system
    const attackerSkillLevel = actor.skills[weaponSkill].level;
    const defenderShieldSkillLevel = enemy.skills?.shield?.level ?? 0;
    const result = calculateAttack(actor, enemy, baseDamage, {
      attackerWeaponAccuracy: weaponAccuracy,
      attackerSkillLevel,
      defenderArmorPenalty: enemyDodgePenalty,
      defenderShieldSkillLevel,
      isRanged: false,
    });

    // Award weapon skill XP
    const skillXp = result.hit ? SKILL_XP_AWARDS.combatHit : SKILL_XP_AWARDS.combatMiss;
    const turn = context?.game?.turn ?? 0;
    const skillGain = addSkillXp(actor.skills[weaponSkill], skillXp, turn);

    if (!result.hit) {
      const msg = result.dodged
        ? `The ${enemy.name} dodges your attack!`
        : `You swing at the ${enemy.name} but miss!`;
      return { success: true, message: msg };
    }

    // Apply enemy armor to damage
    const enemyArmor = getEquipmentArmorBonus(enemy);
    const finalDamage = applyArmor(result.damage, enemyArmor);
    dealDamage(enemy, finalDamage);

    if (result.critical) {
      trackStatUsage(actor.levelInfo, 'luck', 1);
    }

    const critText = result.critical ? ' Critical hit!' : '';
    const levelUpText = skillGain.levelsGained > 0 ? ` ${weaponSkill} leveled up!` : '';

    if (!isAlive(enemy)) {
      return {
        success: true,
        message: `You strike the ${enemy.name} for ${finalDamage} damage.${critText}${levelUpText} Defeated!`,
        encounterEnded: true,
      };
    }

    return {
      success: true,
      message: `You strike the ${enemy.name} for ${finalDamage} damage.${critText}${levelUpText} (${enemy.health}/${enemy.maxHealth} HP)`,
    };
  },
};

export const throwRock: Action = {
  id: 'throw-rock',
  name: 'Throw Rock',
  description: 'Throw a rock at your enemy. Ranged attack.',
  tickCost: 150,
  tags: ['combat', 'offensive', 'ranged'],
  execute: (actor: Actor, context?: ActionContext) => {
    if (!context?.encounter) {
      return { success: false, message: 'Nothing to throw at.' };
    }

    if (getItemCount(actor, 'rocks') <= 0) {
      return { success: false, message: 'You have no rocks to throw.' };
    }

    removeItem(actor, 'rocks', 1);
    const enemy = context.encounter.enemy;

    // Track stat usage
    trackStatUsage(actor.levelInfo, 'precision', 1);
    trackStatUsage(actor.levelInfo, 'agility', 0.3);

    // Roll damage for thrown rock (5-10 base, plus precision stat)
    const rockMinDamage = 5;
    const rockMaxDamage = 10;
    const statBonus = getRangedDamageBonus(actor.levelInfo.stats);
    let baseDamage = rockMinDamage + statBonus + Math.floor(Math.random() * (rockMaxDamage - rockMinDamage + 1));
    const rangedBonus = getEquipmentRangedBonus(actor);
    const fleeingBonus = context.encounter.enemyFleeing ? Math.floor(rangedBonus / 2) : 0;
    baseDamage += fleeingBonus;

    const enemyDodgePenalty = getArmorDodgePenalty(enemy);

    // Use new AR vs DR combat system (thrown rock has some accuracy bonus)
    const attackerSkillLevel = actor.skills.throwing.level;
    const defenderShieldSkillLevel = enemy.skills?.shield?.level ?? 0;
    const result = calculateAttack(actor, enemy, baseDamage, {
      attackerWeaponAccuracy: 5, // Small bonus for thrown projectile
      attackerSkillLevel,
      defenderArmorPenalty: enemyDodgePenalty,
      defenderShieldSkillLevel,
      isRanged: true,
    });

    // Award throwing skill XP
    const skillXp = result.hit ? SKILL_XP_AWARDS.combatHit : SKILL_XP_AWARDS.combatMiss;
    const turn = context?.game?.turn ?? 0;
    const skillGain = addSkillXp(actor.skills.throwing, skillXp, turn);

    if (!result.hit) {
      const msg = result.dodged
        ? `The ${enemy.name} dodges your thrown rock!`
        : `You throw a rock at the ${enemy.name} but miss!`;
      return {
        success: true,
        message: msg,
        projectileUsed: {
          type: 'rock',
          outcome: result.dodged ? 'dodged' : 'missed',
        },
      };
    }

    if (result.critical) {
      trackStatUsage(actor.levelInfo, 'luck', 1);
    }

    const enemyArmor = getEquipmentArmorBonus(enemy);
    const damage = applyArmor(result.damage, enemyArmor);
    dealDamage(enemy, damage);

    const critText = result.critical ? ' Critical hit!' : '';
    const levelUpText = skillGain.levelsGained > 0 ? ' Throwing leveled up!' : '';

    if (!isAlive(enemy)) {
      return {
        success: true,
        message: `Your rock strikes the ${enemy.name} for ${damage} damage.${critText}${levelUpText} Defeated!`,
        encounterEnded: true,
        projectileUsed: { type: 'rock', outcome: 'hit' },
      };
    }

    return {
      success: true,
      message: `Your rock hits the ${enemy.name} for ${damage} damage.${critText}${levelUpText} (${enemy.health}/${enemy.maxHealth} HP)`,
      projectileUsed: { type: 'rock', outcome: 'hit' },
    };
  },
};

export const rangedAttack: Action = {
  id: 'ranged-attack',
  name: 'Shoot Arrow',
  description: 'Fire an arrow at your enemy. Very effective against fleeing targets.',
  tickCost: 180,
  tags: ['combat', 'offensive', 'ranged'],
  execute: (actor: Actor, context?: ActionContext) => {
    if (!context?.encounter) {
      return { success: false, message: 'Nothing to shoot.' };
    }

    // Check for bow equipped
    const mainHand = actor.equipment.mainHand;
    if (mainHand !== 'bow') {
      return { success: false, message: 'You need a bow equipped.' };
    }

    if (getItemCount(actor, 'arrow') <= 0) {
      return { success: false, message: 'You have no arrows.' };
    }

    removeItem(actor, 'arrow', 1);
    const enemy = context.encounter.enemy;

    // Track stat usage (precision is key for archery)
    trackStatUsage(actor.levelInfo, 'precision', 1.5);
    trackStatUsage(actor.levelInfo, 'agility', 0.5);

    // Roll damage (weapon range + stat scaling) with fleeing bonus
    let baseDamage = rollDamage(actor);
    const rangedBonus = getEquipmentRangedBonus(actor);
    const fleeingBonus = context.encounter.enemyFleeing ? rangedBonus : 0;
    baseDamage += fleeingBonus;

    // Get weapon accuracy (bow has high accuracy)
    const weaponAccuracy = getWeaponAccuracy(actor);
    const enemyDodgePenalty = getArmorDodgePenalty(enemy);

    // Use new AR vs DR combat system
    const attackerSkillLevel = actor.skills.archery.level;
    const defenderShieldSkillLevel = enemy.skills?.shield?.level ?? 0;
    const result = calculateAttack(actor, enemy, baseDamage, {
      attackerWeaponAccuracy: weaponAccuracy,
      attackerSkillLevel,
      defenderArmorPenalty: enemyDodgePenalty,
      defenderShieldSkillLevel,
      isRanged: true,
    });

    // Award archery skill XP
    const skillXp = result.hit ? SKILL_XP_AWARDS.combatHit : SKILL_XP_AWARDS.combatMiss;
    const turn = context?.game?.turn ?? 0;
    const skillGain = addSkillXp(actor.skills.archery, skillXp, turn);

    if (!result.hit) {
      const msg = result.dodged
        ? `The ${enemy.name} narrowly dodges your arrow!`
        : `Your arrow flies past the ${enemy.name}!`;
      return {
        success: true,
        message: msg,
        projectileUsed: {
          type: 'arrow',
          outcome: result.dodged ? 'dodged' : 'missed',
        },
      };
    }

    if (result.critical) {
      trackStatUsage(actor.levelInfo, 'luck', 1);
    }

    const enemyArmor = getEquipmentArmorBonus(enemy);
    const damage = applyArmor(result.damage, enemyArmor);
    dealDamage(enemy, damage);

    const critText = result.critical ? ' Critical hit!' : '';
    const levelUpText = skillGain.levelsGained > 0 ? ' Archery leveled up!' : '';

    if (!isAlive(enemy)) {
      const fleeMsg = context.encounter.enemyFleeing ? ' as it flees' : '';
      return {
        success: true,
        message: `Your arrow strikes the ${enemy.name}${fleeMsg} for ${damage} damage.${critText}${levelUpText} Defeated!`,
        encounterEnded: true,
        projectileUsed: { type: 'arrow', outcome: 'hit' },
      };
    }

    return {
      success: true,
      message: `Your arrow hits the ${enemy.name} for ${damage} damage.${critText}${levelUpText} (${enemy.health}/${enemy.maxHealth} HP)`,
      projectileUsed: { type: 'arrow', outcome: 'hit' },
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

// === Location Actions ===

export const exitLocation: Action = {
  id: 'exit-location',
  name: 'Exit Location',
  description: 'Leave the current location through a discovered exit.',
  tickCost: 100,
  tags: ['basic', 'exploration', 'movement', 'non-combat', 'location'],
  execute: (_actor: Actor, context?: ActionContext) => {
    // Can't exit with a placed campfire
    if (context?.game?.structures.has('campfire')) {
      return {
        success: false,
        message: "You can't leave with a campfire burning! Pick it up or smother it first.",
      };
    }

    // Check if we're in a location
    if (context?.game?.currentLocation === null) {
      return {
        success: false,
        message: 'You are already in the wilderness.',
      };
    }

    // Check if we've found an exit
    if (!context?.game?.foundExit) {
      return {
        success: false,
        message: "You haven't found a way out yet. Keep exploring!",
      };
    }

    // The actual location exit is handled by the game
    // This action just signals that the player wants to exit
    const location = getLocation(context.game.currentLocation);
    return {
      success: true,
      message: `You make your way out of ${location?.name ?? 'the location'}...`,
    };
  },
};

// Helper to create an enter location action for a specific location
export function createEnterLocationAction(locationId: string, locationName: string): Action {
  return {
    id: `enter-location-${locationId}`,
    name: `Enter ${locationName}`,
    description: `Enter the ${locationName}.`,
    tickCost: 150,
    tags: ['basic', 'exploration', 'movement', 'non-combat', 'location'],
    execute: (_actor: Actor, context?: ActionContext) => {
      // Can't enter with a placed campfire
      if (context?.game?.structures.has('campfire')) {
        return {
          success: false,
          message: "You can't leave with a campfire burning! Pick it up or smother it first.",
        };
      }

      // The actual location entry is handled by the game via enterLocation()
      return {
        success: true,
        message: `You prepare to enter ${locationName}...`,
      };
    },
  };
}

// === Action Collections ===

export const combatActions: Action[] = [attack, throwRock, rangedAttack, flee, chase];
export const gatheringActions: Action[] = [gatherBerries, gatherSticks, gatherRocks, gatherFiber];
export const craftingActions: Action[] = [
  craftCampfire,
  placeCampfire,
  pickupCampfire,
  smotherCampfire,
  cookMeat,
  craftStoneKnife,
  craftStoneSpear,
  craftBow,
  craftArrows,
  craftWoodenShield,
  processLeather,
  craftLeatherHelm,
  craftLeatherChest,
  craftLeatherLegs,
  craftLeatherBoots,
];
export const consumptionActions: Action[] = [eatBerries, eatCookedMeat, eatRawMeat];
export const locationActions: Action[] = [exitLocation];

export const initialPlayerActions: Action[] = [
  idle,
  wander,
  ...combatActions,
  ...gatheringActions,
  ...craftingActions,
  ...consumptionActions,
  ...locationActions,
];

// Helper to get gathering action for a resource node
export function getGatherAction(nodeId: string): Action | undefined {
  const node = getResourceNode(nodeId);
  if (!node) return undefined;

  const actionMap: Record<string, Action> = {
    'gather-berries': gatherBerries,
    'gather-sticks': gatherSticks,
    'gather-rocks': gatherRocks,
    'gather-fiber': gatherFiber,
  };

  return actionMap[node.gatherActionId];
}
