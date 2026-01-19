import type { RecipeDef, Inventory, ItemQuality, ItemInstance, Actor } from './types.ts';
import { QUALITY_BREAKAGE_THRESHOLD, getQualityName } from './types.ts';
import {
  getCraftingFailureChance,
  rollQualityValue,
  addSkillXp,
  SKILL_XP_AWARDS,
} from './skills.ts';
import { createItemInstanceWithQuality, canHaveQuality, getItem } from './items.ts';
import { removeItemsWithQuality, addItemWithQuality } from './actor.ts';

// Recipe registry - crafting recipes
export const recipes: Record<string, RecipeDef> = {
  // Basic crafting
  campfire: {
    id: 'campfire',
    name: 'Craft Campfire',
    description: 'Craft a portable campfire using sticks and rocks.',
    inputs: { sticks: 5, rocks: 3 },
    outputs: { campfire: 1 },
    tickCost: 400,
  },
  cookedMeat: {
    id: 'cookedMeat',
    name: 'Cook Meat',
    description: 'Cook raw meat on the campfire.',
    inputs: { rawMeat: 1 },
    outputs: { cookedMeat: 1 },
    tickCost: 200,
    requiresCampfire: true,
  },

  // Materials
  leather: {
    id: 'leather',
    name: 'Process Leather',
    description: 'Process raw leather at the campfire. Requires a knife.',
    inputs: { rawLeather: 2 },
    outputs: { leather: 1 },
    tickCost: 300,
    requiresCampfire: true,
  },

  // Weapons
  stoneKnife: {
    id: 'stoneKnife',
    name: 'Craft Stone Knife',
    description: 'Craft a stone knife from rocks and sticks.',
    inputs: { rocks: 2, sticks: 1 },
    outputs: { stoneKnife: 1 },
    tickCost: 250,
  },
  stoneSpear: {
    id: 'stoneSpear',
    name: 'Craft Stone Spear',
    description: 'Craft a stone spear from rocks, sticks, and fiber.',
    inputs: { rocks: 1, sticks: 3, fiber: 2 },
    outputs: { stoneSpear: 1 },
    tickCost: 300,
  },
  bow: {
    id: 'bow',
    name: 'Craft Bow',
    description: 'Craft a bow from sticks and fiber.',
    inputs: { sticks: 3, fiber: 5 },
    outputs: { bow: 1 },
    tickCost: 400,
  },
  arrow: {
    id: 'arrow',
    name: 'Craft Arrows',
    description: 'Craft arrows from sticks and rocks.',
    inputs: { sticks: 2, rocks: 1 },
    outputs: { arrow: 5 },
    tickCost: 150,
  },

  // Shields
  woodenShield: {
    id: 'woodenShield',
    name: 'Craft Wooden Shield',
    description: 'Craft a wooden shield from sticks and fiber.',
    inputs: { sticks: 6, fiber: 3 },
    outputs: { woodenShield: 1 },
    tickCost: 350,
  },

  // Armor
  leatherHelm: {
    id: 'leatherHelm',
    name: 'Craft Leather Helm',
    description: 'Craft a leather helmet.',
    inputs: { leather: 2 },
    outputs: { leatherHelm: 1 },
    tickCost: 200,
  },
  leatherChest: {
    id: 'leatherChest',
    name: 'Craft Leather Chest',
    description: 'Craft a leather chestpiece.',
    inputs: { leather: 4 },
    outputs: { leatherChest: 1 },
    tickCost: 300,
  },
  leatherLegs: {
    id: 'leatherLegs',
    name: 'Craft Leather Leggings',
    description: 'Craft leather leggings.',
    inputs: { leather: 3 },
    outputs: { leatherLegs: 1 },
    tickCost: 250,
  },
  leatherBoots: {
    id: 'leatherBoots',
    name: 'Craft Leather Boots',
    description: 'Craft leather boots.',
    inputs: { leather: 2 },
    outputs: { leatherBoots: 1 },
    tickCost: 200,
  },
};

export function getRecipe(id: string): RecipeDef | undefined {
  return recipes[id];
}

export function getAllRecipes(): RecipeDef[] {
  return Object.values(recipes);
}

export function canCraftRecipe(
  recipe: RecipeDef,
  inventory: Inventory,
  structures: Set<string>
): { canCraft: boolean; reason?: string } {
  // Check campfire requirement (for cooking)
  if (recipe.requiresCampfire && !structures.has('campfire')) {
    return { canCraft: false, reason: 'Requires a placed campfire.' };
  }

  // Check input materials
  for (const [itemId, needed] of Object.entries(recipe.inputs)) {
    const have = inventory[itemId] ?? 0;
    if (have < needed) {
      return {
        canCraft: false,
        reason: `Need ${needed} ${itemId}, have ${have}.`,
      };
    }
  }

  return { canCraft: true };
}

export function applyRecipe(recipe: RecipeDef, inventory: Inventory): void {
  // Consume inputs
  for (const [itemId, amount] of Object.entries(recipe.inputs)) {
    inventory[itemId] = (inventory[itemId] ?? 0) - amount;
  }

  // Produce outputs
  for (const [itemId, amount] of Object.entries(recipe.outputs)) {
    inventory[itemId] = (inventory[itemId] ?? 0) + amount;
  }
}

// === Skill-based Crafting ===

export interface CraftResult {
  success: boolean;
  failed: boolean; // True if crafting attempt failed (materials lost)
  broken: boolean; // True if materials broke due to low quality
  message: string;
  craftedItems?: { itemId: string; quality: ItemQuality; qualityValue: number; instance?: ItemInstance }[];
  skillGain?: { levelsGained: number; newLevel: number };
}

// Attempt crafting with skill checks and material quality
export function attemptCraft(
  recipe: RecipeDef,
  actor: Actor,
  inventory: Inventory,
  structures: Set<string>,
  turn: number = 0
): CraftResult {
  // First check if we can craft at all
  const { canCraft, reason } = canCraftRecipe(recipe, inventory, structures);
  if (!canCraft) {
    return { success: false, failed: false, broken: false, message: reason! };
  }

  const craftingSkill = actor.skills.crafting;
  const skillLevel = craftingSkill.level;

  // Consume inputs and collect their quality values
  const consumedQualities: number[] = [];
  for (const [itemId, amount] of Object.entries(recipe.inputs)) {
    const qualities = removeItemsWithQuality(actor, itemId, amount);
    if (qualities) {
      consumedQualities.push(...qualities);
    }
    // Also update the plain inventory (for backwards compatibility)
    inventory[itemId] = actor.inventory[itemId] ?? 0;
  }

  // Calculate average material quality
  const avgMaterialQuality = consumedQualities.length > 0
    ? consumedQualities.reduce((sum, q) => sum + q, 0) / consumedQualities.length
    : 50; // Default quality if no tracking

  // Check for breakage - if any material is below threshold, craft fails
  const lowestQuality = consumedQualities.length > 0 ? Math.min(...consumedQualities) : 50;
  const broken = lowestQuality < QUALITY_BREAKAGE_THRESHOLD;

  // Award XP (less for failure/breakage)
  const xpAmount = broken
    ? SKILL_XP_AWARDS.craftFailure
    : SKILL_XP_AWARDS.craftSuccess;
  const skillGain = addSkillXp(craftingSkill, xpAmount, turn);

  if (broken) {
    const qualityName = getQualityName(lowestQuality);
    return {
      success: false,
      failed: true,
      broken: true,
      message: `Crafting failed! ${qualityName} quality materials broke apart. (+${xpAmount} crafting XP)`,
      skillGain,
    };
  }

  // Check for skill-based failure
  const failureChance = getCraftingFailureChance(skillLevel);
  const failed = Math.random() < failureChance;

  if (failed) {
    return {
      success: false,
      failed: true,
      broken: false,
      message: `Crafting failed! Materials were lost. (+${xpAmount} crafting XP)`,
      skillGain,
    };
  }

  // Roll quality based on skill, influenced by material quality
  // Output quality = weighted average of skill roll and material quality
  const skillQuality = rollQualityValue(skillLevel);
  // Material quality contributes 40% to final quality
  const outputQuality = Math.round(skillQuality * 0.6 + avgMaterialQuality * 0.4);

  const craftedItems: CraftResult['craftedItems'] = [];

  for (const [itemId, amount] of Object.entries(recipe.outputs)) {
    for (let i = 0; i < amount; i++) {
      if (canHaveQuality(itemId)) {
        const instance = createItemInstanceWithQuality(itemId, outputQuality);
        craftedItems.push({ itemId, quality: instance.quality, qualityValue: outputQuality, instance });
        // Store in equipment instances when equipped (handled elsewhere)
      } else {
        // For stackable output items (like arrows), add with quality
        addItemWithQuality(actor, itemId, 1, outputQuality);
        craftedItems.push({ itemId, quality: 'normal', qualityValue: outputQuality });
      }
    }

    // Update plain inventory count
    inventory[itemId] = (inventory[itemId] ?? 0) + amount;
  }

  return {
    success: true,
    failed: false,
    broken: false,
    message: buildCraftSuccessMessage(craftedItems, xpAmount, outputQuality),
    craftedItems,
    skillGain,
  };
}

function buildCraftSuccessMessage(
  items: CraftResult['craftedItems'],
  xpGained: number,
  qualityValue: number
): string {
  if (!items || items.length === 0) return 'Crafted successfully!';

  // Count by item type
  const itemCounts = new Map<string, number>();
  for (const item of items) {
    itemCounts.set(item.itemId, (itemCounts.get(item.itemId) ?? 0) + 1);
  }

  const itemDescriptions = Array.from(itemCounts.entries())
    .map(([itemId, cnt]) => {
      const name = getItem(itemId)?.name ?? itemId;
      return cnt > 1 ? `${cnt}x ${name}` : name;
    })
    .join(', ');

  const qualityName = getQualityName(qualityValue);
  let qualityText = '';
  if (qualityName !== 'Normal') {
    qualityText = ` (${qualityName} quality!)`;
  }

  return `Crafted ${itemDescriptions}${qualityText} (+${xpGained} crafting XP)`;
}

// Get the quality-based item instance for equipped items
export function getEquippedItemInstance(
  actor: Actor,
  slot: keyof Actor['equipment']
): ItemInstance | undefined {
  return actor.equipmentInstances[slot];
}
