import type { RecipeDef, Inventory } from './types.ts';

// Recipe registry - crafting recipes
export const recipes: Record<string, RecipeDef> = {
  campfire: {
    id: 'campfire',
    name: 'Build Campfire',
    description: 'Build a campfire using sticks and rocks.',
    inputs: { sticks: 5, rocks: 3 },
    outputs: {},
    tickCost: 400,
    unlocks: 'campfire',
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
  // Check campfire requirement
  if (recipe.requiresCampfire && !structures.has('campfire')) {
    return { canCraft: false, reason: 'Requires a campfire.' };
  }

  // Check structure isn't already built (for unlocking recipes)
  if (recipe.unlocks && structures.has(recipe.unlocks)) {
    return { canCraft: false, reason: 'Already built.' };
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
