import type { RecipeDef, Inventory, ItemQuality, ItemInstance, Actor } from './types.ts';
import {
  getCraftingFailureChance,
  rollCraftingQuality,
  addSkillXp,
  SKILL_XP_AWARDS,
} from './skills.ts';
import { createItemInstance, canHaveQuality } from './items.ts';

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
  message: string;
  craftedItems?: { itemId: string; quality: ItemQuality; instance?: ItemInstance }[];
  skillGain?: { levelsGained: number; newLevel: number };
}

// Attempt crafting with skill checks
export function attemptCraft(
  recipe: RecipeDef,
  actor: Actor,
  inventory: Inventory,
  structures: Set<string>
): CraftResult {
  // First check if we can craft at all
  const { canCraft, reason } = canCraftRecipe(recipe, inventory, structures);
  if (!canCraft) {
    return { success: false, failed: false, message: reason! };
  }

  const craftingSkill = actor.skills.crafting;
  const skillLevel = craftingSkill.level;

  // Check for failure
  const failureChance = getCraftingFailureChance(skillLevel);
  const failed = Math.random() < failureChance;

  // Consume inputs regardless of success/failure
  for (const [itemId, amount] of Object.entries(recipe.inputs)) {
    inventory[itemId] = (inventory[itemId] ?? 0) - amount;
  }

  // Award XP (less for failure)
  const xpAmount = failed ? SKILL_XP_AWARDS.craftFailure : SKILL_XP_AWARDS.craftSuccess;
  const skillGain = addSkillXp(craftingSkill, xpAmount);

  if (failed) {
    return {
      success: false,
      failed: true,
      message: `Crafting failed! Materials were lost. (+${xpAmount} crafting XP)`,
      skillGain,
    };
  }

  // Roll quality and create output items
  const craftedItems: CraftResult['craftedItems'] = [];

  for (const [itemId, amount] of Object.entries(recipe.outputs)) {
    // Roll quality once per item type (not per item)
    const quality = canHaveQuality(itemId) ? rollCraftingQuality(skillLevel) : 'normal';

    for (let i = 0; i < amount; i++) {
      if (canHaveQuality(itemId)) {
        const instance = createItemInstance(itemId, quality);
        craftedItems.push({ itemId, quality, instance });
      } else {
        craftedItems.push({ itemId, quality: 'normal' });
      }
    }

    // Add to inventory (quality items tracked separately)
    inventory[itemId] = (inventory[itemId] ?? 0) + amount;
  }

  return {
    success: true,
    failed: false,
    message: buildCraftSuccessMessage(craftedItems, xpAmount),
    craftedItems,
    skillGain,
  };
}

function buildCraftSuccessMessage(
  items: CraftResult['craftedItems'],
  xpGained: number
): string {
  if (!items || items.length === 0) return 'Crafted successfully!';

  const firstItem = items[0];
  const quality = firstItem.quality;

  // Count by item type
  const itemCounts = new Map<string, number>();
  for (const item of items) {
    itemCounts.set(item.itemId, (itemCounts.get(item.itemId) ?? 0) + 1);
  }

  const itemDescriptions = Array.from(itemCounts.entries())
    .map(([itemId, cnt]) => (cnt > 1 ? `${cnt}x ${itemId}` : itemId))
    .join(', ');

  let qualityText = '';
  if (quality !== 'normal') {
    qualityText = ` (${quality.charAt(0).toUpperCase() + quality.slice(1)} quality!)`;
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
